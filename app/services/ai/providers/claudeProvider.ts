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

    const systemPrompt = `You are an expert e-commerce assistant generating authentic, natural-sounding customer reviews for an online store product.
You MUST output ONLY a valid JSON array of exactly 5 review objects matching this structure:
[
  {
    "reviewerName": "Rachel V.",
    "rating": 5,
    "bodyShort": "Short snippet under 140 characters highlighting real user experience",
    "bodyFull": "Detailed review explaining user experience, product feel, and benefits",
    "tags": ["fast-shipping", "high-quality"]
  }
]
Rules:
1. Target language: ${input.language || "en"}.
2. Reviewer Names: Use realistic human names (e.g. "Rachel V.", "David Miller", "Priya S.", "Alex Johnson", "Marcus Vance").
3. Ratings: Natural mix (four 5-stars, one 4-star with positive feedback).
4. Tone: Write strictly like genuine online shoppers sharing real usage stories (mention shipping speed, packaging, daily use, texture/fit, gifting, value for money).
5. VISION ANALYSIS: If a product image is attached, inspect the image visually (design, color, texture, build, materials, category) and combine it with the Product Title to write detailed, product-specific reviews even if the text description is short or missing!
6. Avoid repetitive buzzwords or corporate speak.
7. Output strictly pure JSON without markdown code fences.`;

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
