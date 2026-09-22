import OpenAI from "openai";
import { z } from "zod";
import { AIProvider, GeneratedReview, ReviewGenInput } from "../AIProvider";

const ReviewSchema = z.object({
  reviewerName: z.string(),
  rating: z.number().min(1).max(5),
  bodyShort: z.string().max(160),
  bodyFull: z.string(),
  tags: z.array(z.string()),
});

const ReviewArraySchema = z.array(ReviewSchema);

export class OpenAIProvider implements AIProvider {
  public providerName = "openai" as const;

  public async generateReviews(input: ReviewGenInput, apiKey?: string): Promise<GeneratedReview[]> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI ChatGPT API key missing. Please provide it in AI Settings or OPENAI_API_KEY env variable.");
    }

    const openai = new OpenAI({ apiKey: key });

    const reqCount = input.count || 5;
    const systemPrompt = `You are an expert e-commerce customer review generator. Every review MUST be product-specific, grounded in actual product data, and sound like a real customer experience.

You MUST output ONLY a valid JSON array of exactly ${reqCount} review objects matching this JSON structure:
[
  {
    "reviewerName": "Rachel Vance",
    "rating": 5,
    "bodyShort": "Product-specific short snippet under 140 chars highlighting actual features",
    "bodyFull": "Detailed customer review explaining real usage of specific product features",
    "tags": ["soft-cotton", "relaxed-fit"]
  }
]

MANDATORY RULES:
1. PRODUCT-GROUNDED ANALYSIS:
Analyze product info in this priority order: Description -> Title -> Keywords -> Features -> Specifications -> Category -> Variants (color/size/material) -> Product Image.
Convert available product details into a natural customer experience. Do NOT copy descriptions verbatim.

2. STRICT GROUNDING WHEN DETAILS ARE MINIMAL:
If product description is missing, rely strictly on Product Title, Category, and Product Image.
Do NOT invent unsupported details (e.g. unverified materials, washing results, durability claims) that cannot be supported.

3. EVERY REVIEW MUST BE PRODUCT-SPECIFIC:
Do NOT generate generic reviews that could apply to any product.
FORBIDDEN STANDALONE GENERIC REVIEWS: "Great product, highly recommended.", "Excellent quality. Love it.", "Very happy with my purchase."

4. DIVERSITY & NATURAL VARIATION:
Vary reviewerName, comment length, sentence structure, vocabulary, opening sentence, and discussed aspects.

5. UNIQUE CUSTOMER NAMES:
All reviewer names in the generated array MUST be unique, natural human names.`;

    let userPromptText = `Product Description:\n${input.description}`;
    if (input.notes) {
      userPromptText += `\n\nKey Notes / USPs:\n${input.notes}`;
    }
    if (input.avoidPhrasing && input.avoidPhrasing.length > 0) {
      userPromptText += `\n\nAvoid repeating these prior review concepts:\n- ${input.avoidPhrasing.join("\n- ")}`;
    }
    userPromptText += `\n\nTarget Language: ${input.language || "en"}`;

    const userContent: Array<any> = [];

    if (input.imageBase64 && input.imageMimeType) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${input.imageMimeType};base64,${input.imageBase64}`,
        },
      });
    }

    userContent.push({
      type: "text",
      text: userPromptText,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const textOutput = response.choices[0]?.message?.content || "";
    let cleanedText = textOutput.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    
    // In json_object response format, OpenAI sometimes wraps the array inside an object key like { "reviews": [...] }
    let parsed = JSON.parse(cleanedText);
    if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
      const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      if (arrayKey) {
        parsed = parsed[arrayKey];
      }
    }

    return ReviewArraySchema.parse(parsed);
  }

  public async autoTagReview(reviewText: string, apiKey?: string): Promise<string[]> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) return [];

    const openai = new OpenAI({ apiKey: key });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract 2 to 4 concise product attribute/USP tags from the review text. Output ONLY a JSON array of strings (e.g. [\"dry-skin\", \"moisturizing\"]).",
        },
        { role: "user", content: reviewText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const textOutput = response.choices[0]?.message?.content || "";
    try {
      let cleaned = textOutput.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      let parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
        const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
        if (arrayKey) parsed = parsed[arrayKey];
      }
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fallback
    }
    return [];
  }
}
