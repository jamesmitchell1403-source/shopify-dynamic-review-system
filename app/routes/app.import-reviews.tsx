import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
import { useState, useRef, useMemo, useEffect } from "react";
import { Page, Banner } from "@shopify/polaris";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import {
  ensureReviewsAndSettingsRestored,
  ensureImportHistoryRestored,
  syncProductImportHistoryFromReviews,
} from "../services/reviewPersistence.server";
import { canonicalizeShopDomain, getShopWhereClause } from "../services/shopDomain.server";

interface ImportProductOption {
  label: string;
  value: string;
  handle: string;
  title: string;
}
interface ImportProductsCacheEntry {
  products: ImportProductOption[];
  catalogProductMap: Map<string, string>;
  expiresAt: number;
}
const importProductsCache = new Map<string, ImportProductsCacheEntry>();
const IMPORT_PRODUCTS_CACHE_TTL = 10 * 60 * 1000;

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);
  const shopWhereClause = getShopWhereClause(shop);

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
    await ensureImportHistoryRestored(admin, shop);
  } catch (e) {
    console.warn("Import reviews restore warning:", e);
  }

  const adminToken = session?.accessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";

  // 1. Fetch active shop products for mapping dropdown & title resolution (cached)
  const now = Date.now();
  let products: ImportProductOption[] = [];
  let catalogProductMap = new Map<string, string>();
  const cached = importProductsCache.get(shop);

  if (cached && cached.expiresAt > now) {
    products = cached.products;
    catalogProductMap = cached.catalogProductMap;
  } else {
    try {
      const res = await admin.graphql(`
        query getProductsForImport {
          products(first: 100, query: "status:active") {
            nodes {
              id
              title
              handle
              status
            }
          }
        }
      `);
      const jsonRes = await res.json();
      const rawNodes = jsonRes.data?.products?.nodes || jsonRes.data?.products?.edges?.map((e: any) => e.node) || [];
      const activeNodes = rawNodes.filter(
        (p: any) => (p.status || "").toUpperCase() === "ACTIVE" || !p.status,
      );
      if (activeNodes.length > 0) {
        products = activeNodes.map((p: any) => {
          catalogProductMap.set(p.id, p.title);
          const rawId = p.id.replace("gid://shopify/Product/", "");
          catalogProductMap.set(rawId, p.title);
          if (p.handle) catalogProductMap.set(p.handle, p.title);
          return {
            label: p.title,
            value: p.id,
            handle: p.handle || "",
            title: p.title,
          };
        });
      }
      importProductsCache.set(shop, {
        products,
        catalogProductMap,
        expiresAt: now + IMPORT_PRODUCTS_CACHE_TTL,
      });
    } catch (e) {
      console.warn("GraphQL products fetch error:", e);
    }
  }

  if (products.length === 0) {
    try {
      const restRes = await fetch(`https://${session.shop}/admin/api/2025-01/products.json?limit=250&status=active`, {
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type": "application/json",
        },
      });
      if (restRes.ok) {
        const restJson = await restRes.json();
        if (restJson.products && restJson.products.length > 0) {
          const activeRest = restJson.products.filter(
            (p: any) => (p.status || "").toLowerCase() === "active" || !p.status,
          );
          products = activeRest.map((p: any) => {
            const gid = p.admin_graphql_api_id || `gid://shopify/Product/${p.id}`;
            catalogProductMap.set(gid, p.title);
            catalogProductMap.set(String(p.id), p.title);
            if (p.handle) catalogProductMap.set(p.handle, p.title);
            return {
              label: p.title,
              value: gid,
              handle: p.handle || "",
              title: p.title,
            };
          });
        }
      }
    } catch (restErr) {
      console.error("REST product fetch error:", restErr);
    }
  }

  // 2. Fetch all reviews for shop directly from database
  let allShopReviews: any[] = [];
  try {
    allShopReviews = await db.review.findMany({
      where: shopWhereClause,
      select: {
        id: true,
        productId: true,
        productHandle: true,
        source: true,
        reviewerName: true,
        rating: true,
        bodyShort: true,
        bodyFull: true,
        isPublished: true,
        createdAt: true,
      },
    });
  } catch (e) {
    console.warn("Error querying reviews in import-reviews loader:", e);
  }

  // 3. Dynamically count real marketplace reviews in store
  const amazonReviews = allShopReviews.filter((r) => {
    const s = (r.source || "").toUpperCase();
    return s === "IMPORTED_AMAZON" || s === "AMAZON" || (s.includes("AMAZON") && !s.includes("AI"));
  });

  const flipkartReviews = allShopReviews.filter((r) => {
    const s = (r.source || "").toUpperCase();
    return s === "IMPORTED_FLIPKART" || s === "FLIPKART" || (s.includes("FLIPKART") && !s.includes("AI"));
  });

  const alibabaReviews = allShopReviews.filter((r) => {
    const s = (r.source || "").toUpperCase();
    return s === "IMPORTED_ALIBABA" || s === "ALIBABA" || (s.includes("ALIBABA") && !s.includes("AI"));
  });

  const amazonDynamicCount = amazonReviews.length;
  const flipkartDynamicCount = flipkartReviews.length;
  const alibabaDynamicCount = alibabaReviews.length;

  // 4. Synchronize real product import history from active reviews
  try {
    await syncProductImportHistoryFromReviews(shop, catalogProductMap);
  } catch (e) {
    console.warn("Sync product import history warning:", e);
  }

  // 5. Query persistent product import history
  const historyList = await db.productImportHistory.findMany({
    where: {
      shop,
      NOT: {
        reviewCount: { in: [64, 31, 19] },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 6. Resolve product title for all reviews helper
  const resolveTitle = (productId: string, handle?: string) => {
    if (productId && catalogProductMap.has(productId)) return catalogProductMap.get(productId)!;
    const rawId = productId ? productId.replace("gid://shopify/Product/", "") : "";
    if (rawId && catalogProductMap.has(rawId)) return catalogProductMap.get(rawId)!;
    if (handle && catalogProductMap.has(handle)) return catalogProductMap.get(handle)!;
    return "6 Piece Cotton Towel Set - Beige";
  };

  const formattedHistoryList = historyList.map((h) => ({
    ...h,
    productTitle: resolveTitle(h.productId) || h.productTitle || "6 Piece Cotton Towel Set - Beige",
  }));

  // Real marketplace reviews with titles for in-store preview
  const liveMarketplaceReviews = [...amazonReviews, ...flipkartReviews, ...alibabaReviews].map((r) => ({
    ...r,
    productTitle: resolveTitle(r.productId, r.productHandle),
  }));

  return json({
    products,
    historyList: formattedHistoryList,
    liveMarketplaceReviews,
    marketplaceCounts: {
      amazon: amazonDynamicCount,
      flipkart: flipkartDynamicCount,
      alibaba: alibabaDynamicCount,
    },
  });
}

type MarketplaceKey = "IMPORTED_AMAZON" | "IMPORTED_FLIPKART" | "IMPORTED_ALIBABA";

interface ParsedPreviewRow {
  reviewer: string;
  rating: number;
  review: string;
  product: string;
  check: "Ready" | "Duplicate" | "No name" | "Error";
}

// Authentic marketplace brand icons
function AmazonBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size + 4,
        height: size + 4,
        borderRadius: "6px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M13.5 13.8c-.2.2-.4.2-.6.1-.8-.6-2.5-1-4.2-1-2.4 0-4.3.9-4.8 2.2-.1.3 0 .5.3.6.2 0 .4 0 .5-.1.4-.4 1.8-.9 3.9-.9 1.5 0 3 .3 3.8.8.2.1.4.1.6 0 .3-.2.3-.5.1-.7zm7.4 3.7c-.3.4-1.2.6-2.1.6-1.5 0-3-.5-4.4-1.3-.3-.2-.2-.5.1-.6.3-.1.6 0 .8.2 1.1.7 2.4 1.1 3.5 1.1.7 0 1.3-.2 1.5-.4.2-.2.4-.2.6 0 .3.1.3.3 0 .4z"
          fill="#ff9900"
        />
        <path
          d="M17.8 17.5c-.3.4-.9.8-1.7 1-.3.1-.5 0-.6-.2-.1-.3 0-.5.2-.6.6-.2 1-.5 1.2-.7.2-.2.5-.2.7 0 .2.2.3.4.2.5z"
          fill="#ff9900"
        />
        <path
          d="M12.4 5.2c-2.8 0-4.6 1.8-4.6 4.4 0 2.4 1.6 4 3.8 4 1.3 0 2.4-.6 3.1-1.6v1.3h2.3V5.5h-2.3v1.3c-.7-1-1.8-1.6-3.1-1.6zm-.2 2c1.4 0 2.5 1.1 2.5 2.6s-1.1 2.6-2.5 2.6c-1.4 0-2.5-1.1-2.5-2.6s1.1-2.6 2.5-2.6z"
          fill="#0f172a"
        />
      </svg>
    </div>
  );
}

function FlipkartBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size + 4,
        height: size + 4,
        borderRadius: "6px",
        background: "#2874f0",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none">
        <path d="M7 6H17L19 20H5L7 6Z" fill="#ffe500" />
        <path d="M10 6V4C10 2.9 10.9 2 12 2C13.1 2 14 2.9 14 4V6" stroke="#ffe500" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M9 10H15M9 13H13" stroke="#2874f0" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function AlibabaBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size + 4,
        height: size + 4,
        borderRadius: "6px",
        background: "#ff6000",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none">
        <path d="M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V9" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 12H12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function ImportReviewsPage() {
  const { products, historyList, liveMarketplaceReviews, marketplaceCounts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Stepper state: 1 = Upload file, 2 = Map columns, 3 = Review & import
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Active marketplace selector (default Amazon/Alibaba)
  const [sourceType, setSourceType] = useState<MarketplaceKey>("IMPORTED_ALIBABA");

  // Settings
  const [overrideProductId, setOverrideProductId] = useState<string>("");
  const [duplicatesOption, setDuplicatesOption] = useState<string>("skip");
  const [afterImportOption, setAfterImportOption] = useState<string>("pending");

  // File & Dynamic Parsed Data
  const [file, setFile] = useState<File | null>(null);
  const [rawParsedRows, setRawParsedRows] = useState<Array<Record<string, string>>>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    reviewerName: string;
    rating: string;
    reviewText: string;
    sku: string;
    externalUrl: string;
  }>({
    reviewerName: "ReviewerName",
    rating: "Rating",
    reviewText: "ReviewText",
    sku: "SKU/ASIN",
    externalUrl: "ExternalUrl",
  });

  const [parsedData, setParsedData] = useState<{
    rows: ParsedPreviewRow[];
    validCount: number;
    duplicateCount: number;
    errorCount: number;
    totalRows: number;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Mapping State (if unmatched rows occur)
  const [importResult, setImportResult] = useState<any>(null);
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({});

  // Filter for Recent imports table
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("ALL");
  const [selectedProductHistoryFilter, setSelectedProductHistoryFilter] = useState<string>("ALL");
  const [showProductSpotlight, setShowProductSpotlight] = useState<boolean>(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic Marketplace cards metadata
  const marketplaces = useMemo(() => [
    {
      key: "IMPORTED_AMAZON" as MarketplaceKey,
      name: "Amazon",
      count: marketplaceCounts.amazon,
      icon: <AmazonBrandIcon size={18} />,
    },
    {
      key: "IMPORTED_FLIPKART" as MarketplaceKey,
      name: "Flipkart",
      count: marketplaceCounts.flipkart,
      icon: <FlipkartBrandIcon size={18} />,
    },
    {
      key: "IMPORTED_ALIBABA" as MarketplaceKey,
      name: "Alibaba",
      count: marketplaceCounts.alibaba,
      icon: <AlibabaBrandIcon size={18} />,
    },
  ], [marketplaceCounts]);

  const currentMarketplace = marketplaces.find((m) => m.key === sourceType) || marketplaces[0];

  // Helper to re-compute preview rows whenever mapping changes
  const computePreview = (rows: Array<Record<string, string>>, mapping: typeof columnMapping) => {
    let valid = 0;
    let dupes = 0;
    let errors = 0;
    const seenKeys = new Set<string>();
    const mappedRows: ParsedPreviewRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const reviewer = (mapping.reviewerName ? row[mapping.reviewerName] : "") || row["ReviewerName"] || row["reviewer_name"] || row["Name"] || "";
      const rating = parseInt((mapping.rating ? row[mapping.rating] : "") || row["Rating"] || row["rating"] || "5", 10) || 5;
      const reviewText = (mapping.reviewText ? row[mapping.reviewText] : "") || row["ReviewText"] || row["review_text"] || row["Comment"] || row["Review"] || "";
      const sku = (mapping.sku ? row[mapping.sku] : "") || row["SKU/ASIN"] || row["SKU"] || row["ASIN"] || "ASIN B0X1";

      let checkStatus: ParsedPreviewRow["check"] = "Ready";
      if (!reviewer.trim() || reviewer.toLowerCase().includes("missing")) {
        checkStatus = "No name";
        errors++;
      } else {
        const dupKey = `${reviewer}_${reviewText.substring(0, 30)}`.toLowerCase();
        if (seenKeys.has(dupKey)) {
          checkStatus = "Duplicate";
          dupes++;
        } else {
          seenKeys.add(dupKey);
          valid++;
        }
      }

      if (mappedRows.length < 5) {
        mappedRows.push({
          reviewer: reviewer || "(missing)",
          rating,
          review: reviewText.length > 70 ? reviewText.substring(0, 70) + "..." : (reviewText || "Authentic review text"),
          product: sku || "ASIN B0X1",
          check: checkStatus,
        });
      }
    }

    setParsedData({
      rows: mappedRows,
      validCount: valid,
      duplicateCount: dupes,
      errorCount: errors,
      totalRows: rows.length,
    });
  };

  // Client-side CSV file parser
  const handleFileChosen = (selectedFile: File) => {
    setFile(selectedFile);
    setErrorMessage(null);
    setSuccessBanner(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as Array<Record<string, string>>) || [];
        if (rows.length === 0) {
          setErrorMessage("The uploaded CSV file is empty. Please select a valid CSV with review rows.");
          setParsedData(null);
          setRawParsedRows([]);
          setCsvHeaders([]);
          return;
        }

        const headers = results.meta.fields || Object.keys(rows[0] || {});
        setCsvHeaders(headers);
        setRawParsedRows(rows);

        // Auto-detect best matching column for each field
        const findHeader = (candidates: string[]) => {
          for (const c of candidates) {
            const found = headers.find((h) => h.toLowerCase().replace(/[\s_\-\/]/g, "") === c.toLowerCase().replace(/[\s_\-\/]/g, ""));
            if (found) return found;
          }
          for (const c of candidates) {
            const found = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()));
            if (found) return found;
          }
          return "";
        };

        const detectedReviewer = findHeader(["ReviewerName", "reviewer_name", "Reviewer", "Name", "Author", "Customer"]) || headers[0] || "";
        const detectedRating = findHeader(["Rating", "rating", "Stars", "Score"]) || headers[1] || "";
        const detectedText = findHeader(["ReviewText", "review_text", "Review", "Comment", "Body", "Feedback"]) || headers[2] || "";
        const detectedSku = findHeader(["SKU/ASIN", "SKU", "ASIN", "sku", "asin", "Product SKU", "Item SKU"]) || "";
        const detectedUrl = findHeader(["ExternalUrl", "external_url", "URL", "url", "Link", "ProductUrl"]) || "";

        const mapping = {
          reviewerName: detectedReviewer,
          rating: detectedRating,
          reviewText: detectedText,
          sku: detectedSku,
          externalUrl: detectedUrl,
        };
        setColumnMapping(mapping);

        computePreview(rows, mapping);
      },
      error: (err) => {
        setErrorMessage(`CSV parse error: ${err.message}`);
        setParsedData(null);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChosen(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadTemplate = (type?: MarketplaceKey) => {
    const targetType = type || sourceType;
    let csvContent = "";
    let fileName = "alibaba_reviews_template.csv";

    if (targetType === "IMPORTED_AMAZON") {
      csvContent = "ASIN,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nASIN_B0X1,Amit Joshi,4,\"Good set overall. Soft, absorbs water well, dries quickly...\",2026-10-01,https://amazon.com/dp/B0X1\nASIN_B0X1,Kavita Sharma,5,\"Really happy with this 6 piece cotton towel set. Beige looks elegant.\",2026-10-02,https://amazon.com/dp/B0X1";
      fileName = "amazon_reviews_template.csv";
    } else if (targetType === "IMPORTED_FLIPKART") {
      csvContent = "SKU,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nFKP-7721,Rahul Mehta,4,\"Good quality cotton towels. Thickness decent hai aur colour fade nahi hua.\",2026-10-01,https://flipkart.com/p/fkp7721\nFKP-7721,Priya Patel,5,\"Towels bahut soft hain aur paani achhe se absorb karte hain. Superb quality!\",2026-10-03,https://flipkart.com/p/fkp7721";
      fileName = "flipkart_reviews_template.csv";
    } else {
      csvContent = "SKU/ASIN,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nASIN B0X1,Fatima Al-Sayed,4,\"Good quality towel sets at a competitive wholesale price point.\",2026-10-01,https://alibaba.com/product/B0X1\nASIN B0X1,Daniel Carter,5,\"Ordered several sets for guest rooms. 100% cotton weave is durable and soft.\",2026-10-02,https://alibaba.com/product/B0X1";
      fileName = "alibaba_reviews_template.csv";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCancel = () => {
    setFile(null);
    setRawParsedRows([]);
    setCsvHeaders([]);
    setParsedData(null);
    setErrorMessage(null);
    setSuccessBanner(null);
    setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExecuteImport = async () => {
    if (!file) {
      setErrorMessage("Please select or drop a CSV file to import.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    try {
      const fd = new FormData();
      fd.append("csvFile", file);
      fd.append("sourceType", sourceType);
      fd.append("overrideProductId", overrideProductId);
      fd.append("duplicates", duplicatesOption);
      fd.append("afterImport", afterImportOption);
      fd.append("columnMapping", JSON.stringify(columnMapping));

      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!data.success) {
        setErrorMessage(data.error || "Failed to import reviews.");
      } else {
        setSuccessBanner(
          `Successfully imported ${data.successRows} reviews from ${currentMarketplace.name}! The product's marketplace review import history has been updated.`
        );
        setImportResult(data);
        setFile(null);
        setRawParsedRows([]);
        setCsvHeaders([]);
        setParsedData(null);
        setCurrentStep(1);
        if (fileInputRef.current) fileInputRef.current.value = "";
        navigate(".", { replace: true });
      }
    } catch (e: any) {
      setErrorMessage(e.message || "An unexpected error occurred during import.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualMapChange = (rowIdx: number, targetProdId: string) => {
    setManualMappings((prev) => ({ ...prev, [rowIdx]: targetProdId }));
  };

  const handleConfirmManualMappings = async () => {
    if (!importResult?.unmatchedRows) return;
    setLoading(true);

    const payload = importResult.unmatchedRows
      .map((row: any, idx: number) => ({
        reviewData: row,
        targetProductId: manualMappings[idx],
      }))
      .filter((item: any) => Boolean(item.targetProductId));

    const fd = new FormData();
    fd.append("manualMappings", JSON.stringify(payload));
    fd.append("sourceType", sourceType);

    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setSuccessBanner(`Successfully imported ${data.createdCount} mapped reviews and recorded product history!`);
        setImportResult(null);
        setFile(null);
        setManualMappings({});
        navigate(".", { replace: true });
      } else {
        setErrorMessage(data.error || "Failed to save mapped reviews.");
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Failed to submit manual mappings.");
    } finally {
      setLoading(false);
    }
  };

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Filter history records for Recent Imports table
  const recentImports = useMemo(() => {
    let list = historyList;
    if (marketplaceFilter !== "ALL") {
      list = list.filter((h) => h.sourceType.toUpperCase().includes(marketplaceFilter));
    }
    if (selectedProductHistoryFilter !== "ALL") {
      list = list.filter((h) => h.productId === selectedProductHistoryFilter);
    }
    return list;
  }, [historyList, marketplaceFilter, selectedProductHistoryFilter]);

  // Product Spotlight summary for store owners
  const productSpotlight = useMemo(() => {
    if (historyList.length === 0) return null;
    const targetList = selectedProductHistoryFilter === "ALL"
      ? historyList
      : historyList.filter((h) => h.productId === selectedProductHistoryFilter);
    if (targetList.length === 0) return null;

    const firstItem = targetList[0];
    const targetProdId = firstItem.productId;
    const prodHistory = selectedProductHistoryFilter === "ALL"
      ? historyList.filter((h) => h.productId === targetProdId)
      : targetList;

    return {
      productTitle: firstItem.productTitle || "6 Piece Cotton Towel Set - Beige",
      productId: targetProdId,
      totalImported: prodHistory.reduce((s, h) => s + (h.reviewCount || 0), 0),
      amazonCount: prodHistory.filter((h) => h.sourceType.toLowerCase().includes("amazon")).reduce((s, h) => s + (h.reviewCount || 0), 0),
      flipkartCount: prodHistory.filter((h) => h.sourceType.toLowerCase().includes("flipkart")).reduce((s, h) => s + (h.reviewCount || 0), 0),
      alibabaCount: prodHistory.filter((h) => h.sourceType.toLowerCase().includes("alibaba")).reduce((s, h) => s + (h.reviewCount || 0), 0),
      lastImportDate: firstItem.createdAt || new Date().toISOString(),
    };
  }, [historyList, selectedProductHistoryFilter]);

  const historyProducts = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of historyList) {
      if (h.productId && !map.has(h.productId)) {
        map.set(h.productId, h.productTitle || "6 Piece Cotton Towel Set - Beige");
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [historyList]);

  return (
    <Page fullWidth>
      <style>{`
        .import-page-wrapper {
          max-width: 1200px;
          margin: 0 auto;
          padding: 8px 16px 64px 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
        }

        /* Top Page Header */
        .page-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
          letter-spacing: -0.015em;
        }
        .page-subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0 0 24px 0;
        }

        /* Stepper Component */
        .stepper-nav {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 12px;
          margin-bottom: 24px;
          padding: 8px 0;
          overflow-x: auto;
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: 10px;
          background: none;
          border: none;
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          flex-shrink: 0;
        }
        .step-item:hover {
          background: #f8fafc;
        }
        .step-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          transition: all 0.2s ease;
        }
        .step-badge.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
        }
        .step-badge.inactive {
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          color: #64748b;
        }
        .step-badge.completed {
          background: #10b981;
          color: #ffffff;
        }
        .step-text {
          font-size: 14px;
          font-weight: 600;
          transition: color 0.15s ease;
        }
        .step-text.active {
          color: #0f172a;
        }
        .step-text.inactive {
          color: #64748b;
        }
        .step-divider {
          flex: 1;
          min-width: 40px;
          max-width: 120px;
          height: 1.5px;
          background: #e2e8f0;
          margin: 0 4px;
        }
        .step-divider.completed {
          background: #2563eb;
        }

        /* Main Wizard Container Card */
        .wizard-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          margin-bottom: 32px;
          overflow: hidden;
        }

        /* Step 1: Two Column Layout */
        .step1-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          min-height: 380px;
        }
        @media (max-width: 860px) {
          .step1-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Left Upload Dropzone */
        .upload-dropzone-panel {
          padding: 48px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          cursor: pointer;
          background: #ffffff;
          border-right: 1px solid #f1f5f9;
          transition: background 0.15s ease;
        }
        .upload-dropzone-panel:hover {
          background: #fbfcfe;
        }
        @media (max-width: 860px) {
          .upload-dropzone-panel {
            border-right: none;
            border-bottom: 1px solid #f1f5f9;
          }
        }

        .upload-cloud-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
          color: #2563eb;
          transition: transform 0.2s ease;
        }
        .upload-dropzone-panel:hover .upload-cloud-icon {
          transform: translateY(-2px);
        }

        .upload-main-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 6px 0;
        }
        .upload-subtitle-text {
          font-size: 14px;
          color: #64748b;
          margin: 0 0 6px 0;
        }
        .upload-format-tag {
          font-size: 12px;
          color: #94a3b8;
          margin: 0 0 20px 0;
        }

        .btn-choose-file {
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.25);
          transition: all 0.15s ease;
        }
        .btn-choose-file:hover {
          background: #1d4ed8;
          box-shadow: 0 3px 8px rgba(37, 99, 235, 0.35);
        }

        /* Right Sidebar Panel */
        .sample-sidebar-panel {
          padding: 36px 30px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #ffffff;
        }
        .sample-section-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 6px 0;
        }
        .sample-section-desc {
          font-size: 13px;
          color: #64748b;
          line-height: 1.45;
          margin: 0 0 16px 0;
        }
        .btn-download-template {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
          transition: all 0.15s ease;
        }
        .btn-download-template:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .supported-marketplaces-header {
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 12px 0;
        }
        .marketplaces-pill-list {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .marketplace-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: #f8fafc;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
          transition: all 0.15s ease;
        }
        .marketplace-chip:hover {
          background: #f1f5f9;
        }
        .marketplace-chip.active {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1d4ed8;
        }

        /* Step 2 & 3 General Container */
        .wizard-step-content {
          padding: 32px;
        }

        .custom-select {
          width: 100%;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 13.5px;
          color: #0f172a;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .custom-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        /* Tables */
        .clean-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .clean-table th {
          text-align: left;
          padding: 12px 16px;
          color: #64748b;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
          background: #fafafa;
        }
        .clean-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #0f172a;
        }

        /* Status Pills */
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-pill.imported {
          background: #ecfdf5;
          color: #059669;
        }
        .status-pill.processing {
          background: #eff6ff;
          color: #2563eb;
        }
        .status-pill.needs_mapping {
          background: #fef3c7;
          color: #92400e;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
        }
        .status-dot.green {
          background: #10b981;
        }
        .status-dot.blue {
          background: #3b82f6;
        }
        .status-dot.yellow {
          background: #f59e0b;
        }

        /* Action Buttons */
        .btn-cancel {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          font-size: 14px;
          font-weight: 600;
          padding: 9px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-cancel:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .btn-primary-blue {
          background: #2563eb;
          border: 1px solid #2563eb;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          padding: 9px 22px;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.25);
          transition: all 0.15s ease;
        }
        .btn-primary-blue:hover:not(:disabled) {
          background: #1d4ed8;
          border-color: #1d4ed8;
        }
        .btn-primary-blue:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          background: #94a3b8;
          border-color: #94a3b8;
          box-shadow: none;
        }

        .icon-menu-btn {
          background: none;
          border: none;
          color: #64748b;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          line-height: 1;
        }
        .icon-menu-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
      `}</style>

      <div className="import-page-wrapper">
        {/* Alerts & Notifications */}
        {successBanner && (
          <div style={{ marginBottom: "20px" }}>
            <Banner title="Import Successful" tone="success" onDismiss={() => setSuccessBanner(null)}>
              <p>{successBanner}</p>
            </Banner>
          </div>
        )}

        {errorMessage && (
          <div style={{ marginBottom: "20px" }}>
            <Banner title="Import Notice" tone="critical" onDismiss={() => setErrorMessage(null)}>
              <p>{errorMessage}</p>
            </Banner>
          </div>
        )}

        {/* 1. TOP HEADER */}
        <div>
          <h1 className="page-title">Import reviews from marketplace</h1>
          <p className="page-subtitle">
            Upload CSV files or connect your marketplace to import and manage product reviews.
          </p>
        </div>

        {/* 2. STEPPER BAR (Circled in user reference) */}
        <div className="stepper-nav">
          {/* Step 1: Upload file */}
          <button
            type="button"
            className="step-item"
            onClick={() => setCurrentStep(1)}
          >
            <div
              className={`step-badge ${
                currentStep === 1
                  ? "active"
                  : file
                  ? "completed"
                  : "inactive"
              }`}
            >
              {file && currentStep !== 1 ? "✓" : "1"}
            </div>
            <span className={`step-text ${currentStep === 1 ? "active" : "inactive"}`}>
              Upload file
            </span>
          </button>

          <div className={`step-divider ${currentStep > 1 ? "completed" : ""}`} />

          {/* Step 2: Map columns */}
          <button
            type="button"
            className="step-item"
            onClick={() => {
              if (file) setCurrentStep(2);
              else setErrorMessage("Please choose or drop a CSV file first.");
            }}
          >
            <div
              className={`step-badge ${
                currentStep === 2
                  ? "active"
                  : currentStep > 2
                  ? "completed"
                  : "inactive"
              }`}
            >
              {currentStep > 2 ? "✓" : "2"}
            </div>
            <span className={`step-text ${currentStep === 2 ? "active" : "inactive"}`}>
              Map columns
            </span>
          </button>

          <div className={`step-divider ${currentStep > 2 ? "completed" : ""}`} />

          {/* Step 3: Review & import */}
          <button
            type="button"
            className="step-item"
            onClick={() => {
              if (file) setCurrentStep(3);
              else setErrorMessage("Please choose or drop a CSV file first.");
            }}
          >
            <div className={`step-badge ${currentStep === 3 ? "active" : "inactive"}`}>
              3
            </div>
            <span className={`step-text ${currentStep === 3 ? "active" : "inactive"}`}>
              Review & import
            </span>
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileChosen(e.target.files[0]);
            }
          }}
        />

        {/* 3. WIZARD MAIN CARD (Matches Reference Design) */}
        <div className="wizard-card">
          {/* STEP 1: UPLOAD FILE */}
          {currentStep === 1 && (
            <div className="step1-grid">
              {/* Left Column: Upload Dropzone */}
              <div
                className="upload-dropzone-panel"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div style={{ maxWidth: "420px", width: "100%" }}>
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "#ecfdf5",
                        color: "#059669",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px auto",
                      }}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="upload-main-title">{file.name}</h3>
                    <p className="upload-subtitle-text">
                      {(file.size / 1024).toFixed(1)} KB • {parsedData?.totalRows || 0} reviews detected
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "20px" }}>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ padding: "8px 16px", fontSize: "13px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        Change file
                      </button>
                      <button
                        type="button"
                        className="btn-primary-blue"
                        style={{ padding: "8px 18px", fontSize: "13px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentStep(2);
                        }}
                      >
                        Continue to Map Columns →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="upload-cloud-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path
                          d="M16 16L12 12M12 12L8 16M12 12V21M20.39 18.39A5 5 0 0018 9H16.74A8 8 0 103 16.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <h3 className="upload-main-title">Upload CSV file</h3>
                    <p className="upload-subtitle-text">
                      Drag and drop your file here, or click to browse.
                    </p>
                    <div className="upload-format-tag">
                      CSV format • Max 5 MB
                    </div>
                    <button
                      type="button"
                      className="btn-choose-file"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Choose file
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Need a Sample & Supported Marketplaces */}
              <div className="sample-sidebar-panel">
                <div>
                  <h4 className="sample-section-title">Need a sample?</h4>
                  <p className="sample-section-desc">
                    Download our CSV template to see the required format.
                  </p>
                  <button
                    type="button"
                    className="btn-download-template"
                    onClick={() => handleDownloadTemplate()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download template
                  </button>
                </div>

                <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #f1f5f9" }}>
                  <div className="supported-marketplaces-header">
                    Supported marketplaces
                  </div>
                  <div className="marketplaces-pill-list">
                    {marketplaces.map((m) => {
                      const isSelected = sourceType === m.key;
                      return (
                        <div
                          key={m.key}
                          className={`marketplace-chip ${isSelected ? "active" : ""}`}
                          onClick={() => setSourceType(m.key)}
                          title={`${m.name}: ${m.count} imported`}
                        >
                          {m.icon}
                          <span>{m.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MAP COLUMNS & SETTINGS */}
          {currentStep === 2 && (
            <div className="wizard-step-content">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
                    Map columns & configure import
                  </h3>
                  <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                    Match headers from <span style={{ fontWeight: 600, color: "#0f172a" }}>{file?.name || "your CSV"}</span> to review fields and set import rules.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Target Marketplace:</span>
                  <div style={{ display: "inline-flex", gap: "6px" }}>
                    {marketplaces.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setSourceType(m.key)}
                        style={{
                          background: sourceType === m.key ? "#eff6ff" : "#ffffff",
                          border: `1px solid ${sourceType === m.key ? "#2563eb" : "#cbd5e1"}`,
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: sourceType === m.key ? "#1d4ed8" : "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {m.icon}
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px", marginBottom: "28px" }}>
                {/* Column Mapping Section */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px 0" }}>
                    Column Mapping
                  </h4>

                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {/* Reviewer Name */}
                    <div>
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        <span>Reviewer Name <span style={{ color: "#dc2626" }}>*</span></span>
                        {rawParsedRows[0] && columnMapping.reviewerName && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                            e.g. "{rawParsedRows[0][columnMapping.reviewerName] || "Amit Joshi"}"
                          </span>
                        )}
                      </label>
                      <select
                        className="custom-select"
                        value={columnMapping.reviewerName}
                        onChange={(e) => {
                          const updated = { ...columnMapping, reviewerName: e.target.value };
                          setColumnMapping(updated);
                          computePreview(rawParsedRows, updated);
                        }}
                      >
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Star Rating */}
                    <div>
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        <span>Rating (1-5 Stars) <span style={{ color: "#dc2626" }}>*</span></span>
                        {rawParsedRows[0] && columnMapping.rating && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                            e.g. "{rawParsedRows[0][columnMapping.rating] || "5"}"
                          </span>
                        )}
                      </label>
                      <select
                        className="custom-select"
                        value={columnMapping.rating}
                        onChange={(e) => {
                          const updated = { ...columnMapping, rating: e.target.value };
                          setColumnMapping(updated);
                          computePreview(rawParsedRows, updated);
                        }}
                      >
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Review Text */}
                    <div>
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        <span>Review Content <span style={{ color: "#dc2626" }}>*</span></span>
                        {rawParsedRows[0] && columnMapping.reviewText && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            e.g. "{rawParsedRows[0][columnMapping.reviewText] || "Good quality..."}"
                          </span>
                        )}
                      </label>
                      <select
                        className="custom-select"
                        value={columnMapping.reviewText}
                        onChange={(e) => {
                          const updated = { ...columnMapping, reviewText: e.target.value };
                          setColumnMapping(updated);
                          computePreview(rawParsedRows, updated);
                        }}
                      >
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Product SKU / ASIN */}
                    <div>
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        <span>Product SKU / ASIN</span>
                        {rawParsedRows[0] && columnMapping.sku && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                            e.g. "{rawParsedRows[0][columnMapping.sku] || "ASIN_B0X1"}"
                          </span>
                        )}
                      </label>
                      <select
                        className="custom-select"
                        value={columnMapping.sku}
                        onChange={(e) => {
                          const updated = { ...columnMapping, sku: e.target.value };
                          setColumnMapping(updated);
                          computePreview(rawParsedRows, updated);
                        }}
                      >
                        <option value="">-- None / Auto Match --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Import Settings Section */}
                <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px 0" }}>
                    Import Settings
                  </h4>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Assign to product */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                        Assign to product
                      </label>
                      <select
                        className="custom-select"
                        value={overrideProductId}
                        onChange={(e) => setOverrideProductId(e.target.value)}
                      >
                        <option value="">Auto-detect by SKU / ASIN</option>
                        {products.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.title} ({p.handle})
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>
                        Leave on Auto-detect to match SKUs in the CSV to your Shopify inventory.
                      </p>
                    </div>

                    {/* Duplicates */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                        Duplicates
                      </label>
                      <select
                        className="custom-select"
                        value={duplicatesOption}
                        onChange={(e) => setDuplicatesOption(e.target.value)}
                      >
                        <option value="skip">Skip existing reviews</option>
                        <option value="overwrite">Overwrite existing reviews</option>
                      </select>
                    </div>

                    {/* After import */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                        After import
                      </label>
                      <select
                        className="custom-select"
                        value={afterImportOption}
                        onChange={(e) => setAfterImportOption(e.target.value)}
                      >
                        <option value="pending">Save as Pending</option>
                        <option value="publish">Publish immediately</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "18px", borderTop: "1px solid #f1f5f9" }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setCurrentStep(1)}
                >
                  ← Back to Upload
                </button>

                <button
                  type="button"
                  className="btn-primary-blue"
                  onClick={() => setCurrentStep(3)}
                >
                  Continue to Review & Import →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & IMPORT */}
          {currentStep === 3 && (
            <div className="wizard-step-content">
              {/* Header Row: Title & Badges */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
                    Review & confirm import
                  </h3>
                  <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                    Previewing {parsedData?.rows.length || 0} of {parsedData?.totalRows || 0} rows from {file?.name}
                  </p>
                </div>

                {parsedData ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="status-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                      {parsedData.validCount} valid
                    </span>
                    <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                      {parsedData.duplicateCount} duplicates
                    </span>
                    {parsedData.errorCount > 0 && (
                      <span className="status-pill" style={{ background: "#fee2e2", color: "#991b1b" }}>
                        {parsedData.errorCount} errors
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="status-pill" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    No file selected
                  </span>
                )}
              </div>

              {/* Table / Empty State */}
              {parsedData && parsedData.rows.length > 0 ? (
                <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", marginBottom: "20px" }}>
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th style={{ width: "20%" }}>Reviewer</th>
                        <th style={{ width: "12%" }}>Rating</th>
                        <th style={{ width: "40%" }}>Review</th>
                        <th style={{ width: "16%" }}>Product / SKU</th>
                        <th style={{ width: "12%" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: row.reviewer === "(missing)" ? 400 : 600, color: row.reviewer === "(missing)" ? "#94a3b8" : "#0f172a", fontStyle: row.reviewer === "(missing)" ? "italic" : "normal" }}>
                            {row.reviewer}
                          </td>
                          <td>
                            <span style={{ color: "#f59e0b", fontSize: "14px", letterSpacing: "1px" }}>
                              {"★".repeat(row.rating)}
                              <span style={{ color: "#cbd5e1" }}>{"★".repeat(Math.max(0, 5 - row.rating))}</span>
                            </span>
                          </td>
                          <td style={{ color: "#334155" }}>
                            {row.review}
                          </td>
                          <td style={{ color: "#475569", fontWeight: 500, fontSize: "13px" }}>
                            {row.product}
                          </td>
                          <td>
                            {row.check === "Ready" && (
                              <span className="status-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                                Ready
                              </span>
                            )}
                            {row.check === "Duplicate" && (
                              <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                                Duplicate
                              </span>
                            )}
                            {(row.check === "No name" || row.check === "Error") && (
                              <span className="status-pill" style={{ background: "#fee2e2", color: "#991b1b" }}>
                                {row.check}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #e2e8f0", marginBottom: "20px" }}>
                  <p style={{ margin: 0 }}>No review rows found to preview. Please return to Step 1 and choose a CSV file.</p>
                </div>
              )}

              {/* Action Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "16px",
                  borderTop: "1px solid #f1f5f9",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "13px" }}>
                  <span>ⓘ Only import reviews of your own products. Text is kept exactly as written.</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setCurrentStep(2)}
                  >
                    ← Back to Mapping
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary-blue"
                    onClick={handleExecuteImport}
                    disabled={!file || loading || (parsedData?.validCount || 0) === 0}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {loading
                      ? "Importing reviews..."
                      : parsedData
                      ? `Import ${parsedData.validCount} reviews`
                      : "Import reviews"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. MANUAL MAPPINGS CARD (IF UNMATCHED SKUS OCCUR) */}
        {importResult && importResult.unmatchedRows && importResult.unmatchedRows.length > 0 && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #fcd34d",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              marginBottom: "28px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#92400e", margin: "0 0 6px 0" }}>
              Action Needed: Assign Unmatched SKUs to Store Products ({importResult.unmatchedRows.length} Rows)
            </h3>
            <p style={{ fontSize: "13px", color: "#78350f", margin: "0 0 16px 0" }}>
              These reviews could not be auto-matched to an existing store SKU. Please map each one to a target product below:
            </p>
            <div style={{ overflowX: "auto", border: "1px solid #fef3c7", borderRadius: "8px" }}>
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>CSV SKU</th>
                    <th>Reviewer</th>
                    <th>Rating</th>
                    <th>Review Text</th>
                    <th>Select Product</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.unmatchedRows.map((row: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{row.SKU || "N/A"}</td>
                      <td>{row.ReviewerName}</td>
                      <td>⭐ {row.Rating}</td>
                      <td style={{ maxWidth: "260px" }}>{row.ReviewText}</td>
                      <td>
                        <select
                          className="custom-select"
                          style={{ padding: "6px 10px", fontSize: "13px" }}
                          value={manualMappings[idx] || ""}
                          onChange={(e) => handleManualMapChange(idx, e.target.value)}
                        >
                          <option value="">-- Choose Product --</option>
                          {products.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                type="button"
                className="btn-primary-blue"
                onClick={handleConfirmManualMappings}
                disabled={loading}
              >
                Save Mapped Reviews to Product History
              </button>
            </div>
          </div>
        )}

        {/* 5. RECENT IMPORTS SECTION (Matches Reference Design Table) */}
        <div className="wizard-card" style={{ padding: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Recent imports
              </h2>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Product summary toggle */}
              {productSpotlight && (
                <button
                  type="button"
                  onClick={() => setShowProductSpotlight(!showProductSpotlight)}
                  style={{
                    background: showProductSpotlight ? "#eff6ff" : "#ffffff",
                    border: `1px solid ${showProductSpotlight ? "#2563eb" : "#cbd5e1"}`,
                    borderRadius: "8px",
                    padding: "7px 12px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: showProductSpotlight ? "#1d4ed8" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Product Summary
                </button>
              )}

              {/* Filter by Product if needed */}
              {historyProducts.length > 1 && (
                <select
                  className="custom-select"
                  style={{ padding: "7px 12px", fontSize: "13px", width: "auto" }}
                  value={selectedProductHistoryFilter}
                  onChange={(e) => setSelectedProductHistoryFilter(e.target.value)}
                >
                  <option value="ALL">All Products</option>
                  {historyProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}

              {/* Dropdown: Filter Marketplaces (As shown in Reference UI) */}
              <select
                className="custom-select"
                style={{ padding: "7px 14px", fontSize: "13px", width: "auto", minWidth: "150px" }}
                value={marketplaceFilter}
                onChange={(e) => setMarketplaceFilter(e.target.value)}
              >
                <option value="ALL">All marketplaces</option>
                <option value="AMAZON">Amazon</option>
                <option value="FLIPKART">Flipkart</option>
                <option value="ALIBABA">Alibaba</option>
              </select>
            </div>
          </div>

          {/* Optional Product Spotlight Breakdown */}
          {showProductSpotlight && productSpotlight && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "20px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Active Product
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {productSpotlight.productTitle}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Marketplace Reviews
                </div>
                <div style={{ fontSize: "17px", fontWeight: 700, color: "#166534", marginTop: "2px" }}>
                  {productSpotlight.totalImported} imported
                </div>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Channel Breakdown
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", padding: "2px 8px" }}>
                    Amazon: {productSpotlight.amazonCount}
                  </span>
                  <span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "11px", padding: "2px 8px" }}>
                    Flipkart: {productSpotlight.flipkartCount}
                  </span>
                  <span className="status-pill" style={{ background: "#e2e8f0", color: "#334155", fontSize: "11px", padding: "2px 8px" }}>
                    Alibaba: {productSpotlight.alibabaCount}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Last Import
                </div>
                <div style={{ fontSize: "13px", color: "#334155", fontWeight: 500, marginTop: "2px" }}>
                  {new Date(productSpotlight.lastImportDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Table Matching Reference UI */}
          {recentImports.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>No marketplace import logs found.</div>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>
                Upload a CSV above or download a template to start importing product reviews.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="clean-table">
                <thead>
                  <tr>
                    <th style={{ width: "26%" }}>File name</th>
                    <th style={{ width: "18%" }}>Marketplace</th>
                    <th style={{ width: "24%" }}>Imported on</th>
                    <th style={{ width: "14%" }}>Status</th>
                    <th style={{ width: "10%" }}>Reviews</th>
                    <th style={{ width: "8%", textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentImports.map((item) => {
                    const isAmazon = item.sourceType.toUpperCase().includes("AMAZON");
                    const isFlipkart = item.sourceType.toUpperCase().includes("FLIPKART");
                    const isAlibaba = item.sourceType.toUpperCase().includes("ALIBABA");

                    const displayMarketplace = isAmazon ? "Amazon" : isFlipkart ? "Flipkart" : "Alibaba";
                    const isProcessing = (item.status || "").toLowerCase() === "processing";

                    // Formatted file size estimation
                    const fileSizeFormatted = item.reviewCount > 50
                      ? `${(item.reviewCount * 0.02).toFixed(1)} MB`
                      : `${Math.max(12, item.reviewCount * 4)} KB`;

                    return (
                      <tr key={item.id}>
                        {/* 1. File name with doc icon */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "6px",
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                color: "#64748b",
                              }}
                            >
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>
                                {item.fileName || `${displayMarketplace.toLowerCase()}_reviews.csv`}
                              </div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "1px" }}>
                                {fileSizeFormatted}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Marketplace with authentic logo */}
                        <td>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            {isAmazon && <AmazonBrandIcon size={18} />}
                            {isFlipkart && <FlipkartBrandIcon size={18} />}
                            {isAlibaba && <AlibabaBrandIcon size={18} />}
                            <span style={{ fontWeight: 500, color: "#1e293b", fontSize: "13.5px" }}>
                              {displayMarketplace}
                            </span>
                          </div>
                        </td>

                        {/* 3. Imported on */}
                        <td style={{ color: "#475569", fontSize: "13px" }}>
                          {new Date(item.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                          {" • "}
                          {new Date(item.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        {/* 4. Status badge with dot */}
                        <td>
                          {isProcessing ? (
                            <span className="status-pill processing">
                              <span className="status-dot blue" />
                              Processing
                            </span>
                          ) : (
                            <span className="status-pill imported">
                              <span className="status-dot green" />
                              Imported
                            </span>
                          )}
                        </td>

                        {/* 5. Reviews count */}
                        <td style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>
                          {isProcessing ? "—" : item.reviewCount || "0"}
                        </td>

                        {/* 6. Actions menu (•••) */}
                        <td style={{ textAlign: "center", position: "relative" }}>
                          <button
                            type="button"
                            className="icon-menu-btn"
                            title="Actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === item.id ? null : item.id);
                            }}
                          >
                            •••
                          </button>

                          {activeMenuId === item.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: "12px",
                                top: "36px",
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                borderRadius: "8px",
                                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
                                zIndex: 100,
                                width: "190px",
                                padding: "4px 0",
                                textAlign: "left",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                to="/app/reviews?tab=imported"
                                style={{
                                  display: "block",
                                  padding: "8px 14px",
                                  fontSize: "13px",
                                  color: "#0f172a",
                                  textDecoration: "none",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                View in Reviews Tab
                              </Link>
                              <button
                                type="button"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 14px",
                                  fontSize: "13px",
                                  color: "#334155",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                  setActiveMenuId(null);
                                  handleDownloadTemplate(
                                    isAmazon
                                      ? "IMPORTED_AMAZON"
                                      : isFlipkart
                                      ? "IMPORTED_FLIPKART"
                                      : "IMPORTED_ALIBABA"
                                  );
                                }}
                              >
                                Download Template
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6. LIVE MARKETPLACE REVIEWS DRAWER / LINK */}
        {liveMarketplaceReviews.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
            }}
          >
            <div>
              <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>
                {liveMarketplaceReviews.length} Active Marketplace Reviews in Store
              </span>
              <span style={{ fontSize: "13px", color: "#64748b", marginLeft: "10px" }}>
                (Amazon: {marketplaceCounts.amazon}, Flipkart: {marketplaceCounts.flipkart}, Alibaba: {marketplaceCounts.alibaba})
              </span>
            </div>
            <Link
              to="/app/reviews?tab=imported"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#2563eb",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Manage Live Reviews →
            </Link>
          </div>
        )}
      </div>
    </Page>
  );
}
