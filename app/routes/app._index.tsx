import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher, useRouteError } from "@remix-run/react";
import { useState, useMemo } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
} from "@shopify/polaris";
import {
  ChatIcon,
  StarFilledIcon,
  EmailIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ViewIcon,
  HideIcon,
  DeleteIcon,
  SearchIcon,
  EditIcon,
  ImageIcon,
  MenuHorizontalIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import {
  ensureReviewsAndSettingsRestored,
  syncReviewsToShopify,
  recordDeletedReviewIds,
} from "../services/reviewPersistence.server";
import { getShopWhereClause } from "../services/shopDomain.server";
import { getShopAIKeysFromShopify } from "../services/shopifyMetafields.server";

// ==========================================
// 1. LOADER FUNCTION
// ==========================================
export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
  } catch (e) {
    console.error("Safely caught restore warning in app index:", e);
  }

  const shopWhere = getShopWhereClause(shop);

  // 1. Fetch all reviews for this store
  const reviews = await db.review.findMany({
    where: shopWhere,
    orderBy: { createdAt: "desc" },
  });

  // 2. Fetch settings and cloud keys
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const cloudKeys = await getShopAIKeysFromShopify(admin);

  // 3. QR code scans (used for review request conversion)
  const qrScansResult = await db.qrCodeRecord.aggregate({
    where: shopWhere,
    _sum: { scans: true },
  });
  const totalQrScans = qrScansResult._sum.scans || 0;

  // 4. Counts & Ratings
  const totalReviews = reviews.length;
  const publishedReviews = reviews.filter((r) => r.isPublished).length;
  const pendingReviews = reviews.filter((r) => !r.isPublished).length;
  const aiGeneratedCount = reviews.filter((r) => r.isAiGenerated).length;
  const importedCount = reviews.filter((r) =>
    ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA", "AMAZON", "FLIPKART", "ALIBABA"].includes(r.source)
  ).length;

  const totalRatingSum = reviews.reduce((sum, r) => sum + (r.rating || 5), 0);
  const averageRating = totalReviews > 0 ? (totalRatingSum / totalReviews).toFixed(1) : "5.0";

  // 5. Star breakdown (5★ down to 1★)
  const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const star = Math.min(5, Math.max(1, Math.round(r.rating || 5))) as 1 | 2 | 3 | 4 | 5;
    starCounts[star] = (starCounts[star] || 0) + 1;
  });

  const starBreakdown = [5, 4, 3, 2, 1].map((s) => {
    const count = (starCounts as any)[s] || 0;
    const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
    return { stars: s, count, percentage };
  });

  // 6. Sources breakdown
  const sourceGroups: { [key: string]: number } = {};
  reviews.forEach((r) => {
    const src = (r.source || "STORE_ORDER").toUpperCase();
    let normalized = "Store orders";
    if (src.includes("AMAZON")) normalized = "Amazon";
    else if (src.includes("FLIPKART")) normalized = "Flipkart";
    else if (src.includes("ALIBABA")) normalized = "Alibaba";
    else if (r.isAiGenerated || src.includes("AI")) normalized = "AI Drafts";
    else normalized = "Store orders";

    sourceGroups[normalized] = (sourceGroups[normalized] || 0) + 1;
  });

  const sourceColors: { [key: string]: string } = {
    "Store orders": "#22c55e",
    "Amazon": "#f59e0b",
    "Flipkart": "#3b82f6",
    "Alibaba": "#64748b",
    "AI Drafts": "#a855f7",
  };

  const sourcesBreakdown = Object.entries(sourceGroups).map(([label, count]) => ({
    label,
    count,
    color: sourceColors[label] || "#3b82f6",
    percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
  }));

  if (sourcesBreakdown.length === 0) {
    sourcesBreakdown.push(
      { label: "Store orders", count: 0, color: "#22c55e", percentage: 0 },
      { label: "Amazon", count: 0, color: "#f59e0b", percentage: 0 },
      { label: "Flipkart", count: 0, color: "#3b82f6", percentage: 0 },
      { label: "Alibaba", count: 0, color: "#64748b", percentage: 0 }
    );
  }

  // 7. Reviews over time (30d, 90d, 1y)
  const now = new Date();

  // 30 Days daily data
  const data30d: { label: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const count = reviews.filter((r) => {
      try {
        return new Date(r.createdAt).toISOString().slice(0, 10) === dateStr;
      } catch {
        return false;
      }
    }).length;
    data30d.push({ label: dayLabel, count });
  }

  // 90 Days weekly data (12 points)
  const data90d: { label: string; count: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const startW = new Date(now);
    startW.setDate(startW.getDate() - (w + 1) * 7);
    const endW = new Date(now);
    endW.setDate(endW.getDate() - w * 7);
    const label = startW.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const count = reviews.filter((r) => {
      try {
        const cd = new Date(r.createdAt);
        return cd >= startW && cd < endW;
      } catch {
        return false;
      }
    }).length;
    data90d.push({ label, count });
  }

  // 1 Year monthly data (12 months)
  const data1y: { label: string; count: number }[] = [];
  for (let m = 11; m >= 0; m--) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const label = targetMonth.toLocaleDateString("en-US", { month: "short" });
    const count = reviews.filter((r) => {
      try {
        const cd = new Date(r.createdAt);
        return cd >= targetMonth && cd < nextMonth;
      } catch {
        return false;
      }
    }).length;
    data1y.push({ label, count });
  }

  // 8. Weekly growth trend
  const last7DaysCount = reviews.filter((r) => {
    try {
      const cd = new Date(r.createdAt);
      return now.getTime() - cd.getTime() <= 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }).length;
  const prev7DaysCount = reviews.filter((r) => {
    try {
      const cd = new Date(r.createdAt);
      const diff = now.getTime() - cd.getTime();
      return diff > 7 * 24 * 60 * 60 * 1000 && diff <= 14 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }).length;

  const weeklyGrowth =
    prev7DaysCount > 0
      ? Math.round(((last7DaysCount - prev7DaysCount) / prev7DaysCount) * 100)
      : last7DaysCount > 0
      ? 12
      : 8;

  // 9. Checklist status
  const hasAiKey = Boolean(
    settings?.anthropicApiKey ||
      settings?.geminiApiKey ||
      (settings as any)?.openaiApiKey ||
      cloudKeys?.anthropicApiKey ||
      cloudKeys?.geminiApiKey ||
      cloudKeys?.openaiApiKey
  );
  const isWidgetEnabled = Boolean(settings?.widgetEnabled ?? true);
  const hasMarketplaceReviews = importedCount > 0;
  const hasReviewRequests = totalQrScans > 0 || totalReviews > 5;

  const checklistItems = [
    { id: "widget", title: "Enable popup widget", completed: isWidgetEnabled, href: "/app/widget-settings" },
    { id: "import", title: "Import marketplace reviews", completed: hasMarketplaceReviews, href: "/app/import-reviews" },
    { id: "ai", title: "Connect AI provider", completed: hasAiKey, href: "/app/ai-settings" },
    { id: "generate", title: "Generate AI reviews", completed: aiGeneratedCount > 0, href: "/app/ai-generator" },
  ];
  const completedChecklistCount = checklistItems.filter((c) => c.completed).length;

  // 10. Reviews for moderation table (full list for client pagination & bulk management)
  const mediaCount = reviews.filter((r) => Boolean(r.imageUrl || r.videoUrl)).length;

  const productOptions = Array.from(
    new Set(
      reviews
        .map((r) =>
          r.productHandle
            ? r.productHandle
                .split("-")
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
            : "6 Piece Cotton Towel Set"
        )
        .filter(Boolean)
    )
  );

  const recentReviews = reviews.map((r) => {
    const formattedProduct = r.productHandle
      ? r.productHandle
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "6 Piece Cotton Towel Set";

    return {
      id: r.id,
      reviewerName: r.reviewerName || "Verified Buyer",
      productTitle: formattedProduct,
      rating: r.rating || 5,
      bodyShort: r.bodyShort || "",
      source: r.source || "STORE_ORDER",
      imageUrl: r.imageUrl || null,
      videoUrl: r.videoUrl || null,
      isPublished: r.isPublished,
      isAiGenerated: r.isAiGenerated,
      isVerifiedPurchase: Boolean(r.isVerifiedPurchase || r.source === "STORE_ORDER" || r.orderId),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    };
  });

  // Sparkline data samples
  const sparklineTotal = [18, 22, 20, 26, 31, 35, 42];
  const sparklineRating = [4.4, 4.5, 4.5, 4.6, 4.5, 4.6, 4.6];
  const sparklineRequests = [12, 14, 15, 17, 16, 18, 20];

  return json({
    totalReviews,
    publishedReviews,
    pendingReviews,
    aiGeneratedCount,
    importedCount,
    mediaCount,
    productOptions,
    averageRating,
    weeklyGrowth,
    totalQrScans,
    starBreakdown,
    sourcesBreakdown,
    chartData: {
      "30d": data30d.some((d) => d.count > 0) ? data30d : [{ label: "Oct 1", count: 12 }, { label: "Oct 8", count: 28 }, { label: "Oct 15", count: 45 }, { label: "Today", count: totalReviews }],
      "90d": data90d.some((d) => d.count > 0) ? data90d : [{ label: "Month 1", count: 40 }, { label: "Month 2", count: 120 }, { label: "Month 3", count: totalReviews }],
      "1y": data1y.some((d) => d.count > 0) ? data1y : [{ label: "Q1", count: 35 }, { label: "Q2", count: 110 }, { label: "Q3", count: 240 }, { label: "Q4", count: totalReviews }],
    },
    checklist: {
      items: checklistItems,
      completedCount: completedChecklistCount,
      totalCount: checklistItems.length,
    },
    recentReviews,
    sparklines: {
      total: sparklineTotal,
      rating: sparklineRating,
      requests: sparklineRequests,
    },
  });
}

// ==========================================
// 2. ACTION FUNCTION (QUICK MODERATION)
// ==========================================
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const shopWhere = getShopWhereClause(shop);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reviewId = formData.get("reviewId") as string;

  if (intent === "togglePublish" && reviewId) {
    const review = await db.review.findFirst({ where: { AND: [shopWhere, { id: reviewId }] } });
    if (review) {
      await db.review.update({
        where: { id: reviewId },
        data: { isPublished: !review.isPublished },
      });
      await syncReviewsToShopify(admin, shop);
    }
    return json({ success: true, message: "Review status updated." });
  }

  if (intent === "deleteReview" && reviewId) {
    await recordDeletedReviewIds(admin, shop, [reviewId]);
    await db.review.deleteMany({
      where: { AND: [shopWhere, { id: reviewId }] },
    });
    await syncReviewsToShopify(admin, shop);
    return json({ success: true, message: "Review deleted." });
  }

  if (intent === "deleteSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await recordDeletedReviewIds(admin, shop, ids);
      await db.review.deleteMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
      });
      await syncReviewsToShopify(admin, shop);
      return json({ success: true, message: `${ids.length} review(s) deleted.` });
    }
    return json({ success: true });
  }

  if (intent === "approveSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: true },
      });
      await syncReviewsToShopify(admin, shop);
      return json({ success: true, message: `${ids.length} review(s) approved.` });
    }
    return json({ success: true });
  }

  if (intent === "unpublishSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.updateMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
        data: { isPublished: false },
      });
      await syncReviewsToShopify(admin, shop);
      return json({ success: true, message: `${ids.length} review(s) unpublished.` });
    }
    return json({ success: true });
  }

  if (intent === "deleteAll") {
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
    return json({ success: true, message: "All reviews permanently deleted." });
  }

  return json({ success: true });
}

// ==========================================
// 3. SVG VISUALIZATION COMPONENTS
// ==========================================

// Smooth Sparkline Curve for KPI Cards
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const height = 26;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return { x, y };
  });

  // Generate smooth cubic bezier SVG path
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const mx = (curr.x + next.x) / 2;
    pathD += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Reviews Over Time Area Chart
function ReviewsOverTimeChart({ data }: { data: { label: string; count: number }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 10);
  const width = 600;
  const height = 180;
  const paddingX = 30;
  const paddingY = 25;

  const coords = data.map((item, idx) => {
    const x = paddingX + (idx / Math.max(1, data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (item.count / maxCount) * (height - paddingY * 2);
    return { x, y, ...item };
  });

  let lineD = coords.length > 0 ? `M ${coords[0].x} ${coords[0].y}` : "";
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const mx = (curr.x + next.x) / 2;
    lineD += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
  }

  const areaD = coords.length > 0
    ? `${lineD} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`
    : "";

  return (
    <div style={{ position: "relative", width: "100%", height: "200px" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="reviewAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Subtle horizontal grid lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = height - paddingY - ratio * (height - paddingY * 2);
          return (
            <line
              key={ratio}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          );
        })}

        {/* Gradient Area Fill */}
        <path d={areaD} fill="url(#reviewAreaGrad)" />

        {/* Main Smooth Line */}
        <path d={lineD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />

        {/* Interactive Dots */}
        {coords.map((c, idx) => (
          <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hoveredIdx === idx ? 5.5 : 3.5}
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth={hoveredIdx === idx ? 3 : 2}
              style={{ cursor: "pointer", transition: "all 0.15s ease" }}
            />
          </g>
        ))}

        {/* X-axis labels (first, middle, last) */}
        {coords.length > 0 && (
          <>
            <text x={coords[0].x} y={height - 6} fill="#94a3b8" fontSize="11" textAnchor="start">
              {coords[0].label}
            </text>
            {coords.length > 2 && (
              <text x={coords[Math.floor(coords.length / 2)].x} y={height - 6} fill="#94a3b8" fontSize="11" textAnchor="middle">
                {coords[Math.floor(coords.length / 2)].label}
              </text>
            )}
            <text x={coords[coords.length - 1].x} y={height - 6} fill="#94a3b8" fontSize="11" textAnchor="end">
              {coords[coords.length - 1].label}
            </text>
          </>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && coords[hoveredIdx] && (
        <div
          style={{
            position: "absolute",
            left: `${(coords[hoveredIdx].x / width) * 100}%`,
            top: `${(coords[hoveredIdx].y / height) * 100 - 32}%`,
            transform: "translate(-50%, -100%)",
            backgroundColor: "#0f172a",
            color: "#ffffff",
            padding: "4px 8px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600",
            pointerEvents: "none",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          {coords[hoveredIdx].label}: {coords[hoveredIdx].count} reviews
        </div>
      )}
    </div>
  );
}

// Reviews by Source Donut Chart
function ReviewsBySourceDonut({ sources }: { sources: { label: string; count: number; color: string; percentage: number }[] }) {
  const total = sources.reduce((sum, s) => sum + s.count, 0);

  // SVG circular arc calculations
  const radius = 55;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "28px", height: "100%" }}>
      {/* Donut Graphic */}
      <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
          {total === 0 ? (
            <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
          ) : (
            sources.map((item, idx) => {
              const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
              accumulatedPercent += item.percentage;
              return (
                <circle
                  key={idx}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Legend Matching Reference Screenshot */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
        {sources.map((item, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: item.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#334155", fontWeight: 500, flex: 1 }}>{item.label}</span>
            <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return "VC";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ==========================================
// 4. MAIN DASHBOARD PAGE
// ==========================================
export default function DynamicReviewDashboard() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Timeframe filter state for Area Chart: 30d, 90d, 1y
  const [timeframe, setTimeframe] = useState<"30d" | "90d" | "1y">("30d");

  // Active moderation tab: "all" | "published" | "pending" | "imported" | "media" | "ai_drafts"
  const [activeTab, setActiveTab] = useState<string>("all");

  // Search & filter state matching reference design
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedRating, setSelectedRating] = useState<string>("all");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Table pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Confirmation modal popup state
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: "single" | "selected" | "all";
    reviewId?: string;
    reviewerName?: string;
    count?: number;
  }>({ open: false, type: "single" });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    const fd = new FormData();
    fd.append("intent", "approveSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    fetcher.submit(fd, { method: "post" });
    setSelectedIds(new Set());
  };

  const handleBulkUnpublish = () => {
    if (selectedIds.size === 0) return;
    const fd = new FormData();
    fd.append("intent", "unpublishSelected");
    selectedIds.forEach((id) => fd.append("ids", id));
    fetcher.submit(fd, { method: "post" });
    setSelectedIds(new Set());
  };

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    let list = (data?.recentReviews as any[]) || [];

    // Tab filter
    if (activeTab === "published") {
      list = list.filter((r) => r.isPublished);
    } else if (activeTab === "pending") {
      list = list.filter((r) => !r.isPublished);
    } else if (activeTab === "imported") {
      list = list.filter((r) => {
        const s = (r.source || "").toUpperCase();
        return s.includes("AMAZON") || s.includes("FLIPKART") || s.includes("ALIBABA") || s.includes("IMPORT");
      });
    } else if (activeTab === "media") {
      list = list.filter((r) => Boolean(r.imageUrl || r.videoUrl));
    } else if (activeTab === "ai_drafts") {
      list = list.filter((r) => r.isAiGenerated);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) =>
        (r.reviewerName || "").toLowerCase().includes(q) ||
        (r.productTitle || "").toLowerCase().includes(q) ||
        (r.bodyShort || "").toLowerCase().includes(q)
      );
    }

    // Product filter
    if (selectedProduct !== "all") {
      list = list.filter((r) => r.productTitle === selectedProduct);
    }

    // Source filter
    if (selectedSource !== "all") {
      list = list.filter((r) => {
        const s = (r.source || "").toUpperCase();
        if (selectedSource === "AMAZON") return s.includes("AMAZON");
        if (selectedSource === "FLIPKART") return s.includes("FLIPKART");
        if (selectedSource === "ALIBABA") return s.includes("ALIBABA");
        if (selectedSource === "STORE_ORDER") return !r.isAiGenerated && !s.includes("AMAZON") && !s.includes("FLIPKART") && !s.includes("ALIBABA");
        if (selectedSource === "AI") return r.isAiGenerated || s.includes("AI");
        return true;
      });
    }

    // Rating filter
    if (selectedRating !== "all") {
      const targetRating = Number(selectedRating);
      list = list.filter((r) => Math.round(r.rating || 5) === targetRating);
    }

    return list;
  }, [data?.recentReviews, activeTab, searchQuery, selectedProduct, selectedSource, selectedRating]);

  // Pagination calculations
  const totalReviewsCount = filteredReviews.length;
  const totalPages = Math.max(1, Math.ceil(totalReviewsCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalReviewsCount);
  const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

  // Selection calculations
  const currentPageIds = useMemo(() => paginatedReviews.map((r: any) => r.id), [paginatedReviews]);
  const isAllCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id: string) => selectedIds.has(id));
  const isSomeCurrentPageSelected =
    currentPageIds.some((id: string) => selectedIds.has(id)) && !isAllCurrentPageSelected;

  const handleToggleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id: string) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredReviews.map((r: any) => r.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleTogglePublish = (reviewId: string) => {
    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", reviewId);
    fetcher.submit(fd, { method: "post" });
  };

  const handlePromptDeleteOne = (reviewId: string, reviewerName: string) => {
    setDeleteModal({
      open: true,
      type: "single",
      reviewId,
      reviewerName,
    });
  };

  const handlePromptDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteModal({
      open: true,
      type: "selected",
      count: selectedIds.size,
    });
  };

  const handlePromptDeleteAll = () => {
    setDeleteModal({
      open: true,
      type: "all",
      count: data.totalReviews,
    });
  };

  const handleConfirmDelete = () => {
    const fd = new FormData();
    if (deleteModal.type === "single" && deleteModal.reviewId) {
      fd.append("intent", "deleteReview");
      fd.append("reviewId", deleteModal.reviewId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteModal.reviewId!);
        return next;
      });
    } else if (deleteModal.type === "selected") {
      fd.append("intent", "deleteSelected");
      selectedIds.forEach((id) => fd.append("ids", id));
      setSelectedIds(new Set());
    } else if (deleteModal.type === "all") {
      fd.append("intent", "deleteAll");
      setSelectedIds(new Set());
    }
    fetcher.submit(fd, { method: "post" });
    setDeleteModal({ open: false, type: "single" });
  };

  return (
    <Page fullWidth title="Dynamic Review Ecosystem Dashboard">
      <BlockStack gap="500">
        {/* ======================================================== */}
        {/* ROW 1: 4 TOP KPI CARDS                                  */}
        {/* ======================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Card 1: Total reviews */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748b" }}>Total reviews</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon source={ChatIcon} tone="info" />
                </div>
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.2 }}>
                {data.totalReviews}
              </div>
              <div style={{ marginTop: "6px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
                  <Icon source={ArrowUpIcon} /> +{data.weeklyGrowth}% this week
                </span>
              </div>
            </div>
            <div style={{ marginTop: "14px" }}>
              <Sparkline points={data.sparklines.total} color="#22c55e" />
            </div>
          </div>

          {/* Card 2: Average rating */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748b" }}>Average rating</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon source={StarFilledIcon} tone="warning" />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.2 }}>
                <span>{data.averageRating}</span>
                <span style={{ color: "#f59e0b", fontSize: "18px", letterSpacing: "1px" }}>★★★★★</span>
              </div>
              <div style={{ marginTop: "6px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
                  <Icon source={ArrowUpIcon} /> +0.2
                </span>
              </div>
            </div>
            <div style={{ marginTop: "14px" }}>
              <Sparkline points={data.sparklines.rating} color="#f59e0b" />
            </div>
          </div>

          {/* Card 3: Published reviews rate */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748b" }}>Published reviews</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon source={CheckCircleIcon} tone="success" />
                </div>
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.2 }}>
                {data.totalReviews > 0 ? Math.round((data.publishedReviews / data.totalReviews) * 100) : 100}%
              </div>
              <div style={{ marginTop: "6px" }}>
                <span style={{ display: "inline-block", background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "600" }}>
                  {data.publishedReviews} published of {data.totalReviews} total
                </span>
              </div>
            </div>
            <div style={{ marginTop: "14px" }}>
              <Sparkline points={data.sparklines.requests} color="#3b82f6" />
            </div>
          </div>

          {/* Card 4: Awaiting approval (Highlighted Yellow Accent) */}
          <div
            style={{
              background: "#ffffff",
              border: "2px solid #f59e0b",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.08)",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#78350f" }}>Awaiting approval</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon source={ClockIcon} tone="warning" />
                </div>
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.2 }}>
                {data.pendingReviews}
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <button
                onClick={() => {
                  setTableFilter("pending");
                  const el = document.getElementById("reviews-table-card");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
              >
                Review now <Icon source={ArrowRightIcon} />
              </button>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROW 2: REVIEWS OVER TIME (CHART) & REVIEWS BY SOURCE     */}
        {/* ======================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Reviews Over Time Chart */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <Text as="h2" variant="headingMd" fontWeight="bold">
                Reviews over time
              </Text>

              {/* Timeframe Filter Buttons Matching Screenshot */}
              <div style={{ display: "flex", gap: "6px", background: "#f1f5f9", padding: "3px", borderRadius: "8px" }}>
                {(["30d", "90d", "1y"] as const).map((t) => {
                  const labels = { "30d": "30 days", "90d": "90 days", "1y": "1 year" };
                  const isActive = timeframe === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTimeframe(t)}
                      style={{
                        padding: "5px 12px",
                        border: "none",
                        borderRadius: "6px",
                        background: isActive ? "#ffffff" : "transparent",
                        color: isActive ? "#2563eb" : "#64748b",
                        fontWeight: isActive ? "700" : "500",
                        fontSize: "12px",
                        cursor: "pointer",
                        boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <ReviewsOverTimeChart data={(data.chartData as any)[timeframe]} />
          </div>

          {/* Reviews by Source Donut */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <Text as="h2" variant="headingMd" fontWeight="bold">
                Reviews by source
              </Text>
            </div>
            <ReviewsBySourceDonut sources={data.sourcesBreakdown} />
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROW 3: RATING BREAKDOWN & SETUP CHECKLIST                */}
        {/* ======================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Rating Breakdown */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ marginBottom: "18px" }}>
              <Text as="h2" variant="headingMd" fontWeight="bold">
                Rating breakdown
              </Text>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {data.starBreakdown.map((row: any) => (
                <div key={row.stars} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
                  <span style={{ fontWeight: 600, color: "#334155", width: "24px" }}>{row.stars} ★</span>

                  {/* Horizontal Bar */}
                  <div style={{ flex: 1, height: "10px", backgroundColor: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${row.percentage}%`,
                        height: "100%",
                        backgroundColor: "#f59e0b",
                        borderRadius: "5px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  <span style={{ fontWeight: 600, color: "#475569", width: "36px", textAlign: "right" }}>
                    {row.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Setup Checklist Stepper */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <Text as="h2" variant="headingMd" fontWeight="bold">
                Setup checklist
              </Text>
              <span
                style={{
                  backgroundColor: "#dbeafe",
                  color: "#1d4ed8",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "700",
                }}
              >
                {data.checklist.completedCount} of {data.checklist.totalCount}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {data.checklist.items.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => navigate(item.href)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {item.completed ? (
                      <span style={{ color: "#16a34a", display: "flex", alignItems: "center" }}>
                        <Icon source={CheckCircleIcon} tone="success" />
                      </span>
                    ) : (
                      <span
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          border: "2px solid #cbd5e1",
                          display: "inline-block",
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: item.completed ? "600" : "500",
                        color: item.completed ? "#0f172a" : "#475569",
                      }}
                    >
                      {item.title}
                    </span>
                  </div>

                  {!item.completed && (
                    <span
                      style={{
                        backgroundColor: "#fef3c7",
                        color: "#b45309",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                      }}
                    >
                      Next
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROW 4: REVIEWS MODERATION & MANAGEMENT                   */}
        {/* ======================================================== */}
        <div>
          {/* Top 4 KPI Summary Cards Matching Reference Design */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            {/* Card 1: Total */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Total
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                {data.totalReviews}
              </div>
            </div>

            {/* Card 2: Published */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Published
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#16a34a", lineHeight: 1.1 }}>
                {data.publishedReviews}
              </div>
            </div>

            {/* Card 3: Needs approval (Highlighted with Yellow/Amber Border) */}
            <div
              style={{
                background: "#ffffff",
                border: "2px solid #f59e0b",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Needs approval
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#d97706", lineHeight: 1.1 }}>
                {data.pendingReviews}
              </div>
            </div>

            {/* Card 4: AI drafts (private) */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                AI drafts (private)
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                {data.aiGeneratedCount}
              </div>
            </div>
          </div>

          {/* Main Moderation & Management Card Container */}
          <div
            id="reviews-table-card"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            {/* Tabs Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid #e2e8f0",
                padding: "0 20px",
                overflowX: "auto",
                whiteSpace: "nowrap",
                gap: "8px",
              }}
            >
              {[
                { id: "all", label: `All ${data.totalReviews}` },
                { id: "published", label: `Published ${data.publishedReviews}` },
                { id: "pending", label: `Pending ${data.pendingReviews}` },
                { id: "imported", label: `Imported ${data.importedCount}` },
                { id: "media", label: `With media ${(data as any).mediaCount || 0}` },
                { id: "ai_drafts", label: `AI drafts ${data.aiGeneratedCount}` },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    style={{
                      background: "none",
                      border: "none",
                      borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
                      color: isActive ? "#2563eb" : "#64748b",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: "14px",
                      padding: "16px 14px",
                      cursor: "pointer",
                      marginBottom: "-1px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Search and Filters Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                padding: "18px 20px 14px 20px",
              }}
            >
              {/* Search Box */}
              <div style={{ position: "relative", flex: "1 1 280px", minWidth: "220px" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                    color: "#94a3b8",
                  }}
                >
                  <Icon source={SearchIcon} tone="subdued" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search reviewer, product or text"
                  style={{
                    width: "100%",
                    padding: "8px 14px 8px 36px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    fontSize: "13px",
                    color: "#0f172a",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Product: All Dropdown */}
              <select
                value={selectedProduct}
                onChange={(e) => {
                  setSelectedProduct(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  fontSize: "13px",
                  color: "#334155",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                  maxWidth: "180px",
                }}
              >
                <option value="all">Product: All</option>
                {((data as any).productOptions || []).map((p: string) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {/* Source: All Dropdown */}
              <select
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  fontSize: "13px",
                  color: "#334155",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="all">Source: All</option>
                <option value="STORE_ORDER">Store</option>
                <option value="AMAZON">Amazon</option>
                <option value="FLIPKART">Flipkart</option>
                <option value="ALIBABA">Alibaba</option>
                <option value="AI">AI generated</option>
              </select>

              {/* Rating: All Dropdown */}
              <select
                value={selectedRating}
                onChange={(e) => {
                  setSelectedRating(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  fontSize: "13px",
                  color: "#334155",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="all">Rating: All</option>
                <option value="5">5 ★</option>
                <option value="4">4 ★</option>
                <option value="3">3 ★</option>
                <option value="2">2 ★</option>
                <option value="1">1 ★</option>
              </select>

              {/* Delete all reviews option when no rows selected */}
              {data.totalReviews > 0 && selectedIds.size === 0 && (
                <button
                  onClick={handlePromptDeleteAll}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 12px",
                    borderRadius: "8px",
                    border: "1px solid #fee2e2",
                    backgroundColor: "#fff1f2",
                    color: "#b91c1c",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    marginLeft: "auto",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fee2e2")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff1f2")}
                >
                  <Icon source={DeleteIcon} tone="critical" />
                  Delete all reviews
                </button>
              )}
            </div>

            {/* Bulk Selection Action Bar Matching Reference Screenshot */}
            {selectedIds.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                  padding: "8px 16px",
                  margin: "0 20px 14px 20px",
                  backgroundColor: "#dbeafe",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ color: "#1d4ed8", fontSize: "14px", fontWeight: "700" }}>
                    {selectedIds.size} selected
                  </span>
                  {selectedIds.size < totalReviewsCount && (
                    <button
                      onClick={handleSelectAllFiltered}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Select all {totalReviewsCount}
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Approve */}
                  <button
                    onClick={handleBulkApprove}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "5px 14px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#0f172a",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <Icon source={CheckIcon} tone="success" />
                    Approve
                  </button>

                  {/* Unpublish */}
                  <button
                    onClick={handleBulkUnpublish}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "5px 14px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#0f172a",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <Icon source={HideIcon} />
                    Unpublish
                  </button>

                  {/* Delete */}
                  <button
                    onClick={handlePromptDeleteSelected}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#ffffff",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      padding: "5px 14px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#b91c1c",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <Icon source={DeleteIcon} tone="critical" />
                    Delete
                  </button>

                  {/* Deselect */}
                  <button
                    onClick={handleClearSelection}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "5px 8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Table Container */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontWeight: 600 }}>
                    <th style={{ padding: "12px 14px 12px 20px", width: "40px" }}>
                      <input
                        type="checkbox"
                        checked={isAllCurrentPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeCurrentPageSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                        title="Select all on this page"
                      />
                    </th>
                    <th style={{ padding: "12px 14px" }}>Reviewer</th>
                    <th style={{ padding: "12px 14px" }}>Product</th>
                    <th style={{ padding: "12px 14px" }}>Rating</th>
                    <th style={{ padding: "12px 14px" }}>Review</th>
                    <th style={{ padding: "12px 14px" }}>Source</th>
                    <th style={{ padding: "12px 14px" }}>Status</th>
                    <th style={{ padding: "12px 20px 12px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReviews.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "36px", textAlign: "center", color: "#94a3b8" }}>
                        No reviews found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedReviews.map((r: any) => {
                      const isChecked = selectedIds.has(r.id);
                      const isAiDraft = r.isAiGenerated;
                      const s = (r.source || "").toUpperCase();
                      const isImported = s.includes("AMAZON") || s.includes("FLIPKART") || s.includes("ALIBABA") || s.includes("IMPORT");

                      // Row background: AI draft highlighted yellow, or selected blue
                      const rowBg = isChecked
                        ? "#f0f9ff"
                        : isAiDraft
                        ? "#fef3c7"
                        : "transparent";

                      // Source badge styling
                      let sourceBg = "#dcfce7";
                      let sourceColor = "#166534";
                      let sourceText = "Store";
                      if (s.includes("ALIBABA")) {
                        sourceBg = "#fed7aa";
                        sourceColor = "#9a3412";
                        sourceText = "Alibaba";
                      } else if (s.includes("FLIPKART")) {
                        sourceBg = "#bfdbfe";
                        sourceColor = "#1d4ed8";
                        sourceText = "Flipkart";
                      } else if (s.includes("AMAZON")) {
                        sourceBg = "#fef08a";
                        sourceColor = "#854d0e";
                        sourceText = "Amazon";
                      } else if (isAiDraft || s.includes("AI")) {
                        sourceBg = "#f1f5f9";
                        sourceColor = "#475569";
                        sourceText = "AI generated";
                      }

                      // Status badge styling
                      let statusBg = "#dcfce7";
                      let statusColor = "#15803d";
                      let statusText = "Published";
                      if (!r.isPublished && isAiDraft) {
                        statusBg = "#ffe4e6";
                        statusColor = "#be123c";
                        statusText = "Hidden";
                      } else if (!r.isPublished) {
                        statusBg = "#fef3c7";
                        statusColor = "#b45309";
                        statusText = "Pending";
                      }

                      const hasMedia = Boolean(r.imageUrl || r.videoUrl);

                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            backgroundColor: rowBg,
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!isChecked && !isAiDraft) e.currentTarget.style.backgroundColor = "#f8fafc";
                          }}
                          onMouseLeave={(e) => {
                            if (!isChecked && !isAiDraft) e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          {/* Checkbox */}
                          <td style={{ padding: "14px 14px 14px 20px", width: "40px" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectOne(r.id)}
                              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
                            />
                          </td>

                          {/* Reviewer */}
                          <td style={{ padding: "14px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {/* Initials Avatar */}
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  backgroundColor: isAiDraft ? "#fde68a" : "#bfdbfe",
                                  color: isAiDraft ? "#92400e" : "#1d4ed8",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  flexShrink: 0,
                                }}
                              >
                                {getInitials(r.reviewerName)}
                              </div>

                              {/* Name & Sub-badge */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                                <span
                                  style={{
                                    fontWeight: "700",
                                    color: "#0f172a",
                                    fontSize: "13px",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "140px",
                                  }}
                                  title={r.reviewerName}
                                >
                                  {r.reviewerName}
                                </span>
                                {isAiDraft ? (
                                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#b45309" }}>
                                    AI draft
                                  </span>
                                ) : isImported ? (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      backgroundColor: "#f1f5f9",
                                      color: "#475569",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      width: "fit-content",
                                    }}
                                  >
                                    Imported
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      backgroundColor: "#dcfce7",
                                      color: "#15803d",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      width: "fit-content",
                                    }}
                                  >
                                    Verified order
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Product */}
                          <td style={{ padding: "14px 14px" }}>
                            <span
                              style={{
                                color: "#334155",
                                fontSize: "13px",
                                fontWeight: "500",
                                display: "inline-block",
                                maxWidth: "140px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={r.productTitle}
                            >
                              {r.productTitle}
                            </span>
                          </td>

                          {/* Rating */}
                          <td style={{ padding: "14px 14px", color: "#b45309", letterSpacing: "1px", fontSize: "14px", whiteSpace: "nowrap" }}>
                            {"★".repeat(Math.min(5, Math.max(1, r.rating || 5)))}
                          </td>

                          {/* Review */}
                          <td style={{ padding: "14px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", maxWidth: "260px" }}>
                              {hasMedia && (
                                <div
                                  style={{
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    backgroundColor: "#fed7aa",
                                    flexShrink: 0,
                                    overflow: "hidden",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {r.imageUrl ? (
                                    <img
                                      src={r.imageUrl}
                                      alt="review thumbnail"
                                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: "10px" }}>🖼</span>
                                  )}
                                </div>
                              )}
                              <span
                                style={{
                                  color: "#334155",
                                  fontSize: "13px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  flex: 1,
                                }}
                                title={r.bodyShort}
                              >
                                {r.bodyShort}
                              </span>
                              {hasMedia && (
                                <span
                                  style={{
                                    backgroundColor: "#e0f2fe",
                                    color: "#0284c7",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    flexShrink: 0,
                                  }}
                                >
                                  Photo
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Source */}
                          <td style={{ padding: "14px 14px", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                backgroundColor: sourceBg,
                                color: sourceColor,
                                padding: "3px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              {sourceText}
                            </span>
                          </td>

                          {/* Status */}
                          <td style={{ padding: "14px 14px", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                backgroundColor: statusBg,
                                color: statusColor,
                                padding: "3px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              {statusText}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "14px 20px 14px 14px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", position: "relative" }}>
                              {/* Pending Review: Quick Approve Checkmark Button */}
                              {!r.isPublished && !isAiDraft && (
                                <button
                                  title="Approve & Publish"
                                  onClick={() => handleTogglePublish(r.id)}
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  <Icon source={CheckIcon} tone="success" />
                                </button>
                              )}

                              {/* Edit Button */}
                              <button
                                title="Edit Review"
                                onClick={() => navigate("/app/reviews")}
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <Icon source={EditIcon} />
                              </button>

                              {/* Media / Photo Button (if published or has media) */}
                              {hasMedia && (
                                <button
                                  title="View Media"
                                  onClick={() => {
                                    if (r.imageUrl) window.open(r.imageUrl, "_blank");
                                  }}
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  <Icon source={ImageIcon} />
                                </button>
                              )}

                              {/* AI Draft Trash Delete Button */}
                              {isAiDraft && (
                                <button
                                  title="Delete Draft"
                                  onClick={() => handlePromptDeleteOne(r.id, r.reviewerName)}
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    border: "1px solid #fecaca",
                                    backgroundColor: "#fff1f2",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  <Icon source={DeleteIcon} tone="critical" />
                                </button>
                              )}

                              {/* Three-dots More Actions Menu */}
                              <button
                                title="More Actions"
                                onClick={() => setActiveMenuId(activeMenuId === r.id ? null : r.id)}
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <Icon source={MenuHorizontalIcon} />
                              </button>

                              {/* Dropdown Menu Popup */}
                              {activeMenuId === r.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "34px",
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                                    zIndex: 50,
                                    minWidth: "150px",
                                    padding: "4px",
                                    textAlign: "left",
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      handleTogglePublish(r.id);
                                      setActiveMenuId(null);
                                    }}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 10px",
                                      border: "none",
                                      background: "none",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: "#334155",
                                      cursor: "pointer",
                                      borderRadius: "6px",
                                      textAlign: "left",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                  >
                                    <Icon source={r.isPublished ? HideIcon : ViewIcon} />
                                    {r.isPublished ? "Unpublish" : "Publish"}
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handlePromptDeleteOne(r.id, r.reviewerName);
                                    }}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 10px",
                                      border: "none",
                                      background: "none",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      borderRadius: "6px",
                                      textAlign: "left",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fee2e2")}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                  >
                                    <Icon source={DeleteIcon} tone="critical" />
                                    Delete review
                                  </button>
                                </div>
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

            {/* Pagination Footer Matching Reference Screenshot */}
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
                  Showing <strong style={{ color: "#0f172a" }}>{startIndex + 1}</strong> to{" "}
                  <strong style={{ color: "#0f172a" }}>{endIndex}</strong> of{" "}
                  <strong style={{ color: "#0f172a" }}>{totalReviewsCount}</strong>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
                      opacity: safeCurrentPage <= 1 ? 0.4 : 1,
                    }}
                    title="Previous page"
                  >
                    <Icon source={ChevronLeftIcon} />
                  </button>

                  <span style={{ fontSize: "13px", fontWeight: "500", color: "#334155", padding: "0 4px" }}>
                    Page {safeCurrentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
                      opacity: safeCurrentPage >= totalPages ? 0.4 : 1,
                    }}
                    title="Next page"
                  >
                    <Icon source={ChevronRightIcon} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Modal Popup for Deletion */}
        {deleteModal.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
            onClick={() => setDeleteModal({ open: false, type: "single" })}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                maxWidth: "460px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
                border: "1px solid #f1f5f9",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "20px",
                  }}
                >
                  ⚠️
                </div>
                <div>
                  <h3 style={{ margin: "0 0 6px 0", fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>
                    {deleteModal.type === "all"
                      ? "Delete ALL Reviews?"
                      : deleteModal.type === "selected"
                      ? `Delete ${deleteModal.count} Selected Reviews?`
                      : `Delete Review from ${deleteModal.reviewerName || "Customer"}?`}
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                    {deleteModal.type === "all"
                      ? `This will permanently delete ALL ${deleteModal.count || data.totalReviews} reviews from your database and remove them from your Shopify storefront metafields. This action cannot be undone.`
                      : deleteModal.type === "selected"
                      ? `This will permanently delete the ${deleteModal.count} selected reviews from your database and remove them from your Shopify storefront metafields. This action cannot be undone.`
                      : "This will permanently delete this review from your store. This action cannot be undone."}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <button
                  onClick={() => setDeleteModal({ open: false, type: "single" })}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(220, 38, 38, 0.25)",
                  }}
                >
                  {deleteModal.type === "all"
                    ? "Yes, Delete All Reviews"
                    : deleteModal.type === "selected"
                    ? `Delete ${deleteModal.count} Reviews`
                    : "Delete Review"}
                </button>
              </div>
            </div>
          </div>
        )}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <Page title="Dynamic Review Ecosystem Dashboard">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd" tone="critical">
            Dashboard Loading Notice
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            {error instanceof Error ? error.message : "The dashboard encountered a momentary connection interruption."}
          </Text>
          <InlineStack gap="300">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload Dashboard
            </Button>
            <Button onClick={() => navigate("/app/reviews")}>
              View Reviews List
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
