import { json, LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { ensureReviewsAndSettingsRestored } from "../services/reviewPersistence.server";
import { getAmazonReviewStylePhotoUrl, getReviewerAvatarPhotoUrl } from "../services/ai/reviewGenerator";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const productHandle = url.searchParams.get("productHandle");
  const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
  const customerTagsParam = url.searchParams.get("customerTags");

  if (!productId && !productHandle) {
    return json({ reviews: [], settings: null, error: "Missing productId or productHandle" }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (shop) {
    try {
      await ensureReviewsAndSettingsRestored(null, shop);
    } catch (e) {
      console.warn("Storefront widget review restore warning:", e);
    }
  }

  // Fetch shop settings
  const settings = shop
    ? await db.shopSettings.findUnique({ where: { shop } })
    : null;

  // Fetch published reviews for this product ID or handle
  const rawId = productId ? productId.replace(/^gid:\/\/shopify\/Product\//, "") : "";
  const fullGid = rawId ? `gid://shopify/Product/${rawId}` : "";

  const whereProductMatch: any[] = [];
  if (rawId && rawId !== "all") {
    whereProductMatch.push({ productId: { in: [fullGid, rawId] } });
    whereProductMatch.push({ productHandle: rawId });
  }
  if (productHandle && productHandle !== "all") {
    whereProductMatch.push({ productHandle: productHandle });
    whereProductMatch.push({ productId: productHandle });
  }

  const isAllProductsRequest = (productId === "all" || productHandle === "all");

  let productReviews: any[] = [];
  if (isAllProductsRequest) {
    productReviews = await db.review.findMany({
      where: {
        ...(shop ? { shop } : {}),
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } else {
    productReviews = await db.review.findMany({
      where: {
        ...(shop ? { shop } : {}),
        isPublished: true,
        ...(whereProductMatch.length > 0 ? { OR: whereProductMatch } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Fall back to shop's overall published reviews if product-specific reviews are 0
    if (productReviews.length === 0) {
      productReviews = await db.review.findMany({
        where: {
          ...(shop ? { shop } : {}),
          isPublished: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
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
    // Product has 0 reviews for this shop -> Return 0 reviews, 0 count, no popup cards!
    reviewsToReturn = [];
    totalCount = 0;
    averageRating = "0.0";
  }

  // Parsing customer tags if available (Module D Personalization)
  let customerTags: string[] = [];
  if (customerTagsParam) {
    try {
      customerTags = JSON.parse(customerTagsParam);
    } catch {
      customerTags = customerTagsParam.split(",").map((t) => t.trim());
    }
  }

  const rawPosition = settings?.widgetPosition || "bottom-left";
  const widgetConfig = {
    position: rawPosition === "bottom-right" ? "bottom-left" : rawPosition,
    layoutStyle: settings?.widgetLayoutStyle || "layout-1",
    delaySeconds: settings?.widgetDelaySeconds ?? 1,
    displayDuration: settings?.widgetDisplayDuration ?? 10,
    rotationInterval: settings?.widgetRotationInterval ?? 2,
    maxPerSession: settings?.widgetMaxPerSession ?? 20,
    enabled: settings?.widgetEnabled ?? true,
  };

  const formattedReviews = reviewsToReturn.map((r, idx) => {
    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(r.tags);
    } catch {
      parsedTags = [];
    }

    let bodyShort = r.bodyShort || "";
    let bodyFull = r.bodyFull || "";

    // Self-healing check for legacy DB records that were generated with repetitive clothing templates ("super comfortable for daily wear")
    const isDailyWear = /is super comfortable for daily wear|comfortable for daily wear|relaxed cut for daily wear/gi.test(bodyShort + " " + bodyFull);
    
    if (isDailyWear) {
      const text = (bodyShort + " " + bodyFull).toLowerCase();
      const isBedding = text.includes("thread count") || text.includes("sheet") || text.includes("pillow") || text.includes("bed");
      const isTowels = text.includes("towel") || text.includes("washcloth") || text.includes("bath") || text.includes("cotton towel");

      if (isBedding) {
        bodyShort = bodyShort.replace(/is super comfortable for daily wear.*/gi, "feels silky smooth, highly breathable, and cool for night sleeping.");
        bodyFull = bodyFull.replace(/is super comfortable for daily wear.*/gi, "The weave feels crisp and luxurious against skin, and deep corners fit our mattress securely.");
      } else if (isTowels) {
        bodyShort = bodyShort.replace(/is super comfortable for daily wear.*/gi, "is super absorbent, thick, plush, and quick-drying!");
        bodyFull = bodyFull.replace(/is super comfortable for daily wear.*/gi, "These towels absorb moisture instantly, feel plush against skin, and dry fast on the towel bar.");
      }

      // Asynchronously heal database record
      db.review.update({
        where: { id: r.id },
        data: { bodyShort, bodyFull }
      }).catch(() => {});
    }

    let imageUrl = r.imageUrl;

    // Self-healing: Ensure EVERY review returned has a valid product-specific Amazon customer review photo URL if imageUrl is missing
    if (!imageUrl && (r.isAiGenerated || widgetConfig.layoutStyle === "layout-1" || widgetConfig.layoutStyle === "layout-2")) {
      const prodName = productHandle || r.productHandle || rawId || r.productId || "Product";
      imageUrl = getAmazonReviewStylePhotoUrl(prodName, r.id || idx, bodyShort);
    }

    const avatarUrl = r.avatarUrl || getReviewerAvatarPhotoUrl(r.reviewerName || "Verified Customer");

    return {
      id: r.id,
      reviewerName: r.reviewerName || "Verified Customer",
      rating: r.rating,
      bodyShort,
      bodyFull,
      isVerifiedPurchase: r.isVerifiedPurchase,
      source: r.source,
      externalUrl: r.externalUrl || null,
      imageUrl: imageUrl || null,
      avatarUrl: avatarUrl,
      videoUrl: r.videoUrl || null,
      tags: parsedTags,
    };
  });

  // Sort within priority tiers if customer tags exist
  if (customerTags.length > 0) {
    formattedReviews.sort((a, b) => {
      const aIsMarketplace = a.source.startsWith("IMPORTED");
      const bIsMarketplace = b.source.startsWith("IMPORTED");
      if (aIsMarketplace && !bIsMarketplace) return -1;
      if (!aIsMarketplace && bIsMarketplace) return 1;

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
