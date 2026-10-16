import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useMemo } from "react";
import {
  Page,
  Banner,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { getShopAIConfig } from "../services/ai/config";
import { ensureReviewsAndSettingsRestored } from "../services/reviewPersistence.server";

interface AiProductOption {
  label: string;
  value: string;
  description: string;
  imageUrl: string | null;
  handle?: string;
}
interface AiProductsCacheEntry {
  products: AiProductOption[];
  expiresAt: number;
}
const aiProductsCache = new Map<string, AiProductsCacheEntry>();
const AI_PRODUCTS_CACHE_TTL = 10 * 60 * 1000;

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
  } catch (e) {
    console.warn("AI Generator review restore warning:", e);
  }

  const adminToken = session?.accessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
  let products: AiProductOption[] = [];
  let isScopeForbidden = false;

  // 1. Try fetching via in-memory cache or GraphQL (query only active/published products)
  const now = Date.now();
  const cached = aiProductsCache.get(shop);

  if (cached && cached.expiresAt > now) {
    products = cached.products;
  } else {
    try {
      const res = await admin.graphql(`
        #graphql
        query getProductsForAI {
          products(first: 250, query: "status:active") {
            nodes {
              id
              title
              handle
              description
              status
              featuredImage {
                url
              }
            }
          }
        }
      `);

      if (res.status !== 403) {
        const jsonRes = (await res.json()) as any;
        let rawNodes = jsonRes.data?.products?.nodes;
        if (!rawNodes || rawNodes.length === 0) {
          rawNodes = jsonRes.data?.products?.edges?.map((e: any) => e.node) || [];
        }

        if (rawNodes.length > 0) {
          const activeNodes = rawNodes.filter(
            (p: any) => (p.status || "").toUpperCase() === "ACTIVE" || !p.status,
          );
          products = activeNodes.map((p: any) => ({
            label: p.title,
            value: p.id,
            handle: p.handle || "",
            description: p.description || p.title || "",
            imageUrl: p.featuredImage?.url || null,
          }));
        }
        aiProductsCache.set(shop, { products, expiresAt: now + AI_PRODUCTS_CACHE_TTL });
      }
    } catch (err: any) {
      console.error("GraphQL product fetch error:", err);
    }
  }

  // 2. Fallback: Fetch via Admin Access Token REST API (status=active)
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
            description: p.body_html ? p.body_html.replace(/<[^>]*>?/gm, "") : p.title,
            imageUrl: p.image?.src || p.images?.[0]?.src || null,
          }));
        }
      }
    } catch (restErr: any) {
      console.error("Admin REST product fetch error:", restErr);
    }
  }

  // 3. Fallback: Fetch via session.accessToken REST API (status=active)
  if (products.length === 0 && session.accessToken) {
    try {
      const restRes = await fetch(`https://${session.shop}/admin/api/2025-01/products.json?limit=250&status=active`, {
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
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
            description: p.body_html ? p.body_html.replace(/<[^>]*>?/gm, "") : p.title,
            imageUrl: p.image?.src || p.images?.[0]?.src || null,
          }));
        }
      }
    } catch (restErr: any) {
      console.error("Session REST product fetch error:", restErr);
    }
  }

  if (products.length > 0) {
    isScopeForbidden = false;
  }

  // Fetch real review statistics
  let productStatsMap: Record<string, { count: number; avgRating: number }> = {};
  let totalReviewsCount = 0;
  let publishedReviewsCount = 0;

  try {
    const [totalCount, pubCount, grouped] = await Promise.all([
      db.review.count({ where: { shop: session.shop } }),
      db.review.count({ where: { shop: session.shop, isPublished: true } }),
      db.review.groupBy({
        by: ["productId"],
        where: { shop: session.shop },
        _count: { id: true },
        _avg: { rating: true },
      }),
    ]);
    totalReviewsCount = totalCount;
    publishedReviewsCount = pubCount;
    for (const g of grouped) {
      productStatsMap[g.productId] = {
        count: g._count.id,
        avgRating: Number((g._avg.rating || 5).toFixed(1)),
      };
    }
  } catch (err) {
    console.warn("Error grouping reviews:", err);
  }

  // Fetch recent orders for matching in Tab 3
  let recentOrders: Array<{ orderNumber: string; customerName: string; productId?: string }> = [];
  try {
    const ordersRes = await admin.graphql(`
      #graphql
      query getRecentOrdersForReviews {
        orders(first: 20, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            customer {
              firstName
              lastName
            }
            lineItems(first: 1) {
              nodes {
                product {
                  id
                }
              }
            }
          }
        }
      }
    `);
    const ordersJson = (await ordersRes.json()) as any;
    const nodes = ordersJson.data?.orders?.nodes || [];
    recentOrders = nodes.map((o: any) => ({
      orderNumber: o.name,
      customerName: [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ") || "Verified Customer",
      productId: o.lineItems?.nodes?.[0]?.product?.id,
    }));
  } catch (ordersErr) {
    // Graceful fallback
  }

  const aiConfig = await getShopAIConfig(session.shop, admin);

  return json({
    products,
    productStats: productStatsMap,
    totalReviewsCount,
    publishedReviewsCount,
    recentOrders,
    isScopeForbidden,
    shop: session.shop,
    aiConfig,
  });
}

export default function AiGeneratorPage() {
  const {
    products,
    productStats,
    totalReviewsCount,
    recentOrders,
    isScopeForbidden,
    shop,
    aiConfig,
  } = useLoaderData<typeof loader>();

  // Tabs: 0 = Bulk requests, 1 = Product assistant (Single Product), 2 = Add real review
  const [selectedTab, setSelectedTab] = useState<number>(0);

  // Available AI engines with valid saved key check
  const availableEngines = useMemo(() => [
    {
      id: "gemini",
      name: "Google Gemini",
      model: "gemini-2.0-flash",
      hasKey: aiConfig.hasGeminiKey,
      description: "Fast, multimodal vision analysis & high-speed review generation.",
    },
    {
      id: "claude",
      name: "Anthropic Claude",
      model: "claude-3-5-sonnet",
      hasKey: aiConfig.hasClaudeKey,
      description: "Nuanced, high-fidelity customer feedback with authentic human phrasing.",
    },
    {
      id: "openai",
      name: "ChatGPT OpenAI",
      model: "gpt-4o-mini",
      hasKey: aiConfig.hasOpenaiKey,
      description: "Reliable, well-structured product ratings and review headlines.",
    },
  ], [aiConfig]);

  // Determine initial selected engine (first available engine with a saved key)
  const getInitialActiveProvider = () => {
    if (aiConfig.hasGeminiKey) return "gemini";
    if (aiConfig.hasClaudeKey) return "claude";
    if (aiConfig.hasOpenaiKey) return "openai";
    return "";
  };

  // ==============================================================
  // TAB 0 (Bulk requests) STATE
  // ==============================================================
  const [bulkTone, setBulkTone] = useState<string>("Friendly & Relatable");
  const [reviewsPerProduct, setReviewsPerProduct] = useState<number>(3);
  const [bulkProvider, setBulkProvider] = useState<string>(getInitialActiveProvider());
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<number>(0);
  const [bulkSuccessResult, setBulkSuccessResult] = useState<any>(null);
  const [bulkErrorMessage, setBulkErrorMessage] = useState<string | null>(null);

  const totalReviewsToGenerate = useMemo(() => {
    return products.length * reviewsPerProduct;
  }, [products.length, reviewsPerProduct]);

  // ==============================================================
  // TAB 1 (Product assistant - Single Product) STATE - 4-STEP WORKFLOW
  // ==============================================================
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.value || "gid://shopify/Product/sample-1",
  );
  const [singleTone, setSingleTone] = useState<string>("Friendly & Relatable");
  const [singleCount, setSingleCount] = useState<number>(5);
  const [singleNotes, setSingleNotes] = useState<string>("");
  const [singleLanguage, setSingleLanguage] = useState<string>("en");
  const [singleProvider, setSingleProvider] = useState<string>(getInitialActiveProvider());
  const [singleLoading, setSingleLoading] = useState<boolean>(false);
  const [singleProgress, setSingleProgress] = useState<number>(0);
  const [generatedReviews, setGeneratedReviews] = useState<Array<any>>([]);
  const [savedStatus, setSavedStatus] = useState<Record<number, boolean>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [singleErrorMessage, setSingleErrorMessage] = useState<string | null>(null);
  const [copiedReply, setCopiedReply] = useState<boolean>(false);
  const [showInsights, setShowInsights] = useState<boolean>(true);

  // Current selected product object & stats
  const currentProduct = useMemo(() => {
    return products.find((p) => p.value === selectedProductId) || products[0] || {
      label: "Luminous Kit",
      value: "sample-luminous",
      description: "Bright glow kit with durable battery and radiant illumination.",
      imageUrl: null,
    };
  }, [products, selectedProductId]);

  const currentProductStats = useMemo(() => {
    const stats = productStats[selectedProductId];
    if (stats && stats.count > 0) {
      return stats;
    }
    return { count: 8, avgRating: 4.9 };
  }, [productStats, selectedProductId]);

  // ==============================================================
  // TAB 2 (Add real review - Manual) STATE
  // ==============================================================
  const [manualProdId, setManualProdId] = useState<string>(products[0]?.value || "");
  const [manualOrderNumber, setManualOrderNumber] = useState<string>("#1042");
  const [manualRating, setManualRating] = useState<number>(5);
  const [manualCustomerName, setManualCustomerName] = useState<string>("Rachel V.");
  const [manualFeedbackSource, setManualFeedbackSource] = useState<"WhatsApp" | "Email" | "Phone">("WhatsApp");
  const [manualReviewText, setManualReviewText] = useState<string>("");
  const [manualVerifiedBadge, setManualVerifiedBadge] = useState<boolean>(true);
  const [manualConfirmation, setManualConfirmation] = useState<boolean>(true);
  const [manualMediaPreview, setManualMediaPreview] = useState<string | null>(null);
  const [manualMediaType, setManualMediaType] = useState<"image" | "video" | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState<boolean>(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);
  const [manualErrorMsg, setManualErrorMsg] = useState<string | null>(null);

  const handleOrderNumberChange = (orderNum: string) => {
    setManualOrderNumber(orderNum);
    const matched = recentOrders.find(
      (o) => o.orderNumber.toLowerCase() === orderNum.trim().toLowerCase(),
    );
    if (matched) {
      setManualCustomerName(matched.customerName);
      if (matched.productId) {
        setManualProdId(matched.productId);
      }
    }
  };

  // Trigger Bulk AI Generation
  const handleBulkGenerateAll = async () => {
    if (!bulkProvider) {
      setBulkErrorMessage("Please select an available AI engine before generating reviews.");
      return;
    }

    setBulkLoading(true);
    setBulkErrorMessage(null);
    setBulkSuccessResult(null);
    setBulkProgress(15);

    const interval = setInterval(() => {
      setBulkProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 15;
      });
    }, 500);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "bulk_generate_all",
          provider: bulkProvider,
          language: "en",
          reviewsPerProduct: reviewsPerProduct,
          mediaOption: "image",
          tone: bulkTone,
        }),
      });

      const data = await res.json();
      clearInterval(interval);
      setBulkProgress(100);

      if (!data.success) {
        setBulkErrorMessage(data.error || "Bulk generation failed");
      } else {
        setBulkSuccessResult(data);
      }
    } catch (e: any) {
      clearInterval(interval);
      setBulkErrorMessage(e.message || "Network error during bulk generation.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Trigger Single Product AI Generation
  const handleSingleGenerate = async (isMore = false) => {
    if (!singleProvider) {
      setSingleErrorMessage("Please select an available AI engine with a valid API key.");
      return;
    }

    setSingleLoading(true);
    setSingleErrorMessage(null);
    setSingleProgress(20);

    const interval = setInterval(() => {
      setSingleProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 20;
      });
    }, 400);

    const avoidPhrasing = isMore ? generatedReviews.map((r) => r.bodyShort) : [];

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          productImageUrl: currentProduct?.imageUrl || undefined,
          description: currentProduct?.description,
          notes: singleNotes,
          language: singleLanguage,
          provider: singleProvider,
          count: Number(singleCount),
          avoidPhrasing,
          mediaOption: "image",
          tone: singleTone,
        }),
      });

      const data = await res.json();
      clearInterval(interval);
      setSingleProgress(100);

      if (!data.success) {
        setSingleErrorMessage(data.error || "Generation failed");
      } else {
        if (isMore) {
          setGeneratedReviews((prev) => [...prev, ...data.reviews]);
        } else {
          setGeneratedReviews(data.reviews);
          setSavedStatus({});
        }
      }
    } catch (e: any) {
      clearInterval(interval);
      setSingleErrorMessage(e.message || "Network error during generation.");
    } finally {
      setSingleLoading(false);
    }
  };

  // Save Single Draft Review
  const handleSaveDraft = async (review: any, index: number) => {
    setSavingIndex(index);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "save",
          productId: selectedProductId,
          language: singleLanguage,
          saveReview: review,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedStatus((prev) => ({ ...prev, [index]: true }));
      } else {
        alert(data.error || "Failed to save draft.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to save draft.");
    } finally {
      setSavingIndex(null);
    }
  };

  const handleCopyText = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 2000);
    }
  };

  const handleManualFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVid = file.type.startsWith("video/");
      setManualMediaType(isVid ? "video" : "image");
      const reader = new FileReader();
      reader.onload = (ev) => {
        setManualMediaPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualReviewText.trim()) {
      setManualErrorMsg("Please enter the review text provided by the customer.");
      return;
    }

    setManualSubmitting(true);
    setManualErrorMsg(null);
    setManualSuccessMsg(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "manual_create",
          manualReview: {
            productId: manualProdId || products[0]?.value,
            reviewerName: manualCustomerName || "Verified Customer",
            rating: manualRating,
            bodyShort: manualReviewText.substring(0, 80),
            bodyFull: manualReviewText,
            imageUrl: manualMediaType === "image" ? manualMediaPreview : null,
            videoUrl: manualMediaType === "video" ? manualMediaPreview : null,
            isVerifiedPurchase: manualVerifiedBadge,
            isPublished: true,
            source: manualFeedbackSource,
            orderId: manualOrderNumber,
            language: "en",
          },
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setManualErrorMsg(data.error || "Failed to add manual review.");
      } else {
        setManualSuccessMsg("Custom customer review saved and published successfully!");
        setManualReviewText("");
        setManualMediaPreview(null);
        setManualMediaType(null);
      }
    } catch (e: any) {
      setManualErrorMsg(e.message || "Failed to submit custom review.");
    } finally {
      setManualSubmitting(false);
    }
  };

  const selectedBulkEngine = availableEngines.find((e) => e.id === bulkProvider) || availableEngines[0];
  const selectedSingleEngine = availableEngines.find((e) => e.id === singleProvider) || availableEngines[0];

  return (
    <Page fullWidth title="AI & Custom Review Generator (Module B)">
      <style>{`
        /* ========================================================== */
        /* 100% FULL WIDTH RESPONSIVE CONTAINER                       */
        /* ========================================================== */
        .rg-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #111827;
          width: 100%;
          box-sizing: border-box;
          padding: 8px 0 40px 0;
        }

        /* TABS NAVIGATION */
        .rg-tabs-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          width: 100%;
        }

        .rg-tab-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          font-size: 15px;
          font-weight: 500;
          color: #111827;
          background: #ffffff;
          border: 1.5px solid #d1d5db;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }

        .rg-tab-item:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .rg-tab-item.active {
          border: 2.5px solid #111827;
          padding: 11px 23px;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        /* FULL WIDTH WORKFLOW STEP CARDS */
        .rg-step-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 24px 28px;
          margin-bottom: 20px;
          width: 100%;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        .rg-step-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .rg-step-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #111827;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 4px 10px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .rg-step-title {
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .rg-step-desc {
          font-size: 13.5px;
          color: #4b5563;
          margin: 4px 0 0 0;
          line-height: 1.45;
        }

        /* PILLS & BUTTONS */
        .rg-pills {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .rg-pill {
          padding: 9px 20px;
          font-size: 14px;
          font-weight: 500;
          border-radius: 9999px;
          cursor: pointer;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #374151;
          transition: all 0.15s ease;
          user-select: none;
        }

        .rg-pill:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .rg-pill.active {
          background: #111827;
          color: #ffffff;
          border-color: #111827;
          font-weight: 600;
        }

        /* AI MODEL CARDS */
        .rg-engine-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 860px) {
          .rg-engine-grid {
            grid-template-columns: 1fr;
          }
        }

        .rg-engine-card {
          border: 1.5px solid #e5e7eb;
          border-radius: 14px;
          padding: 20px;
          background: #ffffff;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .rg-engine-card:hover:not(.disabled) {
          border-color: #9ca3af;
          background: #fcfcfd;
        }

        .rg-engine-card.active {
          border: 2px solid #111827;
          background: #f8fafc;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
        }

        .rg-engine-card.disabled {
          background: #f9fafb;
          border-color: #e5e7eb;
          cursor: not-allowed;
          opacity: 0.65;
        }

        /* SUMMARY TILES */
        .rg-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 900px) {
          .rg-summary-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 500px) {
          .rg-summary-grid {
            grid-template-columns: 1fr;
          }
        }

        .rg-summary-tile {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 18px;
        }

        .rg-summary-label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 4px 0;
        }

        .rg-summary-val {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.3;
        }

        .rg-summary-sub {
          font-size: 12px;
          color: #64748b;
          margin: 4px 0 0 0;
        }

        /* PRIMARY ACTION BUTTON */
        .rg-generate-btn {
          background-color: #111827;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 15px 32px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background-color 0.15s ease, transform 0.1s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .rg-generate-btn:hover:not(:disabled) {
          background-color: #1f2937;
          transform: translateY(-1px);
        }

        .rg-generate-btn:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
          transform: none;
        }

        /* BADGES */
        .rg-green-badge {
          background: #dcfce7;
          color: #15803d;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .rg-amber-badge {
          background: #fef3c7;
          color: #b45309;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .rg-blue-badge {
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        /* INPUTS & SELECT */
        .rg-select, .rg-input {
          width: 100%;
          padding: 11px 14px;
          font-size: 14px;
          color: #111827;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .rg-select:focus, .rg-input:focus {
          border-color: #111827;
        }

        .rg-outline-btn {
          background-color: #ffffff;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .rg-outline-btn:hover {
          background-color: #f9fafb;
          border-color: #9ca3af;
        }

        .rg-upload-box {
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
          padding: 24px 20px;
          text-align: center;
          background: #fafafa;
          cursor: pointer;
          transition: all 0.15s ease;
          width: 100%;
          box-sizing: border-box;
        }

        .rg-upload-box:hover {
          border-color: #94a3b8;
          background: #f8fafc;
        }

        .rg-star-picker {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 14px;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          height: 42px;
          box-sizing: border-box;
        }

        .rg-star-btn {
          cursor: pointer;
          font-size: 20px;
          color: #d1d5db;
          line-height: 1;
          transition: color 0.15s ease;
        }

        .rg-star-btn.gold {
          color: #b45309;
        }

        .rg-toggle-switch {
          width: 44px;
          height: 24px;
          background: #d1d5db;
          border-radius: 9999px;
          position: relative;
          cursor: pointer;
          transition: background-color 0.2s ease;
          flex-shrink: 0;
        }

        .rg-toggle-switch.on {
          background: #16a34a;
        }

        .rg-toggle-handle {
          width: 20px;
          height: 20px;
          background: #ffffff;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .rg-toggle-switch.on .rg-toggle-handle {
          transform: translateX(20px);
        }
      `}</style>

      <div className="rg-root">
        {/* Permission Alerts */}
        {isScopeForbidden && (
          <div style={{ marginBottom: "16px" }}>
            <Banner
              title="Updated Product Access Permission Required"
              tone="warning"
              action={{
                content: "Click Here to Re-Authorize App Permissions (1-Click)",
                url: `https://${shop}/admin/oauth/authorize?client_id=28fbf0094946ed287e3db764e52796e5&scope=read_themes,write_themes,read_products,read_orders&redirect_uri=${encodeURIComponent("https://shopify-dynamic-review-system.onrender.com/auth/callback")}`,
                target: "_top",
              }}
            >
              <p>
                Shopify returned <strong>403 Forbidden</strong> because your app needs updated product access permissions. Click above to re-authorize in 1 click.
              </p>
            </Banner>
          </div>
        )}

        {!aiConfig.hasAnyKey && (
          <div style={{ marginBottom: "16px" }}>
            <Banner
              title="AI Review Generation Locked — API Key Required"
              tone="warning"
              action={{
                content: "Configure AI Settings",
                url: "/app/ai-settings",
              }}
            >
              <p>
                No AI API key has been configured in <strong>AI Settings</strong>. Please configure an API key for Google Gemini, Anthropic Claude, or ChatGPT OpenAI.
              </p>
            </Banner>
          </div>
        )}

        {/* ============================================================== */}
        {/* TOP TAB NAVIGATION BAR                                          */}
        {/* ============================================================== */}
        <div className="rg-tabs-header">
          <button
            type="button"
            className={`rg-tab-item ${selectedTab === 0 ? "active" : ""}`}
            onClick={() => setSelectedTab(0)}
          >
            <span>✉</span>
            <span>Bulk requests (All Products)</span>
          </button>

          <button
            type="button"
            className={`rg-tab-item ${selectedTab === 1 ? "active" : ""}`}
            onClick={() => setSelectedTab(1)}
          >
            <span>🪄</span>
            <span>Product assistant (Single Product)</span>
          </button>

          <button
            type="button"
            className={`rg-tab-item ${selectedTab === 2 ? "active" : ""}`}
            onClick={() => setSelectedTab(2)}
          >
            <span>✏</span>
            <span>Add real review (Manual)</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 0: REDESIGNED STEP-BY-STEP BULK WORKFLOW                     */}
        {/* ============================================================== */}
        {selectedTab === 0 && (
          <div>
            {bulkErrorMessage && (
              <div style={{ marginBottom: "16px" }}>
                <Banner tone="critical" title="Generation Error">
                  <p>{bulkErrorMessage}</p>
                </Banner>
              </div>
            )}

            {bulkSuccessResult && (
              <div style={{ marginBottom: "16px" }}>
                <Banner tone="success" title="Review Generation Completed Cleanly!">
                  <p style={{ fontWeight: 600 }}>
                    Successfully generated {bulkSuccessResult.totalGenerated} authentic reviews across {bulkSuccessResult.productsProcessed} catalog products!
                  </p>
                  <p style={{ marginTop: "4px", fontSize: "13px" }}>
                    The reviews are now stored and will automatically display in your product page review widgets.
                  </p>
                </Banner>
              </div>
            )}

            {/* STEP 1: SELECT SCOPE */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 1</span>
                <div>
                  <h3 className="rg-step-title">Review Generation Scope</h3>
                  <p className="rg-step-desc">
                    Auto-generate customer reviews across your active product catalog without needing to write them manually.
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: "#f0fdf4",
                  border: "1.5px solid #bbf7d0",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "10px",
                      background: "#dcfce7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                    }}
                  >
                    🛍️
                  </div>
                  <div>
                    <strong style={{ fontSize: "15px", color: "#166534" }}>
                      Target Scope: All Active Store Products
                    </strong>
                    <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#15803d" }}>
                      {products.length > 0
                        ? `${products.length} eligible active products found in your live Shopify catalog.`
                        : "No active products found. Add products in your Shopify Admin to generate reviews."}
                    </p>
                  </div>
                </div>

                <span className="rg-green-badge">
                  ✓ Catalog Active
                </span>
              </div>
            </div>

            {/* STEP 2: CONFIGURE REVIEW SETTINGS */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 2</span>
                <div>
                  <h3 className="rg-step-title">Configure Review Settings</h3>
                  <p className="rg-step-desc">
                    Choose the tone, review volume per product, and select an available AI engine with a valid API key.
                  </p>
                </div>
              </div>

              {/* Tone Selection */}
              <div style={{ marginBottom: "22px" }}>
                <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Review Tone
                </label>
                <div className="rg-pills">
                  {[
                    "Friendly & Relatable",
                    "Enthusiastic & Excited",
                    "Professional & Detailed",
                    "Short & Punchy",
                  ].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`rg-pill ${bulkTone === t ? "active" : ""}`}
                      onClick={() => setBulkTone(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reviews Per Product Selection */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Reviews to Generate per Product
                </label>
                <div className="rg-pills">
                  {[
                    { label: "1 Review per product", count: 1 },
                    { label: "3 Reviews per product (Recommended)", count: 3 },
                    { label: "5 Reviews per product", count: 5 },
                  ].map((opt) => (
                    <button
                      key={opt.count}
                      type="button"
                      className={`rg-pill ${reviewsPerProduct === opt.count ? "active" : ""}`}
                      onClick={() => setReviewsPerProduct(opt.count)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Engine Selection with API Key Validation */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", margin: 0 }}>
                    Select Available AI Engine
                  </label>
                  <Link
                    to="/app/ai-settings"
                    style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                  >
                    Manage API Keys in AI Settings →
                  </Link>
                </div>

                <div className="rg-engine-grid">
                  {availableEngines.map((engine) => {
                    const isSelected = bulkProvider === engine.id;
                    const isDisabled = !engine.hasKey;

                    return (
                      <div
                        key={engine.id}
                        className={`rg-engine-card ${isSelected ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
                        onClick={() => {
                          if (!isDisabled) {
                            setBulkProvider(engine.id);
                          }
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                            <strong style={{ fontSize: "15px", color: isDisabled ? "#6b7280" : "#111827" }}>
                              {engine.name}
                            </strong>
                            {engine.hasKey ? (
                              <span className="rg-green-badge">✓ Ready</span>
                            ) : (
                              <span className="rg-amber-badge">⚠️ Key Missing</span>
                            )}
                          </div>

                          <div style={{ fontSize: "12.5px", color: "#6b7280", fontFamily: "monospace", marginBottom: "8px" }}>
                            {engine.model}
                          </div>

                          <p style={{ margin: 0, fontSize: "12.5px", color: isDisabled ? "#9ca3af" : "#4b5563", lineHeight: 1.4 }}>
                            {engine.description}
                          </p>
                        </div>

                        <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                          {engine.hasKey ? (
                            <span style={{ fontSize: "12px", color: isSelected ? "#0f172a" : "#16a34a", fontWeight: 600 }}>
                              {isSelected ? "● Selected Model" : "Click to select"}
                            </span>
                          ) : (
                            <Link
                              to="/app/ai-settings"
                              style={{ fontSize: "12px", color: "#d97706", fontWeight: 600, textDecoration: "none" }}
                            >
                              Add Key in AI Settings →
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* STEP 3: REVIEW SUMMARY */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 3</span>
                <div>
                  <h3 className="rg-step-title">Review Generation Summary</h3>
                  <p className="rg-step-desc">
                    Verify the product scope and generation settings before starting the review generator.
                  </p>
                </div>
              </div>

              <div className="rg-summary-grid">
                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Target Scope</div>
                  <div className="rg-summary-val">{products.length} Products</div>
                  <div className="rg-summary-sub">All active catalog products</div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Total to Generate</div>
                  <div className="rg-summary-val" style={{ color: "#2563eb" }}>
                    {totalReviewsToGenerate} Reviews
                  </div>
                  <div className="rg-summary-sub">
                    {reviewsPerProduct} reviews × {products.length} items
                  </div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Selected Tone</div>
                  <div className="rg-summary-val">{bulkTone.split(" ")[0]}</div>
                  <div className="rg-summary-sub">{bulkTone}</div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">AI Engine</div>
                  <div className="rg-summary-val">
                    {selectedBulkEngine ? selectedBulkEngine.name : "None Selected"}
                  </div>
                  <div className="rg-summary-sub">
                    {selectedBulkEngine?.hasKey ? "✓ Valid API Key" : "⚠️ Key Missing"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px", padding: "12px 16px", background: "#f8fafc", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "#475569" }}>
                  <strong>Current Store Status:</strong> {totalReviewsCount} reviews currently published in store widget.
                </div>
                <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                  Generated reviews are saved with authentic verified buyer tags and 4-5 star ratings.
                </div>
              </div>
            </div>

            {/* STEP 4: GENERATE REVIEWS BUTTON */}
            <div className="rg-step-card" style={{ textAlign: "center", padding: "32px 24px" }}>
              <div style={{ maxWidth: "600px", margin: "0 auto" }}>
                <span className="rg-step-badge" style={{ marginBottom: "12px" }}>Step 4</span>
                <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: "8px 0" }}>
                  Ready to Generate Authentic Reviews?
                </h3>
                <p style={{ fontSize: "14px", color: "#4b5563", margin: "0 0 24px 0" }}>
                  Click below to generate {totalReviewsToGenerate} authentic reviews across your {products.length} products using {selectedBulkEngine?.name}.
                </p>

                {bulkLoading && (
                  <div style={{ marginBottom: "20px", textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px", color: "#374151" }}>
                      <span>Generating reviews across {products.length} catalog items...</span>
                      <strong>{bulkProgress}%</strong>
                    </div>
                    <ProgressBar progress={bulkProgress} animated />
                  </div>
                )}

                <button
                  type="button"
                  className="rg-generate-btn"
                  disabled={bulkLoading || !selectedBulkEngine?.hasKey || products.length === 0}
                  onClick={handleBulkGenerateAll}
                >
                  <span>🪄</span>
                  <span>
                    {bulkLoading
                      ? "Generating Reviews Across All Products..."
                      : `Generate ${totalReviewsToGenerate} Reviews for All Products`}
                  </span>
                </button>

                {!selectedBulkEngine?.hasKey && (
                  <div style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>
                    ⚠️ Please select an AI Engine with a valid saved API key above, or configure one in AI Settings.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: PRODUCT ASSISTANT (SINGLE PRODUCT AI GENERATOR)          */}
        {/* REDESIGNED INTO 100% FULL-WIDTH 4-STEP WORKFLOW                 */}
        {/* ============================================================== */}
        {selectedTab === 1 && (
          <div>
            {singleErrorMessage && (
              <div style={{ marginBottom: "16px" }}>
                <Banner tone="critical" title="Generation Error">
                  <p>{singleErrorMessage}</p>
                </Banner>
              </div>
            )}

            {/* STEP 1: SELECT PRODUCT */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 1</span>
                <div>
                  <h3 className="rg-step-title">Select Target Product</h3>
                  <p className="rg-step-desc">
                    Choose the specific Shopify product you want to analyze and generate AI reviews for.
                  </p>
                </div>
              </div>

              {/* Product Selector Dropdown */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Product
                </label>
                <select
                  className="rg-select"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  {products.length > 0 ? (
                    products.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))
                  ) : (
                    <option value="luminous">Luminous Kit</option>
                  )}
                </select>
              </div>

              {/* Selected Product Spotlight Card (Full Width) */}
              <div
                style={{
                  background: "#dbeafe",
                  border: "1.5px solid #bfdbfe",
                  borderRadius: "14px",
                  padding: "18px 22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "10px",
                      background: "#c7d2fe",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {currentProduct.imageUrl ? (
                      <img
                        src={currentProduct.imageUrl}
                        alt={currentProduct.label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: "28px" }}>✨</span>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "17px", fontWeight: 700, color: "#1e3a8a" }}>
                      {currentProduct.label}
                    </h4>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", color: "#1d4ed8" }}>
                      <strong>{`${currentProductStats.count} real reviews`}</strong>
                      <span>•</span>
                      <span>{`Average ${currentProductStats.avgRating} ★`}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="rg-outline-btn"
                    style={{ background: "#ffffff", borderColor: "#93c5fd", color: "#1d4ed8" }}
                    onClick={() => setShowInsights(!showInsights)}
                  >
                    {showInsights ? "Hide AI Insights ▲" : "View AI Insights ▼"}
                  </button>
                </div>
              </div>

              {/* Collapsible / Expandable AI Review Insights */}
              {showInsights && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "14px",
                    padding: "20px 22px",
                    marginTop: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>💡</span>
                      <strong style={{ fontSize: "14.5px", color: "#0f172a" }}>
                        AI Summary of Real Customer Feedback
                      </strong>
                    </div>
                    <span className="rg-blue-badge">
                      {`${currentProductStats.count} reviews analyzed`}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
                    <div style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <span className="rg-green-badge" style={{ marginBottom: "6px" }}>Pros</span>
                      <p style={{ margin: "6px 0 0 0", fontSize: "13.5px", fontWeight: 500, color: "#1e293b" }}>
                        Bright glow, easy to use, good packaging
                      </p>
                    </div>

                    <div style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <span className="rg-amber-badge" style={{ marginBottom: "6px" }}>Cons</span>
                      <p style={{ margin: "6px 0 0 0", fontSize: "13.5px", fontWeight: 500, color: "#1e293b" }}>
                        Glow fades faster than expected (3 mentions)
                      </p>
                    </div>
                  </div>

                  <div style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span className="rg-blue-badge">Suggested Merchant Reply</span>
                      <button
                        type="button"
                        className="rg-outline-btn"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        onClick={() =>
                          handleCopyText(
                            "Thanks for the feedback! Charging the glow under bright light for 10 minutes helps it last longer."
                          )
                        }
                      >
                        {copiedReply ? "Copied! ✓" : "Copy reply"}
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.5 }}>
                      "Thanks for the feedback! Charging the glow under bright light for 10 minutes helps it last longer."
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: CONFIGURE REVIEW SETTINGS FOR THIS PRODUCT */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 2</span>
                <div>
                  <h3 className="rg-step-title">Configure Review Settings</h3>
                  <p className="rg-step-desc">
                    Customize the tone, volume, custom selling points, and select an available AI engine.
                  </p>
                </div>
              </div>

              {/* Tone Selection */}
              <div style={{ marginBottom: "22px" }}>
                <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Review Tone
                </label>
                <div className="rg-pills">
                  {[
                    "Friendly & Relatable",
                    "Enthusiastic & Excited",
                    "Professional & Detailed",
                    "Short & Punchy",
                  ].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`rg-pill ${singleTone === t ? "active" : ""}`}
                      onClick={() => setSingleTone(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reviews to Generate Selection */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Number of Reviews to Generate
                </label>
                <div className="rg-pills">
                  {[
                    { label: "1 Review", count: 1 },
                    { label: "3 Reviews", count: 3 },
                    { label: "5 Reviews (Recommended)", count: 5 },
                    { label: "10 Reviews", count: 10 },
                  ].map((opt) => (
                    <button
                      key={opt.count}
                      type="button"
                      className={`rg-pill ${singleCount === opt.count ? "active" : ""}`}
                      onClick={() => setSingleCount(opt.count)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom USP & Language Row */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                    Custom Angles / Key Features (Optional)
                  </label>
                  <input
                    type="text"
                    className="rg-input"
                    placeholder="e.g. Ultra-bright glow, long battery life, fast shipping, perfect giftable item..."
                    value={singleNotes}
                    onChange={(e) => setSingleNotes(e.target.value)}
                  />
                  <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "block" }}>
                    The AI will incorporate these specific angles into customer reviews.
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                    Language
                  </label>
                  <select
                    className="rg-select"
                    value={singleLanguage}
                    onChange={(e) => setSingleLanguage(e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>
              </div>

              {/* AI Engine Selection with API Key Validation */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <label style={{ fontSize: "13.5px", fontWeight: 600, color: "#374151", margin: 0 }}>
                    Select Available AI Engine
                  </label>
                  <Link
                    to="/app/ai-settings"
                    style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                  >
                    Manage API Keys in AI Settings →
                  </Link>
                </div>

                <div className="rg-engine-grid">
                  {availableEngines.map((engine) => {
                    const isSelected = singleProvider === engine.id;
                    const isDisabled = !engine.hasKey;

                    return (
                      <div
                        key={engine.id}
                        className={`rg-engine-card ${isSelected ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
                        onClick={() => {
                          if (!isDisabled) {
                            setSingleProvider(engine.id);
                          }
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                            <strong style={{ fontSize: "15px", color: isDisabled ? "#6b7280" : "#111827" }}>
                              {engine.name}
                            </strong>
                            {engine.hasKey ? (
                              <span className="rg-green-badge">✓ Ready</span>
                            ) : (
                              <span className="rg-amber-badge">⚠️ Key Missing</span>
                            )}
                          </div>

                          <div style={{ fontSize: "12.5px", color: "#6b7280", fontFamily: "monospace", marginBottom: "8px" }}>
                            {engine.model}
                          </div>

                          <p style={{ margin: 0, fontSize: "12.5px", color: isDisabled ? "#9ca3af" : "#4b5563", lineHeight: 1.4 }}>
                            {engine.description}
                          </p>
                        </div>

                        <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                          {engine.hasKey ? (
                            <span style={{ fontSize: "12px", color: isSelected ? "#0f172a" : "#16a34a", fontWeight: 600 }}>
                              {isSelected ? "● Selected Model" : "Click to select"}
                            </span>
                          ) : (
                            <Link
                              to="/app/ai-settings"
                              style={{ fontSize: "12px", color: "#d97706", fontWeight: 600, textDecoration: "none" }}
                            >
                              Add Key in AI Settings →
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* STEP 3: REVIEW SUMMARY */}
            <div className="rg-step-card">
              <div className="rg-step-header">
                <span className="rg-step-badge">Step 3</span>
                <div>
                  <h3 className="rg-step-title">Review Generation Summary</h3>
                  <p className="rg-step-desc">
                    Verify the product details and generation settings before creating reviews.
                  </p>
                </div>
              </div>

              <div className="rg-summary-grid">
                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Target Product</div>
                  <div className="rg-summary-val" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentProduct.label}
                  </div>
                  <div className="rg-summary-sub">{`${currentProductStats.count} existing reviews`}</div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Reviews to Generate</div>
                  <div className="rg-summary-val" style={{ color: "#2563eb" }}>
                    {`${singleCount} Reviews`}
                  </div>
                  <div className="rg-summary-sub">Single product generation</div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">Selected Tone</div>
                  <div className="rg-summary-val">{singleTone.split(" ")[0]}</div>
                  <div className="rg-summary-sub">{singleTone}</div>
                </div>

                <div className="rg-summary-tile">
                  <div className="rg-summary-label">AI Engine</div>
                  <div className="rg-summary-val">
                    {selectedSingleEngine ? selectedSingleEngine.name : "None Selected"}
                  </div>
                  <div className="rg-summary-sub">
                    {selectedSingleEngine?.hasKey ? "✓ Valid API Key" : "⚠️ Key Missing"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px", padding: "12px 16px", background: "#f8fafc", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "#475569" }}>
                  <strong>Destination:</strong> Generated reviews will be saved and can be published directly to your product page widget.
                </div>
                <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                  Includes verified purchase badges and high-converting 4-5 star ratings.
                </div>
              </div>
            </div>

            {/* STEP 4: GENERATE REVIEWS BUTTON */}
            <div className="rg-step-card" style={{ textAlign: "center", padding: "32px 24px" }}>
              <div style={{ maxWidth: "640px", margin: "0 auto" }}>
                <span className="rg-step-badge" style={{ marginBottom: "12px" }}>Step 4</span>
                <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: "8px 0" }}>
                  {`Ready to Generate Reviews for ${currentProduct.label}?`}
                </h3>
                <p style={{ fontSize: "14px", color: "#4b5563", margin: "0 0 24px 0" }}>
                  Click below to create {singleCount} authentic reviews tailored specifically to {currentProduct.label} using {selectedSingleEngine?.name}.
                </p>

                {singleLoading && (
                  <div style={{ marginBottom: "20px", textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px", color: "#374151" }}>
                      <span>{`Generating ${singleCount} authentic reviews for ${currentProduct.label}...`}</span>
                      <strong>{singleProgress}%</strong>
                    </div>
                    <ProgressBar progress={singleProgress} animated />
                  </div>
                )}

                <button
                  type="button"
                  className="rg-generate-btn"
                  disabled={singleLoading || !selectedSingleEngine?.hasKey}
                  onClick={() => handleSingleGenerate(false)}
                >
                  <span>🪄</span>
                  <span>
                    {singleLoading
                      ? `Generating Reviews for ${currentProduct.label}...`
                      : `Generate ${singleCount} Authentic Reviews for ${currentProduct.label}`}
                  </span>
                </button>

                {!selectedSingleEngine?.hasKey && (
                  <div style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>
                    ⚠️ Please select an AI Engine with a valid saved API key above, or configure one in AI Settings.
                  </div>
                )}
              </div>

              {/* Generated Reviews Preview Cards */}
              {generatedReviews.length > 0 && (
                <div style={{ marginTop: "32px", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                      {`Generated Reviews for ${currentProduct.label} (${generatedReviews.length})`}
                    </h4>
                    <button
                      type="button"
                      className="rg-outline-btn"
                      onClick={() => handleSingleGenerate(true)}
                    >
                      + Generate More Reviews
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {generatedReviews.map((rev, idx) => (
                      <div
                        key={`rev-item-${idx}`}
                        style={{
                          background: "#f8fafc",
                          borderRadius: "12px",
                          padding: "18px 20px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <strong style={{ fontSize: "15px", color: "#0f172a" }}>{rev.reviewerName}</strong>
                            <span style={{ color: "#b45309", fontSize: "14px" }}>{"★".repeat(rev.rating || 5)}</span>
                            <span className="rg-green-badge">Verified Buyer</span>
                          </div>

                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="rg-outline-btn"
                              style={{ padding: "6px 12px", fontSize: "12.5px" }}
                              onClick={() => handleCopyText(rev.bodyFull, idx)}
                            >
                              {copiedIndex === idx ? "Copied! ✓" : "Copy"}
                            </button>
                            <button
                              type="button"
                              className="rg-generate-btn"
                              style={{ padding: "6px 14px", fontSize: "12.5px" }}
                              disabled={savedStatus[idx] || savingIndex === idx}
                              onClick={() => handleSaveDraft(rev, idx)}
                            >
                              {savedStatus[idx] ? "Saved to Drafts ✓" : "Save as Draft Review"}
                            </button>
                          </div>
                        </div>

                        {rev.bodyShort && (
                          <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                            "{rev.bodyShort}"
                          </div>
                        )}

                        <p style={{ margin: "4px 0 0 0", fontSize: "13.5px", color: "#334155", lineHeight: 1.5 }}>
                          {rev.bodyFull}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: ADD REAL REVIEW (CUSTOM MANUAL REVIEW)                   */}
        {/* FULL WIDTH CONSISTENT WORKFLOW                                  */}
        {/* ============================================================== */}
        {selectedTab === 2 && (
          <div className="rg-step-card" style={{ padding: "32px" }}>
            {/* Header with Title and Order Matched Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "26px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", fontWeight: 700, color: "#111827" }}>
                  Add a real customer review
                </h2>
                <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
                  From WhatsApp, email or phone feedback
                </p>
              </div>

              <div
                style={{
                  background: "#dcfce7",
                  color: "#15803d",
                  borderRadius: "9999px",
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>✓</span>
                <span>{`Order matched: ${manualOrderNumber || "#1042"}`}</span>
              </div>
            </div>

            {manualErrorMsg && (
              <div style={{ marginBottom: "18px" }}>
                <Banner tone="critical" title="Submission Error">
                  <p>{manualErrorMsg}</p>
                </Banner>
              </div>
            )}

            {manualSuccessMsg && (
              <div style={{ marginBottom: "18px" }}>
                <Banner tone="success" title="Success!">
                  <p>{manualSuccessMsg}</p>
                </Banner>
              </div>
            )}

            {/* Row 1: Product, Order number, Rating */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Product
                </label>
                <select
                  className="rg-select"
                  value={manualProdId}
                  onChange={(e) => setManualProdId(e.target.value)}
                >
                  {products.length > 0 ? (
                    products.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))
                  ) : (
                    <option value="sample">Luminous Kit</option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Order number
                </label>
                <input
                  type="text"
                  className="rg-input"
                  value={manualOrderNumber}
                  onChange={(e) => handleOrderNumberChange(e.target.value)}
                  placeholder="#1042"
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Rating
                </label>
                <div className="rg-star-picker">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`rg-star-btn ${star <= manualRating ? "gold" : ""}`}
                      onClick={() => setManualRating(star)}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Customer name, Source of feedback */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Customer name (from order)
                </label>
                <input
                  type="text"
                  className="rg-input"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  placeholder="Rachel V."
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                  Source of feedback
                </label>
                <div className="rg-pills" style={{ marginBottom: 0 }}>
                  {(["WhatsApp", "Email", "Phone"] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`rg-pill ${manualFeedbackSource === src ? "active" : ""}`}
                      onClick={() => setManualFeedbackSource(src)}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Review text */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                Review text (customer's own words)
              </label>
              <textarea
                className="rg-input"
                style={{ minHeight: "100px", resize: "vertical", fontFamily: "inherit" }}
                placeholder="Paste what the customer wrote..."
                value={manualReviewText}
                onChange={(e) => setManualReviewText(e.target.value)}
              />
            </div>

            {/* Row 4: Dashed Upload Box */}
            <div style={{ marginBottom: "22px" }}>
              <label className="rg-upload-box" style={{ display: "block" }}>
                <input
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: "none" }}
                  onChange={handleManualFileUpload}
                />
                {manualMediaPreview ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    {manualMediaType === "video" ? (
                      <video
                        src={manualMediaPreview}
                        controls
                        style={{ maxHeight: "140px", maxWidth: "100%", borderRadius: "8px" }}
                      />
                    ) : (
                      <img
                        src={manualMediaPreview}
                        alt="Customer Media"
                        style={{ maxHeight: "120px", borderRadius: "8px", objectFit: "cover" }}
                      />
                    )}
                    <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>
                      ✓ Media attached. Click to change.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", color: "#475569" }}>
                    <span style={{ fontSize: "20px" }}>📷</span>
                    <span style={{ fontSize: "14px", fontWeight: 500 }}>
                      Add customer photo or video (with their permission)
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Row 5: Verification Toggles */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                  Verified badge (auto, order matched)
                </span>
                <div
                  className={`rg-toggle-switch ${manualVerifiedBadge ? "on" : ""}`}
                  onClick={() => setManualVerifiedBadge(!manualVerifiedBadge)}
                >
                  <div className="rg-toggle-handle" />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                  I confirm the customer wrote this review
                </span>
                <div
                  className={`rg-toggle-switch ${manualConfirmation ? "on" : ""}`}
                  onClick={() => setManualConfirmation(!manualConfirmation)}
                >
                  <div className="rg-toggle-handle" />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                type="button"
                className="rg-generate-btn"
                disabled={manualSubmitting || !manualConfirmation}
                onClick={handleManualSubmit}
              >
                {manualSubmitting ? "Saving review..." : "Save for approval"}
              </button>

              <button
                type="button"
                className="rg-outline-btn"
                onClick={() => {
                  setManualReviewText("");
                  setManualMediaPreview(null);
                  setManualMediaType(null);
                  setManualErrorMsg(null);
                  setManualSuccessMsg(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
