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
} from "@shopify/polaris";
import { SearchIcon, CheckIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
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
  const sourceFilter = url.searchParams.get("source") || "ALL";
  const statusFilter = url.searchParams.get("status") || "ALL";
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
        isPublished: true,
      },
    });
  } catch (e) {
    console.error("Error fetching all reviews for stats:", e);
  }

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
  if (sourceFilter !== "ALL") whereClause.source = sourceFilter;
  if (statusFilter === "PUBLISHED") whereClause.isPublished = true;
  if (statusFilter === "PENDING") whereClause.isPublished = false;

  if (searchQuery.trim() !== "") {
    whereClause.AND = [
      ...(whereClause.AND || []),
      {
        OR: [
          { reviewerName: { contains: searchQuery } },
          { bodyShort: { contains: searchQuery } },
          { bodyFull: { contains: searchQuery } },
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
        files(first: 100, sortKey: CREATED_AT, reverse: true) {
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
    sourceFilter,
    statusFilter,
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

export default function ReviewsPage() {
  const {
    reviews,
    sourceFilter,
    statusFilter,
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
    shopifyFiles = [],
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchValue, setSearchValue] = useState<string>(searchQuery);
  const [productSearchValue, setProductSearchValue] = useState<string>(productSearchQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  const someSelected = selectedIds.size > 0;

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

  const handleProductChange = (val: string) => updateFilters({ product: val, page: "1" });
  const handleSourceChange = (val: string) => updateFilters({ source: val, page: "1" });
  const handleStatusChange = (val: string) => updateFilters({ status: val, page: "1" });
  const handleSearchSubmit = () => updateFilters({ search: searchValue, page: "1" });
  const handleProductSearchSubmit = () => updateFilters({ productSearch: productSearchValue, page: "1" });

  const handleTogglePublish = (id: string) => {
    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", id);
    submit(fd, { method: "post" });
  };

  const handleApproveAllPending = () => {
    if (confirm("Approve and publish ALL pending draft reviews for your store?")) {
      const fd = new FormData();
      fd.append("intent", "approveAllPending");
      submit(fd, { method: "post" });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this review?")) {
      const fd = new FormData();
      fd.append("intent", "delete");
      fd.append("reviewId", id);
      submit(fd, { method: "post" });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      confirm(
        `Are you sure you want to delete ${selectedIds.size} selected review${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`
      )
    ) {
      const fd = new FormData();
      fd.append("intent", "deleteSelected");
      selectedIds.forEach((id) => fd.append("ids", id));
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const handleDeleteAll = () => {
    if (
      confirm(
        `⚠️ WARNING: This will permanently delete ALL ${totalReviewsCount} reviews for your store. This cannot be undone!`
      ) &&
      confirm("Are you absolutely sure? ALL reviews will be deleted forever.")
    ) {
      const fd = new FormData();
      fd.append("intent", "deleteAll");
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const startRecord = totalReviewsCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(page * pageSize, totalReviewsCount);

  // Select-all header checkbox cell
  const selectAllCell = (
    <div style={{ display: "flex", alignItems: "center", paddingLeft: "2px" }}>
      <Checkbox
        label=""
        labelHidden
        checked={allSelected}
        onChange={toggleSelectAll}
      />
    </div>
  );

  const rows = reviews.map((r: any) => [
    <div
      key={`cb-${r.id}`}
      style={{ display: "flex", alignItems: "center", paddingLeft: "2px" }}
    >
      <Checkbox
        label=""
        labelHidden
        checked={selectedIds.has(r.id)}
        onChange={() => toggleSelectOne(r.id)}
      />
    </div>,

    <BlockStack key={`r-${r.id}`} gap="100">
      <Text as="span" fontWeight="bold">
        {r.reviewerName || "Verified Buyer"}
      </Text>
      {r.isVerifiedPurchase && (
        <Badge tone="success">Verified Purchase</Badge>
      )}
    </BlockStack>,

    <BlockStack key={`p-${r.id}`} gap="050">
      <Text as="span" fontWeight="bold" variant="bodySm">
        {r.productTitle}
      </Text>
    </BlockStack>,

    `${r.rating} ⭐`,

    <BlockStack key={`b-${r.id}`} gap="100">
      {(r.imageUrl || r.videoUrl) && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          {r.videoUrl ? (
            <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "6px", overflow: "hidden", background: "#000", flexShrink: 0 }}>
              <video src={r.videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: "10px", color: "#fff" }}>▶</div>
            </div>
          ) : (
            <img src={r.imageUrl} alt="Review media" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #ddd", flexShrink: 0 }} />
          )}
          <Badge tone="info">{r.videoUrl ? "Video Review" : "Image Review"}</Badge>
        </div>
      )}
      <Text as="span" variant="bodySm" fontWeight="bold">
        {r.bodyShort}
      </Text>
      <Text as="span" variant="bodyXs" tone="subdued">
        {(r.bodyFull || "").length > 120
          ? `${(r.bodyFull || "").substring(0, 120)}...`
          : r.bodyFull}
      </Text>
      {r.externalUrl && (
        <Text as="span" variant="bodyXs" tone="subdued">
          🔗 {r.externalUrl}
        </Text>
      )}
      {r.isAiGenerated && (
        <Badge tone="warning">AI-Generated Draft</Badge>
      )}
    </BlockStack>,

    <Badge key={`s-${r.id}`} tone={r.source.startsWith("IMPORTED") ? "attention" : "success"}>
      {r.source.replace("IMPORTED_", "")}
    </Badge>,

    <Badge key={`st-${r.id}`} tone={r.isPublished ? "success" : "warning"}>
      {r.isPublished ? "Published" : "Pending"}
    </Badge>,

    <InlineStack key={`a-${r.id}`} gap="200">
      <Button
        size="micro"
        icon={EditIcon}
        onClick={() => handleOpenEdit(r)}
      >
        Edit
      </Button>
      <Button
        size="micro"
        onClick={() => handleOpenUploadMedia(r)}
      >
        {r.imageUrl || r.videoUrl ? "📷 Media ✓" : "+ Upload Media"}
      </Button>
      <Button
        size="micro"
        tone={r.isPublished ? "critical" : "success"}
        onClick={() => handleTogglePublish(r.id)}
      >
        {r.isPublished ? "Unpublish" : "Approve & Publish"}
      </Button>
      <Button
        size="micro"
        tone="critical"
        icon={DeleteIcon}
        onClick={() => handleDelete(r.id)}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page fullWidth title="Reviews Moderation & Management">
      <BlockStack gap="500">
        <Banner title="Review Moderation Queue" tone="info">
          <p>
            Manage, verify, edit, approve, and publish customer reviews. Use the full-width management table to filter reviews by product title, marketplace source, or moderation status.
          </p>
        </Banner>

        {selectedProductSummary && (
          <Banner tone="info" title={`Product Overview: ${selectedProductSummary.title}`}>
            <p style={{ fontWeight: 600 }}>
              Total Reviews for this Product: {selectedProductSummary.count} review{selectedProductSummary.count > 1 ? "s" : ""} 
              ({selectedProductSummary.published} Published, {selectedProductSummary.pending} Pending)
            </p>
          </Banner>
        )}

        <Card padding="500">
          <BlockStack gap="400">
            {/* SEARCH AND BULK ACTIONS */}
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ display: "flex", gap: "12px", width: "650px" }}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label=""
                    labelHidden
                    placeholder="Search by Product Title (e.g. Hoodie, Sheet Set)..."
                    value={productSearchValue}
                    onChange={setProductSearchValue}
                    prefix={<SearchIcon />}
                    onBlur={handleProductSearchSubmit}
                    autoComplete="off"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label=""
                    labelHidden
                    placeholder="Search by reviewer name or text snippet..."
                    value={searchValue}
                    onChange={setSearchValue}
                    prefix={<SearchIcon />}
                    onBlur={handleSearchSubmit}
                    autoComplete="off"
                  />
                </div>
              </div>

              <InlineStack gap="200">
                {someSelected && (
                  <Button
                    variant="primary"
                    tone="critical"
                    icon={DeleteIcon}
                    loading={isSubmitting}
                    onClick={handleBulkDelete}
                  >
                    {`Delete Selected (${selectedIds.size})`}
                  </Button>
                )}
                <Button
                  tone="critical"
                  icon={DeleteIcon}
                  loading={isSubmitting}
                  onClick={handleDeleteAll}
                >
                  Delete All Reviews
                </Button>
                <Button
                  variant="primary"
                  icon={CheckIcon}
                  onClick={handleApproveAllPending}
                >
                  Approve All Pending Drafts
                </Button>
              </InlineStack>
            </InlineStack>

            {/* FILTERS */}
            <InlineGrid columns={3} gap="400">
              <Select
                label="Filter by Product Title"
                options={[
                  { label: `All Products (${totalShopReviewsCount} Total Reviews)`, value: "ALL" },
                  ...productOptionsList.map((p: any) => ({
                    label: `${p.title} (${p.count} review${p.count > 1 ? "s" : ""})`,
                    value: p.title,
                  })),
                ]}
                value={productFilter}
                onChange={handleProductChange}
              />

              <Select
                label="Filter by Source"
                options={[
                  { label: "All Sources", value: "ALL" },
                  { label: "Manual Submissions", value: "MANUAL" },
                  { label: "AI Generated", value: "AI_GENERATED" },
                  { label: "Amazon Imported", value: "IMPORTED_AMAZON" },
                  { label: "Flipkart Imported", value: "IMPORTED_FLIPKART" },
                  { label: "Alibaba Imported", value: "IMPORTED_ALIBABA" },
                ]}
                value={sourceFilter}
                onChange={handleSourceChange}
              />

              <Select
                label="Filter by Status"
                options={[
                  { label: "All Statuses", value: "ALL" },
                  { label: "Published Only", value: "PUBLISHED" },
                  { label: "Pending Moderation", value: "PENDING" },
                ]}
                value={statusFilter}
                onChange={handleStatusChange}
              />
            </InlineGrid>

            {/* COUNT HEADER & PAGINATION */}
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="span" tone="subdued">
                  {totalReviewsCount > 0
                    ? `Showing ${startRecord}–${endRecord} of ${totalReviewsCount} reviews`
                    : "0 reviews found"}
                </Text>
                {someSelected && (
                  <Text as="span" tone="caution" fontWeight="semibold">
                    {selectedIds.size} review{selectedIds.size > 1 ? "s" : ""} selected
                  </Text>
                )}
              </BlockStack>

              {totalPages > 1 && (
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => updateFilters({ page: String(page - 1) })}
                  hasNext={page < totalPages}
                  onNext={() => updateFilters({ page: String(page + 1) })}
                  label={`Page ${page} of ${totalPages}`}
                />
              )}
            </InlineStack>

            {/* TABLE */}
            {reviews.length === 0 ? (
              <Text as="p" tone="subdued">
                No reviews match your selected filters.
              </Text>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text"]}
                headings={[
                  selectAllCell,
                  "Reviewer",
                  "Product Title",
                  "Rating",
                  "Snippet & Review Text",
                  "Source",
                  "Status",
                  "Actions",
                ]}
                rows={rows}
              />
            )}

            {/* BOTTOM PAGINATION */}
            {totalPages > 1 && (
              <InlineStack align="center">
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => updateFilters({ page: String(page - 1) })}
                  hasNext={page < totalPages}
                  onNext={() => updateFilters({ page: String(page + 1) })}
                  label={`Page ${page} of ${totalPages}`}
                />
              </InlineStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

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
