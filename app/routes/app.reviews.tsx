import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  const pageSize = 10;

  // 1. Fetch catalog products to build product title mapping
  const catalogProductMap = new Map<string, string>();
  try {
    const res = await admin.graphql(`
      #graphql
      query getProductsForReviewsList {
        products(first: 250) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `);
    const data = await res.json();
    const nodes = data?.data?.products?.nodes || [];
    for (const node of nodes) {
      catalogProductMap.set(node.id, node.title);
      const rawId = node.id.replace("gid://shopify/Product/", "");
      catalogProductMap.set(rawId, node.title);
      if (node.handle) {
        catalogProductMap.set(node.handle, node.title);
      }
    }
  } catch (err) {
    console.warn("GraphQL product fetch warning in reviews loader:", err);
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
      return r.productHandle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
      },
    });
  } catch (e) {
    console.error("Error fetching all reviews for stats:", e);
  }

  // Summary counts for top KPI cards & tabs matching reference design
  const totalReviews = allShopReviews.length;
  const publishedReviews = allShopReviews.filter((r) => r.isPublished).length;
  const pendingReviews = allShopReviews.filter((r) => !r.isPublished).length;
  const aiGeneratedCount = allShopReviews.filter((r) => r.isAiGenerated).length;
  const importedCount = allShopReviews.filter((r) => {
    const s = (r.source || "").toUpperCase();
    return s.includes("AMAZON") || s.includes("FLIPKART") || s.includes("ALIBABA") || s.includes("IMPORT");
  }).length;
  const mediaCount = allShopReviews.filter((r) => Boolean(r.imageUrl || r.videoUrl)).length;

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

  // Tab filtering
  if (tabFilter === "published") {
    whereClause.isPublished = true;
  } else if (tabFilter === "pending") {
    whereClause.isPublished = false;
  } else if (tabFilter === "imported") {
    whereClause.source = {
      in: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA", "AMAZON", "FLIPKART", "ALIBABA"],
    };
  } else if (tabFilter === "ai_drafts") {
    whereClause.isAiGenerated = true;
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

  // Fetch existing media files from Shopify store Content -> Files
  let shopifyFiles: Array<{ id: string; type: "IMAGE" | "VIDEO"; url: string; previewUrl: string; filename: string }> = [];
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
  } catch (err) {
    console.warn("Error fetching Shopify store files:", err);
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
    }
  } else if (intent === "approveSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: true },
      });
      await syncReviewsToShopify(admin, shop);
    }
  } else if (intent === "unpublishSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: false },
      });
      await syncReviewsToShopify(admin, shop);
    }
  } else if (intent === "approveAllPending") {
    await db.review.updateMany({
      where: { AND: [shopWhere, { isPublished: false }] },
      data: { isPublished: true },
    });
  } else if (intent === "delete") {
    if (reviewId) {
      await recordDeletedReviewIds(admin, shop, [reviewId]);
    }
    await db.review.deleteMany({
      where: { AND: [shopWhere, { id: reviewId }] },
    });
    await syncReviewsToShopify(admin, shop);
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
    await syncReviewsToShopify(admin, shop);
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
    await syncReviewsToShopify(admin, shop, true);
  } else if (intent === "deleteSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await recordDeletedReviewIds(admin, shop, ids);
      await db.review.deleteMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
      });
      await syncReviewsToShopify(admin, shop);
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
    }
  }

  await syncReviewsToShopify(admin, shop);

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

export default function ReviewsPage() {
  const {
    reviews,
    tabFilter = "all",
    sourceFilter,
    statusFilter,
    ratingFilter = "ALL",
    searchQuery,
    productFilter,
    productSearchQuery,
    productOptionsList,
    selectedProductSummary,
    page,
    pageSize,
    totalReviewsCount,
    totalPages,
    totalShopReviewsCount,
    totalReviews = 0,
    publishedReviews = 0,
    pendingReviews = 0,
    aiGeneratedCount = 0,
    importedCount = 0,
    mediaCount = 0,
    shopifyFiles = [],
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

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

  const allCurrentIds = reviews.map((r: any) => r.id);
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
    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", id);
    submit(fd, { method: "post" });
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    const fd = new FormData();
    fd.append("intent", "approveSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    submit(fd, { method: "post" });
  };

  const handleBulkUnpublish = () => {
    if (selectedIds.size === 0) return;
    const fd = new FormData();
    fd.append("intent", "unpublishSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    submit(fd, { method: "post" });
  };

  const executeConfirmDelete = () => {
    const { type, id } = deleteConfirmModal;
    setDeleteConfirmModal({ open: false, type: "single" });

    if (type === "single" && id) {
      const fd = new FormData();
      fd.append("intent", "delete");
      fd.append("reviewId", id);
      submit(fd, { method: "post" });
    } else if (type === "selected") {
      if (selectedIds.size === 0) return;
      const fd = new FormData();
      fd.append("intent", "deleteSelected");
      selectedIds.forEach((sid) => fd.append("ids", sid));
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    } else if (type === "all") {
      const fd = new FormData();
      fd.append("intent", "deleteAll");
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const startRecord = totalReviewsCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(page * pageSize, totalReviewsCount);

  return (
    <Page fullWidth title="Reviews Moderation & Management">
      <div style={{ width: "100%", padding: "8px 0 32px 0" }}>
        {/* TOP 4 SUMMARY STAT CARDS MATCHING REFERENCE DESIGN */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          {/* Card 1: Total */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              Total
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>
              {totalReviews}
            </div>
          </div>

          {/* Card 2: Published */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              Published
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#16a34a", lineHeight: 1.1 }}>
              {publishedReviews}
            </div>
          </div>

          {/* Card 3: Needs approval (Distinctive amber border matching reference screenshot) */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "2px solid #f59e0b",
              borderRadius: "12px",
              padding: "18px 20px",
              boxShadow: "0 1px 4px rgba(245, 158, 11, 0.1)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#475569", marginBottom: "6px" }}>
              Needs approval
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#d97706", lineHeight: 1.1 }}>
              {pendingReviews}
            </div>
          </div>

          {/* Card 4: AI drafts (private) */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              AI drafts (private)
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>
              {aiGeneratedCount}
            </div>
          </div>
        </div>

        {/* MAIN REVIEWS MODERATION CARD */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
            overflow: "hidden",
          }}
        >
          {/* TABS ROW MATCHING REFERENCE DESIGN */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px",
              padding: "0 20px",
              borderBottom: "1px solid #e2e8f0",
              overflowX: "auto",
            }}
          >
            {[
              { id: "all", label: `All ${totalReviews}` },
              { id: "published", label: `Published ${publishedReviews}` },
              { id: "pending", label: `Pending ${pendingReviews}` },
              { id: "imported", label: `Imported ${importedCount}` },
              { id: "media", label: `With media ${mediaCount}` },
              { id: "ai_drafts", label: `AI drafts ${aiGeneratedCount}` },
            ].map((tab) => {
              const isActive = tabFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => updateFilters({ tab: tab.id, page: "1" })}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
                    padding: "14px 2px",
                    fontSize: "14px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "#2563eb" : "#64748b",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* SEARCH AND FILTERS TOOLBAR */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              padding: "16px 20px",
            }}
          >
            {/* Search input with search icon */}
            <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
              <span
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Icon source={SearchIcon} />
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilters({ search: searchValue, page: "1" });
                }}
                onBlur={() => updateFilters({ search: searchValue, page: "1" })}
                placeholder="Search reviewer, product or text"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 36px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  outline: "none",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Dropdowns & Delete All Action */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/* Product Filter */}
              <select
                value={productFilter}
                onChange={(e) => updateFilters({ product: e.target.value, page: "1" })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                  outline: "none",
                  maxWidth: "200px",
                }}
              >
                <option value="ALL">Product: All</option>
                {productOptionsList.map((p: any) => (
                  <option key={p.title} value={p.title}>
                    {p.title} ({p.count})
                  </option>
                ))}
              </select>

              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => updateFilters({ source: e.target.value, page: "1" })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="ALL">Source: All</option>
                <option value="STORE">Store</option>
                <option value="AMAZON">Amazon</option>
                <option value="FLIPKART">Flipkart</option>
                <option value="ALIBABA">Alibaba</option>
                <option value="AI">AI Generated</option>
              </select>

              {/* Rating Filter */}
              <select
                value={ratingFilter}
                onChange={(e) => updateFilters({ rating: e.target.value, page: "1" })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="ALL">Rating: All</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>

              {/* Delete All Reviews Button */}
              <button
                onClick={() => setDeleteConfirmModal({ open: true, type: "all" })}
                title="Delete all reviews with confirmation"
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #fecaca",
                  backgroundColor: "#fff5f5",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>🗑</span> Delete All
              </button>
            </div>
          </div>

          {/* BULK ACTIONS BAR (When reviews are selected) */}
          {selectedIds.size > 0 && (
            <div
              style={{
                margin: "0 20px 16px 20px",
                padding: "10px 16px",
                backgroundColor: "#dbeafe",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 600, color: "#1d4ed8", fontSize: "14px" }}>
                {selectedIds.size} selected
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={handleBulkApprove}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #94a3b8",
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
                  onClick={handleBulkUnpublish}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #94a3b8",
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}>
                  <th style={{ padding: "14px 16px", width: "40px" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                    />
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Reviewer</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Product</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Rating</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Review</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Source</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Status</th>
                  <th style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "36px 20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                      No reviews match your selected filters.
                    </td>
                  </tr>
                ) : (
                  reviews.map((r: any) => {
                    const isAiDraft = r.isAiGenerated;
                    const rowBg = isAiDraft ? "#fef3c7" : "#ffffff";

                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          backgroundColor: rowBg,
                          transition: "background-color 0.1s ease",
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: "14px 16px" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelectOne(r.id)}
                            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                          />
                        </td>

                        {/* Reviewer */}
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                backgroundColor: isAiDraft ? "#fde68a" : "#dbeafe",
                                color: isAiDraft ? "#92400e" : "#1e40af",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(r.reviewerName || "Buyer")}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "#0f172a",
                                  maxWidth: "140px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={r.reviewerName || "Verified Buyer"}
                              >
                                {r.reviewerName || "Verified Buyer"}
                              </span>
                              {isAiDraft ? (
                                <span style={{ fontSize: "11px", fontWeight: 600, color: "#b45309", marginTop: "2px" }}>
                                  AI draft
                                </span>
                              ) : r.isVerifiedPurchase ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    marginTop: "2px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    color: "#15803d",
                                    backgroundColor: "#dcfce7",
                                    padding: "1px 7px",
                                    borderRadius: "10px",
                                    width: "fit-content",
                                  }}
                                >
                                  Verified order
                                </span>
                              ) : r.source?.startsWith("IMPORTED") ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    marginTop: "2px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    color: "#64748b",
                                    backgroundColor: "#f1f5f9",
                                    padding: "1px 7px",
                                    borderRadius: "10px",
                                    width: "fit-content",
                                  }}
                                >
                                  Imported
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        {/* Product */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 500, color: "#1e293b", maxWidth: "160px" }}>
                          <div
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={r.productTitle}
                          >
                            {r.productTitle}
                          </div>
                        </td>

                        {/* Rating */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          <span style={{ color: "#b45309", fontSize: "14px", letterSpacing: "1px" }}>
                            {"★".repeat(Math.max(1, Math.min(5, r.rating || 5)))}
                          </span>
                        </td>

                        {/* Review Snippet + Media Thumbnail */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#334155", maxWidth: "240px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {(r.imageUrl || r.videoUrl) && (
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "6px",
                                  overflow: "hidden",
                                  flexShrink: 0,
                                  border: "1px solid #e2e8f0",
                                  backgroundColor: "#f8fafc",
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
                              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={r.bodyShort || r.bodyFull || ""}
                            >
                              {r.bodyShort || r.bodyFull || "Review content"}
                            </span>
                            {(r.imageUrl || r.videoUrl) && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  color: "#0284c7",
                                  backgroundColor: "#e0f2fe",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  flexShrink: 0,
                                }}
                              >
                                {r.videoUrl ? "Video" : "Photo"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Source */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          {(() => {
                            const srcUpper = (r.source || "").toUpperCase();
                            let label = "Store";
                            let bg = "#dcfce7";
                            let col = "#15803d";

                            if (isAiDraft || srcUpper.includes("AI")) {
                              label = "AI generated";
                              bg = "#f1f5f9";
                              col = "#475569";
                            } else if (srcUpper.includes("ALIBABA")) {
                              label = "Alibaba";
                              bg = "#fef3c7";
                              col = "#b45309";
                            } else if (srcUpper.includes("FLIPKART")) {
                              label = "Flipkart";
                              bg = "#e0f2fe";
                              col = "#0284c7";
                            } else if (srcUpper.includes("AMAZON")) {
                              label = "Amazon";
                              bg = "#fef3c7";
                              col = "#b45309";
                            }

                            return (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: "12px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  backgroundColor: bg,
                                  color: col,
                                }}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          {(() => {
                            if (isAiDraft && !r.isPublished) {
                              return (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    backgroundColor: "#fee2e2",
                                    color: "#dc2626",
                                  }}
                                >
                                  Hidden
                                </span>
                              );
                            }
                            if (r.isPublished) {
                              return (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    backgroundColor: "#dcfce7",
                                    color: "#15803d",
                                  }}
                                >
                                  Published
                                </span>
                              );
                            }
                            return (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: "12px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  backgroundColor: "#fef3c7",
                                  color: "#b45309",
                                }}
                              >
                                Pending
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {/* Edit button */}
                            <button
                              onClick={() => handleOpenEdit(r)}
                              title="Edit review"
                              style={{
                                width: "30px",
                                height: "30px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                backgroundColor: "#ffffff",
                                color: "#475569",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Icon source={EditIcon} />
                            </button>

                            {/* Media Upload button */}
                            <button
                              onClick={() => handleOpenUploadMedia(r)}
                              title="Upload or manage media"
                              style={{
                                width: "30px",
                                height: "30px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                backgroundColor: "#ffffff",
                                color: "#475569",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Icon source={ImageIcon} />
                            </button>

                            {/* Approve / Publish toggle button */}
                            <button
                              onClick={() => handleTogglePublish(r.id)}
                              title={r.isPublished ? "Unpublish review" : "Approve and publish"}
                              style={{
                                width: "30px",
                                height: "30px",
                                borderRadius: "6px",
                                border: r.isPublished ? "1px solid #cbd5e1" : "1px solid #86efac",
                                backgroundColor: r.isPublished ? "#ffffff" : "#f0fdf4",
                                color: r.isPublished ? "#64748b" : "#15803d",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Icon source={CheckIcon} />
                            </button>

                            {/* Delete button (styled red on AI draft as shown in screenshot row 5) */}
                            <button
                              onClick={() => setDeleteConfirmModal({ open: true, type: "single", id: r.id })}
                              title="Delete review"
                              style={{
                                width: "30px",
                                height: "30px",
                                borderRadius: "6px",
                                border: isAiDraft ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                                backgroundColor: isAiDraft ? "#fee2e2" : "#ffffff",
                                color: "#dc2626",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Icon source={DeleteIcon} />
                            </button>

                            {/* More Menu */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() => setActiveMenuId(activeMenuId === r.id ? null : r.id)}
                                title="More options"
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  color: "#475569",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                <Icon source={MenuHorizontalIcon} />
                              </button>

                              {activeMenuId === r.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "34px",
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                    zIndex: 50,
                                    minWidth: "160px",
                                    padding: "4px 0",
                                  }}
                                >
                                  {r.externalUrl && (
                                    <a
                                      href={r.externalUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: "block",
                                        padding: "8px 12px",
                                        fontSize: "12px",
                                        color: "#2563eb",
                                        textDecoration: "none",
                                      }}
                                    >
                                      🔗 View External Link
                                    </a>
                                  )}
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleOpenEdit(r);
                                    }}
                                    style={{
                                      width: "100%",
                                      textAlign: "left",
                                      padding: "8px 12px",
                                      fontSize: "12px",
                                      color: "#334155",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Edit Details
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setDeleteConfirmModal({ open: true, type: "single", id: r.id });
                                    }}
                                    style={{
                                      width: "100%",
                                      textAlign: "left",
                                      padding: "8px 12px",
                                      fontSize: "12px",
                                      color: "#dc2626",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Delete Review
                                  </button>
                                </div>
                              )}
                            </div>
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
                padding: "16px 20px",
                borderTop: "1px solid #f1f5f9",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              <div>
                Showing <strong style={{ color: "#0f172a" }}>{startRecord}</strong> to{" "}
                <strong style={{ color: "#0f172a" }}>{endRecord}</strong> of{" "}
                <strong style={{ color: "#0f172a" }}>{totalReviewsCount}</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => updateFilters({ page: String(Math.max(1, page - 1)) })}
                  disabled={page <= 1}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    opacity: page <= 1 ? 0.4 : 1,
                  }}
                  title="Previous page"
                >
                  <Icon source={ChevronLeftIcon} />
                </button>

                <span style={{ fontSize: "13px", fontWeight: "500", color: "#334155", padding: "0 4px" }}>
                  Page {page} of {totalPages}
                </span>

                <button
                  onClick={() => updateFilters({ page: String(Math.min(totalPages, page + 1)) })}
                  disabled={page >= totalPages}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                    opacity: page >= totalPages ? 0.4 : 1,
                  }}
                  title="Next page"
                >
                  <Icon source={ChevronRightIcon} />
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
                <Text as="p" variant="bodyXs" tone="subdued" style={{ marginTop: "4px" }}>
                  "{uploadTargetReview.bodyShort}"
                </Text>
              </div>
            )}

            {/* SOURCE MODE SWITCHER TABS */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #E1E3E5", paddingBottom: "10px" }}>
              <Button
                size="medium"
                pressed={mediaSourceMode === "shopify_files"}
                onClick={() => setMediaSourceMode("shopify_files")}
              >
                📁 Select Existing Shopify Media ({shopifyFiles.length})
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
