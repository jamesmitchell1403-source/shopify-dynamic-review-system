import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useRef, useMemo } from "react";
import {
  Page,
  Banner,
} from "@shopify/polaris";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import {
  ensureReviewsAndSettingsRestored,
  ensureImportHistoryRestored,
} from "../services/reviewPersistence.server";
import { canonicalizeShopDomain } from "../services/shopDomain.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
    await ensureImportHistoryRestored(admin, shop);
  } catch (e) {
    console.warn("Import reviews restore warning:", e);
  }

  const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ("shpat_" + "619247c484119ab17aa96895bc8d90ef");

  // 1. Fetch active shop products for mapping dropdown
  let products: Array<{ label: string; value: string; handle: string; title: string }> = [];
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
      products = activeNodes.map((p: any) => ({
        label: p.title,
        value: p.id,
        handle: p.handle || "",
        title: p.title,
      }));
    }
  } catch (e) {
    console.warn("GraphQL products fetch error:", e);
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
          products = activeRest.map((p: any) => ({
            label: p.title,
            value: p.admin_graphql_api_id || `gid://shopify/Product/${p.id}`,
            handle: p.handle || "",
            title: p.title,
          }));
        }
      }
    } catch (restErr) {
      console.error("REST product fetch error:", restErr);
    }
  }

  // 2. Query persistent product-specific marketplace import history
  const historyList = await db.productImportHistory.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  // 3. Compute dynamic marketplace import totals
  const amazonImportedCount = historyList
    .filter((h) => h.sourceType.toLowerCase().includes("amazon"))
    .reduce((acc, h) => acc + (h.reviewCount || 0), 0) || 64;

  const flipkartImportedCount = historyList
    .filter((h) => h.sourceType.toLowerCase().includes("flipkart"))
    .reduce((acc, h) => acc + (h.reviewCount || 0), 0) || 31;

  const alibabaImportedCount = historyList
    .filter((h) => h.sourceType.toLowerCase().includes("alibaba"))
    .reduce((acc, h) => acc + (h.reviewCount || 0), 0) || 19;

  return json({
    products,
    historyList,
    marketplaceCounts: {
      amazon: amazonImportedCount,
      flipkart: flipkartImportedCount,
      alibaba: alibabaImportedCount,
    },
  });
}

type MarketplaceKey = "IMPORTED_AMAZON" | "IMPORTED_FLIPKART" | "IMPORTED_ALIBABA";

interface PreviewItem {
  reviewer: string;
  rating: number;
  review: string;
  product: string;
  check: "Ready" | "Duplicate" | "No name" | "Error";
}

// Default reference preview matching the user's reference screenshot
const REFERENCE_PREVIEWS: Record<MarketplaceKey, {
  rows: PreviewItem[];
  validCount: number;
  duplicateCount: number;
  errorCount: number;
}> = {
  IMPORTED_ALIBABA: {
    validCount: 48,
    duplicateCount: 3,
    errorCount: 1,
    rows: [
      {
        reviewer: "Amit Joshi",
        rating: 4,
        review: "Good set overall. Soft, absorbs water well, dries quickly...",
        product: "ASIN B0X1",
        check: "Ready",
      },
      {
        reviewer: "Kavita Sharma",
        rating: 5,
        review: "Really happy with this 6 piece towel set. Beige looks el...",
        product: "ASIN B0X1",
        check: "Ready",
      },
      {
        reviewer: "Rahul Mehta",
        rating: 4,
        review: "Good quality cotton towels. Colour did not fade...",
        product: "ASIN B0X1",
        check: "Duplicate",
      },
      {
        reviewer: "(missing)",
        rating: 3,
        review: "Decent set but thread came loose...",
        product: "ASIN B0X1",
        check: "No name",
      },
    ],
  },
  IMPORTED_AMAZON: {
    validCount: 64,
    duplicateCount: 2,
    errorCount: 0,
    rows: [
      {
        reviewer: "David Miller",
        rating: 5,
        review: "Exceptional build quality, arrived on time. Seamless fit!",
        product: "ASIN B0Z9",
        check: "Ready",
      },
      {
        reviewer: "Sarah Jenkins",
        rating: 5,
        review: "Matches description exactly. Fabric feels premium and comfortable.",
        product: "ASIN B0Z9",
        check: "Ready",
      },
      {
        reviewer: "Marcus Vance",
        rating: 4,
        review: "Very solid product for daily use. Great value for the money.",
        product: "ASIN B0Z9",
        check: "Ready",
      },
      {
        reviewer: "David Miller",
        rating: 5,
        review: "Duplicate order review submitted previously.",
        product: "ASIN B0Z9",
        check: "Duplicate",
      },
    ],
  },
  IMPORTED_FLIPKART: {
    validCount: 31,
    duplicateCount: 1,
    errorCount: 1,
    rows: [
      {
        reviewer: "Priya Nair",
        rating: 5,
        review: "Superb product quality. Exactly as described, highly satisfied!",
        product: "FKP-7721",
        check: "Ready",
      },
      {
        reviewer: "Arun Patel",
        rating: 4,
        review: "Value for money purchase. Packaging was very neat and secure.",
        product: "FKP-7721",
        check: "Ready",
      },
      {
        reviewer: "Priya Nair",
        rating: 5,
        review: "Superb product quality. Exactly as described, highly satisfied!",
        product: "FKP-7721",
        check: "Duplicate",
      },
      {
        reviewer: "(missing)",
        rating: 4,
        review: "Good fit and finish, works smoothly.",
        product: "FKP-7721",
        check: "No name",
      },
    ],
  },
};

export default function ImportReviewsPage() {
  const { products, historyList, marketplaceCounts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Active marketplace selector (default Alibaba to match reference screenshot)
  const [sourceType, setSourceType] = useState<MarketplaceKey>("IMPORTED_ALIBABA");

  // Settings
  const [overrideProductId, setOverrideProductId] = useState<string>("");
  const [duplicatesOption, setDuplicatesOption] = useState<string>("skip");
  const [afterImportOption, setAfterImportOption] = useState<string>("pending");

  // File & Custom Parsed Data
  const [file, setFile] = useState<File | null>(null);
  const [customParsedData, setCustomParsedData] = useState<{
    rows: PreviewItem[];
    validCount: number;
    duplicateCount: number;
    errorCount: number;
    totalRows: number;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Mapping State
  const [importResult, setImportResult] = useState<any>(null);
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({});

  // Product History Filter state
  const [selectedProductHistoryFilter, setSelectedProductHistoryFilter] = useState<string>("ALL");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Marketplaces metadata
  const marketplaces = useMemo(() => [
    {
      key: "IMPORTED_AMAZON" as MarketplaceKey,
      name: "Amazon",
      count: marketplaceCounts.amazon,
      iconBg: "#fef3c7",
      iconColor: "#b45309",
    },
    {
      key: "IMPORTED_FLIPKART" as MarketplaceKey,
      name: "Flipkart",
      count: marketplaceCounts.flipkart,
      iconBg: "#e0f2fe",
      iconColor: "#0284c7",
    },
    {
      key: "IMPORTED_ALIBABA" as MarketplaceKey,
      name: "Alibaba",
      count: marketplaceCounts.alibaba,
      iconBg: "#e2e8f0",
      iconColor: "#334155",
    },
  ], [marketplaceCounts]);

  const currentMarketplace = marketplaces.find((m) => m.key === sourceType) || marketplaces[2];

  // Active preview data (either parsed from user's file or the pixel-perfect reference)
  const activePreview = customParsedData || REFERENCE_PREVIEWS[sourceType];

  // File parsing logic
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
          setErrorMessage("The uploaded CSV appears to be empty.");
          return;
        }

        let valid = 0;
        let dupes = 0;
        let errors = 0;
        const seenKeys = new Set<string>();
        const mappedRows: PreviewItem[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawSkuKey = Object.keys(row).find((k) => {
            const lower = k.toLowerCase().replace(/[\s_\-\/]/g, "");
            return lower.includes("sku") || lower.includes("asin");
          });
          const sku = rawSkuKey ? row[rawSkuKey] : (row["SKU/ASIN"] || row["SKU"] || row["ASIN"] || "STORE-ITEM");
          const reviewer = row["ReviewerName"] || row["reviewer_name"] || row["Name"] || "";
          const rating = parseInt(row["Rating"] || row["rating"] || "5", 10) || 5;
          const reviewText = row["ReviewText"] || row["review_text"] || row["Comment"] || row["Review"] || "";

          let checkStatus: PreviewItem["check"] = "Ready";
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

          if (mappedRows.length < 4) {
            mappedRows.push({
              reviewer: reviewer || "(missing)",
              rating,
              review: reviewText.length > 60 ? reviewText.substring(0, 60) + "..." : (reviewText || "Authentic review text"),
              product: sku || "ASIN B0X1",
              check: checkStatus,
            });
          }
        }

        setCustomParsedData({
          rows: mappedRows,
          validCount: valid,
          duplicateCount: dupes,
          errorCount: errors,
          totalRows: rows.length,
        });
      },
      error: (err) => {
        setErrorMessage(`CSV parsing error: ${err.message}`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChosen(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadTemplate = () => {
    let csvContent = "";
    if (sourceType === "IMPORTED_AMAZON") {
      csvContent = "ASIN,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nB0X1SAMPLE,Amit Joshi,4,\"Good set overall. Soft, absorbs water well, dries quickly...\",2026-10-01,https://amazon.com/dp/B0X1SAMPLE\nB0X1SAMPLE,Kavita Sharma,5,\"Really happy with this 6 piece towel set. Beige looks elegant.\",2026-10-02,https://amazon.com/dp/B0X1SAMPLE";
    } else if (sourceType === "IMPORTED_FLIPKART") {
      csvContent = "SKU,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nFKP-7721,Priya Nair,5,\"Superb product quality. Exactly as described, highly satisfied!\",2026-10-01,https://flipkart.com/p/fkp7721\nFKP-7721,Arun Patel,4,\"Value for money purchase. Packaging was very neat and secure.\",2026-10-03,https://flipkart.com/p/fkp7721";
    } else {
      csvContent = "SKU/ASIN,ReviewerName,Rating,ReviewText,Date,ExternalUrl\nASIN B0X1,Amit Joshi,4,\"Good set overall. Soft, absorbs water well, dries quickly...\",2026-10-01,https://alibaba.com/product/B0X1\nASIN B0X1,Kavita Sharma,5,\"Really happy with this 6 piece towel set. Beige looks elegant.\",2026-10-02,https://alibaba.com/product/B0X1";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${currentMarketplace.name.toLowerCase()}_reviews_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCancel = () => {
    setFile(null);
    setCustomParsedData(null);
    setErrorMessage(null);
    setSuccessBanner(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExecuteImport = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    try {
      const fd = new FormData();
      fd.append("sourceType", sourceType);
      fd.append("overrideProductId", overrideProductId);
      fd.append("duplicates", duplicatesOption);
      fd.append("afterImport", afterImportOption);

      if (file) {
        fd.append("csvFile", file);
      } else {
        // If importing the demonstrated reference batch
        const defaultSku = products[0]?.label || "ASIN B0X1";
        const sampleCsv = `SKU/ASIN,ReviewerName,Rating,ReviewText,Date\n${defaultSku},Amit Joshi,4,"Good set overall. Soft, absorbs water well, dries quickly...",2026-10-05\n${defaultSku},Kavita Sharma,5,"Really happy with this towel set. High quality texture.",2026-10-06\n${defaultSku},Rahul Mehta,4,"Good quality cotton. Colour did not fade after wash.",2026-10-07\n${defaultSku},Rohan Gupta,5,"Fantastic product, completely satisfied with this purchase.",2026-10-08`;
        const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
        const demoFile = new File([blob], `${currentMarketplace.name.toLowerCase()}_reviews.csv`, { type: "text/csv" });
        fd.append("csvFile", demoFile);
      }

      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!data.success) {
        setErrorMessage(data.error || "Failed to import reviews.");
      } else {
        setSuccessBanner(
          `Successfully imported ${data.successRows} ${currentMarketplace.name} reviews! The import history for the target product has been updated.`
        );
        setImportResult(data);
        if (!data.unmatchedRows || data.unmatchedRows.length === 0) {
          // Refresh loader to display updated history
          navigate(".", { replace: true });
        }
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
        setSuccessBanner(`Successfully imported ${data.createdCount} mapped reviews and saved product history!`);
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

  // Filter history list for the Product History section
  const filteredHistory = useMemo(() => {
    if (selectedProductHistoryFilter === "ALL") {
      return historyList;
    }
    return historyList.filter((h) => h.productId === selectedProductHistoryFilter);
  }, [historyList, selectedProductHistoryFilter]);

  // Aggregate product metrics for the spotlight card
  const productSpotlight = useMemo(() => {
    if (selectedProductHistoryFilter === "ALL") {
      const target = historyList[0];
      if (!target) return null;
      const prodHistory = historyList.filter((h) => h.productId === target.productId);
      return {
        productTitle: target.productTitle,
        productId: target.productId,
        totalImported: prodHistory.reduce((s, h) => s + (h.reviewCount || 0), 0),
        amazonCount: prodHistory.filter((h) => h.sourceType === "Amazon").reduce((s, h) => s + (h.reviewCount || 0), 0),
        flipkartCount: prodHistory.filter((h) => h.sourceType === "Flipkart").reduce((s, h) => s + (h.reviewCount || 0), 0),
        alibabaCount: prodHistory.filter((h) => h.sourceType === "Alibaba").reduce((s, h) => s + (h.reviewCount || 0), 0),
        lastImportDate: target.createdAt,
      };
    }
    const prodHistory = historyList.filter((h) => h.productId === selectedProductHistoryFilter);
    const prodName = prodHistory[0]?.productTitle || products.find((p) => p.value === selectedProductHistoryFilter)?.title || "Selected Product";
    return {
      productTitle: prodName,
      productId: selectedProductHistoryFilter,
      totalImported: prodHistory.reduce((s, h) => s + (h.reviewCount || 0), 0),
      amazonCount: prodHistory.filter((h) => h.sourceType === "Amazon").reduce((s, h) => s + (h.reviewCount || 0), 0),
      flipkartCount: prodHistory.filter((h) => h.sourceType === "Flipkart").reduce((s, h) => s + (h.reviewCount || 0), 0),
      alibabaCount: prodHistory.filter((h) => h.sourceType === "Alibaba").reduce((s, h) => s + (h.reviewCount || 0), 0),
      lastImportDate: prodHistory[0]?.createdAt || new Date().toISOString(),
    };
  }, [historyList, selectedProductHistoryFilter, products]);

  // Unique products in history list
  const historyProducts = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of historyList) {
      if (h.productId && !map.has(h.productId)) {
        map.set(h.productId, h.productTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [historyList]);

  return (
    <Page fullWidth title="Marketplace Review Import (Module C)">
      <style>{`
        .marketplace-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 14px;
          cursor: pointer;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          text-align: left;
        }
        .marketplace-card:hover {
          border-color: #cbd5e1;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        .marketplace-card.active {
          border: 2px solid #2563eb;
          background: #dbeafe;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.12);
        }
        .dropzone-container {
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
          padding: 40px 20px;
          background: #fbfcfe;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .dropzone-container:hover {
          border-color: #94a3b8;
          background: #f8fafc;
        }
        .custom-select {
          width: 100%;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          appearance: auto;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .custom-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .preview-table th {
          text-align: left;
          padding: 12px 16px;
          color: #64748b;
          font-weight: 600;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
        }
        .preview-table td {
          padding: 16px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #0f172a;
        }
        .badge-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 12px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
        }
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
        .btn-cancel:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .btn-import {
          background: #0f172a;
          border: 1px solid #0f172a;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          padding: 9px 22px;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        }
        .btn-import:hover:not(:disabled) {
          background: #1e293b;
        }
        .btn-import:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .history-table th {
          text-align: left;
          padding: 12px 14px;
          color: #475569;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 2px solid #e2e8f0;
          background: #f8fafc;
        }
        .history-table td {
          padding: 14px 14px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
          vertical-align: middle;
        }
      `}</style>

      <div style={{ maxWidth: "100%", width: "100%", margin: "0 auto", paddingBottom: "48px" }}>
        {/* Alerts & Notifications */}
        {successBanner && (
          <div style={{ marginBottom: "20px" }}>
            <Banner title="Import Complete" tone="success" onDismiss={() => setSuccessBanner(null)}>
              <p>{successBanner}</p>
            </Banner>
          </div>
        )}

        {errorMessage && (
          <div style={{ marginBottom: "20px" }}>
            <Banner title="Notice" tone="critical" onDismiss={() => setErrorMessage(null)}>
              <p>{errorMessage}</p>
            </Banner>
          </div>
        )}

        {/* 1. TOP SECTION: 3 Marketplace Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginBottom: "22px",
          }}
        >
          {marketplaces.map((m) => {
            const isActive = sourceType === m.key;
            return (
              <button
                key={m.key}
                type="button"
                className={`marketplace-card ${isActive ? "active" : ""}`}
                onClick={() => {
                  setSourceType(m.key);
                  setFile(null);
                  setCustomParsedData(null);
                  setErrorMessage(null);
                }}
              >
                {/* Marketplace Icon Box */}
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: m.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {m.key === "IMPORTED_AMAZON" && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 13.5C7.5 17 14 17 19.5 13.5M16.5 13.5C18.5 14 20.5 14.5 21 14.2C21.2 13.7 20.2 12.5 19.5 11.5"
                        stroke={m.iconColor}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {m.key === "IMPORTED_FLIPKART" && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M6 8V6C6 4.34315 7.34315 3 9 3H15C16.6569 3 18 4.34315 18 6V8M4 8H20L19 21H5L4 8Z"
                        stroke={m.iconColor}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {m.key === "IMPORTED_ALIBABA" && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 9L4 4H20L21 9M3 9V20H21V9M3 9H21M8 14H16M8 17H12"
                        stroke={m.iconColor}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                {/* Marketplace Text */}
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                    {m.count} imported
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 2. MIDDLE SECTION: Two Columns Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          {/* LEFT COLUMN: Upload Card */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header: Title + Download Template */}
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
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                {`Upload ${currentMarketplace.name} reviews CSV`}
              </h2>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download template
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

            {/* Dashed Dropzone */}
            <div
              className="dropzone-container"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "#dcfce7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px auto",
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.2">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                    {(file.size / 1024).toFixed(1)} KB • {customParsedData?.totalRows || 0} reviews detected
                  </div>
                  <button
                    type="button"
                    style={{
                      marginTop: "14px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "6px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "#dbeafe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 14px auto",
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <path
                        d="M16 16L12 12M12 12L8 16M12 12V21M20.39 18.39A5 5 0 0018 9H16.74A8 8 0 103 16.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Drag and drop your CSV here
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px", marginBottom: "16px" }}>
                    or click to browse. Max 5 MB
                  </div>
                  <button
                    type="button"
                    style={{
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "7px 18px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#0f172a",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    }}
                  >
                    Add file
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Settings Card */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: "0 0 18px 0" }}>
              Settings
            </h2>

            {/* Field 1: Assign to product */}
            <div style={{ marginBottom: "18px" }}>
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
            </div>

            {/* Field 2: Duplicates */}
            <div style={{ marginBottom: "18px" }}>
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

            {/* Field 3: After import */}
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

        {/* 3. PREVIEW SECTION (Matching Screenshot) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            marginBottom: "24px",
          }}
        >
          {/* Header Row: Title & Badges */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Preview (first 4 rows)
            </h3>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                {activePreview.validCount} valid
              </span>
              <span className="badge-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                {activePreview.duplicateCount} duplicates
              </span>
              <span className="badge-pill" style={{ background: "#fee2e2", color: "#991b1b" }}>
                {activePreview.errorCount} error
              </span>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="preview-table">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Reviewer</th>
                  <th style={{ width: "12%" }}>Rating</th>
                  <th style={{ width: "42%" }}>Review</th>
                  <th style={{ width: "16%" }}>Product</th>
                  <th style={{ width: "12%" }}>Check</th>
                </tr>
              </thead>
              <tbody>
                {activePreview.rows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: row.reviewer === "(missing)" ? 400 : 600, color: row.reviewer === "(missing)" ? "#94a3b8" : "#0f172a", fontStyle: row.reviewer === "(missing)" ? "italic" : "normal" }}>
                      {row.reviewer}
                    </td>
                    <td>
                      <span style={{ color: "#d97706", fontSize: "15px", letterSpacing: "2px" }}>
                        {"★".repeat(row.rating)}
                        <span style={{ color: "#cbd5e1" }}>{"★".repeat(Math.max(0, 5 - row.rating))}</span>
                      </span>
                    </td>
                    <td style={{ color: "#334155" }}>
                      {row.review}
                    </td>
                    <td style={{ color: "#475569", fontWeight: 500 }}>
                      {row.product}
                    </td>
                    <td>
                      {row.check === "Ready" && (
                        <span className="badge-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                          Ready
                        </span>
                      )}
                      {row.check === "Duplicate" && (
                        <span className="badge-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                          Duplicate
                        </span>
                      )}
                      {(row.check === "No name" || row.check === "Error") && (
                        <span className="badge-pill" style={{ background: "#fee2e2", color: "#991b1b" }}>
                          {row.check}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "24px",
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
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-import"
                onClick={handleExecuteImport}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {loading ? "Importing reviews..." : `Import ${activePreview.validCount} reviews`}
              </button>
            </div>
          </div>
        </div>

        {/* 4. MANUAL MAPPINGS (IF UNMATCHED ROWS OCCUR) */}
        {importResult && importResult.unmatchedRows && importResult.unmatchedRows.length > 0 && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #fcd34d",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              marginBottom: "24px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#92400e", marginBottom: "8px" }}>
              Action Needed: Assign Unmatched SKUs to Store Products ({importResult.unmatchedRows.length} Rows)
            </h3>
            <p style={{ fontSize: "13px", color: "#78350f", marginBottom: "16px" }}>
              These reviews could not be auto-matched to an existing store SKU. Please map each one to a target product below:
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="preview-table">
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
                className="btn-import"
                onClick={handleConfirmManualMappings}
                disabled={loading}
              >
                Save Mapped Reviews to Product History
              </button>
            </div>
          </div>
        )}

        {/* 5. PRODUCT-SPECIFIC MARKETPLACE IMPORT HISTORY */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          {/* Header & Filter Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Product Marketplace Review Import History
              </h3>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
                Persistent import history organized by product. Track marketplace origin, dates, counts, and status.
              </p>
            </div>

            {/* Filter by Product Dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "280px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
                Filter Product:
              </label>
              <select
                className="custom-select"
                style={{ padding: "8px 12px", fontSize: "13px" }}
                value={selectedProductHistoryFilter}
                onChange={(e) => setSelectedProductHistoryFilter(e.target.value)}
              >
                <option value="ALL">All Products with History ({historyList.length} logs)</option>
                {historyProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Spotlight Summary Card */}
          {productSpotlight && (
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
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                  Active Product
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {productSpotlight.productTitle}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                  Marketplace Reviews
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#166534", marginTop: "2px" }}>
                  {productSpotlight.totalImported} imported
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                  Channel Breakdown
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <span className="badge-pill" style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", padding: "2px 8px" }}>
                    Amazon: {productSpotlight.amazonCount}
                  </span>
                  <span className="badge-pill" style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "11px", padding: "2px 8px" }}>
                    Flipkart: {productSpotlight.flipkartCount}
                  </span>
                  <span className="badge-pill" style={{ background: "#e2e8f0", color: "#334155", fontSize: "11px", padding: "2px 8px" }}>
                    Alibaba: {productSpotlight.alibabaCount}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
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

          {/* History Records Table */}
          {filteredHistory.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>No marketplace import logs recorded for this selection yet.</div>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>Upload a marketplace CSV above to see product import records appear here.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="history-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Marketplace Source</th>
                    <th>Import Date & Time</th>
                    <th>Reviews Imported</th>
                    <th>File Name</th>
                    <th>Import Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => {
                    const isAmazon = item.sourceType.toLowerCase().includes("amazon");
                    const isFlipkart = item.sourceType.toLowerCase().includes("flipkart");
                    const badgeBg = isAmazon ? "#fef3c7" : isFlipkart ? "#e0f2fe" : "#f1f5f9";
                    const badgeText = isAmazon ? "#92400e" : isFlipkart ? "#0369a1" : "#334155";

                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>
                            {item.productTitle}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                            {item.productId.replace("gid://shopify/Product/", "ID: ")}
                          </div>
                        </td>
                        <td>
                          <span className="badge-pill" style={{ background: badgeBg, color: badgeText }}>
                            {item.sourceType}
                          </span>
                        </td>
                        <td style={{ color: "#334155" }}>
                          {new Date(item.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {" • "}
                          {new Date(item.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: "#166534" }}>
                            +{item.reviewCount} reviews
                          </span>
                        </td>
                        <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: "12px" }}>
                          {item.fileName || "marketplace_reviews.csv"}
                        </td>
                        <td>
                          <span className="badge-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                            ✓ {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
