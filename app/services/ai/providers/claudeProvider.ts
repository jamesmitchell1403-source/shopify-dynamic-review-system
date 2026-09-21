import Anthropic from "@anthropic-ai/sdk";
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

export class ClaudeProvider implements AIProvider {
  public providerName = "claude" as const;

  public async generateReviews(input: ReviewGenInput, apiKey?: string): Promise<GeneratedReview[]> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("Anthropic API key missing. Please provide it in AI Settings or ANTHROPIC_API_KEY env variable.");
    }

    const anthropic = new Anthropic({ apiKey: key });

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
Example: Product = "Premium cotton hoodie with soft interior and embroidered logo."
Good Review: "The inside feels really soft and the relaxed fit is exactly what I was looking for. I also like the embroidered logo — it gives the hoodie a nice finish."

2. STRICT GROUNDING WHEN DETAILS ARE MINIMAL:
If product description is missing, rely strictly on Product Title, Category, and Product Image.
Do NOT invent unsupported details (e.g. unverified materials, washing results, durability claims, delivery history) that cannot be deduced from the title/image.

3. EVERY REVIEW MUST BE PRODUCT-SPECIFIC:
Do NOT generate generic reviews that could apply to any product.
FORBIDDEN STANDALONE GENERIC REVIEWS: "Great product, highly recommended.", "Excellent quality. Love it.", "Very happy with my purchase."
Every review MUST mention relevant specific characteristics of the actual product.

4. DIVERSITY & NATURAL VARIATION:
If multiple reviews are generated, vary: reviewerName, comment length, sentence structure, vocabulary, opening sentence, writing style, and aspect discussed (e.g. fit vs design vs material vs color vs daily usability).

5. UNIQUE CUSTOMER NAMES:
All reviewer names in the generated array MUST be unique, natural human names. No "Customer 1" or duplicate names.

6. UNIQUE COMMENTS & NO REPEAT PHRASES:
No two reviews can have the same or nearly the same comment, repeated sentence structures, or identical review meaning.

7. HUMAN-LIKE CONVERSATIONAL WRITING (BANNED CLICHÉS):
Do NOT repeatedly use artificial marketing clichés such as:
- "Amazing product!"
- "Absolutely love it!"
- "Highly recommended!"
- "Perfect quality!"
- "Best purchase ever!"
Write in natural, conversational shopper language.

8. TARGET LANGUAGE: ${input.language || "en"}.
9. Output strictly pure JSON without markdown code blocks.`;

    const userMessages: Anthropic.MessageParam[] = [];

    const content: Anthropic.ContentBlockParam[] = [];

    if (input.imageBase64 && input.imageMimeType) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.imageMimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: input.imageBase64,
        },
      });
    }

    let textPrompt = `Product Description:\n${input.description}`;
    if (input.notes) {
      textPrompt += `\n\nKey USPs / Notes:\n${input.notes}`;
    }
    if (input.avoidPhrasing && input.avoidPhrasing.length > 0) {
      textPrompt += `\n\nPlease avoid repeating these prior review concepts/phrasings:\n- ${input.avoidPhrasing.join("\n- ")}`;
    }

    content.push({
      type: "text",
      text: textPrompt,
    });

    userMessages.push({
      role: "user",
      content,
    });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      system: systemPrompt,
      messages: userMessages,
    });

    const textOutput = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    const cleanedText = textOutput.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleanedText);
    return ReviewArraySchema.parse(parsed);
  }

  public async autoTagReview(reviewText: string, apiKey?: string): Promise<string[]> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) return [];

    const anthropic = new Anthropic({ apiKey: key });

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      system: "Extract 2 to 4 concise product attribute/USP tags from the review text (e.g. ['dry-skin', 'moisturizing']). Return ONLY a JSON string array.",
      messages: [{ role: "user", content: reviewText }],
    });

    const textOutput = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    try {
      const cleaned = textOutput.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fallback on error
    }
    return [];
  }
}
