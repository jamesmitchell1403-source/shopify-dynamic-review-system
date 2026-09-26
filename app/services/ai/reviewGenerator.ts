import { ClaudeProvider } from "./providers/claudeProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { OpenAIProvider } from "./providers/openaiProvider";
import { AIProvider, GeneratedReview, ReviewGenInput } from "./AIProvider";
import { getShopAIConfig } from "./config";

export async function generateReviewsForShop(
  shopDomain: string,
  input: ReviewGenInput,
  preferredProvider?: "claude" | "gemini" | "openai"
): Promise<{ reviews: GeneratedReview[]; providerUsed: string; modelUsed: string }> {
  const config = await getShopAIConfig(shopDomain);
  const activeProvider = preferredProvider || config.defaultProvider;

  const claude = new ClaudeProvider();
  const gemini = new GeminiProvider();
  const openai = new OpenAIProvider();

  let primary: AIProvider = claude;
  let primaryKey = config.anthropicApiKey;

  if (activeProvider === "gemini") {
    primary = gemini;
    primaryKey = config.geminiApiKey;
  } else if (activeProvider === "openai") {
    primary = openai;
    primaryKey = config.openaiApiKey;
  }

  // Find fallback key & provider
  let secondary: AIProvider | null = null;
  let secondaryKey: string | undefined = undefined;

  if (activeProvider !== "gemini" && config.geminiApiKey) {
    secondary = gemini;
    secondaryKey = config.geminiApiKey;
  } else if (activeProvider !== "claude" && config.anthropicApiKey) {
    secondary = claude;
    secondaryKey = config.anthropicApiKey;
  } else if (activeProvider !== "openai" && config.openaiApiKey) {
    secondary = openai;
    secondaryKey = config.openaiApiKey;
  }

  const getModelName = (prov: string) => {
    if (prov === "claude") return "claude-3-5-sonnet-20241022";
    if (prov === "gemini") return "gemini-2.5-flash";
    if (prov === "openai") return "gpt-4o-mini";
    return "Template Engine v1";
  };

  try {
    if (!primaryKey) {
      throw new Error(`Selected AI Provider (${activeProvider.toUpperCase()}) does not have an API key configured in AI Settings. Please add a valid API key to enable review generation.`);
    }

    const reviews = await primary.generateReviews(input, primaryKey);
    return {
      reviews: validateAndPostProcessReviews(reviews, input),
      providerUsed: primary.providerName,
      modelUsed: getModelName(primary.providerName),
    };
  } catch (primaryError: any) {
    console.warn(`Primary AI Provider (${primary.providerName}) failed: ${primaryError?.message}. Attempting fallback...`);

    // Try fallback
    if (secondary && secondaryKey) {
      try {
        const fallbackReviews = await secondary.generateReviews(input, secondaryKey);
        return {
          reviews: validateAndPostProcessReviews(fallbackReviews, input),
          providerUsed: secondary.providerName,
          modelUsed: getModelName(secondary.providerName),
        };
      } catch (secondaryError: any) {
        console.warn(`Fallback AI Provider (${secondary.providerName}) also failed: ${secondaryError?.message}. Using Smart Template Engine fallback...`);
      }
    }

    // Fallback to smart demo generator if API key error occurs
    const demoReviews = generateSmartDemoReviews(input);
    return {
      reviews: validateAndPostProcessReviews(demoReviews, input),
      providerUsed: `Smart Demo Engine (${primary.providerName} key error)`,
      modelUsed: "Template Engine v1",
    };
  }
}

function generateSmartDemoReviews(input: ReviewGenInput): GeneratedReview[] {
  const description = (input.description || "").trim();
  const notes = (input.notes || "").trim();
  const text = (description + " " + notes).toLowerCase();

  // Extract title
  const titleMatch = notes.match(/Product Title:\s*([^.]+)/i);
  const productName = titleMatch
    ? titleMatch[1].trim()
    : description.split(/\s+/).slice(0, 4).join(" ") || "this item";

  const shortName = productName.split(/\s+/).slice(0, 3).join(" ");
  const targetCount = input.count || 5;

  // Accurate Category Keyword Detection
  const isBedding = text.includes("sheet") || text.includes("pillowcase") || text.includes("duvet") || text.includes("comforter") || text.includes("thread count") || text.includes("bedding") || text.includes("bed ");
  const isTowels = text.includes("towel") || text.includes("washcloth") || text.includes("bath") || text.includes("shower") || text.includes("robe");
  const isBeauty = text.includes("skin") || text.includes("cream") || text.includes("serum") || text.includes("lotion") || text.includes("cleanser") || text.includes("moisturizer");
  const isClothing = (text.includes("hoodie") || text.includes("sweatpants") || text.includes("shirt") || text.includes("jacket") || text.includes("pant") || text.includes("suit") || text.includes("dress") || text.includes("wear")) && !isBedding && !isTowels;
  const isWax = text.includes("wax") || text.includes("tuning") || text.includes("glide") || text.includes("snowboard") || text.includes("ski");

  // Derive a numeric seed from productName to ensure review variety across products
  const seed = productName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const DIVERSE_NAMES = [
    "Rachel Vance", "David Kim", "Priya Sharma", "Sophia Martinez", "Liam Howard",
    "Jessica Patel", "Alex Rivera", "Emily Clarke", "Brandon Miller", "Carlos Mendez",
    "Hannah Wright", "Tyler Sanders", "Chloe Dupont", "Ethan Brooks", "Elena Rostova",
    "Daniel Smith", "Kavya Menon", "Justin Blake", "Amanda Foster", "Marcus Thorne",
    "Michael Chang", "Sarah Jenkins", "Olivia Taylor", "Noah Wilson", "Isabelle Chen",
    "Lucas Meyer", "Zoe Bennett", "Amir Khan", "Nina Rossi", "Julian Vance"
  ];

  let reviewTemplates: Array<{ rating: number; bodyShort: string; bodyFull: string; tags: string[] }> = [];

  if (isBedding) {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} feels silky smooth, highly breathable, and cool for night sleeping.`,
        bodyFull: `I bought ${shortName} recently and the quality surprised me. The weave feels crisp and luxurious against skin, deep corners fit our mattress securely, and it washed cleanly without pilling.`,
        tags: ["silky-smooth", "breathable", "deep-pockets"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} retains its soft texture and cool feel night after night.`,
        bodyFull: `Sleeping on ${shortName} feels like a high-end hotel experience. The fabric is light, breathable, doesn't trap body heat, and stays soft after multiple wash cycles.`,
        tags: ["hotel-quality", "cool-sleeping", "soft-linen"],
      },
      {
        rating: 4,
        bodyShort: `Generous sizing, neat corner elastic, and smooth finish on ${shortName}.`,
        bodyFull: `${shortName} fits snug around the corners without slipping off overnight. Material weight is comfortable and feels durable for everyday home use.`,
        tags: ["great-fit", "durable-fabric", "neat-stitching"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} washed remarkably well with zero shrinkage or fraying.`,
        bodyFull: `Ran ${shortName} through the laundry twice already. Still feels soft, smooth, and crisp on the bed. A very practical and comfortable bedding choice.`,
        tags: ["wash-resilient", "zero-shrinkage", "crisp-finish"],
      },
      {
        rating: 5,
        bodyShort: `Extremely comfortable weave and luxury feel for ${shortName}.`,
        bodyFull: `Upgraded our main bedroom set to ${shortName} and could not be happier. The texture is smooth, cozy, and perfect for all seasons.`,
        tags: ["luxury-weave", "all-season", "cozy-touch"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} has a soft sateen touch that makes sleeping peaceful.`,
        bodyFull: `The fabric quality on ${shortName} is top notch. It doesn't wrinkle easily and keeps temperature regulated all night long.`,
        tags: ["sateen-touch", "temperature-control", "wrinkle-resistant"],
      },
      {
        rating: 4,
        bodyShort: `Smooth weave and accurate color matching on ${shortName}.`,
        bodyFull: `${shortName} arrived quickly and packaging was pristine. Color matches online images perfectly and texture feels premium.`,
        tags: ["accurate-color", "fast-shipping", "pristine-packaging"],
      }
    ];
  } else if (isTowels) {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} is super absorbent, thick, plush, and quick-drying!`,
        bodyFull: `These towels are fantastic after a shower. ${shortName} absorbs moisture instantly, feels plush against skin, and dries quickly on the towel bar.`,
        tags: ["super-absorbent", "plush-loops", "quick-drying"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} held its fluffiness and rich color after washing.`,
        bodyFull: `Washed ${shortName} before first use and there was minimal lint. The cotton set feels dense, soft, durable, and looks great hanging in our bathroom.`,
        tags: ["lint-free", "durable-cotton", "rich-color"],
      },
      {
        rating: 4,
        bodyShort: `Generous set size and soft absorbency with ${shortName}.`,
        bodyFull: `The water absorption on ${shortName} is great right out of the package. Solid GSM thickness without feeling overly heavy when wet.`,
        tags: ["great-absorption", "soft-touch", "solid-thickness"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} brings a refreshing spa-like feel to daily bath routines.`,
        bodyFull: `Bought ${shortName} as a bathroom refresh. The cotton texture is gentle on skin, dries you off in seconds, and holds shape wash after wash.`,
        tags: ["spa-quality", "gentle-on-skin", "shape-retention"],
      },
      {
        rating: 5,
        bodyShort: `Thick quality weave on ${shortName} with sturdy reinforced edges.`,
        bodyFull: `${shortName} exceeded expectations. Hemming along the edges is neat and sturdy. Highly recommend if you want durable bath towels.`,
        tags: ["neat-hemming", "long-lasting", "dense-weave"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} stays soft without scratchiness even after line drying.`,
        bodyFull: `Impressed by how soft ${shortName} remains after laundering. Dries fast and feels gentle on sensitive skin.`,
        tags: ["soft-laundering", "fast-drying", "gentle-skin"],
      }
    ];
  } else if (isBeauty) {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} absorbs quickly and leaves skin hydrated without grease.`,
        bodyFull: `Been using ${shortName} daily. Skin feels noticeably softer and hydrated without feeling heavy or oily. Very gentle formula.`,
        tags: ["hydrating", "non-greasy", "gentle-formula"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} is gentle on sensitive skin with visible smoothness.`,
        bodyFull: `I have sensitive skin but ${shortName} caused zero irritation. Very soothing texture and subtle pleasant scent.`,
        tags: ["sensitive-skin-safe", "soothing", "subtle-scent"],
      },
      {
        rating: 4,
        bodyShort: `Noticeable improvement in skin texture using ${shortName}.`,
        bodyFull: `Saw positive results after 4-5 days using ${shortName} consistently. Will definitely keep this in my daily skincare routine.`,
        tags: ["effective", "daily-routine", "smooth-skin"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} is lightweight, effective, and long-lasting.`,
        bodyFull: `${shortName} is one of the best skincare purchases I've made this year. Lightweight, effective, and generous bottle quantity.`,
        tags: ["lightweight", "great-value", "long-lasting"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} gives skin an instant natural, healthy glow.`,
        bodyFull: `Packaging was pristine. ${shortName} feels so luxurious on application. Couldn't be happier with this purchase!`,
        tags: ["luxurious", "pristine-packaging", "natural-glow"],
      }
    ];
  } else if (isClothing) {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} fits true to size with soft, durable fabric.`,
        bodyFull: `I was skeptical buying online, but ${shortName} blew me away. Super soft material, durable stitching, and it washed well without shrinking.`,
        tags: ["true-to-size", "soft-fabric", "no-shrinkage"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} has a clean, relaxed cut for daily wear.`,
        bodyFull: `Wore ${shortName} all day. Incredibly comfortable, lightweight, and looks even better in person. Shipped fast too!`,
        tags: ["comfortable-fit", "stylish-cut", "lightweight"],
      },
      {
        rating: 4,
        bodyShort: `${shortName} is well tailored and color matches photos accurately.`,
        bodyFull: `${shortName} arrived in 3 days. Quality is really good for the price point. Color is spot-on. Would order again.`,
        tags: ["accurate-color", "fast-shipping", "tailored-fit"],
      },
      {
        rating: 5,
        bodyShort: `Receiving compliments whenever wearing ${shortName}!`,
        bodyFull: `Got compliments wearing ${shortName}. Feels premium, durable, and holds shape after washing.`,
        tags: ["premium-feel", "durable", "shape-holding"],
      },
      {
        rating: 5,
        bodyShort: `Neat stitching and great quality material on ${shortName}.`,
        bodyFull: `Bought ${shortName} as a gift and ended up buying one for myself too. High quality stitching and lovely packaging.`,
        tags: ["neat-stitching", "great-gift", "quality-cotton"],
      }
    ];
  } else if (isWax) {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} made gliding noticeably smoother across all snow conditions.`,
        bodyFull: `Applied ${shortName} before my weekend session. Application was smooth and easy, and the glide performance was fantastic all day long!`,
        tags: ["smooth-glide", "easy-application", "snow-performance"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} keeps bases protected and fast all season.`,
        bodyFull: `${shortName} keeps my bases protected, hydrated, and fast all season. Super reliable for varied temperatures.`,
        tags: ["base-protection", "all-temp", "fast-glide"],
      },
      {
        rating: 4,
        bodyShort: `${shortName} is a solid everyday glide wax for gear tuning.`,
        bodyFull: `${shortName} holds up well for multiple runs. Great value and easy maintenance. Would definitely buy again.`,
        tags: ["great-value", "long-lasting", "easy-maintenance"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} gives a noticeable boost in glide speed.`,
        bodyFull: `${shortName} gives a noticeable boost in speed and reduces base drag completely. Will keep handy all season.`,
        tags: ["glide-speed", "smooth-ride", "zero-drag"],
      }
    ];
  } else {
    reviewTemplates = [
      {
        rating: 5,
        bodyShort: `${shortName} — practical design, solid build, and fast delivery!`,
        bodyFull: `Impressed with ${shortName} right out of the box. Arrived earlier than expected and works exactly as advertised.`,
        tags: ["fast-shipping", "solid-build", "as-described"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} exceeded expectations with quality materials throughout.`,
        bodyFull: `I bought ${shortName} based on product specifications and it lived up to expectations! Solid materials, easy to use, great value.`,
        tags: ["great-value", "easy-to-use", "quality-materials"],
      },
      {
        rating: 4,
        bodyShort: `Very satisfied with ${shortName}. Well packaged and reliable finish.`,
        bodyFull: `${shortName} was well packaged and arrived in perfect condition. Practical, well-designed, and sturdy finish.`,
        tags: ["well-packaged", "practical-design", "sturdy-finish"],
      },
      {
        rating: 5,
        bodyShort: `${shortName} performs reliably for everyday store standards.`,
        bodyFull: `Have been using ${shortName} for a few weeks now. Reliable performance and excellent quality for the price.`,
        tags: ["reliable", "quality-finish", "daily-use"],
      },
      {
        rating: 5,
        bodyShort: `Sturdy construction and great overall user experience on ${shortName}.`,
        bodyFull: `Super happy with my ${shortName} order. Beautiful finish, sturdy feel, and great user experience.`,
        tags: ["sturdy-feel", "recommended", "beautiful-finish"],
      }
    ];
  }

  let reviews: GeneratedReview[] = [];
  for (let i = 0; i < targetCount; i++) {
    const templateIdx = (seed + i) % reviewTemplates.length;
    const base = reviewTemplates[templateIdx];
    const uniqueName = DIVERSE_NAMES[(seed * 7 + i * 3) % DIVERSE_NAMES.length];

    reviews.push({
      reviewerName: uniqueName,
      rating: base.rating,
      bodyShort: base.bodyShort,
      bodyFull: base.bodyFull,
      tags: base.tags,
    });
  }

  return reviews.slice(0, targetCount);
}

const BANNED_CLICHES = [
  "amazing product",
  "absolutely love it",
  "highly recommended",
  "perfect quality",
  "best purchase ever",
  "great product, highly recommended",
  "excellent quality. love it",
  "very happy with my purchase",
];

const DIVERSE_NAME_POOL = [
  "Rachel Vance", "David Kim", "Priya Sharma", "Sophia Martinez", "Liam Howard",
  "Jessica Patel", "Alex Rivera", "Emily Clarke", "Brandon Miller", "Carlos Mendez",
  "Hannah Wright", "Tyler Sanders", "Chloe Dupont", "Ethan Brooks", "Elena Rostova",
  "Daniel Smith", "Kavya Menon", "Justin Blake", "Amanda Foster", "Marcus Thorne",
  "Michael Chang", "Sarah Jenkins", "Olivia Taylor", "Noah Wilson", "Isabelle Chen"
];

const REAL_HUMAN_CLOTHING_PHOTOS = [
  "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=800&q=80"
];

const REAL_HUMAN_BEAUTY_PHOTOS = [
  "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1608248597261-833258657640?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80"
];

const REAL_HUMAN_BEDDING_PHOTOS = [
  "https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80"
];

const REAL_HUMAN_TOWELS_PHOTOS = [
  "https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1563298723-dcfebaa392e3?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80"
];

const REAL_HUMAN_GENERAL_PHOTOS = [
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80"
];

export function getAmazonReviewStylePhotoUrl(
  productName: string,
  seedInput: string | number,
  contextText: string = ""
): string {
  const combinedText = (productName + " " + contextText).toLowerCase();

  const isBedding = combinedText.includes("sheet") || combinedText.includes("pillowcase") || combinedText.includes("duvet") || combinedText.includes("comforter") || combinedText.includes("thread count") || combinedText.includes("bedding") || combinedText.includes("bed ");
  const isTowels = combinedText.includes("towel") || combinedText.includes("washcloth") || combinedText.includes("bath") || combinedText.includes("shower") || combinedText.includes("robe");
  const isBeauty = combinedText.includes("skin") || combinedText.includes("cream") || combinedText.includes("serum") || combinedText.includes("lotion") || combinedText.includes("cleanser") || combinedText.includes("moisturizer") || combinedText.includes("cosmetic");
  const isClothing = (combinedText.includes("hoodie") || combinedText.includes("sweatpants") || combinedText.includes("shirt") || combinedText.includes("jacket") || combinedText.includes("pant") || combinedText.includes("suit") || combinedText.includes("dress") || combinedText.includes("wear") || combinedText.includes("shoe") || combinedText.includes("sneaker") || combinedText.includes("apparel") || combinedText.includes("coat") || combinedText.includes("top")) && !isBedding && !isTowels;

  const cleanName = productName
    .replace(/^gid:\/\/shopify\/Product\//, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim() || "item";

  const numSeed = typeof seedInput === "number"
    ? Math.abs(seedInput)
    : Math.abs(String(seedInput).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));

  let pool = REAL_HUMAN_GENERAL_PHOTOS;
  if (isClothing) {
    pool = REAL_HUMAN_CLOTHING_PHOTOS;
  } else if (isBeauty) {
    pool = REAL_HUMAN_BEAUTY_PHOTOS;
  } else if (isBedding) {
    pool = REAL_HUMAN_BEDDING_PHOTOS;
  } else if (isTowels) {
    pool = REAL_HUMAN_TOWELS_PHOTOS;
  }

  const selectedPhoto = pool[numSeed % pool.length];
  return `${selectedPhoto}&prod=${encodeURIComponent(cleanName)}&sig=${numSeed}`;
}

const CATEGORY_MEDIA = {
  bedding: {
    videos: [
      "https://assets.mixkit.co/videos/preview/mixkit-cozy-bedroom-with-made-bed-42880-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-hands-folding-a-soft-towel-or-sheet-42879-large.mp4"
    ]
  },
  towels: {
    videos: [
      "https://assets.mixkit.co/videos/preview/mixkit-hands-folding-a-soft-towel-or-sheet-42879-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-clean-bathroom-with-towels-and-amenities-41566-large.mp4"
    ]
  },
  beauty: {
    videos: [
      "https://assets.mixkit.co/videos/preview/mixkit-woman-applying-facial-cream-in-front-of-mirror-42878-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-dropper-putting-serum-on-hand-42877-large.mp4"
    ]
  },
  clothing: {
    videos: [
      "https://assets.mixkit.co/videos/preview/mixkit-model-showing-stylish-jacket-and-outfit-42876-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-close-up-of-fabric-texture-42875-large.mp4"
    ]
  },
  general: {
    videos: [
      "https://assets.mixkit.co/videos/preview/mixkit-hands-holding-and-showing-a-new-product-box-42874-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-close-up-unboxing-of-a-product-42873-large.mp4"
    ]
  }
};

function validateAndPostProcessReviews(
  reviews: GeneratedReview[],
  input: ReviewGenInput
): GeneratedReview[] {
  const reqCount = input.count || reviews.length || 5;
  const usedNames = new Set<string>();
  const usedShorts = new Set<string>();
  const validated: GeneratedReview[] = [];

  // Extract product title / short name for product-specific grounding check
  const titleMatch = (input.notes || "").match(/Product Title:\s*([^.]+)/i);
  const productName = titleMatch
    ? titleMatch[1].trim()
    : (input.description || "").split(/\s+/).slice(0, 4).join(" ") || "this item";
  const shortName = productName.split(/\s+/).slice(0, 3).join(" ");

  const lowerText = (productName + " " + (input.description || "")).toLowerCase();
  const isBedding = lowerText.includes("sheet") || lowerText.includes("pillowcase") || lowerText.includes("duvet") || lowerText.includes("thread count") || lowerText.includes("bedding");
  const isTowels = lowerText.includes("towel") || lowerText.includes("washcloth") || lowerText.includes("bath") || lowerText.includes("robe");
  const isBeauty = lowerText.includes("skin") || lowerText.includes("cream") || lowerText.includes("serum") || lowerText.includes("lotion") || lowerText.includes("cleanser");
  const isClothing = (lowerText.includes("hoodie") || lowerText.includes("shirt") || lowerText.includes("jacket") || lowerText.includes("pant") || lowerText.includes("dress")) && !isBedding && !isTowels;

  const categoryKey = isBedding ? "bedding" : isTowels ? "towels" : isBeauty ? "beauty" : isClothing ? "clothing" : "general";
  const mediaPool = CATEGORY_MEDIA[categoryKey];

  const seed = Math.abs(productName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
  let nameIndex = seed;

  const mediaOption = input.mediaOption || "none";

  for (let idx = 0; idx < reviews.length; idx++) {
    const r = reviews[idx];
    let reviewerName = (r.reviewerName || "").trim();
    if (!reviewerName || reviewerName.toLowerCase().startsWith("customer")) {
      reviewerName = DIVERSE_NAME_POOL[nameIndex++ % DIVERSE_NAME_POOL.length];
    }

    // Enforce Rule 6: Unique Customer Names
    while (usedNames.has(reviewerName.toLowerCase())) {
      reviewerName = DIVERSE_NAME_POOL[nameIndex++ % DIVERSE_NAME_POOL.length];
    }
    usedNames.add(reviewerName.toLowerCase());

    let bodyShort = (r.bodyShort || "").trim();
    let bodyFull = (r.bodyFull || "").trim();

    // BAN "super comfortable for daily wear" / "daily wear" on non-clothing items
    if (!isClothing) {
      const dailyWearRegex = /is super comfortable for daily wear|comfortable for daily wear|relaxed cut for daily wear/gi;
      if (dailyWearRegex.test(bodyShort)) {
        if (isBedding) {
          bodyShort = `${shortName} is silky smooth, breathable, and cool for night sleeping.`;
        } else if (isTowels) {
          bodyShort = `${shortName} is super absorbent, plush, and quick-drying!`;
        } else {
          bodyShort = `${shortName} — practical design, solid build, and fast delivery!`;
        }
      }
      if (dailyWearRegex.test(bodyFull)) {
        if (isBedding) {
          bodyFull = `I bought ${shortName} recently and the quality surprised me. The fabric feels crisp and luxurious against skin, and deep corners fit our mattress securely.`;
        } else if (isTowels) {
          bodyFull = `These towels are fantastic after a shower. ${shortName} absorbs moisture instantly, feels plush against skin, and dries quickly.`;
        } else {
          bodyFull = `Impressed with ${shortName} right out of the box. Arrived earlier than expected and works exactly as advertised.`;
        }
      }
    }

    // Enforce Rule 8: Filter out banned clichés
    for (const cliché of BANNED_CLICHES) {
      const reg = new RegExp(cliché, "gi");
      if (reg.test(bodyShort)) {
        bodyShort = bodyShort.replace(reg, `${shortName} performs well`);
      }
      if (reg.test(bodyFull)) {
        bodyFull = bodyFull.replace(reg, `the overall design and texture of ${shortName} stand out`);
      }
    }

    // Enforce Rule 4: Ensure product specificity in review text
    const lowerShort = bodyShort.toLowerCase();
    const lowerFull = bodyFull.toLowerCase();
    const lowerProd = shortName.toLowerCase();
    if (!lowerShort.includes(lowerProd) && !lowerFull.includes(lowerProd)) {
      bodyShort = `${shortName} — ${bodyShort}`;
    }

    // Enforce Rule 7: Unique comments / no duplicate short snippets
    let uniqueShortKey = bodyShort.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (usedShorts.has(uniqueShortKey)) {
      bodyShort = `${bodyShort} (verified feature)`;
      uniqueShortKey = bodyShort.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    usedShorts.add(uniqueShortKey);

    let assignedImage: string | undefined = undefined;
    let assignedVideo: string | undefined = undefined;

    const uniqueSeed = seed * 1000 + idx * 73 + Math.floor(Math.random() * 100);

    if (mediaOption === "image") {
      assignedImage = getAmazonReviewStylePhotoUrl(productName, uniqueSeed, bodyShort);
    } else if (mediaOption === "video") {
      assignedVideo = mediaPool.videos[(seed + idx) % mediaPool.videos.length];
    } else if (mediaOption === "image_video") {
      assignedImage = getAmazonReviewStylePhotoUrl(productName, uniqueSeed, bodyShort);
      assignedVideo = mediaPool.videos[(seed + idx) % mediaPool.videos.length];
    }

    validated.push({
      reviewerName,
      rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
      bodyShort: bodyShort.substring(0, 160),
      bodyFull,
      tags: Array.isArray(r.tags) && r.tags.length > 0 ? r.tags : ["quality-build", "verified-purchase"],
      imageUrl: assignedImage,
      videoUrl: assignedVideo,
    });
  }

  // Ensure returned set matches requested count
  while (validated.length < reqCount) {
    const idx = validated.length;
    let fallbackName = DIVERSE_NAME_POOL[nameIndex++ % DIVERSE_NAME_POOL.length];
    while (usedNames.has(fallbackName.toLowerCase())) {
      fallbackName = DIVERSE_NAME_POOL[nameIndex++ % DIVERSE_NAME_POOL.length];
    }
    usedNames.add(fallbackName.toLowerCase());

    let fallbackShort = `${shortName} — practical design and comfortable fit`;
    let fallbackFull = `I've been using ${shortName} regularly. The texture and features match what was shown in the catalog, and it performs reliably for daily use.`;

    if (isBedding) {
      fallbackShort = `${shortName} — silky smooth weave and cool night sleeping`;
      fallbackFull = `${shortName} fits comfortably around mattress corners and keeps its crisp softness wash after wash.`;
    } else if (isTowels) {
      fallbackShort = `${shortName} — plush cotton density and super absorbent`;
      fallbackFull = `${shortName} absorbs water effortlessly, feels soft and thick, and dries fast on the bathroom rack.`;
    }

    let assignedImage: string | undefined = undefined;
    let assignedVideo: string | undefined = undefined;

    const uniqueSeed = seed * 1000 + idx * 73 + Math.floor(Math.random() * 100);

    if (mediaOption === "image") {
      assignedImage = getAmazonReviewStylePhotoUrl(productName, uniqueSeed, fallbackShort);
    } else if (mediaOption === "video") {
      assignedVideo = mediaPool.videos[(seed + idx) % mediaPool.videos.length];
    } else if (mediaOption === "image_video") {
      assignedImage = getAmazonReviewStylePhotoUrl(productName, uniqueSeed, fallbackShort);
      assignedVideo = mediaPool.videos[(seed + idx) % mediaPool.videos.length];
    }

    validated.push({
      reviewerName: fallbackName,
      rating: 5,
      bodyShort: fallbackShort,
      bodyFull: fallbackFull,
      tags: ["practical-design", "verified-purchase"],
      imageUrl: assignedImage,
      videoUrl: assignedVideo,
    });
  }

  return validated.slice(0, reqCount);
}
