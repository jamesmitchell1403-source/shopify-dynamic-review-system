import { json, LoaderFunctionArgs } from "@remix-run/node";
import db, { ensureTablesExist } from "../db.server";
import { getReviewerAvatarPhotoUrl } from "../services/ai/reviewGenerator";
import { getShopWhereClause } from "../services/shopDomain.server";
import { ensureReviewsAndSettingsRestored } from "../services/reviewPersistence.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const productHandle = url.searchParams.get("productHandle");
  const shopParam = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
  const customerTagsParam = url.searchParams.get("customerTags");

  if (shopParam) {
    try {
      await ensureReviewsAndSettingsRestored(null, shopParam);
    } catch (e) {
      console.warn("Storefront widget loader auto-restore warning:", e);
    }
  }

  if (!productId && !productHandle) {
    return json({ reviews: [], settings: null, error: "Missing productId or productHandle" }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Fetch shop settings with domain fallback
  let settings: any = null;
  if (shopParam) {
    settings = await db.shopSettings.findFirst({
      where: getShopWhereClause(shopParam),
      orderBy: { updatedAt: "desc" },
    }).catch(() => null);
  }
  if (!settings) {
    settings = await db.shopSettings.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);
  }

  const rawPosition = settings?.widgetPosition || "bottom-left";
  const rawStyle = settings?.widgetLayoutStyle || "layout-1";
  const layoutStyle = rawStyle.startsWith("layout-") ? rawStyle : `layout-${rawStyle}`;

  const widgetConfig = {
    position: rawPosition === "bottom-right" ? "bottom-left" : rawPosition,
    layoutStyle: layoutStyle,
    delaySeconds: settings?.widgetDelaySeconds ?? 1,
    displayDuration: settings?.widgetDisplayDuration ?? 10,
    rotationInterval: settings?.widgetRotationInterval ?? 2,
    maxPerSession: settings?.widgetMaxPerSession ?? 20,
    enabled: settings?.widgetEnabled ?? true,
  };

  // Build shop domain filter clause
  const shopWhereClause = getShopWhereClause(shopParam || "");

  // Fetch published reviews strictly for this shop & product
  const rawId = productId ? String(productId).replace(/^gid:\/\/shopify\/Product\//, "").trim() : "";
  const fullGid = rawId ? `gid://shopify/Product/${rawId}` : "";
  const cleanHandle = productHandle && productHandle !== "all" ? String(productHandle).trim() : "";

  const whereProductMatch: any[] = [];
  if (rawId && rawId !== "all") {
    whereProductMatch.push({ productId: fullGid });
    whereProductMatch.push({ productId: rawId });
    whereProductMatch.push({ productHandle: rawId });
  }
  if (cleanHandle) {
    whereProductMatch.push({ productHandle: cleanHandle });
    whereProductMatch.push({ productId: cleanHandle });
  }

  const isAllProductsRequest = (productId === "all" || productHandle === "all");

  let productReviews: any[] = [];
  const baseWhere: any = {
    isPublished: true,
    ...shopWhereClause,
  };

  if (isAllProductsRequest) {
    productReviews = await db.review.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } else if (whereProductMatch.length > 0) {
    // Strictly filter by specific product ID or product Handle for this product page ONLY
    productReviews = await db.review.findMany({
      where: {
        AND: [
          baseWhere,
          { OR: whereProductMatch },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  const safeProductReviews = productReviews.filter((r) => r.isPublished);

  let reviewsToReturn: any[] = [];
  let totalCount = 0;
  let averageRating = "0.0";

  if (safeProductReviews.length > 0) {
    reviewsToReturn = safeProductReviews;
    totalCount = safeProductReviews.length;
    const sumRating = safeProductReviews.reduce((sum, r) => sum + (r.rating || 5), 0);
    averageRating = (sumRating / totalCount).toFixed(1);
  } else {
    // If shop genuinely has 0 published reviews -> return empty array
    return json(
      {
        reviews: [],
        settings: widgetConfig,
        averageRating: "0.0",
        totalCount: 0,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  }

  // Parsing customer tags if available
  let customerTags: string[] = [];
  if (customerTagsParam) {
    try {
      customerTags = JSON.parse(customerTagsParam);
    } catch {
      customerTags = customerTagsParam.split(",").map((t) => t.trim());
    }
  }

  const formattedReviews = reviewsToReturn.map((r) => {
    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(r.tags);
    } catch {
      parsedTags = [];
    }

    const isValidUrl = (url: any) =>
      typeof url === "string" &&
      url.trim().length > 5 &&
      (url.trim().startsWith("http") ||
        url.trim().startsWith("data:") ||
        url.trim().startsWith("//") ||
        url.trim().startsWith("/"));

    return {
      id: r.id,
      reviewerName: r.reviewerName || "Verified Customer",
      rating: r.rating || 5,
      bodyShort: r.bodyShort || "",
      bodyFull: r.bodyFull || "",
      isVerifiedPurchase: r.isVerifiedPurchase,
      source: r.source || "MANUAL",
      externalUrl: r.externalUrl || null,
      imageUrl: isValidUrl(r.imageUrl) ? r.imageUrl : null,
      avatarUrl: isValidUrl(r.avatarUrl) ? r.avatarUrl : getReviewerAvatarPhotoUrl(r.reviewerName || "Verified Customer"),
      videoUrl: isValidUrl(r.videoUrl) ? r.videoUrl : null,
      tags: parsedTags,
    };
  });

  // Sort by customer tag matches if available
  if (customerTags.length > 0) {
    formattedReviews.sort((a, b) => {
      const aMatches = a.tags.filter((t) => customerTags.includes(t)).length;
      const bMatches = b.tags.filter((t) => customerTags.includes(t)).length;
      return bMatches - aMatches;
    });
  }

  return json(
    {
      reviews: formattedReviews,
      settings: widgetConfig,
      averageRating,
      totalCount,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
