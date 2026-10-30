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

interface OrdersCacheEntry {
  orders: Array<{ orderNumber: string; customerName: string; productId?: string }>;
  expiresAt: number;
}
const ordersCache = new Map<string, OrdersCacheEntry>();
const ORDERS_CACHE_TTL = 10 * 60 * 1000;

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

  // Fetch recent orders for matching in Tab 3 (cached with 10-minute TTL)
  let recentOrders: Array<{ orderNumber: string; customerName: string; productId?: string }> = [];
  const cachedOrders = ordersCache.get(shop);
  if (cachedOrders && cachedOrders.expiresAt > now) {
    recentOrders = cachedOrders.orders;
  } else {
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
      ordersCache.set(shop, { orders: recentOrders, expiresAt: now + ORDERS_CACHE_TTL });
    } catch (ordersErr) {
      // Graceful fallback
    }
  }

  // Fetch store collections for dynamic collection scope selection
  let collections: Array<{ id: string; title: string; handle: string }> = [];
  try {
    const collRes = await admin.graphql(`
      #graphql
      query getCollectionsForAI {
        collections(first: 50) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `);
    if (collRes.status !== 403) {
      const collJson = (await collRes.json()) as any;
      const rawNodes = collJson.data?.collections?.nodes || collJson.data?.collections?.edges?.map((e: any) => e.node) || [];
      collections = rawNodes.map((c: any) => ({
        id: c.id,
        title: c.title,
        handle: c.handle || "",
      }));
    }
  } catch (collErr) {
    console.warn("Collections fetch error:", collErr);
  }

  // Fetch recent AI generation jobs for audit history
  let recentJobs: Array<{
    id: string;
    status: string;
    resultCount: number;
    createdAt: string;
    provider: string;
  }> = [];
  try {
    const jobs = await db.aiGenerationJob.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    recentJobs = jobs.map((j) => ({
      id: j.id,
      status: j.status,
      resultCount: j.resultCount,
      createdAt: j.createdAt.toISOString(),
      provider: j.provider,
    }));
  } catch (jobErr) {
    // Graceful fallback
  }

  const aiConfig = await getShopAIConfig(session.shop, admin);

  return json({
    products,
    collections,
    productStats: productStatsMap,
    totalReviewsCount,
    publishedReviewsCount,
    recentOrders,
    recentJobs,
    isScopeForbidden,
    shop: session.shop,
    aiConfig,
  });
}

export default function AiGeneratorPage() {
  const {
    products,
    collections = [],
    productStats,
    totalReviewsCount,
    recentOrders,
    recentJobs = [],
    isScopeForbidden,
    shop,
    aiConfig,
  } = useLoaderData<typeof loader>();

  // Tabs: 0 = Bulk requests, 1 = Single product, 2 = Manual review
  const [selectedTab, setSelectedTab] = useState<number>(0);

  // Available AI engines with valid saved key check
  const availableEngines = useMemo(() => [
    {
      id: "gemini",
      name: "Google Gemini",
      model: "gemini-1.5-flash",
      hasKey: aiConfig.hasGeminiKey,
      description: "Fast, multimodal vision analysis & high-speed review generation.",
    },
    {
      id: "openai",
      name: "ChatGPT (OpenAI)",
      model: "gpt-4o-mini",
      hasKey: aiConfig.hasOpenaiKey,
      description: "Reliable, well-structured product ratings and review headlines.",
    },
    {
      id: "claude",
      name: "Anthropic Claude",
      model: "claude-3-5-sonnet",
      hasKey: aiConfig.hasClaudeKey,
      description: "Nuanced, high-fidelity customer feedback with authentic human phrasing.",
    },
  ], [aiConfig]);

  // Determine initial selected engine
  const getInitialActiveProvider = () => {
    if (aiConfig?.defaultProvider) return aiConfig.defaultProvider;
    if (aiConfig?.hasGeminiKey) return "gemini";
    if (aiConfig?.hasOpenaiKey) return "openai";
    if (aiConfig?.hasClaudeKey) return "claude";
    return "gemini";
  };

  // ==============================================================
  // TAB 0 (Bulk requests) STATE
  // ==============================================================
  const [bulkTone, setBulkTone] = useState<string>("Friendly & Relatable");
  const [bulkLanguage, setBulkLanguage] = useState<string>("en");
  const [reviewsPerProduct, setReviewsPerProduct] = useState<number>(3);
  const [includeTitles, setIncludeTitles] = useState<boolean>(true);
  const [useVerifiedBuyerTag, setUseVerifiedBuyerTag] = useState<boolean>(true);
  const [ratingRange, setRatingRange] = useState<string>("4–5 stars");
  const [targetScope, setTargetScope] = useState<string>("all_active");
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [customSelectedIds, setCustomSelectedIds] = useState<string[]>([]);
  const [editScopeModalOpen, setEditScopeModalOpen] = useState<boolean>(false);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState<string>("");
  const [showAuditHistory, setShowAuditHistory] = useState<boolean>(false);

  const [bulkProvider, setBulkProvider] = useState<string>(getInitialActiveProvider());
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<number>(0);
  const [bulkSuccessResult, setBulkSuccessResult] = useState<any>(null);
  const [bulkErrorMessage, setBulkErrorMessage] = useState<string | null>(null);

  // Filter products based on selected scope
  const filteredProducts = useMemo(() => {
    let list = products;
    if (targetScope === "no_reviews") {
      list = list.filter((p) => !productStats[p.value] || productStats[p.value].count === 0);
    } else if (targetScope === "custom" && customSelectedIds.length > 0) {
      list = list.filter((p) => customSelectedIds.includes(p.value));
    }
    return list;
  }, [products, targetScope, customSelectedIds, productStats]);

  const totalReviewsToGenerate = useMemo(() => {
    return filteredProducts.length * reviewsPerProduct;
  }, [filteredProducts.length, reviewsPerProduct]);

  // Dynamic estimated time calculation
  const estimatedTimeInfo = useMemo(() => {
    if (totalReviewsToGenerate === 0) {
      return { range: "0 minutes", secondsPerReview: 8 };
    }
    const minutes = totalReviewsToGenerate / 110;
    if (minutes < 1) {
      return { range: "< 1 minute", secondsPerReview: 8 };
    }
    const minMin = Math.max(1, Math.floor(minutes * 0.85));
    const maxMin = Math.max(minMin + 1, Math.ceil(minutes * 1.15));
    return { range: `${minMin}–${maxMin} minutes`, secondsPerReview: 8 };
  }, [totalReviewsToGenerate]);

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

  // New state for Screenshot-matched Single Product 2x2 modular UI
  const [singleSearchQuery, setSingleSearchQuery] = useState<string>("");
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState<boolean>(false);
  const [activeAdvancedSection, setActiveAdvancedSection] = useState<string | null>(null);
  const [advancedAiSuggestions, setAdvancedAiSuggestions] = useState<boolean>(true);
  const [advancedExcludeKeywords, setAdvancedExcludeKeywords] = useState<string>("");
  const [advancedCustomerProfile, setAdvancedCustomerProfile] = useState<string>("General Shoppers");
  const [advancedReviewFormat, setAdvancedReviewFormat] = useState<string>("Standard Paragraph");

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
    return { count: 5, avgRating: 4.6 };
  }, [productStats, selectedProductId]);

  const filteredSingleProducts = useMemo(() => {
    if (!singleSearchQuery.trim()) return products;
    const q = singleSearchQuery.toLowerCase();
    return products.filter((p) => p.label.toLowerCase().includes(q));
  }, [products, singleSearchQuery]);

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
      setBulkErrorMessage("Please select an AI provider from the dropdown before generating reviews.");
      return;
    }

    if (!selectedBulkEngine?.hasKey) {
      setBulkErrorMessage(
        `Selected AI Provider (${selectedBulkEngine?.name || bulkProvider}) does not have an API key configured. Please configure your API key in AI Settings to enable review generation.`,
      );
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
          language: bulkLanguage,
          reviewsPerProduct: reviewsPerProduct,
          mediaOption: "image",
          tone: bulkTone,
          ratingRange: ratingRange,
          includeTitles: includeTitles,
          verifiedBuyer: useVerifiedBuyerTag,
          customProductIds: customSelectedIds.length > 0 ? customSelectedIds : undefined,
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

    const excludeWords = advancedExcludeKeywords
      ? advancedExcludeKeywords.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const avoidPhrasing = [
      ...(isMore ? generatedReviews.map((r) => r.bodyShort) : []),
      ...excludeWords,
    ];

    let customNotesCompiled = singleNotes ? singleNotes.trim() : "";
    if (advancedAiSuggestions) {
      customNotesCompiled += (customNotesCompiled ? ". " : "") + "Use AI to highlight unique product benefits and selling points";
    }
    if (advancedCustomerProfile && advancedCustomerProfile !== "General Shoppers") {
      customNotesCompiled += (customNotesCompiled ? ". " : "") + `Customer target profile: ${advancedCustomerProfile}`;
    }
    if (advancedReviewFormat && advancedReviewFormat !== "Standard Paragraph") {
      customNotesCompiled += (customNotesCompiled ? ". " : "") + `Review layout structure: ${advancedReviewFormat}`;
    }

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          productImageUrl: currentProduct?.imageUrl || undefined,
          description: currentProduct?.description,
          notes: customNotesCompiled,
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
    <Page fullWidth>
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

        /* TOP MODE SWITCHER PILL TABS */
        .rg-mode-pill {
          padding: 8px 18px;
          font-size: 13.5px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #4b5563;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .rg-mode-pill:hover {
          background: #f9fafb;
          border-color: #cbd5e1;
        }
        .rg-mode-pill.active {
          border: 1.5px solid #3b82f6;
          background: #ffffff;
          color: #2563eb;
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(59, 130, 246, 0.08);
        }

        /* HORIZONTAL STEPPER BAR */
        .rg-stepper-bar {
          display: flex;
          align-items: center;
          margin: 14px 0 24px 0;
          flex-wrap: wrap;
          gap: 4px;
        }
        .rg-step-node {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .rg-step-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          background: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .rg-step-circle.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
          font-weight: 700;
        }
        .rg-step-label {
          font-size: 13.5px;
          font-weight: 500;
          color: #475569;
        }
        .rg-step-label.active {
          color: #2563eb;
          font-weight: 600;
        }
        .rg-step-line {
          flex: 1;
          min-width: 32px;
          max-width: 130px;
          height: 1px;
          background: #e2e8f0;
          margin: 0 8px;
        }

        /* 2x2 MODULAR GRID */
        .rg-grid-2x2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 960px) {
          .rg-grid-2x2 {
            grid-template-columns: 1fr;
          }
        }

        .rg-modular-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
        }

        .rg-card-step-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
        }
        .rg-card-step-num {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #eff6ff;
          color: #2563eb;
          font-size: 11px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .rg-card-step-title {
          color: #2563eb;
          font-size: 13px;
          font-weight: 700;
        }

        .rg-card-heading {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 4px 0;
        }
        .rg-card-subheading {
          font-size: 13px;
          color: #6b7280;
          margin: 0 0 18px 0;
          line-height: 1.4;
        }

        .rg-field-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .rg-modern-select {
          width: 100%;
          height: 38px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 0 32px 0 12px;
          font-size: 13.5px;
          color: #111827;
          background-color: #ffffff;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          background-size: 16px;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .rg-modern-select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }

        .rg-segmented-group {
          display: flex;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          overflow: hidden;
          height: 38px;
          box-sizing: border-box;
          background: #ffffff;
        }
        .rg-segmented-btn {
          flex: 1;
          border: none;
          background: transparent;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rg-segmented-btn:hover {
          background: #f8fafc;
        }
        .rg-segmented-btn.active {
          background: #eff6ff;
          color: #2563eb;
          font-weight: 600;
          border: 1.5px solid #3b82f6;
          border-radius: 5px;
          margin: -1px;
        }

        .rg-toggle-row {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          user-select: none;
        }
        .rg-pill-switch {
          width: 38px;
          height: 22px;
          border-radius: 9999px;
          background: #cbd5e1;
          position: relative;
          transition: background-color 0.2s ease;
          flex-shrink: 0;
        }
        .rg-pill-switch.on {
          background: #2563eb;
        }
        .rg-pill-switch-handle {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .rg-pill-switch.on .rg-pill-switch-handle {
          transform: translateX(16px);
        }

        .rg-summary-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        @media (max-width: 600px) {
          .rg-summary-stat-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .rg-stat-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 10px;
          box-sizing: border-box;
        }
        .rg-stat-box-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: #64748b;
          font-weight: 500;
          margin-bottom: 4px;
        }
        .rg-stat-box-val {
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rg-btn-primary-blue {
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          width: 100%;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s ease, transform 0.1s ease;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
        }
        .rg-btn-primary-blue:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .rg-btn-primary-blue:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }

        .rg-btn-secondary-white {
          background: #ffffff;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          width: 100%;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.15s ease;
        }
        .rg-btn-secondary-white:hover {
          background: #f8fafc;
          border-color: #9ca3af;
        }

        .rg-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }
        .rg-modal-dialog {
          background: #ffffff;
          border-radius: 14px;
          max-width: 620px;
          width: 100%;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
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

        /* ========================================================== */
        /* SINGLE PRODUCT 2x2 MODULAR GRID (SCREENSHOT EXACT MATCH)    */
        /* ========================================================== */
        .sp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 24px;
        }
        @media (max-width: 960px) {
          .sp-grid {
            grid-template-columns: 1fr;
          }
        }
        .sp-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          transition: border-color 0.15s ease;
        }
        .sp-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 20px;
        }
        .sp-header-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #334155;
          flex-shrink: 0;
        }
        .sp-header-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .sp-header-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 3px 0 0 0;
        }
        .sp-search-box {
          position: relative;
          margin-bottom: 12px;
        }
        .sp-search-input {
          width: 100%;
          height: 42px;
          padding: 0 14px 0 38px;
          font-size: 13.5px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sp-search-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
        .sp-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
          display: flex;
          align-items: center;
        }
        .sp-product-select-row {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          background: #ffffff;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .sp-product-select-row:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .sp-selected-box {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          margin-top: 12px;
        }
        .sp-tone-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 18px;
        }
        .sp-tone-btn {
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .sp-tone-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .sp-tone-btn.active {
          border: 1.5px solid #2563eb;
          background: #eff6ff;
          color: #2563eb;
          font-weight: 600;
        }
        .sp-count-row {
          display: flex;
          gap: 10px;
          margin-bottom: 18px;
        }
        .sp-count-btn {
          flex: 1;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13.5px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .sp-count-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .sp-count-btn.active {
          border: 1.5px solid #2563eb;
          background: #eff6ff;
          color: #2563eb;
          font-weight: 600;
        }
        .sp-adv-item {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          cursor: pointer;
          background: #ffffff;
          transition: all 0.15s ease;
        }
        .sp-adv-item:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .sp-adv-item.open {
          border-color: #3b82f6;
          background: #f8fafc;
        }
        .sp-adv-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #475569;
          flex-shrink: 0;
        }
        .sp-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .sp-summary-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sp-summary-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #475569;
          flex-shrink: 0;
        }
        .sp-btn-generate {
          width: 100%;
          height: 44px;
          background: #1e293b;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: background 0.15s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .sp-btn-generate:hover:not(:disabled) {
          background: #0f172a;
        }
        .sp-btn-generate:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        .sp-chip {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sp-chip:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .sp-chip.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
          font-weight: 600;
        }

        /* MANUAL REVIEW TOGGLES (DARK ACCENT MATCHING SCREENSHOT) */
        .mr-toggle-switch {
          width: 44px;
          height: 24px;
          background: #cbd5e1;
          border-radius: 9999px;
          position: relative;
          cursor: pointer;
          transition: background-color 0.2s ease;
          flex-shrink: 0;
        }
        .mr-toggle-switch.on {
          background: #111827;
        }
        .mr-toggle-handle {
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
        .mr-toggle-switch.on .mr-toggle-handle {
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
                url: `https://${shop}/admin/oauth/authorize?client_id=28fbf0094946ed287e3db764e52796e5&scope=read_themes,write_themes,read_products,read_orders&redirect_uri=${encodeURIComponent("https://productreview.zooq.app/auth/callback")}`,
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
        {/* HEADER: TITLE & SUBTITLE                                        */}
        {/* ============================================================== */}
        <div style={{ marginBottom: "18px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", margin: "0 0 6px 0", letterSpacing: "-0.015em" }}>
            AI Review Generator
          </h1>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            Generate product reviews for your Shopify catalog using AI.
          </p>
        </div>

        {/* ============================================================== */}
        {/* TOP MODE SWITCHER TABS (Bulk requests | Single product | Manual review) */}
        {/* ============================================================== */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`rg-mode-pill ${selectedTab === 0 ? "active" : ""}`}
            onClick={() => setSelectedTab(0)}
          >
            Bulk requests
          </button>
          <button
            type="button"
            className={`rg-mode-pill ${selectedTab === 1 ? "active" : ""}`}
            onClick={() => setSelectedTab(1)}
          >
            Single product
          </button>
          <button
            type="button"
            className={`rg-mode-pill ${selectedTab === 2 ? "active" : ""}`}
            onClick={() => setSelectedTab(2)}
          >
            Manual review
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 0: REDESIGNED 2x2 MODULAR GRID WORKFLOW                      */}
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
                    The reviews are now stored and will automatically display in your store product review widgets.
                  </p>
                </Banner>
              </div>
            )}

            {/* 2x2 MODULAR CARDS GRID */}
            <div className="rg-grid-2x2">
              {/* ================= CARD 1: SCOPE ================= */}
              <div className="rg-modular-card">
                <div>
                  <div className="rg-card-step-badge">
                    <span className="rg-card-step-num">1</span>
                    <span className="rg-card-step-title">Scope</span>
                  </div>
                  <h2 className="rg-card-heading">Select products</h2>
                  <p className="rg-card-subheading">Choose which products to generate reviews for.</p>

                  <div style={{ marginBottom: "14px" }}>
                    <label className="rg-field-label">Target products</label>
                    <select
                      className="rg-modern-select"
                      value={targetScope}
                      onChange={(e) => {
                        setTargetScope(e.target.value);
                        if (e.target.value === "custom") {
                          setEditScopeModalOpen(true);
                        }
                      }}
                    >
                      <option value="all_active">All active products</option>
                      <option value="no_reviews">Only products without reviews</option>
                      <option value="custom">
                        Custom selected products ({customSelectedIds.length})
                      </option>
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label className="rg-field-label">Collection</label>
                    <select
                      className="rg-modern-select"
                      value={selectedCollection}
                      onChange={(e) => setSelectedCollection(e.target.value)}
                    >
                      <option value="all">All collections</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Mint Green Pill Banner */}
                  <div
                    style={{
                      background: "#ecfdf5",
                      border: "1px solid #d1fae5",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="10" fill="#10b981" />
                      <path
                        d="M6 10l3 3 5-5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span style={{ color: "#065f46", fontWeight: 600, fontSize: "13.5px" }}>
                      {filteredProducts.length} active products selected
                    </span>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="rg-btn-secondary-white"
                    style={{ width: "auto", padding: "7px 16px" }}
                    onClick={() => setEditScopeModalOpen(true)}
                  >
                    Edit scope
                  </button>
                </div>
              </div>

              {/* ================= CARD 2: SETTINGS ================= */}
              <div className="rg-modular-card">
                <div>
                  <div className="rg-card-step-badge">
                    <span className="rg-card-step-num">2</span>
                    <span className="rg-card-step-title">Settings</span>
                  </div>
                  <h2 className="rg-card-heading">Review settings</h2>
                  <p className="rg-card-subheading">Configure how the AI should generate your reviews.</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
                    {/* Left Column */}
                    <div>
                      <div style={{ marginBottom: "14px" }}>
                        <label className="rg-field-label">Tone</label>
                        <select
                          className="rg-modern-select"
                          value={bulkTone}
                          onChange={(e) => setBulkTone(e.target.value)}
                        >
                          <option value="Friendly & Relatable">Friendly & Relatable</option>
                          <option value="Enthusiastic & Excited">Enthusiastic & Excited</option>
                          <option value="Professional & Detailed">Professional & Detailed</option>
                          <option value="Short & Punchy">Short & Punchy</option>
                          <option value="Casual & Humorous">Casual & Humorous</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "16px" }}>
                        <label className="rg-field-label">Rating</label>
                        <select
                          className="rg-modern-select"
                          value={ratingRange}
                          onChange={(e) => setRatingRange(e.target.value)}
                        >
                          <option value="4–5 stars">4–5 stars</option>
                          <option value="5 stars only">5 stars only</option>
                          <option value="3–5 stars">3–5 stars</option>
                        </select>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div>
                      <div style={{ marginBottom: "14px" }}>
                        <label className="rg-field-label">Reviews per product</label>
                        <div className="rg-segmented-group">
                          {[1, 3, 5].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              className={`rg-segmented-btn ${reviewsPerProduct === cnt ? "active" : ""}`}
                              onClick={() => setReviewsPerProduct(cnt)}
                            >
                              {cnt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Toggle: Use verified buyer tag */}
                      <div
                        className="rg-toggle-row"
                        style={{ marginTop: "18px" }}
                        onClick={() => setUseVerifiedBuyerTag(!useVerifiedBuyerTag)}
                      >
                        <div className={`rg-pill-switch ${useVerifiedBuyerTag ? "on" : ""}`}>
                          <div className="rg-pill-switch-handle" />
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
                            Use verified buyer tag
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#6b7280" }}>
                            Add verified buyer tags to reviews.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div />
              </div>

              {/* ================= CARD 3: SUMMARY ================= */}
              <div className="rg-modular-card">
                <div>
                  <div className="rg-card-step-badge">
                    <span className="rg-card-step-num">3</span>
                    <span className="rg-card-step-title">Summary</span>
                  </div>
                  <h2 className="rg-card-heading">Generation summary</h2>
                  <p className="rg-card-subheading">Review your settings and estimated results.</p>

                  {/* 4 Mini Stat Boxes */}
                  <div className="rg-summary-stat-grid">
                    <div className="rg-stat-box">
                      <div className="rg-stat-box-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                        <span>Products</span>
                      </div>
                      <div className="rg-stat-box-val">{filteredProducts.length}</div>
                    </div>

                    <div className="rg-stat-box">
                      <div className="rg-stat-box-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        <span>Reviews</span>
                      </div>
                      <div className="rg-stat-box-val">{totalReviewsToGenerate}</div>
                    </div>

                    <div className="rg-stat-box">
                      <div className="rg-stat-box-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        <span>Tone</span>
                      </div>
                      <div className="rg-stat-box-val">{bulkTone.split(" ")[0]}</div>
                    </div>

                    <div className="rg-stat-box">
                      <div className="rg-stat-box-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        <span>Engine</span>
                      </div>
                      <div className="rg-stat-box-val" style={{ fontSize: "13.5px" }}>
                        {selectedBulkEngine?.name || "Google Gemini"}
                      </div>
                    </div>
                  </div>

                  {/* Light Blue Pill Banner */}
                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="10" fill="#3b82f6" />
                      <path
                        d="M6 10l3 3 5-5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span style={{ color: "#1d4ed8", fontWeight: 600, fontSize: "13.5px" }}>
                      Ready to review
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: "12.5px", color: "#6b7280", lineHeight: 1.5 }}>
                    Based on your current settings, {totalReviewsToGenerate} reviews will be generated for {filteredProducts.length} products ({reviewsPerProduct} reviews per product).
                  </p>
                </div>
                <div />
              </div>

              {/* ================= CARD 4: GENERATE ================= */}
              <div className="rg-modular-card">
                <div>
                  <div className="rg-card-step-badge">
                    <span className="rg-card-step-num">4</span>
                    <span className="rg-card-step-title">Generate</span>
                  </div>
                  <h2 className="rg-card-heading">Create reviews</h2>
                  <p className="rg-card-subheading">Generate AI reviews for your selected products.</p>

                  {/* AI Provider Dropdown Selector */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <label className="rg-field-label" style={{ margin: 0, fontWeight: 600 }}>
                        Select AI Provider
                      </label>
                      {selectedBulkEngine?.hasKey ? (
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#15803d",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "8px" }}>●</span> Connected & Ready
                        </span>
                      ) : (
                        <Link
                          to="/app/ai-settings"
                          style={{
                            background: "#fef3c7",
                            color: "#b45309",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          ⚠️ Missing API Key (Configure in AI Settings →)
                        </Link>
                      )}
                    </div>

                    <select
                      className="rg-modern-select"
                      value={bulkProvider}
                      onChange={(e) => setBulkProvider(e.target.value)}
                      style={{
                        height: "44px",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#0f172a",
                        backgroundColor: "#ffffff",
                        borderColor: selectedBulkEngine?.hasKey ? "#cbd5e1" : "#f59e0b",
                      }}
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">ChatGPT (OpenAI)</option>
                      <option value="claude">Anthropic Claude</option>
                    </select>

                    {/* Active Provider Info Badge */}
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "8px 12px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#64748b",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {bulkProvider === "gemini" && (
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "5px", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" /></svg>
                          </span>
                        )}
                        {bulkProvider === "openai" && (
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "5px", background: "#10a37f", color: "#ffffff", fontWeight: 700, fontSize: "11px" }}>
                            ✦
                          </span>
                        )}
                        {bulkProvider === "claude" && (
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "5px", background: "#d97706", color: "#ffffff", fontWeight: 700, fontSize: "11px" }}>
                            ◈
                          </span>
                        )}
                        <span>
                          {bulkProvider === "gemini"
                            ? "Advanced AI for natural, high-quality reviews."
                            : bulkProvider === "openai"
                              ? "Structured product ratings and authentic customer headlines."
                              : "Nuanced feedback with high-fidelity, human phrasing."}
                        </span>
                      </div>

                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#334155",
                          background: "#ffffff",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {selectedBulkEngine?.model || (bulkProvider === "openai" ? "gpt-4o-mini" : bulkProvider === "claude" ? "claude-3-5-sonnet" : "gemini-1.5-flash")}
                      </span>
                    </div>
                  </div>

                  {/* Estimated Time Row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    <span style={{ fontSize: "13px", color: "#6b7280" }}>Estimated time</span>
                    <strong style={{ fontSize: "13.5px", color: "#111827" }}>
                      {estimatedTimeInfo.range}
                    </strong>
                    <span style={{ fontSize: "11.5px", color: "#6b7280" }}>
                      Based on {totalReviewsToGenerate} reviews • ~{estimatedTimeInfo.secondsPerReview} seconds per review
                    </span>
                  </div>

                  {/* Loading Progress Bar */}
                  {bulkLoading && (
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "#374151", marginBottom: "4px" }}>
                        <span>Generating reviews...</span>
                        <strong>{bulkProgress}%</strong>
                      </div>
                      <ProgressBar progress={bulkProgress} animated />
                    </div>
                  )}

                  {/* Primary Action Button */}
                  <button
                    type="button"
                    className="rg-btn-primary-blue"
                    disabled={bulkLoading || filteredProducts.length === 0}
                    onClick={handleBulkGenerateAll}
                  >
                    <span>✦</span>
                    <span>
                      {bulkLoading
                        ? "Generating Reviews Across Products..."
                        : `Generate ${totalReviewsToGenerate} Reviews`}
                    </span>
                  </button>

                  {/* Secondary Action Button */}
                  <button
                    type="button"
                    className="rg-btn-secondary-white"
                    style={{ marginTop: "10px", marginBottom: "14px" }}
                    onClick={() => setPreviewModalOpen(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Preview sample reviews</span>
                  </button>
                </div>

                {/* Shield Note Footer */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280", paddingTop: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>
                    Reviews will be saved with {useVerifiedBuyerTag ? "verified buyer tags" : "standard tags"} and {ratingRange} ratings.
                  </span>
                </div>
              </div>
            </div>

            {/* ================= EDIT SCOPE MODAL ================= */}
            {editScopeModalOpen && (
              <div className="rg-modal-overlay" onClick={() => setEditScopeModalOpen(false)}>
                <div className="rg-modal-dialog" onClick={(e) => e.stopPropagation()}>
                  <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                        Select Products for AI Review Generation
                      </h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "#6b7280" }}>
                        Check specific products you want to generate reviews for.
                      </p>
                    </div>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280" }}
                      onClick={() => setEditScopeModalOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ padding: "14px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="rg-input"
                      style={{ padding: "8px 12px", fontSize: "13px" }}
                      placeholder="Search active catalog products..."
                      value={scopeSearchQuery}
                      onChange={(e) => setScopeSearchQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rg-btn-secondary-white"
                      style={{ width: "auto", whiteSpace: "nowrap", padding: "8px 12px", fontSize: "12.5px" }}
                      onClick={() => {
                        setCustomSelectedIds(products.map((p) => p.value));
                        setTargetScope("custom");
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="rg-btn-secondary-white"
                      style={{ width: "auto", whiteSpace: "nowrap", padding: "8px 12px", fontSize: "12.5px" }}
                      onClick={() => {
                        setCustomSelectedIds([]);
                        setTargetScope("all_active");
                      }}
                    >
                      Reset All
                    </button>
                  </div>

                  <div style={{ maxHeight: "380px", overflowY: "auto", padding: "10px 22px" }}>
                    {products
                      .filter((p) => p.label.toLowerCase().includes(scopeSearchQuery.toLowerCase()))
                      .map((p) => {
                        const isChecked = customSelectedIds.length === 0
                          ? targetScope !== "custom"
                          : customSelectedIds.includes(p.value);
                        return (
                          <label
                            key={p.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 0",
                              borderBottom: "1px solid #f8fafc",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setTargetScope("custom");
                                if (e.target.checked) {
                                  setCustomSelectedIds((prev) => [...prev, p.value]);
                                } else {
                                  setCustomSelectedIds((prev) => prev.filter((id) => id !== p.value));
                                }
                              }}
                            />
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.label}
                                style={{ width: "36px", height: "36px", borderRadius: "6px", objectFit: "cover" }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "6px",
                                  background: "#f1f5f9",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "16px",
                                }}
                              >
                                📦
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {p.label}
                              </div>
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                {productStats[p.value]?.count || 0} reviews existing
                              </div>
                            </div>
                          </label>
                        );
                      })}
                  </div>

                  <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                    <div style={{ fontSize: "13px", color: "#475569" }}>
                      <strong>{filteredProducts.length}</strong> products will be targeted
                    </div>
                    <button
                      type="button"
                      className="rg-btn-primary-blue"
                      style={{ width: "auto", padding: "8px 20px" }}
                      onClick={() => setEditScopeModalOpen(false)}
                    >
                      Done & Apply Scope
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ================= SAMPLE REVIEW PREVIEW MODAL ================= */}
            {previewModalOpen && (
              <div className="rg-modal-overlay" onClick={() => setPreviewModalOpen(false)}>
                <div className="rg-modal-dialog" onClick={(e) => e.stopPropagation()}>
                  <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                        Sample Review Preview
                      </h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "#6b7280" }}>
                        Simulated review preview using your current generator settings.
                      </p>
                    </div>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280" }}
                      onClick={() => setPreviewModalOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ padding: "18px 22px", overflowY: "auto", maxHeight: "400px" }}>
                    {/* Simulated Review Card 1 */}
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                        marginBottom: "14px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#f59e0b", fontSize: "15px" }}>★★★★★</span>
                          <strong style={{ fontSize: "13.5px", color: "#111827" }}>Emily R.</strong>
                          {useVerifiedBuyerTag && (
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "9999px" }}>
                              ✓ Verified Buyer
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>2 days ago</span>
                      </div>

                      {includeTitles && (
                        <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                          {bulkTone.includes("Friendly")
                            ? "Exceeded all my expectations!"
                            : bulkTone.includes("Enthusiastic")
                              ? "Hands down the best purchase I made this year!"
                              : bulkTone.includes("Short")
                                ? "Great quality, five stars."
                                : "Excellent build and reliable performance."}
                        </h4>
                      )}

                      <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                        {bulkTone.includes("Friendly")
                          ? `I was genuinely surprised by how great the ${filteredProducts[0]?.label || "item"} turned out. The craftsmanship is wonderful, shipping was fast, and it works exactly as promised.`
                          : bulkTone.includes("Enthusiastic")
                            ? `Obsessed with this! The quality is unmatched and everyone who visited asked where I got it. 10/10 recommendation for anyone on the fence!`
                            : bulkTone.includes("Short")
                              ? `Arrived quickly, packaged well, and works flawlessly. Very pleased with this purchase.`
                              : `The item matches all specifications accurately. Materials are durable, ergonomic, and provide tremendous value for money.`}
                      </p>
                    </div>

                    {/* Simulated Review Card 2 */}
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#f59e0b", fontSize: "15px" }}>
                            {ratingRange === "5 stars only" ? "★★★★★" : "★★★★☆"}
                          </span>
                          <strong style={{ fontSize: "13.5px", color: "#111827" }}>Marcus D.</strong>
                          {useVerifiedBuyerTag && (
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "9999px" }}>
                              ✓ Verified Buyer
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>Yesterday</span>
                      </div>

                      {includeTitles && (
                        <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                          Super happy with this item!
                        </h4>
                      )}

                      <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                        Really impressed with the packaging and customer experience. Will definitely be placing another order soon!
                      </p>
                    </div>
                  </div>

                  <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
                    <button
                      type="button"
                      className="rg-btn-secondary-white"
                      style={{ width: "auto", padding: "8px 18px" }}
                      onClick={() => setPreviewModalOpen(false)}
                    >
                      Close Preview
                    </button>
                    <button
                      type="button"
                      className="rg-btn-primary-blue"
                      style={{ width: "auto", padding: "8px 20px" }}
                      onClick={() => {
                        setPreviewModalOpen(false);
                        handleBulkGenerateAll();
                      }}
                    >
                      Generate Reviews Now ✦
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: PRODUCT ASSISTANT (SINGLE PRODUCT AI GENERATOR)          */}
        {/* EXACT 2x2 MODULAR GRID AS SHOWN IN SCREENSHOT                   */}
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

            <div className="sp-grid">
              {/* CARD 1: 1. SELECT PRODUCT */}
              <div className="sp-card">
                <div>
                  <div className="sp-header">
                    <div className="sp-header-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="sp-header-title">1. Select Product</h3>
                      <p className="sp-header-subtitle">Choose a product from your Shopify catalog to generate reviews.</p>
                    </div>
                  </div>

                  {/* Search input with magnifying glass */}
                  <div className="sp-search-box">
                    <span className="sp-search-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      className="sp-search-input"
                      placeholder="Search product..."
                      value={singleSearchQuery}
                      onChange={(e) => {
                        setSingleSearchQuery(e.target.value);
                        setIsProductDropdownOpen(true);
                      }}
                      onFocus={() => setIsProductDropdownOpen(true)}
                    />
                  </div>

                  {/* Product Dropdown Selector Bar */}
                  <div
                    className="sp-product-select-row"
                    onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                      <div style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "8px",
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}>
                        {currentProduct.imageUrl ? (
                          <img src={currentProduct.imageUrl} alt={currentProduct.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "20px" }}>🛍️</span>
                        )}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {currentProduct.label}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                          <span>{`${currentProductStats.count} real reviews`}</span>
                          <span>•</span>
                          <span style={{ color: "#d97706", fontWeight: 600 }}>{`Avg. ${currentProductStats.avgRating} ★`}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ color: "#64748b", transform: isProductDropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Dropdown Options List */}
                  {isProductDropdownOpen && (
                    <div style={{
                      marginTop: "6px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      maxHeight: "190px",
                      overflowY: "auto",
                      boxShadow: "0 6px 16px rgba(0, 0, 0, 0.08)",
                      zIndex: 20,
                    }}>
                      {(filteredSingleProducts.length > 0 ? filteredSingleProducts : products).map((p) => {
                        const stats = productStats[p.value] || { count: 5, avgRating: 4.6 };
                        const isSelected = p.value === selectedProductId;
                        return (
                          <div
                            key={p.value}
                            onClick={() => {
                              setSelectedProductId(p.value);
                              setIsProductDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              background: isSelected ? "#eff6ff" : "transparent",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                              <div style={{ width: "32px", height: "32px", borderRadius: "6px", overflow: "hidden", background: "#f8fafc", flexShrink: 0 }}>
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <span>🛍️</span>
                                )}
                              </div>
                              <div style={{ overflow: "hidden" }}>
                                <div style={{ fontSize: "13.5px", fontWeight: isSelected ? 600 : 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {p.label}
                                </div>
                                <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                                  {`${stats.count} reviews • Avg. ${stats.avgRating} ★`}
                                </div>
                              </div>
                            </div>
                            {isSelected && <span style={{ color: "#2563eb", fontWeight: 700, fontSize: "13px" }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Product Card */}
                  <div className="sp-selected-box">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                      <div style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "8px",
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}>
                        {currentProduct.imageUrl ? (
                          <img src={currentProduct.imageUrl} alt={currentProduct.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "20px" }}>🛍️</span>
                        )}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                          Selected Product
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {currentProduct.label}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsProductDropdownOpen(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>

              {/* CARD 2: 2. REVIEW SETTINGS */}
              <div className="sp-card">
                <div>
                  <div className="sp-header">
                    <div className="sp-header-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="sp-header-title">2. Review Settings</h3>
                      <p className="sp-header-subtitle">Customize the tone, volume, and other details.</p>
                    </div>
                  </div>

                  {/* Review Tone */}
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Review Tone
                    </label>
                    <div className="sp-tone-grid">
                      {[
                        "Friendly & Relatable",
                        "Enthusiastic & Excited",
                        "Professional & Detailed",
                        "Short & Punchy",
                      ].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`sp-tone-btn ${singleTone === t ? "active" : ""}`}
                          onClick={() => setSingleTone(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Number of Reviews to Generate */}
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Number of Reviews to Generate
                    </label>
                    <div className="sp-count-row">
                      {[1, 3, 5, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`sp-count-btn ${singleCount === num ? "active" : ""}`}
                          onClick={() => setSingleCount(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Language
                    </label>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        pointerEvents: "none",
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
                        </svg>
                      </div>
                      <select
                        value={singleLanguage}
                        onChange={(e) => setSingleLanguage(e.target.value)}
                        style={{
                          width: "100%",
                          height: "42px",
                          padding: "0 34px 0 36px",
                          fontSize: "13.5px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          background: "#ffffff",
                          color: "#0f172a",
                          cursor: "pointer",
                          appearance: "none",
                          outline: "none",
                        }}
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="it">Italian</option>
                        <option value="pt">Portuguese</option>
                        <option value="ja">Japanese</option>
                      </select>
                      <div style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        pointerEvents: "none",
                        display: "flex",
                        alignItems: "center",
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Key Features (Optional) */}
                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Key Features (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. long battery life, fast shipping, perfect for travel..."
                      value={singleNotes}
                      onChange={(e) => setSingleNotes(e.target.value)}
                      style={{
                        width: "100%",
                        height: "42px",
                        padding: "0 12px",
                        fontSize: "13.5px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        outline: "none",
                        boxSizing: "border-box",
                        color: "#0f172a",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: 3. ADVANCED OPTIONS */}
              <div className="sp-card">
                <div>
                  <div className="sp-header">
                    <div className="sp-header-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="1" x2="7" y1="14" y2="14" /><line x1="9" x2="15" y1="8" y2="8" /><line x1="17" x2="23" y1="16" y2="16" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="sp-header-title">3. Advanced Options</h3>
                      <p className="sp-header-subtitle">Refine your reviews with AI suggestions and custom rules.</p>
                    </div>
                  </div>

                  {/* Action 1: AI Suggestions */}
                  <div>
                    <div
                      className={`sp-adv-item ${activeAdvancedSection === "ai_suggestions" ? "open" : ""}`}
                      onClick={() => setActiveAdvancedSection(activeAdvancedSection === "ai_suggestions" ? null : "ai_suggestions")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div className="sp-adv-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>AI Suggestions</div>
                          <div style={{ fontSize: "12.5px", color: "#64748b" }}>Use AI to highlight product benefits and unique features.</div>
                        </div>
                      </div>
                      <div style={{ color: "#64748b", transform: activeAdvancedSection === "ai_suggestions" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                    {activeAdvancedSection === "ai_suggestions" && (
                      <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", marginBottom: "10px", border: "1px solid #e2e8f0" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={advancedAiSuggestions}
                            onChange={(e) => setAdvancedAiSuggestions(e.target.checked)}
                            style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
                          />
                          <span>Highlight top features and real-world benefit statements in reviews</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Action 2: Exclude Keywords */}
                  <div>
                    <div
                      className={`sp-adv-item ${activeAdvancedSection === "exclude_keywords" ? "open" : ""}`}
                      onClick={() => setActiveAdvancedSection(activeAdvancedSection === "exclude_keywords" ? null : "exclude_keywords")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div className="sp-adv-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Exclude Keywords</div>
                          <div style={{ fontSize: "12.5px", color: "#64748b" }}>Add words or phrases to avoid in reviews.</div>
                        </div>
                      </div>
                      <div style={{ color: "#64748b", transform: activeAdvancedSection === "exclude_keywords" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                    {activeAdvancedSection === "exclude_keywords" && (
                      <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", marginBottom: "10px", border: "1px solid #e2e8f0" }}>
                        <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "6px" }}>
                          Forbidden terms (comma-separated):
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. cheap, broke, slow delivery, fake, returned"
                          value={advancedExcludeKeywords}
                          onChange={(e) => setAdvancedExcludeKeywords(e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "13px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", boxSizing: "border-box" }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Action 3: Customer Profile */}
                  <div>
                    <div
                      className={`sp-adv-item ${activeAdvancedSection === "customer_profile" ? "open" : ""}`}
                      onClick={() => setActiveAdvancedSection(activeAdvancedSection === "customer_profile" ? null : "customer_profile")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div className="sp-adv-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Customer Profile</div>
                          <div style={{ fontSize: "12.5px", color: "#64748b" }}>Target specific customer types (e.g., new buyers, professionals).</div>
                        </div>
                      </div>
                      <div style={{ color: "#64748b", transform: activeAdvancedSection === "customer_profile" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                    {activeAdvancedSection === "customer_profile" && (
                      <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", marginBottom: "10px", border: "1px solid #e2e8f0" }}>
                        <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "8px" }}>
                          Select Customer Persona:
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {[
                            "General Shoppers",
                            "Verified First-Time Buyers",
                            "Repeat Customers",
                            "Gift Shoppers",
                            "Professionals",
                          ].map((profile) => (
                            <button
                              key={profile}
                              type="button"
                              className={`sp-chip ${advancedCustomerProfile === profile ? "active" : ""}`}
                              onClick={() => setAdvancedCustomerProfile(profile)}
                            >
                              {profile}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action 4: Review Format */}
                  <div>
                    <div
                      className={`sp-adv-item ${activeAdvancedSection === "review_format" ? "open" : ""}`}
                      onClick={() => setActiveAdvancedSection(activeAdvancedSection === "review_format" ? null : "review_format")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div className="sp-adv-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Review Format</div>
                          <div style={{ fontSize: "12.5px", color: "#64748b" }}>Choose how reviews should be structured (e.g., pros & cons).</div>
                        </div>
                      </div>
                      <div style={{ color: "#64748b", transform: activeAdvancedSection === "review_format" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                    {activeAdvancedSection === "review_format" && (
                      <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", marginBottom: "10px", border: "1px solid #e2e8f0" }}>
                        <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "8px" }}>
                          Review Format Style:
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {[
                            "Standard Paragraph",
                            "Pros & Cons Format",
                            "Short & Punchy",
                            "Detailed Experience",
                          ].map((fmt) => (
                            <button
                              key={fmt}
                              type="button"
                              className={`sp-chip ${advancedReviewFormat === fmt ? "active" : ""}`}
                              onClick={() => setAdvancedReviewFormat(fmt)}
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CARD 4: 4. REVIEW GENERATION SUMMARY */}
              <div className="sp-card">
                <div>
                  <div className="sp-header">
                    <div className="sp-header-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="sp-header-title">4. Review Generation Summary</h3>
                      <p className="sp-header-subtitle">Verify the product details and generation settings before creating reviews.</p>
                    </div>
                  </div>

                  {/* 2x3 Summary Table */}
                  <div className="sp-summary-grid">
                    {/* Row 1 Left: Product */}
                    <div className="sp-summary-item">
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", background: "#f8fafc", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {currentProduct.imageUrl ? (
                          <img src={currentProduct.imageUrl} alt={currentProduct.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span>🛍️</span>
                        )}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Product</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {currentProduct.label}
                        </div>
                      </div>
                    </div>

                    {/* Row 1 Right: Language */}
                    <div className="sp-summary-item">
                      <div className="sp-summary-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Language</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a" }}>
                          {singleLanguage === "en" ? "English" : singleLanguage === "es" ? "Spanish" : singleLanguage === "fr" ? "French" : singleLanguage === "de" ? "German" : singleLanguage === "it" ? "Italian" : singleLanguage === "pt" ? "Portuguese" : "Japanese"}
                        </div>
                      </div>
                    </div>

                    {/* Row 2 Left: Tone */}
                    <div className="sp-summary-item">
                      <div className="sp-summary-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                        </svg>
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Tone</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {singleTone}
                        </div>
                      </div>
                    </div>

                    {/* Row 2 Right: Key Features */}
                    <div className="sp-summary-item">
                      <div className="sp-summary-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Key Features</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {singleNotes && singleNotes.trim() ? singleNotes : "No custom features"}
                        </div>
                      </div>
                    </div>

                    {/* Row 3 Left: Count */}
                    <div className="sp-summary-item">
                      <div className="sp-summary-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Count</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a" }}>
                          {`${singleCount} Reviews`}
                        </div>
                      </div>
                    </div>

                    {/* Row 3 Right: AI Engine */}
                    <div className="sp-summary-item">
                      <div className="sp-summary-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>AI Engine</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedSingleEngine?.name || "Google Gemini"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Single Progress Bar during Generation */}
                  {singleLoading && (
                    <div style={{ marginBottom: "16px", textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px", color: "#374151" }}>
                        <span>{`Generating ${singleCount} authentic reviews for ${currentProduct.label}...`}</span>
                        <strong>{singleProgress}%</strong>
                      </div>
                      <ProgressBar progress={singleProgress} animated />
                    </div>
                  )}

                  {/* Primary Generate Button */}
                  <button
                    type="button"
                    className="sp-btn-generate"
                    disabled={singleLoading || !selectedSingleEngine?.hasKey}
                    onClick={() => handleSingleGenerate(false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    </svg>
                    <span>
                      {singleLoading
                        ? `Generating Reviews for ${currentProduct.label}...`
                        : `Generate ${singleCount} Authentic Reviews`}
                    </span>
                  </button>

                  {!selectedSingleEngine?.hasKey && (
                    <div style={{ marginTop: "10px", fontSize: "12.5px", color: "#dc2626", textAlign: "center" }}>
                      ⚠️ Active engine requires a configured key in <Link to="/app/ai-settings" style={{ color: "#2563eb", textDecoration: "underline" }}>AI Settings</Link>.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Generated Reviews Preview List below 2x2 grid */}
            {generatedReviews.length > 0 && (
              <div style={{ marginTop: "24px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>
                      {`Generated Reviews for ${currentProduct.label} (${generatedReviews.length})`}
                    </h4>
                    <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                      Review and publish generated authentic reviews directly to your store.
                    </p>
                  </div>
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
        )}

        {/* ============================================================== */}
        {/* TAB 2: ADD REAL REVIEW (CUSTOM MANUAL REVIEW)                   */}
        {/* EXACT 2x2 MODULAR GRID AS SHOWN IN SCREENSHOT                   */}
        {/* ============================================================== */}
        {selectedTab === 2 && (
          <div>
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

            <div className="sp-grid">
              {/* CARD 1: Step 1: Order Details */}
              <div className="sp-card">
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                        Step 1: Order Details
                      </h3>
                      <div
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                          borderRadius: "9999px",
                          padding: "4px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <span>✓</span>
                        <span>{`Order matched: ${manualOrderNumber || "#1042"}`}</span>
                      </div>
                    </div>
                    <div style={{ width: "36px", height: "2px", background: "#111827", marginTop: "6px" }} />
                  </div>

                  {/* Product Field */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Product
                    </label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={manualProdId}
                        onChange={(e) => setManualProdId(e.target.value)}
                        style={{
                          width: "100%",
                          height: "42px",
                          padding: "0 34px 0 12px",
                          fontSize: "13.5px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          background: "#ffffff",
                          color: "#0f172a",
                          cursor: "pointer",
                          appearance: "none",
                          outline: "none",
                        }}
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
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b", display: "flex" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Row: Order number & Rating */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                        Order number
                      </label>
                      <input
                        type="text"
                        value={manualOrderNumber}
                        onChange={(e) => handleOrderNumberChange(e.target.value)}
                        placeholder="#1042"
                        style={{
                          width: "100%",
                          height: "42px",
                          padding: "0 12px",
                          fontSize: "13.5px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          outline: "none",
                          boxSizing: "border-box",
                          color: "#0f172a",
                          background: "#ffffff",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                        Rating
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          height: "42px",
                          padding: "0 12px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          background: "#ffffff",
                          boxSizing: "border-box",
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            onClick={() => setManualRating(star)}
                            style={{
                              cursor: "pointer",
                              fontSize: "20px",
                              color: star <= manualRating ? "#b45309" : "#cbd5e1",
                              lineHeight: 1,
                              transition: "color 0.15s ease",
                            }}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: Step 2: Customer & Source */}
              <div className="sp-card">
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                      Step 2: Customer & Source
                    </h3>
                    <div style={{ width: "36px", height: "2px", background: "#111827", marginTop: "6px" }} />
                  </div>

                  {/* Customer name */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Customer name
                    </label>
                    <input
                      type="text"
                      value={manualCustomerName}
                      onChange={(e) => setManualCustomerName(e.target.value)}
                      placeholder="Rachel V."
                      style={{
                        width: "100%",
                        height: "42px",
                        padding: "0 12px",
                        fontSize: "13.5px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        outline: "none",
                        boxSizing: "border-box",
                        color: "#0f172a",
                        background: "#ffffff",
                      }}
                    />
                  </div>

                  {/* Source of feedback */}
                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Source of feedback
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(["WhatsApp", "Email", "Phone"] as const).map((src) => {
                        const isActive = manualFeedbackSource === src;
                        return (
                          <button
                            key={src}
                            type="button"
                            onClick={() => setManualFeedbackSource(src)}
                            style={{
                              padding: "8px 18px",
                              fontSize: "13px",
                              fontWeight: isActive ? 600 : 500,
                              borderRadius: "9999px",
                              border: isActive ? "1px solid #111827" : "1px solid #e2e8f0",
                              background: isActive ? "#111827" : "#ffffff",
                              color: isActive ? "#ffffff" : "#374151",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {src}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 3: Step 3: Review & Media */}
              <div className="sp-card">
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                      Step 3: Review & Media
                    </h3>
                    <div style={{ width: "36px", height: "2px", background: "#111827", marginTop: "6px" }} />
                  </div>

                  {/* Review text */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "8px" }}>
                      Review text (customer's own words)
                    </label>
                    <textarea
                      placeholder="Paste what the customer wrote..."
                      value={manualReviewText}
                      onChange={(e) => setManualReviewText(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: "100px",
                        padding: "10px 12px",
                        fontSize: "13.5px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        outline: "none",
                        boxSizing: "border-box",
                        color: "#0f172a",
                        background: "#ffffff",
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  {/* Dashed Media Box */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        border: "1.5px dashed #cbd5e1",
                        borderRadius: "10px",
                        background: "#f8fafc",
                        padding: "20px 16px",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
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
                              style={{ maxHeight: "120px", maxWidth: "100%", borderRadius: "8px" }}
                            />
                          ) : (
                            <img
                              src={manualMediaPreview}
                              alt="Customer Media"
                              style={{ maxHeight: "100px", borderRadius: "8px", objectFit: "cover" }}
                            />
                          )}
                          <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>
                            ✓ Media attached. Click to change.
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", color: "#475569" }}>
                          <span style={{ fontSize: "22px" }}>📷</span>
                          <span style={{ fontSize: "13.5px", fontWeight: 500 }}>
                            Add customer photo or video (with their permission)
                          </span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* CARD 4: Step 4: Verification & Actions */}
              <div className="sp-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                      Step 4: Verification & Actions
                    </h3>
                    <div style={{ width: "36px", height: "2px", background: "#111827", marginTop: "6px" }} />
                  </div>

                  {/* Verification Toggles */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13.5px", fontWeight: 500, color: "#111827" }}>
                        Verified badge (auto, order matched)
                      </span>
                      <div
                        className={`mr-toggle-switch ${manualVerifiedBadge ? "on" : ""}`}
                        onClick={() => setManualVerifiedBadge(!manualVerifiedBadge)}
                      >
                        <div className="mr-toggle-handle" />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13.5px", fontWeight: 500, color: "#111827" }}>
                        I confirm the customer wrote this review
                      </span>
                      <div
                        className={`mr-toggle-switch ${manualConfirmation ? "on" : ""}`}
                        onClick={() => setManualConfirmation(!manualConfirmation)}
                      >
                        <div className="mr-toggle-handle" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={manualSubmitting || !manualConfirmation}
                    onClick={handleManualSubmit}
                    style={{
                      background: manualSubmitting || !manualConfirmation ? "#94a3b8" : "#111827",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "13.5px",
                      fontWeight: 600,
                      cursor: manualSubmitting || !manualConfirmation ? "not-allowed" : "pointer",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {manualSubmitting ? "Saving review..." : "Save for approval"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setManualReviewText("");
                      setManualMediaPreview(null);
                      setManualMediaType(null);
                      setManualErrorMsg(null);
                      setManualSuccessMsg(null);
                    }}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "10px 18px",
                      fontSize: "13.5px",
                      fontWeight: 500,
                      color: "#374151",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
