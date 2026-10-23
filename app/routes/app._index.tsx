import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher, useRouteError } from "@remix-run/react";
import { useState, useMemo, useEffect, useRef } from "react";
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
// 1. LOADER FUNCTION (DYNAMIC DATA ENGINE)
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

  // 1. Fetch reviews with full details
  const reviews = await db.review.findMany({
    where: shopWhere,
    select: {
      id: true,
      reviewerName: true,
      rating: true,
      bodyShort: true,
      source: true,
      isPublished: true,
      isAiGenerated: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // 2. Fetch settings and cloud keys
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const hasLocalAiKey = Boolean(
    settings?.anthropicApiKey ||
    settings?.geminiApiKey ||
    (settings as any)?.openaiApiKey
  );

  let cloudKeys: any = null;
  if (!hasLocalAiKey) {
    try {
      cloudKeys = await getShopAIKeysFromShopify(admin);
    } catch (_) {}
  }

  // 3. QR code scans
  const qrScansResult = await db.qrCodeRecord.aggregate({
    where: shopWhere,
    _sum: { scans: true },
  });
  const totalQrScans = qrScansResult._sum.scans || 0;

  // 4. Counts & Ratings
  const totalReviews = reviews.length;
  const publishedReviews = reviews.filter((r) => r.isPublished).length;
  const pendingReviews = reviews.filter((r) => !r.isPublished).length;
  const aiGeneratedCount = reviews.filter((r) => r.isAiGenerated || (r.source || "").toUpperCase().includes("AI")).length;
  const importedCount = reviews.filter((r) =>
    ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA", "AMAZON", "FLIPKART", "ALIBABA"].some((s) =>
      (r.source || "").toUpperCase().includes(s)
    )
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

  // 6. Source Counts for Tab Pills
  const sourceCounts = {
    all: totalReviews,
    alibaba: reviews.filter((r) => (r.source || "").toUpperCase().includes("ALIBABA")).length,
    flipkart: reviews.filter((r) => (r.source || "").toUpperCase().includes("FLIPKART")).length,
    amazon: reviews.filter((r) => (r.source || "").toUpperCase().includes("AMAZON")).length,
    ai_drafts: aiGeneratedCount,
    store_orders: reviews.filter((r) => {
      const src = (r.source || "").toUpperCase();
      return (
        !src.includes("ALIBABA") &&
        !src.includes("FLIPKART") &&
        !src.includes("AMAZON") &&
        !r.isAiGenerated &&
        !src.includes("AI")
      );
    }).length,
  };

  // 7. Sources breakdown for Donut Chart
  const sourceGroups: { [key: string]: number } = {};
  reviews.forEach((r) => {
    const src = (r.source || "STORE_ORDER").toUpperCase();
    let normalized = "Store orders";
    if (src.includes("ALIBABA")) normalized = "Alibaba";
    else if (src.includes("FLIPKART")) normalized = "Flipkart";
    else if (src.includes("AMAZON")) normalized = "Amazon";
    else if (r.isAiGenerated || src.includes("AI")) normalized = "AI Drafts";
    else normalized = "Store orders";

    sourceGroups[normalized] = (sourceGroups[normalized] || 0) + 1;
  });

  const sourceColors: { [key: string]: string } = {
    Alibaba: "#3b82f6",
    Flipkart: "#0ea5e9",
    Amazon: "#f59e0b",
    "AI Drafts": "#a855f7",
    "Store orders": "#10b981",
  };

  const sourcesBreakdown = Object.entries(sourceGroups).map(([label, count]) => ({
    label,
    count,
    color: sourceColors[label] || "#3b82f6",
    percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
  }));

  if (sourcesBreakdown.length === 0) {
    sourcesBreakdown.push(
      { label: "Alibaba", count: 0, color: "#3b82f6", percentage: 0 },
      { label: "Flipkart", count: 0, color: "#0ea5e9", percentage: 0 },
      { label: "Amazon", count: 0, color: "#f59e0b", percentage: 0 },
      { label: "AI Drafts", count: 0, color: "#a855f7", percentage: 0 }
    );
  }

  // 8. Reviews over time (30d, 90d, 1y)
  const now = new Date();

  // 30 Days daily data (30 points)
  const data30d: { label: string; count: number; dateStr: string }[] = [];
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
    data30d.push({ label: dayLabel, count, dateStr });
  }

  // 90 Days weekly data (12 points)
  const data90d: { label: string; count: number; dateStr: string }[] = [];
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
    data90d.push({ label, count, dateStr: label });
  }

  // 1 Year monthly data (12 points)
  const data1y: { label: string; count: number; dateStr: string }[] = [];
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
    data1y.push({ label, count, dateStr: label });
  }

  // 9. Trend calculations (last 30 days vs previous 30 days matching screenshot)
  const recent30Reviews = reviews.filter((r) => {
    try {
      return now.getTime() - new Date(r.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });
  const prev30Reviews = reviews.filter((r) => {
    try {
      const diff = now.getTime() - new Date(r.createdAt).getTime();
      return diff > 30 * 24 * 60 * 60 * 1000 && diff <= 60 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  let monthlyGrowth = 0;
  let monthlyGrowthText = "+0% vs. previous 30 days";
  let isMonthlyPositive = true;

  if (prev30Reviews.length > 0) {
    const pct = Math.round(((recent30Reviews.length - prev30Reviews.length) / prev30Reviews.length) * 100);
    monthlyGrowth = pct;
    monthlyGrowthText = `${pct >= 0 ? "+" : ""}${pct}% vs. previous 30 days`;
    isMonthlyPositive = pct >= 0;
  } else if (recent30Reviews.length > 0) {
    monthlyGrowth = 100;
    monthlyGrowthText = `+${recent30Reviews.length} new vs. previous 30 days`;
    isMonthlyPositive = true;
  } else {
    monthlyGrowth = 0;
    monthlyGrowthText = "0% vs. previous 30 days";
    isMonthlyPositive = true;
  }

  // Rating difference
  const recentAvg =
    recent30Reviews.length > 0
      ? recent30Reviews.reduce((sum, r) => sum + (r.rating || 5), 0) / recent30Reviews.length
      : Number(averageRating);
  const prevAvg =
    prev30Reviews.length > 0
      ? prev30Reviews.reduce((sum, r) => sum + (r.rating || 5), 0) / prev30Reviews.length
      : recentAvg;
  const ratingDiffVal = Number((recentAvg - prevAvg).toFixed(1));
  const ratingDiffText = `${ratingDiffVal >= 0 ? "+" : ""}${ratingDiffVal.toFixed(1)} vs. previous 30 days`;
  const isRatingPositive = ratingDiffVal >= 0;

  // 10. Dynamic 7-day sparklines
  const sparklineTotal: number[] = [];
  const sparklineRating: number[] = [];
  const sparklinePending: number[] = [];

  for (let i = 6; i >= 0; i--) {
    const dStart = new Date(now);
    dStart.setDate(dStart.getDate() - i);
    dStart.setHours(0, 0, 0, 0);
    const dEnd = new Date(dStart);
    dEnd.setDate(dEnd.getDate() + 1);

    const dayReviews = reviews.filter((r) => {
      try {
        const cd = new Date(r.createdAt);
        return cd >= dStart && cd < dEnd;
      } catch {
        return false;
      }
    });

    const dayCount = dayReviews.length;
    const dayRating =
      dayCount > 0
        ? Number((dayReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / dayCount).toFixed(1))
        : Number(averageRating);
    const dayPend = dayReviews.filter((r) => !r.isPublished).length;

    sparklineTotal.push(dayCount);
    sparklineRating.push(dayRating);
    sparklinePending.push(dayPend);
  }

  // 11. Checklist status
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
  const isWidgetConfigured = Boolean(settings?.widgetLayoutStyle);

  const checklistItems = [
    { id: "widget", title: "Enable popup widget", completed: isWidgetEnabled, href: "/app/widget-settings" },
    { id: "import", title: "Import marketplace reviews", completed: hasMarketplaceReviews, href: "/app/import-reviews" },
    { id: "ai", title: "Connect AI provider", completed: hasAiKey, href: "/app/ai-settings" },
    { id: "widget_settings", title: "Configure widget settings", completed: isWidgetConfigured, href: "/app/widget-settings" },
  ];
  const completedChecklistCount = checklistItems.filter((c) => c.completed).length;

  // 12. Recent reviews formatted for the table
  const recentReviews = reviews.map((r) => ({
    id: r.id,
    reviewerName: r.reviewerName || "Verified Buyer",
    rating: r.rating || 5,
    bodyShort: r.bodyShort || "",
    source: r.source || "STORE_ORDER",
    isPublished: r.isPublished,
    isAiGenerated: r.isAiGenerated,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));

  const adminName = (shop || "admin").split(".")[0].replace(/-/g, " ");

  return json({
    totalReviews,
    publishedReviews,
    pendingReviews,
    aiGeneratedCount,
    importedCount,
    averageRating,
    monthlyGrowth,
    monthlyGrowthText,
    isMonthlyPositive,
    ratingDiffText,
    isRatingPositive,
    totalQrScans,
    starBreakdown,
    sourceCounts,
    sourcesBreakdown,
    chartData: {
      "30d": data30d,
      "90d": data90d,
      "1y": data1y,
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
      pending: sparklinePending,
    },
    adminName,
  });
}

// ==========================================
// 2. ACTION FUNCTION (MODERATION HANDLERS)
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
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    }
    return json({ success: true, message: "Review status updated." });
  }

  if (intent === "deleteReview" && reviewId) {
    await recordDeletedReviewIds(admin, shop, [reviewId]);
    await db.review.deleteMany({
      where: { AND: [shopWhere, { id: reviewId }] },
    });
    syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
    return json({ success: true, message: "Review deleted." });
  }

  if (intent === "deleteSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await recordDeletedReviewIds(admin, shop, ids);
      await db.review.deleteMany({
        where: { AND: [shopWhere, { id: { in: ids } }] },
      });
      syncReviewsToShopify(admin, shop).catch((e) => console.warn(e));
      return json({ success: true, message: `${ids.length} review(s) deleted.` });
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
    syncReviewsToShopify(admin, shop, true).catch((e) => console.warn(e));
    return json({ success: true, message: "All reviews permanently deleted." });
  }

  return json({ success: true });
}

// ==========================================
// 3. SVG VISUALIZATION COMPONENTS
// ==========================================

// Helper to extract initials
function getInitials(name: string) {
  if (!name) return "VC";
  const clean = name.replace(/[^a-zA-Z\s]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Smooth Sparkline Curve for KPI Cards
function SparklineWave({ points, color }: { points: number[]; color: string }) {
  const width = 84;
  const height = 24;

  let validPoints = points && points.length >= 2 ? points : [2, 3, 4, 3, 6, 8, 7];
  const min = Math.min(...validPoints);
  const max = Math.max(...validPoints);
  const range = max - min || 1;

  const coords = validPoints.map((val, idx) => {
    const x = (idx / (validPoints.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return { x, y };
  });

  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const mx = (curr.x + next.x) / 2;
    pathD += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Review Performance Area Chart (Matches Reference Exactly)
function ReviewPerformanceChart({
  data,
  timeframe,
}: {
  data: { label: string; count: number; dateStr: string }[];
  timeframe: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const counts = data.map((d) => d.count);
  const rawMax = Math.max(...counts, 0);
  const maxScale = rawMax > 60 ? 80 : rawMax > 30 ? 60 : rawMax > 15 ? 40 : rawMax > 0 ? 20 : 80;

  const width = 560;
  const height = 180;
  const padLeft = 32;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 26;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const coords = data.map((item, idx) => {
    const x = padLeft + (idx / Math.max(1, data.length - 1)) * chartW;
    const y = padTop + chartH - (item.count / maxScale) * chartH;
    return { x, y, ...item };
  });

  let lineD = coords.length > 0 ? `M ${coords[0].x} ${coords[0].y}` : "";
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const mx = (curr.x + next.x) / 2;
    lineD += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
  }

  const areaD =
    coords.length > 0
      ? `${lineD} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`
      : "";

  // 5 Y-Axis scale marks: e.g. 80, 60, 40, 20, 0
  const yTicks = [
    { val: maxScale, y: padTop },
    { val: Math.round(maxScale * 0.75), y: padTop + chartH * 0.25 },
    { val: Math.round(maxScale * 0.5), y: padTop + chartH * 0.5 },
    { val: Math.round(maxScale * 0.25), y: padTop + chartH * 0.75 },
    { val: 0, y: padTop + chartH },
  ];

  // Pick 7 evenly spaced dates for X-axis
  const xLabelsIndices = useMemo(() => {
    if (coords.length <= 7) return coords.map((_, i) => i);
    const step = (coords.length - 1) / 6;
    return [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round(i * step));
  }, [coords.length]);

  return (
    <div style={{ position: "relative", width: "100%", height: "200px" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="areaPerfGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal Dotted Gridlines & Y-Axis Numbers */}
        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <text x={padLeft - 8} y={tick.y + 4} fill="#94a3b8" fontSize="10" textAnchor="end" fontWeight="500">
              {tick.val}
            </text>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              stroke="#f1f5f9"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          </g>
        ))}

        {/* Gradient Area Fill */}
        {areaD && <path d={areaD} fill="url(#areaPerfGradient)" />}

        {/* Smooth Blue Area Line */}
        {lineD && <path d={lineD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Interactive Dots */}
        {coords.map((c, idx) => (
          <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hoveredIdx === idx ? 5.5 : 3}
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth={hoveredIdx === idx ? 3 : 2}
              style={{ cursor: "pointer", transition: "all 0.12s ease" }}
            />
          </g>
        ))}

        {/* X-axis date labels */}
        {xLabelsIndices.map((ptIdx) => {
          const pt = coords[ptIdx];
          if (!pt) return null;
          return (
            <text key={ptIdx} x={pt.x} y={height - 6} fill="#94a3b8" fontSize="10.5" textAnchor="middle" fontWeight="500">
              {pt.label}
            </text>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredIdx !== null && coords[hoveredIdx] && (
        <div
          style={{
            position: "absolute",
            left: `${(coords[hoveredIdx].x / width) * 100}%`,
            top: `${(coords[hoveredIdx].y / height) * 100 - 30}%`,
            transform: "translate(-50%, -100%)",
            backgroundColor: "#0f172a",
            color: "#ffffff",
            padding: "4px 8px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600",
            pointerEvents: "none",
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
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

// Reviews by Source Donut Chart (Matches Reference Exactly)
function ReviewsBySourceDonut({
  sources,
  total,
}: {
  sources: { label: string; count: number; color: string; percentage: number }[];
  total: number;
}) {
  const radius = 54;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", height: "100%" }}>
      {/* Donut Graphic */}
      <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0, margin: "auto" }}>
        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
          {total === 0 ? (
            <circle cx="70" cy="70" r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          ) : (
            sources.map((item, idx) => {
              if (item.count === 0) return null;
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

        {/* Center Total Count */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>{total}</div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>Total</div>
        </div>
      </div>

      {/* Legend Matching Reference Screenshot */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
        {sources.map((item, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                backgroundColor: item.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#475569", fontWeight: 500, flex: 1 }}>{item.label}</span>
            <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. MAIN REDESIGNED DASHBOARD PAGE
// ==========================================
export default function DynamicReviewDashboard() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Navigation sidebar items
  const [activeNav, setActiveNav] = useState<string>("dashboard");

  // Timeframe filter state: 30 days, 90 days, 1 year
  const [timeframe, setTimeframe] = useState<"30d" | "90d" | "1y">("30d");

  // Date range dropdown selector state
  const [dateRange, setDateRange] = useState<string>("Last 30 days");
  const [dateDropdownOpen, setDateDropdownOpen] = useState<boolean>(false);

  // Latest Reviews source tabs filter: all, alibaba, flipkart, amazon, ai_drafts, store_orders
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Table pagination state (Default 5 items per page exactly as in screenshot!)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Row Action Menu popup state
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upgrade to Pro Modal state
  const [proModalOpen, setProModalOpen] = useState<boolean>(false);

  // AI Review Summary Modal state
  const [aiSummaryModalOpen, setAiSummaryModalOpen] = useState<boolean>(false);

  // Confirmation modal popup state
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: "single" | "selected" | "all";
    reviewId?: string;
    reviewerName?: string;
    count?: number;
  }>({ open: false, type: "single" });

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside() {
      setOpenActionId(null);
      setDateDropdownOpen(false);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Filtered reviews for Latest Reviews table
  const filteredReviews = useMemo(() => {
    if (!data?.recentReviews) return [];
    if (sourceFilter === "all") return data.recentReviews;
    if (sourceFilter === "alibaba") {
      return data.recentReviews.filter((r: any) => (r.source || "").toUpperCase().includes("ALIBABA"));
    }
    if (sourceFilter === "flipkart") {
      return data.recentReviews.filter((r: any) => (r.source || "").toUpperCase().includes("FLIPKART"));
    }
    if (sourceFilter === "amazon") {
      return data.recentReviews.filter((r: any) => (r.source || "").toUpperCase().includes("AMAZON"));
    }
    if (sourceFilter === "ai_drafts") {
      return data.recentReviews.filter((r: any) => r.isAiGenerated || (r.source || "").toUpperCase().includes("AI"));
    }
    if (sourceFilter === "store_orders") {
      return data.recentReviews.filter((r: any) => {
        const src = (r.source || "").toUpperCase();
        return (
          !src.includes("ALIBABA") &&
          !src.includes("FLIPKART") &&
          !src.includes("AMAZON") &&
          !r.isAiGenerated &&
          !src.includes("AI")
        );
      });
    }
    return data.recentReviews;
  }, [data?.recentReviews, sourceFilter]);

  // Pagination calculations
  const totalReviewsCount = filteredReviews.length;
  const totalPages = Math.max(1, Math.ceil(totalReviewsCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalReviewsCount);
  const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  // Handlers
  const handleTogglePublish = (reviewId: string) => {
    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", reviewId);
    fetcher.submit(fd, { method: "post" });
    setOpenActionId(null);
  };

  const handlePromptDeleteOne = (reviewId: string, reviewerName: string) => {
    setDeleteModal({
      open: true,
      type: "single",
      reviewId,
      reviewerName,
    });
    setOpenActionId(null);
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

  const publishedPercentage =
    data.totalReviews > 0 ? Math.round((data.publishedReviews / data.totalReviews) * 100) : 100;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#0f172a",
      }}
    >
      {/* ======================================================== */}
      {/* 1. LEFT NAVIGATION SIDEBAR                               */}
      {/* ======================================================== */}
      <aside
        style={{
          width: "250px",
          backgroundColor: "#ffffff",
          borderRight: "1px solid #f1f5f9",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexShrink: 0,
          padding: "20px 16px",
        }}
      >
        <div>
          {/* Top Logo & App Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            {/* Shopify Shopping Bag Logo */}
            <svg width="26" height="26" viewBox="0 0 256 256" fill="none">
              <path
                d="M219.4 69.4l-31.5-9.6c-.6-1.5-1.4-3.1-2.2-4.5-8.4-14.7-22.1-23.7-38.6-25.3-2.6-.3-5.2-.2-7.8.1-17.6 2.3-33 13.9-39.7 29.8L79.1 65.5C76 66.5 73.9 69.4 73.8 72.7l-4.5 137.9c-.1 2.3 1 4.5 2.8 5.7 1.8 1.3 4.2 1.5 6.2.7l134.1-51.5c2.6-1 4.3-3.6 4.3-6.4l6.1-84.6c.2-2.7-1.3-5.1-3.4-5.1z"
                fill="#95BF47"
              />
              <path
                d="M139.3 59.9c0-10.4 6.8-20.9 17.6-23.9 1.4-.4 2.8-.5 4.3-.4 10.9 1 20 7.8 24.3 18.2l-46.2 6.1z"
                fill="#5E8E3E"
              />
              <path
                d="M141.2 79.5l-44.1 14.1c-1.5.5-3.1-.4-3.6-1.9-.5-1.5.4-3.1 1.9-3.6l44.1-14.1c1.5-.5 3.1.4 3.6 1.9.5 1.5-.4 3.1-1.9 3.6z"
                fill="#ffffff"
                opacity="0.8"
              />
            </svg>
            <span style={{ fontSize: "17px", fontWeight: "800", color: "#000000", letterSpacing: "-0.5px" }}>
              shopify
            </span>
          </div>

          {/* Subtitle Badge: Sparkle + AI Dynamic Review System */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "6px",
              marginBottom: "26px",
              color: "#4f46e5",
              fontWeight: 700,
              fontSize: "12.5px",
            }}
          >
            <span style={{ fontSize: "14px" }}>✦</span>
            <span>AI Dynamic Review System</span>
          </div>

          {/* Nav Links */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {/* Dashboard Link */}
            <button
              onClick={() => {
                setActiveNav("dashboard");
                navigate("/app");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: activeNav === "dashboard" ? "#eff6ff" : "transparent",
                color: activeNav === "dashboard" ? "#2563eb" : "#475569",
                fontWeight: activeNav === "dashboard" ? 700 : 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span>Dashboard</span>
              </div>
            </button>

            {/* Reviews Link with Dynamic Pill Badge */}
            <button
              onClick={() => {
                setActiveNav("reviews");
                navigate("/app/reviews");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: activeNav === "reviews" ? "#eff6ff" : "transparent",
                color: activeNav === "reviews" ? "#2563eb" : "#475569",
                fontWeight: activeNav === "reviews" ? 700 : 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Reviews</span>
              </div>
              <span
                style={{
                  backgroundColor: "#f1f5f9",
                  color: "#475569",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11.5px",
                  fontWeight: 700,
                }}
              >
                {data.totalReviews}
              </span>
            </button>

            {/* Analytics Link */}
            <button
              onClick={() => {
                setActiveNav("analytics");
                const el = document.getElementById("review-performance-card");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "transparent",
                color: "#475569",
                fontWeight: 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Analytics</span>
            </button>

            {/* Customers Link */}
            <button
              onClick={() => {
                setActiveNav("customers");
                navigate("/app/reviews");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "transparent",
                color: "#475569",
                fontWeight: 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Customers</span>
            </button>

            {/* Products Link */}
            <button
              onClick={() => {
                setActiveNav("products");
                navigate("/app/import-reviews");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "transparent",
                color: "#475569",
                fontWeight: 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <span>Products</span>
            </button>

            {/* Settings Link */}
            <button
              onClick={() => {
                setActiveNav("settings");
                navigate("/app/widget-settings");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "transparent",
                color: "#475569",
                fontWeight: 500,
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom Sidebar Card: Upgrade to Pro */}
        <div
          style={{
            backgroundColor: "#fcfaff",
            border: "1px solid #ede9fe",
            borderRadius: "14px",
            padding: "16px",
            boxShadow: "0 2px 4px rgba(124, 58, 237, 0.04)",
          }}
        >
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              backgroundColor: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "10px",
              color: "#d97706",
              fontSize: "14px",
            }}
          >
            👑
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "13.5px",
              fontWeight: 800,
              color: "#1e1b4b",
              marginBottom: "4px",
            }}
          >
            <span style={{ color: "#7c3aed" }}>✦</span>
            <span>Upgrade to Pro</span>
          </div>
          <p style={{ margin: "0 0 12px 0", fontSize: "11.5px", color: "#64748b", lineHeight: 1.4 }}>
            Unlock advanced features and higher limits.
          </p>
          <button
            onClick={() => setProModalOpen(true)}
            style={{
              width: "100%",
              padding: "7px 12px",
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              color: "#0f172a",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
          >
            View Plans →
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN DASHBOARD CONTENT AREA                           */}
      {/* ======================================================== */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 32px 40px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Top Header Row Matching Screenshot */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: "800",
                color: "#0f172a",
                letterSpacing: "-0.5px",
              }}
            >
              {greeting}, Admin 👋
            </h1>
            <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#64748b" }}>
              Here's what's happening with your AI review system today.
            </p>
          </div>

          {/* Right Header Controls: Date Picker, Notification Bell, Admin Chip */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Date Range Selector Dropdown */}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <span>📅</span>
                <span>{dateRange}</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>▾</span>
              </button>

              {dateDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "6px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                    width: "160px",
                    zIndex: 50,
                    overflow: "hidden",
                  }}
                >
                  {["Last 7 days", "Last 30 days", "Last 90 days", "Last 1 year"].map((item) => (
                    <div
                      key={item}
                      onClick={() => {
                        setDateRange(item);
                        if (item === "Last 7 days" || item === "Last 30 days") setTimeframe("30d");
                        else if (item === "Last 90 days") setTimeframe("90d");
                        else setTimeframe("1y");
                        setDateDropdownOpen(false);
                      }}
                      style={{
                        padding: "8px 14px",
                        fontSize: "12.5px",
                        fontWeight: dateRange === item ? 700 : 500,
                        color: dateRange === item ? "#2563eb" : "#334155",
                        backgroundColor: dateRange === item ? "#eff6ff" : "transparent",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = dateRange === item ? "#eff6ff" : "transparent")
                      }
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => navigate("/app/reviews")}
              title="Notifications"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            {/* Admin Avatar Chip */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 10px 4px 5px",
                borderRadius: "20px",
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#334155",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  fontSize: "13px",
                }}
              >
                A
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>Admin</span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>▾</span>
            </div>
          </div>
        </header>

        {/* ======================================================== */}
        {/* ROW 1: 4 TOP KPI CARDS (MATCHING REFERENCE EXACTLY)      */}
        {/* ======================================================== */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
          }}
        >
          {/* Card 1: Total Reviews */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              minHeight: "150px",
            }}
          >
            <div>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2563eb",
                  marginBottom: "12px",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Total Reviews
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                {data.totalReviews}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginTop: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "12px",
                  color: data.isMonthlyPositive ? "#10b981" : "#64748b",
                  fontWeight: 600,
                }}
              >
                {data.isMonthlyPositive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                )}
                <span>{data.monthlyGrowthText}</span>
              </div>
              <div>
                <SparklineWave points={data.sparklines.total} color="#22c55e" />
              </div>
            </div>
          </div>

          {/* Card 2: Average Rating */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              minHeight: "150px",
            }}
          >
            <div>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d97706",
                  marginBottom: "12px",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Average Rating
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", lineHeight: 1.1 }}>
                <span style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a" }}>{data.averageRating}</span>
                <span style={{ color: "#f59e0b", fontSize: "18px", letterSpacing: "1.5px" }}>★★★★★</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginTop: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "12px",
                  color: data.isRatingPositive ? "#10b981" : "#64748b",
                  fontWeight: 600,
                }}
              >
                {data.isRatingPositive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                )}
                <span>{data.ratingDiffText}</span>
              </div>
              <div>
                <SparklineWave points={data.sparklines.rating} color="#f59e0b" />
              </div>
            </div>
          </div>

          {/* Card 3: Published Reviews */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              minHeight: "150px",
            }}
          >
            <div>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2563eb",
                  marginBottom: "12px",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Published Reviews
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                {data.publishedReviews} <span style={{ fontSize: "20px", color: "#94a3b8", fontWeight: 600 }}>/ {data.totalReviews}</span>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>
                {publishedPercentage}% published
              </div>
              {/* Full Width Blue Progress Bar */}
              <div style={{ width: "100%", height: "5px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${publishedPercentage}%`,
                    height: "100%",
                    backgroundColor: "#2563eb",
                    borderRadius: "3px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Pending Approval */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              minHeight: "150px",
            }}
          >
            <div>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "#f5f3ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9333ea",
                  marginBottom: "12px",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b", marginBottom: "4px" }}>
                Pending Approval
              </div>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                {data.pendingReviews}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setSourceFilter("all");
                  navigate("/app/reviews");
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#2563eb",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>View review queue</span>
                <span>→</span>
              </button>
              <div>
                <SparklineWave points={data.sparklines.pending} color="#c084fc" />
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* ROW 2 & 3: MAIN DUAL-COLUMN GRID (MATCHING REFERENCE)    */}
        {/* ======================================================== */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 290px",
            gap: "20px",
            alignItems: "start",
          }}
        >
          {/* LEFT SECTION (Review Performance, Sources, Rating Breakdown, Latest Reviews) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Top Sub-Row: Performance Chart (60%) & Reviews by Source (40%) */}
            <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: "20px" }}>
              {/* Review Performance Area Chart Card */}
              <div
                id="review-performance-card"
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "22px 24px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                      Review Performance
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "#64748b" }}>
                      Track your review activity and customer feedback over time.
                    </p>
                  </div>

                  {/* 30 days Dropdown button */}
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as any)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                    <option value="1y">1 year</option>
                  </select>
                </div>

                <ReviewPerformanceChart data={(data.chartData as any)[timeframe]} timeframe={timeframe} />
              </div>

              {/* Reviews by Source Donut Card */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "22px 24px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                  Reviews by Source
                </h2>
                <ReviewsBySourceDonut sources={data.sourcesBreakdown} total={data.totalReviews} />
              </div>
            </div>

            {/* Bottom Sub-Row: Rating Breakdown & Latest Reviews */}
            <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: "20px" }}>
              {/* Rating Breakdown Card */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "22px 20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <h2 style={{ margin: "0 0 18px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                  Rating Breakdown
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {data.starBreakdown.map((row: any) => (
                    <div key={row.stars} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "2px", width: "24px", fontWeight: 700, color: "#334155" }}>
                        <span>{row.stars}</span>
                        <span style={{ color: "#f59e0b", fontSize: "11px" }}>★</span>
                      </div>

                      {/* Horizontal Blue Bar */}
                      <div style={{ flex: 1, height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${row.percentage}%`,
                            height: "100%",
                            backgroundColor: "#2563eb",
                            borderRadius: "4px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>

                      <div style={{ width: "32px", textAlign: "right", fontWeight: 700, color: "#64748b", fontSize: "12px" }}>
                        {row.percentage}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest Reviews Card */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "22px 24px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  {/* Header & View All */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                      Latest Reviews
                    </h2>
                    <button
                      onClick={() => navigate("/app/reviews")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#2563eb",
                        cursor: "pointer",
                      }}
                    >
                      View all →
                    </button>
                  </div>

                  {/* Filter Tabs / Pills Matching Screenshot */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    {[
                      { key: "all", label: `All (${data.sourceCounts.all})` },
                      { key: "alibaba", label: `Alibaba (${data.sourceCounts.alibaba})` },
                      { key: "flipkart", label: `Flipkart (${data.sourceCounts.flipkart})` },
                      { key: "amazon", label: `Amazon (${data.sourceCounts.amazon})` },
                      { key: "ai_drafts", label: `AI Drafts (${data.sourceCounts.ai_drafts})` },
                    ].map((tab) => {
                      const isActive = sourceFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => {
                            setSourceFilter(tab.key);
                            setCurrentPage(1);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: isActive ? "#eff6ff" : "#f8fafc",
                            color: isActive ? "#2563eb" : "#64748b",
                            fontSize: "12.5px",
                            fontWeight: isActive ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Reviews Table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontSize: "12px", fontWeight: 600 }}>
                          <th style={{ padding: "8px 10px" }}>Reviewer</th>
                          <th style={{ padding: "8px 10px" }}>Rating</th>
                          <th style={{ padding: "8px 10px" }}>Review</th>
                          <th style={{ padding: "8px 10px" }}>Source</th>
                          <th style={{ padding: "8px 10px" }}>Status</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedReviews.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                              No reviews found in this filter.
                            </td>
                          </tr>
                        ) : (
                          paginatedReviews.map((r: any) => {
                            const isAmazon = (r.source || "").toUpperCase().includes("AMAZON");
                            const isFlipkart = (r.source || "").toUpperCase().includes("FLIPKART");
                            const isAlibaba = (r.source || "").toUpperCase().includes("ALIBABA");
                            const isAi = r.isAiGenerated || (r.source || "").toUpperCase().includes("AI");

                            const sourceLabel = isAmazon
                              ? "Amazon"
                              : isFlipkart
                              ? "Flipkart"
                              : isAlibaba
                              ? "Alibaba"
                              : isAi
                              ? "AI Drafts"
                              : "Store orders";

                            const sourceColor = isAmazon
                              ? "#f59e0b"
                              : isFlipkart
                              ? "#0284c7"
                              : isAlibaba
                              ? "#2563eb"
                              : isAi
                              ? "#9333ea"
                              : "#16a34a";

                            const initials = getInitials(r.reviewerName);

                            return (
                              <tr
                                key={r.id}
                                style={{
                                  borderBottom: "1px solid #f8fafc",
                                  transition: "background 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fcfdff")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                {/* Reviewer with Circular Avatar */}
                                <td style={{ padding: "10px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div
                                      style={{
                                        width: "28px",
                                        height: "28px",
                                        borderRadius: "50%",
                                        backgroundColor: "#f1f5f9",
                                        color: "#475569",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "11px",
                                        fontWeight: 800,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {initials}
                                    </div>
                                    <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                                      {r.reviewerName}
                                    </span>
                                  </div>
                                </td>

                                {/* Rating */}
                                <td style={{ padding: "10px", color: "#f59e0b", letterSpacing: "1px", whiteSpace: "nowrap" }}>
                                  {"★".repeat(r.rating || 5)}
                                </td>

                                {/* Review snippet */}
                                <td
                                  style={{
                                    padding: "10px",
                                    color: "#475569",
                                    maxWidth: "240px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={r.bodyShort}
                                >
                                  {r.bodyShort}
                                </td>

                                {/* Source */}
                                <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                                  <span style={{ color: sourceColor, fontWeight: 600, fontSize: "12.5px" }}>
                                    {sourceLabel}
                                  </span>
                                </td>

                                {/* Status */}
                                <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                                  <span
                                    style={{
                                      backgroundColor: r.isPublished ? "#ecfdf5" : "#fef3c7",
                                      color: r.isPublished ? "#10b981" : "#b45309",
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      fontSize: "11.5px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {r.isPublished ? "Published" : "Pending"}
                                  </span>
                                </td>

                                {/* Three dots Action Menu */}
                                <td style={{ padding: "10px", textAlign: "right", position: "relative" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenActionId(openActionId === r.id ? null : r.id);
                                    }}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: "4px 8px",
                                      cursor: "pointer",
                                      fontSize: "16px",
                                      color: "#64748b",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    ⋮
                                  </button>

                                  {openActionId === r.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: "100%",
                                        marginTop: "4px",
                                        backgroundColor: "#ffffff",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "8px",
                                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                                        zIndex: 30,
                                        minWidth: "140px",
                                        textAlign: "left",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <button
                                        onClick={() => handleTogglePublish(r.id)}
                                        style={{
                                          width: "100%",
                                          padding: "8px 12px",
                                          border: "none",
                                          background: "none",
                                          textAlign: "left",
                                          fontSize: "12.5px",
                                          fontWeight: 600,
                                          color: "#334155",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                      >
                                        {r.isPublished ? "Hide / Unpublish" : "Publish Review"}
                                      </button>
                                      <button
                                        onClick={() => handlePromptDeleteOne(r.id, r.reviewerName)}
                                        style={{
                                          width: "100%",
                                          padding: "8px 12px",
                                          border: "none",
                                          background: "none",
                                          textAlign: "left",
                                          fontSize: "12.5px",
                                          fontWeight: 600,
                                          color: "#ef4444",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fef2f2")}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                      >
                                        Delete Review
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Table Footer with Showing X-Y and Pagination Matching Screenshot */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "16px",
                    borderTop: "1px solid #f1f5f9",
                    marginTop: "12px",
                    fontSize: "12.5px",
                    color: "#94a3b8",
                  }}
                >
                  <div>
                    Showing{" "}
                    <strong style={{ color: "#334155" }}>
                      {totalReviewsCount > 0 ? `${startIndex + 1}-${endIndex}` : "0"}
                    </strong>{" "}
                    of <strong style={{ color: "#334155" }}>{totalReviewsCount}</strong> reviews
                  </div>

                  {/* Pagination Buttons: < 1 2 3 4 5 ... N > */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeCurrentPage <= 1}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        backgroundColor: "#ffffff",
                        color: safeCurrentPage <= 1 ? "#cbd5e1" : "#475569",
                        cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      ‹
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        return p === 1 || p === totalPages || (p >= safeCurrentPage - 2 && p <= safeCurrentPage + 2);
                      })
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsis = prev && p - prev > 1;
                        return (
                          <span key={p} style={{ display: "inline-flex", alignItems: "center" }}>
                            {showEllipsis && <span style={{ padding: "0 4px", color: "#94a3b8" }}>...</span>}
                            <button
                              onClick={() => setCurrentPage(p)}
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "6px",
                                border: safeCurrentPage === p ? "none" : "1px solid #e2e8f0",
                                backgroundColor: safeCurrentPage === p ? "#2563eb" : "#ffffff",
                                color: safeCurrentPage === p ? "#ffffff" : "#475569",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {p}
                            </button>
                          </span>
                        );
                      })}

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage >= totalPages}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        backgroundColor: "#ffffff",
                        color: safeCurrentPage >= totalPages ? "#cbd5e1" : "#475569",
                        cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (AI Assistant, Quick Actions, Setup Progress) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Card 1: AI Review Assistant */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div
                onClick={() => navigate("/app/ai-generator")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#7c3aed", fontSize: "16px" }}>✦</span>
                  <span style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a" }}>AI Review Assistant</span>
                </div>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}>›</span>
              </div>
              <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "#64748b", lineHeight: 1.4 }}>
                Let AI help you create, manage and optimize your reviews.
              </p>

              {/* Banner button: Generate review summary */}
              <div
                onClick={() => setAiSummaryModalOpen(true)}
                style={{
                  backgroundColor: "#f5f3ff",
                  border: "1px solid #ede9fe",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ede9fe")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f5f3ff")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#7c3aed", fontSize: "14px" }}>✦</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#6d28d9" }}>
                    Generate review summary
                  </span>
                </div>
                <span style={{ color: "#7c3aed", fontSize: "14px" }}>›</span>
              </div>
            </div>

            {/* Card 2: Quick Actions */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
                <span style={{ color: "#0f172a", fontSize: "14px" }}>⚡</span>
                <span style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a" }}>Quick Actions</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Action 1: View review queue */}
                <div
                  onClick={() => navigate("/app/reviews")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>View review queue</div>
                      <div style={{ fontSize: "11.5px", color: "#64748b" }}>Check pending reviews</div>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontSize: "14px" }}>›</span>
                </div>

                {/* Action 2: Manage widget */}
                <div
                  onClick={() => navigate("/app/widget-settings")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Manage widget</div>
                      <div style={{ fontSize: "11.5px", color: "#64748b" }}>Edit appearance & settings</div>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontSize: "14px" }}>›</span>
                </div>

                {/* Action 3: Import reviews */}
                <div
                  onClick={() => navigate("/app/import-reviews")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Import reviews</div>
                      <div style={{ fontSize: "11.5px", color: "#64748b" }}>Add marketplace reviews</div>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontSize: "14px" }}>›</span>
                </div>
              </div>
            </div>

            {/* Card 3: Setup Progress */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a" }}>Setup Progress</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  {data.checklist.completedCount} of {data.checklist.totalCount} completed
                </span>
              </div>

              {/* Checklist items */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                {data.checklist.items.map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(item.href)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      fontSize: "13px",
                      color: "#334155",
                      fontWeight: 500,
                    }}
                  >
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        backgroundColor: item.completed ? "#10b981" : "#e2e8f0",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </div>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>

              {/* View setup guide link button */}
              <button
                onClick={() => navigate("/app/widget-settings")}
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
              >
                <span>View setup guide</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* MODAL: UPGRADE TO PRO                                    */}
        {/* ======================================================== */}
        {proModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
            onClick={() => setProModalOpen(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                maxWidth: "500px",
                width: "100%",
                padding: "28px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "24px" }}>👑</span>
                <h3 style={{ margin: 0, fontSize: "19px", fontWeight: "800", color: "#0f172a" }}>
                  Upgrade to Pro Ecosystem
                </h3>
              </div>
              <p style={{ margin: "0 0 18px 0", fontSize: "13.5px", color: "#64748b", lineHeight: 1.5 }}>
                Get unlimited marketplace reviews import, automated Claude & Gemini review generation, real-time storefront syncing, and priority support.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "22px", fontSize: "13px", color: "#334155" }}>
                <div>✓ Unlimited review imports from Amazon, Flipkart & Alibaba</div>
                <div>✓ Multi-provider AI review generation (Claude 3.5 & Gemini 2.0)</div>
                <div>✓ Custom badge layouts & responsive carousel widgets</div>
                <div>✓ Direct SEO rich snippet integration</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => setProModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setProModalOpen(false);
                    navigate("/app/widget-settings");
                  }}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Explore Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL: AI REVIEW SUMMARY PREVIEW                         */}
        {/* ======================================================== */}
        {aiSummaryModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
            onClick={() => setAiSummaryModalOpen(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                maxWidth: "520px",
                width: "100%",
                padding: "26px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "20px", color: "#7c3aed" }}>✦</span>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
                  AI Review Sentiment Summary
                </h3>
              </div>
              <p style={{ margin: "0 0 16px 0", fontSize: "13.5px", color: "#64748b", lineHeight: 1.5 }}>
                Based on your {data.totalReviews} customer reviews across Alibaba, Flipkart, Amazon, and AI Drafts:
              </p>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  fontSize: "13px",
                  color: "#334155",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                  🌟 Overall Store Sentiment: Exceptional ({data.averageRating} ★)
                </div>
                <div>
                  • <strong>Product Quality:</strong> Customers frequently praise soft textures, high fabric density, and accurate sizing.
                </div>
                <div>
                  • <strong>Marketplace Trust:</strong> Verified imports from Alibaba and Amazon reinforce strong social proof.
                </div>
                <div>
                  • <strong>Publication Rate:</strong> {publishedPercentage}% of collected reviews are currently live on storefront.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => setAiSummaryModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setAiSummaryModalOpen(false);
                    navigate("/app/ai-generator");
                  }}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#7c3aed",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Launch AI Generator →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL: DELETE CONFIRMATION                               */}
        {/* ======================================================== */}
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
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
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
      </main>
    </div>
  );
}

// Error Boundary for resilient experience
export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "24px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
          border: "1px solid #e2e8f0",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "14px" }}>⚠️</div>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: "800", color: "#0f172a" }}>
          Dashboard Temporarily Unavailable
        </h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#64748b", lineHeight: 1.5 }}>
          {error instanceof Error ? error.message : "A momentary connection interruption occurred while loading dashboard data."}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload Dashboard
          </button>
          <button
            onClick={() => navigate("/app/reviews")}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#334155",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View Reviews
          </button>
        </div>
      </div>
    </div>
  );
}
