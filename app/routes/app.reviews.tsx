import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Select,
  Banner,
  TextField,
  Pagination,
  InlineGrid,
  Checkbox,
  Modal,
  FormLayout,
  DropZone,
  Icon,
} from "@shopify/polaris";
import {
  SearchIcon,
  CheckIcon,
  DeleteIcon,
  EditIcon,
  ImageIcon,
  MenuHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ViewIcon,
  HideIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { ensureReviewsAndSettingsRestored, syncReviewsToShopify, uploadReviewMediaToShopify, recordDeletedReviewIds } from "../services/reviewPersistence.server";

import { getShopWhereClause } from "../services/shopDomain.server";

// In-memory catalog product mapping cache with 10-minute TTL to make tab & filter clicks instantaneous
interface CatalogCacheEntry {
  map: Map<string, string>;
  expiresAt: number;
}
const catalogCache = new Map<string, CatalogCacheEntry>();
const CATALOG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory Shopify Files cache with 5-minute TTL
interface FilesCacheEntry {
  files: Array<{ id: string; type: "IMAGE" | "VIDEO"; url: string; previewUrl: string; filename: string }>;
  expiresAt: number;
}
const filesCache = new Map<string, FilesCacheEntry>();
const FILES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
  } catch (e) {
    console.error("Safely caught review restore warning:", e);
  }

  const url = new URL(request.url);
  const tabFilter = url.searchParams.get("tab") || "all";
  const sourceFilter = url.searchParams.get("source") || "ALL";
  const statusFilter = url.searchParams.get("status") || "ALL";
  const ratingFilter = url.searchParams.get("rating") || "ALL";
  const searchQuery = url.searchParams.get("search") || "";
  const productFilter = url.searchParams.get("product") || "ALL";
  const productSearchQuery = url.searchParams.get("productSearch") || "";
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const pageSize = 8;

  // 1. Fetch catalog products to build product title mapping (with in-memory cache)
  const now = Date.now();
  let catalogProductMap: Map<string, string>;
  const cachedCatalog = catalogCache.get(shop);

  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    catalogProductMap = cachedCatalog.map;
  } else {
    catalogProductMap = new Map<string, string>();
    try {
      let hasNextPage = true;
      let cursor: string | null = null;
      let pagesFetched = 0;

      while (hasNextPage && pagesFetched < 5) {
        pagesFetched++;
        const res: any = await admin.graphql(
          `#graphql
          query getProductsForReviewsList($cursor: String) {
            products(first: 250, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                title
                handle
              }
            }
          }`,
          { variables: { cursor } }
        );
        const data: any = await res.json();
        const productConnection: any = data?.data?.products;
        const nodes = productConnection?.nodes || [];

        for (const node of nodes) {
          catalogProductMap.set(node.id, node.title);
          const rawId = node.id.replace("gid://shopify/Product/", "");
          catalogProductMap.set(rawId, node.title);
          if (node.handle) {
            catalogProductMap.set(node.handle, node.title);
          }
        }

        hasNextPage = Boolean(productConnection?.pageInfo?.hasNextPage);
        cursor = productConnection?.pageInfo?.endCursor || null;
        if (!cursor) break;
      }
      catalogCache.set(shop, { map: catalogProductMap, expiresAt: now + CATALOG_CACHE_TTL });
    } catch (err) {
      console.warn("GraphQL product fetch warning in reviews loader:", err);
    }
  }

  // Helper function to resolve product title for a review record
  const resolveProductTitle = (r: any): string => {
    if (r.productId && catalogProductMap.has(r.productId)) {
      return catalogProductMap.get(r.productId)!;
    }
    const rawId = r.productId ? r.productId.replace(/^gid:\/\/shopify\/Product\//, "") : "";
    if (rawId && catalogProductMap.has(rawId)) {
      return catalogProductMap.get(rawId)!;
    }
    if (r.productHandle && catalogProductMap.has(r.productHandle)) {
      return catalogProductMap.get(r.productHandle)!;
    }

    // Parse snippet " on <Product Title>" if present
    const match = (r.bodyShort || "").match(/\son\s+(.+?)(?:\.|\,|$)/i);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim();
    }

    if (r.productHandle && r.productHandle !== "all") {
      return r.productHandle.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    return "General Store Product";
  };

  // 2. Fetch all reviews for this shop (with domain fallback) to compute product summary stats
  let allShopReviews: any[] = [];
  const shopWhereClause = getShopWhereClause(shop);

  try {
    allShopReviews = await db.review.findMany({
      where: shopWhereClause,
      select: {
        id: true,
        productId: true,
        productHandle: true,
        bodyShort: true,
        rating: true,
        source: true,
        isPublished: true,
        isAiGenerated: true,
        imageUrl: true,
        videoUrl: true,
        createdAt: true,
      },
    });
  } catch (e) {
    console.error("Error fetching all reviews for stats:", e);
  }

  // Summary counts for top KPI cards & tabs matching reference design
  const totalReviews = allShopReviews.length;
  const publishedReviews = allShopReviews.filter((r) => r.isPublished).length;
  const pendingReviews = allShopReviews.filter((r) => !r.isPublished && !r.isAiGenerated).length;
  const aiGeneratedCount = allShopReviews.filter((r) => r.isAiGenerated).length;
  const importedCount = allShopReviews.filter((r) => {
    const s = (r.source || "").toUpperCase();
    return s.includes("AMAZON") || s.includes("FLIPKART") || s.includes("ALIBABA") || s.includes("IMPORT");
  }).length;
  const mediaCount = allShopReviews.filter((r) => Boolean(r.imageUrl || r.videoUrl)).length;

  // 30-day dynamic growth calculations for metric cards
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const countInWindow = (list: any[], start: Date, end?: Date) => {
    return list.filter((r) => {
      const d = r.createdAt ? new Date(r.createdAt) : null;
      if (!d || isNaN(d.getTime())) return false;
      return d >= start && (!end || d < end);
    }).length;
  };

  const totalLast30 = countInWindow(allShopReviews, thirtyDaysAgo);
  const totalPrev30 = countInWindow(allShopReviews, sixtyDaysAgo, thirtyDaysAgo);

  const pubList = allShopReviews.filter((r) => r.isPublished);
  const pubLast30 = countInWindow(pubList, thirtyDaysAgo);
  const pubPrev30 = countInWindow(pubList, sixtyDaysAgo, thirtyDaysAgo);

  const pendList = allShopReviews.filter((r) => !r.isPublished && !r.isAiGenerated);
  const pendLast30 = countInWindow(pendList, thirtyDaysAgo);
  const pendPrev30 = countInWindow(pendList, sixtyDaysAgo, thirtyDaysAgo);

  const aiList = allShopReviews.filter((r) => r.isAiGenerated);
  const aiLast30 = countInWindow(aiList, thirtyDaysAgo);
  const aiPrev30 = countInWindow(aiList, sixtyDaysAgo, thirtyDaysAgo);

  const calcTrend = (curr: number, prev: number, fallback = 12) => {
    if (prev === 0 && curr === 0) return { text: "— 0%", isPositive: false, isNeutral: true };
    if (prev === 0) return { text: `↑ +${fallback}%`, isPositive: true, isNeutral: false };
    const diff = Math.round(((curr - prev) / prev) * 100);
    if (diff > 0) return { text: `↑ +${diff}%`, isPositive: true, isNeutral: false };
    if (diff < 0) return { text: `↓ ${diff}%`, isPositive: false, isNeutral: false };
    return { text: "— 0%", isPositive: false, isNeutral: true };
  };

  const trends = {
    total: calcTrend(totalLast30, totalPrev30, 12),
    published: calcTrend(pubLast30, pubPrev30, 12),
    pending: calcTrend(pendLast30, pendPrev30, 0),
    ai: calcTrend(aiLast30, aiPrev30, 8),
  };

  // Group stats by product title
  const productStatsMap = new Map<string, { title: string; count: number; published: number; pending: number }>();
  
  for (const r of allShopReviews) {
    const title = resolveProductTitle(r);
    if (!productStatsMap.has(title)) {
      productStatsMap.set(title, { title, count: 0, published: 0, pending: 0 });
    }
    const stat = productStatsMap.get(title)!;
    stat.count += 1;
    if (r.isPublished) stat.published += 1;
    else stat.pending += 1;
  }

  // Build sorted product options list for dropdown
  let productOptionsList = Array.from(productStatsMap.values()).sort((a, b) => b.count - a.count);

  // If user searched for product title via productSearchQuery, filter the dropdown options
  if (productSearchQuery.trim() !== "") {
    productOptionsList = productOptionsList.filter((p) =>
      p.title.toLowerCase().includes(productSearchQuery.toLowerCase().trim())
    );
  }

  // 3. Construct database query for reviews table
  const whereClause: any = { ...shopWhereClause };

  // Status & tab filtering
  if (statusFilter === "published" || tabFilter === "published") {
    whereClause.isPublished = true;
  } else if (statusFilter === "pending" || tabFilter === "pending") {
    whereClause.isPublished = false;
    whereClause.isAiGenerated = false;
  } else if (statusFilter === "draft" || tabFilter === "ai_drafts") {
    whereClause.isAiGenerated = true;
    whereClause.isPublished = false;
  } else if (tabFilter === "imported") {
    whereClause.source = {
      in: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA", "AMAZON", "FLIPKART", "ALIBABA"],
    };
  }

  // Source filtering
  if (sourceFilter !== "ALL") {
    if (sourceFilter === "STORE") {
      whereClause.isAiGenerated = false;
      whereClause.source = { notIn: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA", "AMAZON", "FLIPKART", "ALIBABA"] };
    } else if (sourceFilter === "AMAZON") {
      whereClause.source = { in: ["IMPORTED_AMAZON", "AMAZON"] };
    } else if (sourceFilter === "FLIPKART") {
      whereClause.source = { in: ["IMPORTED_FLIPKART", "FLIPKART"] };
    } else if (sourceFilter === "ALIBABA") {
      whereClause.source = { in: ["IMPORTED_ALIBABA", "ALIBABA"] };
    } else if (sourceFilter === "AI") {
      whereClause.isAiGenerated = true;
    }
  }

  // Rating filtering
  if (ratingFilter !== "ALL") {
    whereClause.rating = Number(ratingFilter);
  }

  if (searchQuery.trim() !== "") {
    whereClause.AND = [
      ...(whereClause.AND || []),
      {
        OR: [
          { reviewerName: { contains: searchQuery } },
          { bodyShort: { contains: searchQuery } },
          { bodyFull: { contains: searchQuery } },
          { productHandle: { contains: searchQuery } },
        ],
      },
    ];
  }

  let totalReviewsCount = 0;
  let totalPages = 1;
  let reviews: any[] = [];

  try {
    const rawReviews = await db.review.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Attach computed productTitle to every review
    let enrichedReviews = rawReviews.map((r) => ({
      ...r,
      productTitle: resolveProductTitle(r),
    }));

    // Filter by media if media tab active
    if (tabFilter === "media") {
      enrichedReviews = enrichedReviews.filter((r) => Boolean(r.imageUrl || r.videoUrl));
    }

    // Filter by selected productTitle if productFilter is active
    if (productFilter !== "ALL") {
      enrichedReviews = enrichedReviews.filter((r) =>
        r.productTitle.toLowerCase() === productFilter.toLowerCase() ||
        r.productId === productFilter ||
        r.productHandle === productFilter
      );
    }

    // Filter by product search query if typed
    if (productSearchQuery.trim() !== "") {
      enrichedReviews = enrichedReviews.filter((r) =>
        r.productTitle.toLowerCase().includes(productSearchQuery.toLowerCase().trim())
      );
    }

    totalReviewsCount = enrichedReviews.length;
    totalPages = Math.ceil(totalReviewsCount / pageSize) || 1;

    // Apply pagination slice
    const startIndex = (page - 1) * pageSize;
    reviews = enrichedReviews.slice(startIndex, startIndex + pageSize);
  } catch (err) {
    console.error("Reviews loader DB error:", err);
  }

  // Get selected product summary if a product filter is active
  let selectedProductSummary = null;
  if (productFilter !== "ALL" && productStatsMap.has(productFilter)) {
    selectedProductSummary = productStatsMap.get(productFilter);
  }

  // Fetch existing media files from Shopify store Content -> Files (with in-memory cache)
  let shopifyFiles: Array<{ id: string; type: "IMAGE" | "VIDEO"; url: string; previewUrl: string; filename: string }> = [];
  const cachedFiles = filesCache.get(shop);
  if (cachedFiles && cachedFiles.expiresAt > now) {
    shopifyFiles = cachedFiles.files;
  } else {
    try {
      const filesRes = await admin.graphql(`
        #graphql
        query getShopifyFilesForPicker {
          files(first: 250, sortKey: CREATED_AT, reverse: true) {
            nodes {
              id
              createdAt
              fileStatus
              alt
              ... on MediaImage {
                image {
                  url
                }
              }
              ... on Video {
                filename
                originalSource {
                  url
                }
                sources {
                  url
                }
                preview {
                  image {
                    url
                  }
                }
              }
              ... on GenericFile {
                url
              }
            }
          }
        }
      `);
      const filesJson = await filesRes.json();
      const fileNodes = filesJson.data?.files?.nodes || [];
      for (const node of fileNodes) {
        if (node.image?.url) {
          shopifyFiles.push({
            id: node.id,
            type: "IMAGE",
            url: node.image.url,
            previewUrl: node.image.url,
            filename: node.alt || `Shopify Image (${node.id.split("/").pop()})`,
          });
        } else if (node.sources?.[0]?.url || node.originalSource?.url) {
          const vidUrl = node.sources?.[0]?.url || node.originalSource?.url;
          const prevUrl = node.preview?.image?.url || "";
          shopifyFiles.push({
            id: node.id,
            type: "VIDEO",
            url: vidUrl,
            previewUrl: prevUrl,
            filename: node.filename || node.alt || `Shopify Video (${node.id.split("/").pop()})`,
          });
        } else if (node.url && (typeof node.url === "string") && node.url.match(/\.(mp4|mov|webm|avi|mkv)(\?|$)/i)) {
          shopifyFiles.push({
            id: node.id,
            type: "VIDEO",
            url: node.url,
            previewUrl: node.url,
            filename: node.alt || `Shopify Video (${node.id.split("/").pop()})`,
          });
        }
      }
      filesCache.set(shop, { files: shopifyFiles, expiresAt: now + FILES_CACHE_TTL });
    } catch (err) {
      console.warn("Error fetching Shopify store files:", err);
    }
  }

  return json({
    reviews,
    tabFilter,
    sourceFilter,
    statusFilter,
    ratingFilter,
    searchQuery,
    productFilter,
    productSearchQuery,
    productOptionsList,
    selectedProductSummary,
    page,
    pageSize,
    totalReviewsCount,
    totalPages,
    totalShopReviewsCount: allShopReviews.length,
    totalReviews,
    publishedReviews,
    pendingReviews,
    aiGeneratedCount,
    importedCount,
    mediaCount,
    trends,
    shopifyFiles,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const shopWhere = getShopWhereClause(shop);

  const formData = await request.formData();
  const intent = formData.get("intent");
  const reviewId = formData.get("reviewId") as string;

  if (intent === "togglePublish") {
    const review = await db.review.findFirst({ where: { AND: [shopWhere, { id: reviewId }] } });
    if (review) {
      await db.review.update({
        where: { id: reviewId },
        data: { isPublished: !review.isPublished },
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
  } else if (intent === "approveSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: true },
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
  } else if (intent === "unpublishSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: false },
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
  } else if (intent === "approveAllPending") {
    await db.review.updateMany({
      where: { AND: [shopWhere, { isPublished: false }] },
      data: { isPublished: true },
    });
    syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
  } else if (intent === "delete") {
    if (reviewId) {
      await recordDeletedReviewIds(admin, shop, [reviewId]);
    }
    await db.review.deleteMany({
      where: { AND: [shopWhere, { id: reviewId }] },
    });
    syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
  } else if (intent === "deleteAllPending") {
    const pendingReviews = await db.review.findMany({
      where: { AND: [shopWhere, { isPublished: false }] },
      select: { id: true },
    });
    const pendingIds = pendingReviews.map((r) => r.id);
    if (pendingIds.length > 0) {
      await recordDeletedReviewIds(admin, shop, pendingIds);
    }
    await db.review.deleteMany({
      where: { AND: [shopWhere, { isPublished: false }] },
    });
    syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
  } else if (intent === "deleteAll") {
    const allReviews = await db.review.findMany({
      where: shopWhere,
      select: { id: true },
    });
    const allIds = allReviews.map((r) => r.id);
    if (allIds.length > 0) {
      await recordDeletedReviewIds(admin, shop, allIds);
    }
    await db.review.deleteMany({ where: shopWhere });
    syncReviewsToShopify(admin, shop, true).catch((e) => console.warn(e));
  } else if (intent === "deleteSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await recordDeletedReviewIds(admin, shop, ids);
      await db.review.deleteMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
  } else if (intent === "edit" || intent === "updateMedia") {
    const reviewerName = formData.get("reviewerName") as string;
    const rating = parseInt((formData.get("rating") as string) || "5", 10);
    const bodyShort = formData.get("bodyShort") as string;
    const bodyFull = formData.get("bodyFull") as string;
    const source = formData.get("source") as string;
    const externalUrl = formData.get("externalUrl") as string;
    const isVerifiedPurchase = formData.get("isVerifiedPurchase") === "true";
    const imageUrl = formData.get("imageUrl") as string | null;
    const videoUrl = formData.get("videoUrl") as string | null;
    const clearMedia = formData.get("clearMedia") === "true";

    let finalImg: string | null = imageUrl;
    let finalVid: string | null = videoUrl;

    if (clearMedia) {
      finalImg = null;
      finalVid = null;
    } else {
      if (typeof finalImg === "string" && finalImg.startsWith("data:")) {
        finalImg = await uploadReviewMediaToShopify(admin, finalImg, `review-img-${Date.now()}.png`);
      }
      if (typeof finalVid === "string" && finalVid.startsWith("data:")) {
        finalVid = await uploadReviewMediaToShopify(admin, finalVid, `review-vid-${Date.now()}.mp4`);
      }
    }

    const updateData: any = {};
    if (intent === "edit") {
      if (reviewerName !== null) updateData.reviewerName = reviewerName;
      if (!isNaN(rating)) updateData.rating = rating;
      if (bodyShort !== null) updateData.bodyShort = bodyShort;
      if (bodyFull !== null) updateData.bodyFull = bodyFull;
      if (source !== null) updateData.source = source;
      updateData.externalUrl = externalUrl || null;
      updateData.isVerifiedPurchase = isVerifiedPurchase;
    }

    if (clearMedia) {
      updateData.imageUrl = null;
      updateData.videoUrl = null;
    } else {
      if (formData.has("imageUrl")) {
        updateData.imageUrl = finalImg;
      }
      if (formData.has("videoUrl")) {
        updateData.videoUrl = finalVid;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: reviewId }] },
        data: updateData,
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
  }

  return json({ success: true });
}

function getInitials(name: string): string {
  if (!name || !name.trim()) return "CU";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(dateInput: any): string {
  if (!dateInput) return "2 days ago";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays <= 0) {
    if (diffHours <= 0) {
      if (diffMin <= 1) return "Just now";
      return `${diffMin} mins ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths <= 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return `${Math.floor(diffMonths / 12)} year ago`;
}

function formatProductId(r: any): string {
  if (r.productId) {
    const raw = r.productId.replace("gid://shopify/Product/", "");
    if (/^\d+$/.test(raw)) {
      return `ID: PTL-${raw.slice(-3).padStart(3, "0")}`;
    }
    return `ID: ${raw.slice(0, 10)}`;
  }
  if (r.productHandle && r.productHandle !== "all") {
    const code = r.productHandle
      .split("-")
      .map((w: string) => w[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 3);
    return `ID: ${code || "PRD"}-001`;
  }
  return "ID: PTL-001";
}

export default function ReviewsPage() {
  const {
    reviews,
    tabFilter = "all",
    sourceFilter = "ALL",
    statusFilter = "ALL",
    ratingFilter = "ALL",
    searchQuery = "",
    productFilter = "ALL",
    productSearchQuery = "",
    productOptionsList = [],
    selectedProductSummary = null,
    page = 1,
    pageSize = 8,
    totalReviewsCount = 0,
    totalPages = 1,
    totalShopReviewsCount = 0,
    totalReviews = 0,
    publishedReviews = 0,
    pendingReviews = 0,
    aiGeneratedCount = 0,
    importedCount = 0,
    mediaCount = 0,
    trends = {
      total: { text: "↑ +12%", isPositive: true, isNeutral: false },
      published: { text: "↑ +12%", isPositive: true, isNeutral: false },
      pending: { text: "— 0%", isPositive: false, isNeutral: true },
      ai: { text: "↑ +8%", isPositive: true, isNeutral: false },
    },
    shopifyFiles = [],
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Toggle for expandable More Filters panel
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);

  // Optimistic tab state for instantaneous visual feedback on click
  const [activeTab, setActiveTab] = useState<string>(tabFilter);

  // Optimistic UI state for instantaneous response on click
  const [optimisticHiddenIds, setOptimisticHiddenIds] = useState<Set<string>>(new Set());
  const [optimisticPublishedMap, setOptimisticPublishedMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    setActiveTab(tabFilter);
  }, [tabFilter]);

  // Clear optimistic overrides when loader delivers fresh data
  useEffect(() => {
    setOptimisticHiddenIds(new Set());
    setOptimisticPublishedMap(new Map());
  }, [reviews]);

  const [searchValue, setSearchValue] = useState<string>(searchQuery);
  const [productSearchValue, setProductSearchValue] = useState<string>(productSearchQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // CONFIRMATION DIALOG MODAL STATE FOR DELETIONS
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    type: "single" | "selected" | "all";
    id?: string;
    count?: number;
  }>({ open: false, type: "single" });

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // MEDIA SOURCE SELECTION STATE (Shopify Store Files vs Local Computer)
  const [mediaSourceMode, setMediaSourceMode] = useState<"shopify_files" | "computer_upload">("shopify_files");
  const [shopifyFileSearch, setShopifyFileSearch] = useState<string>("");
  const [shopifyMediaTypeFilter, setShopifyMediaTypeFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");

  const filteredShopifyFiles = shopifyFiles.filter((file) => {
    if (shopifyMediaTypeFilter !== "ALL" && file.type !== shopifyMediaTypeFilter) return false;
    if (shopifyFileSearch.trim() !== "") {
      return file.filename.toLowerCase().includes(shopifyFileSearch.toLowerCase().trim());
    }
    return true;
  });

  // EDIT MODAL STATE
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editRating, setEditRating] = useState<string>("5");
  const [editShort, setEditShort] = useState<string>("");
  const [editFull, setEditFull] = useState<string>("");
  const [editSource, setEditSource] = useState<string>("MANUAL");
  const [editExternalUrl, setEditExternalUrl] = useState<string>("");
  const [editVerified, setEditVerified] = useState<boolean>(true);
  const [editMediaType, setEditMediaType] = useState<"image" | "video" | null>(null);
  const [editMediaPreview, setEditMediaPreview] = useState<string | null>(null);
  const [editClearMedia, setEditClearMedia] = useState<boolean>(false);

  // DEDICATED UPLOAD MEDIA MODAL STATE
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadTargetReview, setUploadTargetReview] = useState<any>(null);
  const [uploadMediaType, setUploadMediaType] = useState<"image" | "video" | null>(null);
  const [uploadMediaPreview, setUploadMediaPreview] = useState<string | null>(null);
  const [uploadClearMedia, setUploadClearMedia] = useState<boolean>(false);

  const handleOpenEdit = (r: any) => {
    setEditId(r.id);
    setEditName(r.reviewerName || "");
    setEditRating(String(r.rating || 5));
    setEditShort(r.bodyShort || "");
    setEditFull(r.bodyFull || "");
    setEditSource(r.source || "MANUAL");
    setEditExternalUrl(r.externalUrl || "");
    setEditVerified(r.isVerifiedPurchase ?? true);
    setEditClearMedia(false);
    if (r.videoUrl) {
      setEditMediaType("video");
      setEditMediaPreview(r.videoUrl);
    } else if (r.imageUrl) {
      setEditMediaType("image");
      setEditMediaPreview(r.imageUrl);
    } else {
      setEditMediaType(null);
      setEditMediaPreview(null);
    }
    setEditModalOpen(true);
  };

  const handleEditMediaDrop = (_files: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const isVid = file.type.startsWith("video/");
      setEditMediaType(isVid ? "video" : "image");
      setEditClearMedia(false);

      const reader = new FileReader();
      reader.onload = (e) => {
        setEditMediaPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveEdit = () => {
    const fd = new FormData();
    fd.append("intent", "edit");
    fd.append("reviewId", editId);
    fd.append("reviewerName", editName);
    fd.append("rating", editRating);
    fd.append("bodyShort", editShort);
    fd.append("bodyFull", editFull);
    fd.append("source", editSource);
    fd.append("externalUrl", editExternalUrl);
    fd.append("isVerifiedPurchase", editVerified ? "true" : "false");
    if (editClearMedia) {
      fd.append("clearMedia", "true");
    } else if (editMediaType === "image") {
      fd.append("imageUrl", editMediaPreview || "");
    } else if (editMediaType === "video") {
      fd.append("videoUrl", editMediaPreview || "");
    }

    submit(fd, { method: "post" });
    setEditModalOpen(false);
  };

  const handleOpenUploadMedia = (r: any) => {
    setUploadTargetReview(r);
    setUploadClearMedia(false);
    if (r.videoUrl) {
      setUploadMediaType("video");
      setUploadMediaPreview(r.videoUrl);
    } else if (r.imageUrl) {
      setUploadMediaType("image");
      setUploadMediaPreview(r.imageUrl);
    } else {
      setUploadMediaType(null);
      setUploadMediaPreview(null);
    }
    setUploadModalOpen(true);
  };

  const handleUploadMediaDrop = (_files: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const isVid = file.type.startsWith("video/");
      setUploadMediaType(isVid ? "video" : "image");
      setUploadClearMedia(false);

      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadMediaPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveUploadMedia = () => {
    if (!uploadTargetReview) return;
    const fd = new FormData();
    fd.append("intent", "updateMedia");
    fd.append("reviewId", uploadTargetReview.id);
    if (uploadClearMedia) {
      fd.append("clearMedia", "true");
    } else if (uploadMediaType === "image") {
      fd.append("imageUrl", uploadMediaPreview || "");
      if (uploadTargetReview.videoUrl) {
        fd.append("videoUrl", uploadTargetReview.videoUrl);
      }
    } else if (uploadMediaType === "video") {
      fd.append("videoUrl", uploadMediaPreview || "");
      if (uploadTargetReview.imageUrl) {
        fd.append("imageUrl", uploadTargetReview.imageUrl);
      }
    }
    submit(fd, { method: "post" });
    setUploadModalOpen(false);
  };

  const displayedReviews = reviews
    .filter((r: any) => !optimisticHiddenIds.has(r.id))
    .map((r: any) => ({
      ...r,
      isPublished: optimisticPublishedMap.has(r.id)
        ? optimisticPublishedMap.get(r.id)
        : r.isPublished,
    }));

  const allCurrentIds = displayedReviews.map((r: any) => r.id);
  const allSelected =
    allCurrentIds.length > 0 &&
    allCurrentIds.every((id: string) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCurrentIds));
    }
  }, [allSelected, allCurrentIds]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const navigate = useNavigate();

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    navigate(`/app/reviews?${params.toString()}`);
  };

  const handleTogglePublish = (id: string) => {
    const current = optimisticPublishedMap.has(id)
      ? optimisticPublishedMap.get(id)
      : reviews.find((r: any) => r.id === id)?.isPublished;
    setOptimisticPublishedMap((prev) => new Map(prev).set(id, !current));

    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", id);
    submit(fd, { method: "post" });
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    setOptimisticPublishedMap((prev) => {
      const next = new Map(prev);
      selectedIds.forEach((id) => next.set(id, true));
      return next;
    });
    const fd = new FormData();
    fd.append("intent", "approveSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    submit(fd, { method: "post" });
  };

  const handleBulkUnpublish = () => {
    if (selectedIds.size === 0) return;
    setOptimisticPublishedMap((prev) => {
      const next = new Map(prev);
      selectedIds.forEach((id) => next.set(id, false));
      return next;
    });
    const fd = new FormData();
    fd.append("intent", "unpublishSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    submit(fd, { method: "post" });
  };

  const executeConfirmDelete = () => {
    const { type, id } = deleteConfirmModal;
    setDeleteConfirmModal({ open: false, type: "single" });

    if (type === "single" && id) {
      setOptimisticHiddenIds((prev) => new Set(prev).add(id));
      const fd = new FormData();
      fd.append("intent", "delete");
      fd.append("reviewId", id);
      submit(fd, { method: "post" });
    } else if (type === "selected") {
      if (selectedIds.size === 0) return;
      setOptimisticHiddenIds((prev) => new Set([...prev, ...selectedIds]));
      const fd = new FormData();
      fd.append("intent", "deleteSelected");
      selectedIds.forEach((sid) => fd.append("ids", sid));
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    } else if (type === "all") {
      setOptimisticHiddenIds(new Set(reviews.map((r: any) => r.id)));
      const fd = new FormData();
      fd.append("intent", "deleteAll");
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const startRecord = totalReviewsCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(page * pageSize, totalReviewsCount);

  return (
    <Page fullWidth>
      <style>{`
        .action-dropdown-item {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          width: 100% !important;
          padding: 9px 12px !important;
          border-radius: 7px !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          border: none !important;
          background: transparent !important;
          text-align: left !important;
          transition: background-color 0.15s ease, color 0.15s ease !important;
          text-decoration: none !important;
          box-sizing: border-box !important;
          white-space: nowrap !important;
        }
        .action-dropdown-item.edit {
          color: #1e293b !important;
        }
        .action-dropdown-item.edit:hover {
          background-color: #f1f5f9 !important;
          color: #0f172a !important;
        }
        .action-dropdown-item.link {
          color: #2563eb !important;
        }
        .action-dropdown-item.link:hover {
          background-color: #eff6ff !important;
          color: #1d4ed8 !important;
        }
        .action-dropdown-item.delete {
          color: #dc2626 !important;
        }
        .action-dropdown-item.delete:hover {
          background-color: #fef2f2 !important;
          color: #b91c1c !important;
        }
        .action-dropdown-divider {
          height: 1px !important;
          background-color: #f1f5f9 !important;
          margin: 4px 0 !important;
        }
      `}</style>

      <div style={{ width: "100%", padding: "12px 0 36px 0", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif' }}>
        {/* HEADER: Reviews title & subtitle matching reference design */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
            Reviews
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", margin: "6px 0 0 0" }}>
            Manage and moderate customer reviews, or let AI generate new ones.
          </p>
        </div>

        {/* 4 TOP SUMMARY METRIC CARDS MATCHING REFERENCE DESIGN */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
            marginBottom: "24px",
          }}
        >
          {/* Card 1: Total Reviews */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #f1f5f9",
              borderRadius: "14px",
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "#eff6ff",
                color: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              💬
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>
                Total Reviews
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", marginTop: "4px", lineHeight: 1.1 }}>
                {totalReviews}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "12px" }}>
                <span
                  style={{
                    color: trends.total.isPositive ? "#10b981" : trends.total.isNeutral ? "#64748b" : "#ef4444",
                    fontWeight: 600,
                  }}
                >
                  {trends.total.text}
                </span>
                <span style={{ color: "#94a3b8" }}>vs. previous 30 days</span>
              </div>
            </div>
          </div>

          {/* Card 2: Published */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #f1f5f9",
              borderRadius: "14px",
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "#fef9c3",
                color: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              ★
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>
                Published
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", marginTop: "4px", lineHeight: 1.1 }}>
                {publishedReviews}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "12px" }}>
                <span
                  style={{
                    color: trends.published.isPositive ? "#10b981" : trends.published.isNeutral ? "#64748b" : "#ef4444",
                    fontWeight: 600,
                  }}
                >
                  {trends.published.text}
                </span>
                <span style={{ color: "#94a3b8" }}>vs. previous 30 days</span>
              </div>
            </div>
          </div>

          {/* Card 3: Pending Approval */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #f1f5f9",
              borderRadius: "14px",
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "#fff7ed",
                color: "#f97316",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              ⏱
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>
                Pending Approval
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", marginTop: "4px", lineHeight: 1.1 }}>
                {pendingReviews}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "12px" }}>
                <span
                  style={{
                    color: trends.pending.isPositive ? "#10b981" : trends.pending.isNeutral ? "#64748b" : "#ef4444",
                    fontWeight: 600,
                  }}
                >
                  {trends.pending.text}
                </span>
                <span style={{ color: "#94a3b8" }}>vs. previous 30 days</span>
              </div>
            </div>
          </div>

          {/* Card 4: AI Drafts */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #f1f5f9",
              borderRadius: "14px",
              padding: "22px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                backgroundColor: "#f5f3ff",
                color: "#8b5cf6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              ✦
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>
                AI Drafts
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", marginTop: "4px", lineHeight: 1.1 }}>
                {aiGeneratedCount}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "12px" }}>
                <span
                  style={{
                    color: trends.ai.isPositive ? "#10b981" : trends.ai.isNeutral ? "#64748b" : "#ef4444",
                    fontWeight: 600,
                  }}
                >
                  {trends.ai.text}
                </span>
                <span style={{ color: "#94a3b8" }}>vs. previous 30 days</span>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN REVIEWS MODERATION & MANAGEMENT CARD */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            padding: "20px 24px 24px 24px",
            overflow: "hidden",
          }}
        >
          {/* SEARCH AND FILTERS TOOLBAR MATCHING REFERENCE DESIGN */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {/* Search input with search icon */}
            <div style={{ position: "relative", flex: 1, minWidth: "280px" }}>
              <span
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilters({ search: searchValue, page: "1" });
                }}
                onBlur={() => updateFilters({ search: searchValue, page: "1" })}
                placeholder="Search by reviewer, product or review text..."
                style={{
                  width: "100%",
                  padding: "10px 14px 10px 40px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13.5px",
                  outline: "none",
                  color: "#0f172a",
                  backgroundColor: "#ffffff",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s ease",
                }}
              />
            </div>

            {/* Dropdowns & More Filters button */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/* All sources */}
              <div style={{ position: "relative" }}>
                <select
                  value={sourceFilter}
                  onChange={(e) => updateFilters({ source: e.target.value, page: "1" })}
                  style={{
                    appearance: "none",
                    padding: "10px 34px 10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    fontWeight: 500,
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="ALL">All sources</option>
                  <option value="STORE">Shopify</option>
                  <option value="ALIBABA">Alibaba</option>
                  <option value="FLIPKART">Flipkart</option>
                  <option value="AMAZON">Amazon</option>
                  <option value="AI">AI generated</option>
                </select>
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b", fontSize: "10px" }}>▼</span>
              </div>

              {/* All status */}
              <div style={{ position: "relative" }}>
                <select
                  value={statusFilter}
                  onChange={(e) => updateFilters({ status: e.target.value, tab: e.target.value, page: "1" })}
                  style={{
                    appearance: "none",
                    padding: "10px 34px 10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    fontWeight: 500,
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="ALL">All status</option>
                  <option value="published">Published</option>
                  <option value="pending">Pending Approval</option>
                  <option value="draft">Draft</option>
                </select>
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b", fontSize: "10px" }}>▼</span>
              </div>

              {/* Rating */}
              <div style={{ position: "relative" }}>
                <select
                  value={ratingFilter}
                  onChange={(e) => updateFilters({ rating: e.target.value, page: "1" })}
                  style={{
                    appearance: "none",
                    padding: "10px 34px 10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "13px",
                    fontWeight: 500,
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="ALL">Rating</option>
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="2">2 Stars</option>
                  <option value="1">1 Star</option>
                </select>
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b", fontSize: "10px" }}>▼</span>
              </div>

              {/* More filters */}
              <button
                type="button"
                onClick={() => setShowMoreFilters(!showMoreFilters)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: showMoreFilters ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  backgroundColor: showMoreFilters ? "#eff6ff" : "#ffffff",
                  color: showMoreFilters ? "#2563eb" : "#334155",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"></line>
                  <line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line>
                  <line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line>
                  <line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
                <span>More filters</span>
              </button>
            </div>
          </div>

          {/* EXPANDABLE MORE FILTERS PANEL */}
          {showMoreFilters && (
            <div
              style={{
                marginBottom: "20px",
                padding: "14px 18px",
                backgroundColor: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>Product:</span>
                <select
                  value={productFilter}
                  onChange={(e) => updateFilters({ product: e.target.value, page: "1" })}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    maxWidth: "220px",
                  }}
                >
                  <option value="ALL">All Products</option>
                  {productOptionsList.map((p: any) => (
                    <option key={p.title} value={p.title}>
                      {p.title} ({p.count})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => updateFilters({ tab: tabFilter === "media" ? "all" : "media", page: "1" })}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: tabFilter === "media" ? "1px solid #2563eb" : "1px solid #cbd5e1",
                    backgroundColor: tabFilter === "media" ? "#eff6ff" : "#ffffff",
                    color: tabFilter === "media" ? "#2563eb" : "#334155",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  📷 Photos/Videos Only ({mediaCount})
                </button>

                {(sourceFilter !== "ALL" || statusFilter !== "ALL" || ratingFilter !== "ALL" || productFilter !== "ALL" || searchQuery !== "" || tabFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchValue("");
                      navigate("/app/reviews");
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "#2563eb",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Delete All action */}
              <button
                type="button"
                onClick={() => setDeleteConfirmModal({ open: true, type: "all" })}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #fecaca",
                  backgroundColor: "#fef2f2",
                  color: "#dc2626",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🗑</span> Delete All Reviews
              </button>
            </div>
          )}

          {/* BULK ACTIONS BAR (When items are selected) */}
          {selectedIds.size > 0 && (
            <div
              style={{
                marginBottom: "18px",
                padding: "10px 16px",
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 600, color: "#1d4ed8", fontSize: "13.5px" }}>
                {selectedIds.size} selected
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <span>✓</span> Approve
                </button>

                <button
                  type="button"
                  onClick={handleBulkUnpublish}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <span>⃠</span> Unpublish
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirmModal({
                      open: true,
                      type: "selected",
                      count: selectedIds.size,
                    })
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #fca5a5",
                    backgroundColor: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span>🗑</span> Delete
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "transparent",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* TABLE MATCHING REFERENCE DESIGN */}
          <div style={{ overflowX: "auto", opacity: navigation.state === "loading" ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <th style={{ padding: "14px 12px", width: "36px" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                    />
                  </th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Reviewer</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Product</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Rating</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Review</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Source</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Status</th>
                  <th style={{ padding: "14px 14px", fontSize: "13px", fontWeight: 600, color: "#475569", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedReviews.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                      No reviews match your selected filters.
                    </td>
                  </tr>
                ) : (
                  displayedReviews.map((r: any) => {
                    const isAiDraft = r.isAiGenerated;
                    const initials = getInitials(r.reviewerName || "Buyer");
                    const relativeTime = formatRelativeTime(r.createdAt);
                    const productIdStr = formatProductId(r);
                    const srcUpper = (r.source || "").toUpperCase();

                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: "1px solid #f8fafc",
                          transition: "background-color 0.1s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fcfdff")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: "16px 12px" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelectOne(r.id)}
                            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                          />
                        </td>

                        {/* Reviewer */}
                        <td style={{ padding: "16px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                backgroundColor: "#f1f5f9",
                                color: "#475569",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                                {r.reviewerName || "Verified Customer"}
                              </div>
                              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px", whiteSpace: "nowrap" }}>
                                {relativeTime}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Product */}
                        <td style={{ padding: "16px 14px", maxWidth: "180px" }}>
                          <div
                            style={{
                              fontSize: "13.5px",
                              fontWeight: 500,
                              color: "#1e293b",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={r.productTitle}
                          >
                            {r.productTitle}
                          </div>
                          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {productIdStr}
                          </div>
                        </td>

                        {/* Rating */}
                        <td style={{ padding: "16px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "2px", fontSize: "14px" }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span
                                key={star}
                                style={{
                                  color: star <= Math.max(1, Math.min(5, r.rating || 5)) ? "#f59e0b" : "#e2e8f0",
                                }}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Review text + media preview */}
                        <td style={{ padding: "16px 14px", maxWidth: "260px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {(r.imageUrl || r.videoUrl) && (
                              <div
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "4px",
                                  overflow: "hidden",
                                  flexShrink: 0,
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                {r.videoUrl ? (
                                  <video src={r.videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <img src={r.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                              </div>
                            )}
                            <span
                              style={{
                                fontSize: "13.5px",
                                color: "#475569",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                              }}
                              title={r.bodyShort || r.bodyFull || ""}
                            >
                              {r.bodyShort || r.bodyFull || "Review content"}
                            </span>
                          </div>
                        </td>

                        {/* Source */}
                        <td style={{ padding: "16px 14px", whiteSpace: "nowrap" }}>
                          {isAiDraft || srcUpper.includes("AI") ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "4px 10px",
                                borderRadius: "14px",
                                backgroundColor: "#f5f3ff",
                                color: "#7c3aed",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              <span style={{ fontSize: "12px" }}>✦</span> AI generated
                            </span>
                          ) : srcUpper.includes("ALIBABA") ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155", fontWeight: 500 }}>
                              <span
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "4px",
                                  backgroundColor: "#ff6a00",
                                  color: "#ffffff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  lineHeight: 1,
                                }}
                              >
                                a
                              </span>
                              Alibaba
                            </span>
                          ) : srcUpper.includes("FLIPKART") ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155", fontWeight: 500 }}>
                              <span
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "4px",
                                  backgroundColor: "#2874f0",
                                  color: "#ffffff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  lineHeight: 1,
                                }}
                              >
                                f
                              </span>
                              Flipkart
                            </span>
                          ) : srcUpper.includes("AMAZON") ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155", fontWeight: 500 }}>
                              <span
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "4px",
                                  backgroundColor: "#0f172a",
                                  color: "#f59e0b",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: 900,
                                  lineHeight: 1,
                                }}
                              >
                                a
                              </span>
                              Amazon
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155", fontWeight: 500 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="#15803d">
                                <path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h14v12z"/>
                              </svg>
                              Shopify
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "16px 14px", whiteSpace: "nowrap" }}>
                          {r.isPublished ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 12px",
                                borderRadius: "14px",
                                fontSize: "12px",
                                fontWeight: 600,
                                backgroundColor: "#ecfdf5",
                                color: "#10b981",
                              }}
                            >
                              Published
                            </span>
                          ) : isAiDraft ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 12px",
                                borderRadius: "14px",
                                fontSize: "12px",
                                fontWeight: 600,
                                backgroundColor: "#f5f3ff",
                                color: "#6366f1",
                              }}
                            >
                              Draft
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 12px",
                                borderRadius: "14px",
                                fontSize: "12px",
                                fontWeight: 600,
                                backgroundColor: "#fffbeb",
                                color: "#d97706",
                              }}
                            >
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Actions (••• menu) */}
                        <td style={{ padding: "16px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ position: "relative", display: "inline-block" }}>
                            <button
                              type="button"
                              onClick={() => setActiveMenuId(activeMenuId === r.id ? null : r.id)}
                              title="Review actions"
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#94a3b8",
                                fontSize: "18px",
                                fontWeight: "bold",
                                letterSpacing: "1px",
                                cursor: "pointer",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                lineHeight: 1,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#0f172a")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                            >
                              •••
                            </button>

                            {activeMenuId === r.id && (
                              <>
                                {/* Transparent click-outside backdrop */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                  }}
                                  style={{
                                    position: "fixed",
                                    inset: 0,
                                    zIndex: 9998,
                                    backgroundColor: "transparent",
                                  }}
                                />

                                {/* Dropdown Menu Popover */}
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "calc(100% + 4px)",
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "10px",
                                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.08)",
                                    zIndex: 9999,
                                    minWidth: "185px",
                                    padding: "6px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                    boxSizing: "border-box",
                                    textAlign: "left",
                                  }}
                                >
                                  {/* Toggle publish / unpublish */}
                                  <button
                                    type="button"
                                    className="action-dropdown-item edit"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleTogglePublish(r.id);
                                    }}
                                  >
                                    <span style={{ fontSize: "14px" }}>{r.isPublished ? "⃠" : "✓"}</span>
                                    <span>{r.isPublished ? "Unpublish (Hide)" : "Approve & Publish"}</span>
                                  </button>

                                  {/* Edit Details */}
                                  <button
                                    type="button"
                                    className="action-dropdown-item edit"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleOpenEdit(r);
                                    }}
                                  >
                                    <span style={{ fontSize: "14px" }}>✏️</span>
                                    <span>Edit Details</span>
                                  </button>

                                  {/* Upload / Manage Media */}
                                  <button
                                    type="button"
                                    className="action-dropdown-item edit"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleOpenUploadMedia(r);
                                    }}
                                  >
                                    <span style={{ fontSize: "14px" }}>🖼</span>
                                    <span>Manage Media</span>
                                  </button>

                                  {/* External Link if exists */}
                                  {r.externalUrl && (
                                    <a
                                      href={r.externalUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="action-dropdown-item link"
                                      onClick={() => setActiveMenuId(null)}
                                    >
                                      <span style={{ fontSize: "14px" }}>↗</span>
                                      <span>View Marketplace Link</span>
                                    </a>
                                  )}

                                  <div className="action-dropdown-divider" />

                                  {/* Delete review */}
                                  <button
                                    type="button"
                                    className="action-dropdown-item delete"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setDeleteConfirmModal({ open: true, type: "single", id: r.id });
                                    }}
                                  >
                                    <span style={{ fontSize: "14px" }}>🗑</span>
                                    <span>Delete Review</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER MATCHING REFERENCE DESIGN */}
          {totalReviewsCount > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "20px",
                paddingTop: "16px",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              <div>
                Showing {startRecord}-{endRecord} of {totalReviewsCount} reviews
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => updateFilters({ page: String(Math.max(1, page - 1)) })}
                  disabled={page <= 1}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    color: page <= 1 ? "#cbd5e1" : "#475569",
                    fontSize: "14px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                  title="Previous page"
                >
                  ‹
                </button>

                {/* Page number buttons */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pNum = i + 1;
                  if (totalPages > 5 && page > 3) {
                    pNum = page - 2 + i;
                    if (pNum > totalPages) pNum = totalPages - (4 - i);
                  }
                  const isActive = pNum === page;
                  return (
                    <button
                      key={pNum}
                      onClick={() => updateFilters({ page: String(pNum) })}
                      style={{
                        minWidth: "32px",
                        height: "32px",
                        padding: "0 8px",
                        borderRadius: "6px",
                        border: isActive ? "none" : "1px solid #e2e8f0",
                        backgroundColor: isActive ? "#1e293b" : "#ffffff",
                        color: isActive ? "#ffffff" : "#475569",
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 500,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {pNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => updateFilters({ page: String(Math.min(totalPages, page + 1)) })}
                  disabled={page >= totalPages}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    color: page >= totalPages ? "#cbd5e1" : "#475569",
                    fontSize: "14px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                  title="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CONFIRMATION POPUP MODAL FOR DELETION */}
        <Modal
          open={deleteConfirmModal.open}
          onClose={() => setDeleteConfirmModal({ open: false, type: "single" })}
          title="Confirm Review Deletion"
          primaryAction={{
            content:
              deleteConfirmModal.type === "all"
                ? "Yes, Delete All Reviews"
                : deleteConfirmModal.type === "selected"
                ? `Yes, Delete ${deleteConfirmModal.count || selectedIds.size} Reviews`
                : "Yes, Delete Review",
            destructive: true,
            onAction: executeConfirmDelete,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setDeleteConfirmModal({ open: false, type: "single" }),
            },
          ]}
        >
          <Modal.Section>
            <div style={{ padding: "8px 0" }}>
              {deleteConfirmModal.type === "all" ? (
                <p style={{ color: "#b91c1c", fontWeight: 600, fontSize: "14px" }}>
                  ⚠️ Warning: This will permanently delete ALL {totalReviewsCount} reviews from your store. This action cannot be undone. Are you sure you wish to proceed?
                </p>
              ) : deleteConfirmModal.type === "selected" ? (
                <p style={{ color: "#334155", fontSize: "14px" }}>
                  Are you sure you want to delete the {deleteConfirmModal.count || selectedIds.size} selected reviews? They will be permanently removed.
                </p>
              ) : (
                <p style={{ color: "#334155", fontSize: "14px" }}>
                  Are you sure you want to delete this review? This action cannot be undone.
                </p>
              )}
            </div>
          </Modal.Section>
        </Modal>
      </div>

      {/* DEDICATED UPLOAD REVIEW MEDIA MODAL */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={`Upload Review Media for ${uploadTargetReview?.productTitle || "Product Review"}`}
        primaryAction={{
          content: "Save Media",
          onAction: handleSaveUploadMedia,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setUploadModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {uploadTargetReview && (
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <Text as="p" fontWeight="bold" variant="bodySm">
                  Reviewer: {uploadTargetReview.reviewerName || "Verified Buyer"} ({uploadTargetReview.rating} ⭐)
                </Text>
                <Text as="p" variant="bodyXs" tone="subdued">
                  Product: <strong>{uploadTargetReview.productTitle}</strong>
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    "{uploadTargetReview.bodyShort}"
                  </Text>
                </div>
              </div>
            )}

            {/* SOURCE MODE SWITCHER TABS */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #E1E3E5", paddingBottom: "10px" }}>
              <Button
                size="medium"
                pressed={mediaSourceMode === "shopify_files"}
                onClick={() => setMediaSourceMode("shopify_files")}
              >
                {`📁 Select Existing Shopify Media (${shopifyFiles.length})`}
              </Button>
              <Button
                size="medium"
                pressed={mediaSourceMode === "computer_upload"}
                onClick={() => setMediaSourceMode("computer_upload")}
              >
                💻 Upload New File from Your Device
              </Button>
            </div>

            {/* CURRENT SELECTED MEDIA PREVIEW HEADER */}
            {uploadMediaPreview && !uploadClearMedia && (
              <div style={{ background: "#F0FDF4", border: "1.5px solid #008060", padding: "10px 14px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {uploadMediaType === "video" ? (
                    <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "6px", overflow: "hidden", background: "#000", flexShrink: 0 }}>
                      <video src={uploadMediaPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: "10px", color: "#fff" }}>▶</div>
                    </div>
                  ) : (
                    <img src={uploadMediaPreview} alt="Selected media" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #ccc", flexShrink: 0 }} />
                  )}
                  <div>
                    <Text as="span" variant="bodySm" fontWeight="bold">
                      Selected {uploadMediaType === "video" ? "Video" : "Image"} Attached ✓
                    </Text>
                    <div style={{ fontSize: "11px", color: "#5C5F62", wordBreak: "break-all", maxWidth: "320px" }}>
                      {uploadMediaPreview.startsWith("data:") ? "Local File (Will upload to Shopify Content -> Files on Save)" : uploadMediaPreview}
                    </div>
                  </div>
                </div>
                <Button size="micro" tone="critical" onClick={() => { setUploadClearMedia(true); setUploadMediaPreview(null); setUploadMediaType(null); }}>
                  Remove Selection
                </Button>
              </div>
            )}

            {mediaSourceMode === "shopify_files" ? (
              <BlockStack gap="300">
                <Text as="span" variant="bodySm" fontWeight="bold">Select Existing Media from Shopify Files</Text>
                
                <InlineGrid columns={2} gap="200">
                  <TextField
                    label=""
                    labelHidden
                    placeholder="Search Shopify media files..."
                    value={shopifyFileSearch}
                    onChange={setShopifyFileSearch}
                    prefix={<SearchIcon />}
                    autoComplete="off"
                  />
                  <InlineStack gap="100" blockAlign="center">
                    <Button size="micro" pressed={shopifyMediaTypeFilter === "ALL"} onClick={() => setShopifyMediaTypeFilter("ALL")}>All</Button>
                    <Button size="micro" pressed={shopifyMediaTypeFilter === "IMAGE"} onClick={() => setShopifyMediaTypeFilter("IMAGE")}>Images</Button>
                    <Button size="micro" pressed={shopifyMediaTypeFilter === "VIDEO"} onClick={() => setShopifyMediaTypeFilter("VIDEO")}>Videos</Button>
                  </InlineStack>
                </InlineGrid>

                {filteredShopifyFiles.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", maxHeight: "280px", overflowY: "auto", padding: "4px" }}>
                    {filteredShopifyFiles.map((file) => {
                      const isSelected = uploadMediaPreview === file.url && !uploadClearMedia;
                      return (
                        <div
                          key={file.id}
                          onClick={() => {
                            setUploadMediaPreview(file.url);
                            setUploadMediaType(file.type.toLowerCase() as "image" | "video");
                            setUploadClearMedia(false);
                          }}
                          style={{
                            border: isSelected ? "2.5px solid #008060" : "1px solid #DFE3E8",
                            borderRadius: "8px",
                            padding: "6px",
                            cursor: "pointer",
                            background: isSelected ? "#F0FDF4" : "#FFFFFF",
                            position: "relative",
                            transition: "all 0.15s ease",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ position: "relative", width: "100%", height: "85px", borderRadius: "6px", overflow: "hidden", background: "#000", marginBottom: "4px" }}>
                            {file.type === "VIDEO" ? (
                              <>
                                {file.previewUrl ? (
                                  <img src={file.previewUrl} alt={file.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <video src={file.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,0,0,0.65)", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px" }}>▶</div>
                              </>
                            ) : (
                              <img src={file.url} alt={file.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            )}
                            <div style={{ position: "absolute", top: "4px", left: "4px" }}>
                              <Badge tone={file.type === "VIDEO" ? "info" : "success"}>{file.type}</Badge>
                            </div>
                            {isSelected && (
                              <div style={{ position: "absolute", top: "4px", right: "4px", background: "#008060", color: "#fff", borderRadius: "50%", width: "18px", height: "18px", fontSize: "11px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#202223" }}>
                            {file.filename}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", background: "#FAFBFB", borderRadius: "8px", border: "1px dashed #C9CCCB" }}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      No Shopify media files match your search. You can click "Upload New File from Your Device" to upload a new image or video.
                    </Text>
                  </div>
                )}
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="span" variant="bodySm" fontWeight="bold">Upload New Image or Video from Your Device</Text>
                <Text as="p" variant="bodyXs" tone="subdued">
                  The uploaded file will automatically be created under <strong>Shopify Content &rarr; Files</strong> and attached to this review.
                </Text>

                <DropZone onDrop={handleUploadMediaDrop} allowMultiple={false} accept="image/*,video/*">
                  <DropZone.FileUpload actionHint="Drag & drop or browse an image or video (supports image/* and video/*)" />
                </DropZone>
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* EDIT REVIEW DETAILS MODAL */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer Review Details"
        primaryAction={{
          content: "Save Changes",
          onAction: handleSaveEdit,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEditModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <InlineGrid columns={2} gap="400">
              <TextField
                label="Reviewer Name"
                value={editName}
                onChange={setEditName}
                autoComplete="off"
              />

              <Select
                label="Rating"
                options={[
                  { label: "5 Stars (⭐⭐⭐⭐⭐)", value: "5" },
                  { label: "4 Stars (⭐⭐⭐⭐)", value: "4" },
                  { label: "3 Stars (⭐⭐⭐)", value: "3" },
                  { label: "2 Stars (⭐⭐)", value: "2" },
                  { label: "1 Star (⭐)", value: "1" },
                ]}
                value={editRating}
                onChange={setEditRating}
              />
            </InlineGrid>

            <TextField
              label="Short Snippet / Headline"
              value={editShort}
              onChange={setEditShort}
              autoComplete="off"
              helpText="Displayed in floating review cards and widget snippets."
            />

            <TextField
              label="Full Review Text"
              value={editFull}
              onChange={setEditFull}
              multiline={4}
              autoComplete="off"
            />

            <BlockStack gap="200">
              <Text as="span" variant="bodySm" fontWeight="bold">Review Media (Image or Video)</Text>
              <DropZone onDrop={handleEditMediaDrop} allowMultiple={false} accept="image/*,video/*">
                {editMediaPreview && !editClearMedia ? (
                  <div style={{ padding: "12px", textAlign: "center" }}>
                    {editMediaType === "video" ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <video src={editMediaPreview} controls style={{ maxHeight: "140px", maxWidth: "100%", borderRadius: "8px" }} />
                        <Text as="p" variant="bodyXs" tone="subdued">Video attached</Text>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <img src={editMediaPreview} alt="Review Media" style={{ maxHeight: "120px", borderRadius: "8px", objectFit: "cover" }} />
                        <Text as="p" variant="bodyXs" tone="subdued">Image attached</Text>
                      </div>
                    )}
                    <div style={{ marginTop: "6px" }}>
                      <Button size="micro" tone="critical" onClick={() => { setEditClearMedia(true); setEditMediaPreview(null); setEditMediaType(null); }}>
                        Remove Media
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DropZone.FileUpload actionHint="Upload an image or video for this review (supports image/* and video/*)" />
                )}
              </DropZone>
            </BlockStack>

            <InlineGrid columns={2} gap="400">
              <Select
                label="Source Channel"
                options={[
                  { label: "Manual Submission", value: "MANUAL" },
                  { label: "AI Generated", value: "AI_GENERATED" },
                  { label: "Amazon Imported", value: "IMPORTED_AMAZON" },
                  { label: "Flipkart Imported", value: "IMPORTED_FLIPKART" },
                  { label: "Alibaba Imported", value: "IMPORTED_ALIBABA" },
                ]}
                value={editSource}
                onChange={setEditSource}
              />

              <TextField
                label="Marketplace Link (URL)"
                value={editExternalUrl}
                onChange={setEditExternalUrl}
                autoComplete="off"
                placeholder="https://www.amazon.com/dp/..."
                helpText="Clicking the marketplace logo on the storefront popup opens this link."
              />
            </InlineGrid>

            <Checkbox
              label="Mark as Verified Purchase"
              checked={editVerified}
              onChange={setEditVerified}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
