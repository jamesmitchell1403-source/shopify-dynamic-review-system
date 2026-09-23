import { json, LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { ensureReviewsAndSettingsRestored } from "../services/reviewPersistence.server";

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

  // PRIORITY 1: Fetch product-specific published reviews with shop filter
  let productReviews = await db.review.findMany({
    where: {
      ...(shop ? { shop } : {}),
      isPublished: true,
      ...(whereProductMatch.length > 0 ? { OR: whereProductMatch } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // PRIORITY 1b: If 0 found for shop, try product-specific matching across all shops in DB
  if (productReviews.length === 0 && whereProductMatch.length > 0) {
    productReviews = await db.review.findMany({
      where: {
        isPublished: true,
        OR: whereProductMatch,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  let reviews = [...productReviews];

  // FALLBACK: If 0 reviews found for this specific product ID, fetch top published reviews for shop (or global)
  let isFallback = false;
  if (reviews.length === 0) {
    isFallback = true;
    reviews = await db.review.findMany({
      where: {
        ...(shop ? { shop } : {}),
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (reviews.length === 0) {
      reviews = await db.review.findMany({
        where: {
          isPublished: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }
  }

  const safeReviews = reviews.filter((r) => r.isPublished);

  // Parsing customer tags if available (Module D Personalization)
  let customerTags: string[] = [];
  if (customerTagsParam) {
    try {
      customerTags = JSON.parse(customerTagsParam);
    } catch {
      customerTags = customerTagsParam.split(",").map((t) => t.trim());
    }
  }

  const formattedReviews = safeReviews.map((r) => {
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

    return {
      id: r.id,
      reviewerName: r.reviewerName || "Verified Customer",
      rating: r.rating,
      bodyShort,
      bodyFull,
      isVerifiedPurchase: r.isVerifiedPurchase,
      source: r.source,
      externalUrl: r.externalUrl || null,
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

  const widgetConfig = {
    position: settings?.widgetPosition || "bottom-right",
    layoutStyle: settings?.widgetLayoutStyle || "layout-1",
    delaySeconds: settings?.widgetDelaySeconds ?? 1,
    displayDuration: settings?.widgetDisplayDuration ?? 10,
    rotationInterval: settings?.widgetRotationInterval ?? 2,
    maxPerSession: settings?.widgetMaxPerSession ?? 20,
    enabled: settings?.widgetEnabled ?? true,
  };

  const totalCount = safeReviews.length;
  const sumRating = safeReviews.reduce((sum, r) => sum + (r.rating || 5), 0);
  const averageRating = totalCount > 0 ? (sumRating / totalCount).toFixed(1) : "5.0";

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
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    }
  );
}
