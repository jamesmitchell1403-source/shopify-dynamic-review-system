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
        reviews: demoReviews,
        providerUsed: "Demo Generator (Add API key in AI Settings for live Claude/Gemini AI)",
        modelUsed: "Template Engine v1",
      };
    }

    const reviews = await primary.generateReviews(input, primaryKey);
    return {
      reviews,
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
          reviews: fallbackReviews,
          providerUsed: secondary.providerName,
          modelUsed: secondary.providerName === "claude" ? "claude-3-5-sonnet-20241022" : "gemini-2.5-flash",
        };
      } catch (secondaryError: any) {
        console.warn(`Fallback AI Provider (${secondary.providerName}) also failed: ${secondaryError?.message}. Using Smart Template Engine fallback...`);
        const demoReviews = generateSmartDemoReviews(input);
        return {
          reviews: demoReviews,
          providerUsed: "Smart Demo Engine (Live API key rate limited or missing)",
          modelUsed: "Template Engine v1",
        };
      }
    }

    // Fallback to smart demo generator if API key error occurs
    const demoReviews = generateSmartDemoReviews(input);
    return {
      reviews: demoReviews,
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

  return reviewPool;
}
