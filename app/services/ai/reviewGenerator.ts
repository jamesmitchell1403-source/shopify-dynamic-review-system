import { ClaudeProvider } from "./providers/claudeProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { AIProvider, GeneratedReview, ReviewGenInput } from "./AIProvider";
import { getShopAIConfig } from "./config";

export async function generateReviewsForShop(
  shopDomain: string,
  input: ReviewGenInput,
  preferredProvider?: "claude" | "gemini"
): Promise<{ reviews: GeneratedReview[]; providerUsed: string; modelUsed: string }> {
  const config = await getShopAIConfig(shopDomain);
  const activeProvider = preferredProvider || config.defaultProvider;

  const claude = new ClaudeProvider();
  const gemini = new GeminiProvider();

  let primary: AIProvider = activeProvider === "gemini" ? gemini : claude;
  let secondary: AIProvider = activeProvider === "gemini" ? claude : gemini;

  let primaryKey = activeProvider === "gemini" ? config.geminiApiKey : config.anthropicApiKey;
  let secondaryKey = activeProvider === "gemini" ? config.anthropicApiKey : config.geminiApiKey;

  try {
    if (!primaryKey && !secondaryKey) {
      // Demo template mode when no API keys have been entered yet
      const demoReviews = generateSmartDemoReviews(input);
      return {
        reviews: validateAndPostProcessReviews(demoReviews, input),
        providerUsed: "Demo Generator (Add API key in AI Settings for live Claude/Gemini AI)",
        modelUsed: "Template Engine v1",
      };
    }

    const reviews = await primary.generateReviews(input, primaryKey);
    return {
      reviews: validateAndPostProcessReviews(reviews, input),
      providerUsed: primary.providerName,
      modelUsed: primary.providerName === "claude" ? "claude-3-5-sonnet-20241022" : "gemini-2.5-flash",
    };
  } catch (primaryError: any) {
    console.warn(`Primary AI Provider (${primary.providerName}) failed: ${primaryError?.message}. Attempting fallback...`);

    // Try fallback
    if (secondaryKey) {
      try {
        const fallbackReviews = await secondary.generateReviews(input, secondaryKey);
        return {
          reviews: validateAndPostProcessReviews(fallbackReviews, input),
          providerUsed: secondary.providerName,
          modelUsed: secondary.providerName === "claude" ? "claude-3-5-sonnet-20241022" : "gemini-2.5-flash",
        };
      } catch (secondaryError: any) {
        console.warn(`Fallback AI Provider (${secondary.providerName}) also failed: ${secondaryError?.message}. Using Smart Template Engine fallback...`);
        const demoReviews = generateSmartDemoReviews(input);
        return {
          reviews: validateAndPostProcessReviews(demoReviews, input),
          providerUsed: "Smart Demo Engine (Live API key rate limited or missing)",
          modelUsed: "Template Engine v1",
        };
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
  const text = (input.description + " " + (input.notes || "")).toLowerCase();

  // Extract product title from notes (format: "Product Title: XYZ.")
  const titleMatch = (input.notes || "").match(/Product Title:\s*([^.]+)/i);
  const productName = titleMatch
    ? titleMatch[1].trim()
    : input.description.split(/\s+/).slice(0, 4).join(" ") || "this product";

  // Short name for inline usage (first 3 words max)
  const shortName = productName.split(/\s+/).slice(0, 3).join(" ");

  const isWax = text.includes("wax") || text.includes("tuning") || text.includes("glide");
  const isClothing = text.includes("shirt") || text.includes("jacket") || text.includes("pant") || text.includes("dress") || text.includes("wear") || text.includes("cotton");
  const isBeauty = text.includes("skin") || text.includes("cream") || text.includes("serum") || text.includes("oil") || text.includes("hair");
  const isSports = text.includes("snowboard") || text.includes("board") || text.includes("ski") || text.includes("outdoor");

  let reviewPool: GeneratedReview[] = [];

  if (isWax) {
    reviewPool = [
      {
        reviewerName: "Marcus T.",
        rating: 5,
        bodyShort: `${shortName} made gliding noticeably faster on all snow conditions!`,
        bodyFull: `Applied ${shortName} before my weekend session. Application was smooth and easy, and the glide performance was fantastic all day long! Absolutely love this product.`,
        tags: ["easy-application", "fast-glide", "top-wax"],
      },
      {
        reviewerName: "Jessica P.",
        rating: 5,
        bodyShort: `${shortName} works great for daily ski and snowboard tuning!`,
        bodyFull: `${shortName} keeps my bases protected, hydrated, and fast all season. Super reliable for varied temperatures. My go-to wax.`,
        tags: ["reliable-tuning", "all-temp"],
      },
      {
        reviewerName: "David Miller",
        rating: 4,
        bodyShort: `${shortName} is a solid everyday glide wax.`,
        bodyFull: `${shortName} holds up well for multiple runs. Great value and easy maintenance. Would definitely buy again.`,
        tags: ["great-value", "long-lasting"],
      },
      {
        reviewerName: "Priya Sharma",
        rating: 5,
        bodyShort: `${shortName} is my go-to wax for all winter gear!`,
        bodyFull: `${shortName} gives a noticeable boost in speed and reduces base drag completely. Will definitely keep a supply handy all season.`,
        tags: ["must-have", "smooth-ride"],
      },
      {
        reviewerName: "Rachel V.",
        rating: 5,
        bodyShort: `${shortName} transformed my dry bases into fast gliders!`,
        bodyFull: `Restored my dry bases right away with ${shortName}. Smooth application and no sticky spots. Essential for tuning — highly recommend!`,
        tags: ["base-protection", "essential"],
      },
    ];
  } else if (isClothing) {
    reviewPool = [
      {
        reviewerName: "Rachel Vance",
        rating: 5,
        bodyShort: `${shortName} fits perfectly and the fabric quality is top tier!`,
        bodyFull: `I was skeptical buying online, but ${shortName} blew me away. Super soft material, great stitching, and it washed really well without shrinking.`,
        tags: ["perfect-fit", "soft-fabric", "high-quality"],
      },
      {
        reviewerName: "Marcus Thorne",
        rating: 5,
        bodyShort: `${shortName} is super comfortable for daily wear.`,
        bodyFull: `Wore ${shortName} all day. Incredibly comfortable, light on the skin, and looks even better in person. Shipped fast too!`,
        tags: ["comfortable", "fast-delivery", "true-to-size"],
      },
      {
        reviewerName: "Jessica Patel",
        rating: 4,
        bodyShort: `${shortName} is solid quality, true to size.`,
        bodyFull: `${shortName} arrived in 3 days. Quality is really good for the price point. Color is spot-on. Would order again.`,
        tags: ["accurate-color", "fast-shipping"],
      },
      {
        reviewerName: "Liam Howard",
        rating: 5,
        bodyShort: `Getting compliments everywhere wearing ${shortName}!`,
        bodyFull: `Got so many compliments wearing ${shortName}! Feels premium and durable. Definitely worth every penny.`,
        tags: ["stylish", "premium-feel"],
      },
      {
        reviewerName: "Sophia Martinez",
        rating: 5,
        bodyShort: `Love the attention to detail on ${shortName}!`,
        bodyFull: `Bought ${shortName} as a gift and ended up buying one for myself too. High quality stitching and lovely packaging.`,
        tags: ["great-gift", "durable"],
      },
    ];
  } else if (isBeauty) {
    reviewPool = [
      {
        reviewerName: "Emily Clarke",
        rating: 5,
        bodyShort: `${shortName} absorbs quickly and leaves skin feeling amazing!`,
        bodyFull: `I've been using ${shortName} daily for two weeks. My skin feels noticeably softer and hydrated without feeling greasy or heavy.`,
        tags: ["hydrating", "non-greasy", "fast-results"],
      },
      {
        reviewerName: "David Kim",
        rating: 5,
        bodyShort: `Finally found something that works — ${shortName} is it!`,
        bodyFull: `I have sensitive skin but ${shortName} caused zero irritation. Very soothing and smells subtle and pleasant.`,
        tags: ["sensitive-skin-safe", "soothing"],
      },
      {
        reviewerName: "Priya Sharma",
        rating: 4,
        bodyShort: `Noticeable improvement in skin texture with ${shortName}.`,
        bodyFull: `Saw results after 4-5 days using ${shortName} consistently. Will definitely keep this in my daily routine.`,
        tags: ["effective", "daily-use"],
      },
      {
        reviewerName: "Hannah Wright",
        rating: 5,
        bodyShort: `${shortName} is holy grail status! Will reorder.`,
        bodyFull: `${shortName} is one of the best purchases I've made this year. Lightweight, effective, and generous quantity.`,
        tags: ["must-have", "great-value"],
      },
      {
        reviewerName: "Alex Rivera",
        rating: 5,
        bodyShort: `${shortName} is gentle on skin with an instant glow.`,
        bodyFull: `Packaging was pristine. ${shortName} feels so luxurious on application. Couldn't be happier with this purchase!`,
        tags: ["luxurious", "secure-packaging"],
      },
    ];
  } else if (isSports) {
    reviewPool = [
      {
        reviewerName: "Brandon Miller",
        rating: 5,
        bodyShort: `${shortName} has outstanding performance on slopes and trails!`,
        bodyFull: `Took ${shortName} out for a full weekend session. Handles like a dream, rock solid construction, exceeded all expectations.`,
        tags: ["high-performance", "durable", "top-tier"],
      },
      {
        reviewerName: "Chloe Dupont",
        rating: 5,
        bodyShort: `${shortName} glide and feel are smooth as butter.`,
        bodyFull: `${shortName} is a huge upgrade over my previous gear. Easy to maneuver and built to last. Great protective packaging too.`,
        tags: ["smooth-glide", "sturdy"],
      },
      {
        reviewerName: "Jason K.",
        rating: 4,
        bodyShort: `${shortName} is reliable for all conditions.`,
        bodyFull: `Solid build quality on ${shortName}. Held up great under tough conditions. Very happy with the responsiveness.`,
        tags: ["reliable", "all-weather"],
      },
      {
        reviewerName: "Megan Ross",
        rating: 5,
        bodyShort: `${shortName} is the best investment I've made this season!`,
        bodyFull: `${shortName} is worth every cent! Light, strong, and performs consistently well. Delivery was super fast too.`,
        tags: ["fast-delivery", "recommended"],
      },
      {
        reviewerName: "Tyler Sanders",
        rating: 5,
        bodyShort: `${shortName} has top notch quality and awesome design.`,
        bodyFull: `The craftsmanship of ${shortName} is top notch. Tested thoroughly and performed flawlessly under all conditions.`,
        tags: ["craftsmanship", "flawless"],
      },
    ];
  } else {
    reviewPool = [
      {
        reviewerName: "Sarah Jenkins",
        rating: 5,
        bodyShort: `${shortName} — exceptional quality and fast delivery!`,
        bodyFull: `Impressed with ${shortName} right out of the box. Arrived earlier than expected and works exactly as advertised. Highly recommend!`,
        tags: ["fast-shipping", "top-quality", "as-described"],
      },
      {
        reviewerName: "Michael Chang",
        rating: 5,
        bodyShort: `${shortName} exceeded my expectations in every way.`,
        bodyFull: `I bought ${shortName} based on positive reviews and it lived up to the hype! Solid materials, easy to use, great value.`,
        tags: ["great-value", "easy-to-use"],
      },
      {
        reviewerName: "Amanda Foster",
        rating: 4,
        bodyShort: `Very satisfied with my ${shortName} purchase.`,
        bodyFull: `${shortName} was well packaged and arrived in perfect condition. Practical, well-designed, great customer service.`,
        tags: ["well-packaged", "practical"],
      },
      {
        reviewerName: "Daniel Smith",
        rating: 5,
        bodyShort: `${shortName} works like a charm! 5 stars.`,
        bodyFull: `Have been using ${shortName} for a few weeks now. Reliable performance and excellent quality for the price. Totally worth it.`,
        tags: ["reliable", "5-stars"],
      },
      {
        reviewerName: "Olivia Taylor",
        rating: 5,
        bodyShort: `So glad I bought ${shortName}!`,
        bodyFull: `Super happy with my ${shortName} order. Beautiful finish, sturdy feel, and great user experience. Will definitely buy again!`,
        tags: ["recommended", "sturdy-feel"],
      },
    ];
  }

  const targetCount = input.count || 5;
  let reviews: GeneratedReview[] = [...reviewPool];

  const firstNames = ["Rachel", "Marcus", "Jessica", "Liam", "Sophia", "David", "Priya", "Alex", "Emily", "Brandon", "Chloe", "Tyler", "Noah", "Olivia", "Ethan"];
  const lastNames = ["Vance", "Thorne", "Patel", "Howard", "Martinez", "Miller", "Sharma", "Rivera", "Clarke", "Dupont", "Sanders", "Wilson", "Taylor", "Brooks"];

  while (reviews.length < targetCount) {
    const idx = reviews.length;
    const base = reviewPool[idx % reviewPool.length];
    const newName = `${firstNames[idx % firstNames.length]} ${lastNames[(idx * 3) % lastNames.length]}`;
    reviews.push({
      reviewerName: newName,
      rating: 5,
      bodyShort: `${shortName} — exceptional quality, works like a charm!`,
      bodyFull: `I've been using ${shortName} regularly for a while now. High build quality, super fast shipping, and performs even better than advertised!`,
      tags: [...base.tags],
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
  "Rachel Vance", "Marcus Thorne", "Jessica Patel", "Liam Howard",
  "Sophia Martinez", "David Kim", "Priya Sharma", "Alex Rivera",
  "Emily Clarke", "Brandon Miller", "Chloe Dupont", "Tyler Sanders",
  "Noah Wilson", "Olivia Taylor", "Ethan Brooks", "Hannah Wright",
  "Daniel Smith", "Amanda Foster", "Michael Chang", "Sarah Jenkins",
  "Justin Blake", "Elena Rostova", "Kavya Menon", "Carlos Mendez"
];

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

  let nameIndex = 0;

  for (const r of reviews) {
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
      bodyShort = `${bodyShort} (${shortName} feature)`;
      uniqueShortKey = bodyShort.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    usedShorts.add(uniqueShortKey);

    validated.push({
      reviewerName,
      rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
      bodyShort: bodyShort.substring(0, 160),
      bodyFull,
      tags: Array.isArray(r.tags) && r.tags.length > 0 ? r.tags : ["quality-build", "verified-purchase"],
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

    validated.push({
      reviewerName: fallbackName,
      rating: 5,
      bodyShort: `${shortName} — practical design and comfortable fit`,
      bodyFull: `I've been using ${shortName} regularly. The texture and features match what was shown in the catalog, and it performs reliably for daily use.`,
      tags: ["practical-design", "verified-purchase"],
    });
  }

  return validated.slice(0, reqCount);
}
