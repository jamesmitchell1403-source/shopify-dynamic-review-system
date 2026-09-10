import { json, LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
  const customerTagsParam = url.searchParams.get("customerTags");

  if (!productId) {
    return json({ reviews: [], settings: null, error: "Missing productId" }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Fetch shop settings
  const settings = shop
    ? await db.shopSettings.findUnique({ where: { shop } })
    : null;

  // Fetch published reviews for this product ID
  const rawId = productId.replace(/^gid:\/\/shopify\/Product\//, "");
  const fullGid = `gid://shopify/Product/${rawId}`;

  // PRIORITY 1: Fetch imported marketplace reviews for this product
  let marketplaceReviews = await db.review.findMany({
    where: {
      productId: { in: [fullGid, rawId] },
      isPublished: true,
      source: { in: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // PRIORITY 2: Fetch AI & Manual reviews for this product
  let otherReviews = await db.review.findMany({
    where: {
      productId: { in: [fullGid, rawId] },
      isPublished: true,
      source: { notIn: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let reviews = [...marketplaceReviews, ...otherReviews];

  // FALLBACK: If 0 reviews found for this specific product ID, fetch ANY top published reviews for the shop
  if (reviews.length === 0) {
    reviews = await db.review.findMany({
      where: {
        ...(shop ? { shop } : {}),
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
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
    return {
      id: r.id,
      reviewerName: r.reviewerName || "Verified Customer",
      rating: r.rating,
      bodyShort: r.bodyShort,
      bodyFull: r.bodyFull,
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
    position: settings?.widgetPosition || "bottom-left",
    layoutStyle: settings?.widgetLayoutStyle || "layout-1",
    delaySeconds: settings?.widgetDelaySeconds ?? 4,
    displayDuration: settings?.widgetDisplayDuration ?? 7,
    rotationInterval: settings?.widgetRotationInterval ?? 12,
    maxPerSession: settings?.widgetMaxPerSession ?? 10,
    enabled: settings?.widgetEnabled ?? true,
  };

  return json(
    {
      reviews: formattedReviews,
      settings: widgetConfig,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    }
  );
}
