import { GoogleGenAI } from "@google/genai";
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

export class GeminiProvider implements AIProvider {
  public providerName = "gemini" as const;

  public async generateReviews(input: ReviewGenInput, apiKey?: string): Promise<GeneratedReview[]> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Google Gemini API key missing. Please provide it in AI Settings or GEMINI_API_KEY env variable.");
    }

    const ai = new GoogleGenAI({ apiKey: key });

    const promptText = `You are generating authentic customer reviews for an online store product.
Generate a JSON array of 5 realistic customer reviews written by real online shoppers.

Product Description:
${input.description}
${input.notes ? `\nKey Notes / USPs:\n${input.notes}` : ""}
${input.avoidPhrasing && input.avoidPhrasing.length > 0 ? `\nAvoid repeating these prior review concepts:\n- ${input.avoidPhrasing.join("\n- ")}` : ""}

Target Language: ${input.language || "en"}.

CRITICAL REQUIREMENTS FOR AUTHENTICITY:
1. Reviewer Names: Use realistic, diverse full or first-name + last-initial customer names (e.g. "Rachel V.", "David Miller", "Priya Sharma", "Marcus T.", "Jessica P.").
2. Ratings: Natural mix (e.g. four 5-star reviews and one 4-star review with constructive praise).
3. Tone & Style: Write like real customers sharing genuine experiences. Mention real-life context (e.g. delivery time, packaging, daily use, fit/feel, gifting, value for money). Avoid artificial corporate/marketing buzzwords.
4. Product-Specific Vision: If an image is provided, analyze the product visually (colors, materials, product shape, design) combined with the Product Title to write visual-aware reviews even if text description is minimal.
5. Output ONLY a JSON array of 5 review objects with exact keys:
- reviewerName (string)
- rating (integer 1-5)
- bodyShort (short snippet string under 140 chars)
- bodyFull (detailed review text, 2-4 sentences)
- tags (array of 2-3 feature attribute strings e.g. ["fast-shipping", "great-quality"])`;

    const contents: Array<any> = [];

    if (input.imageBase64 && input.imageMimeType) {
      contents.push({
        inlineData: {
          mimeType: input.imageMimeType,
          data: input.imageBase64,
        },
      });
    }

    contents.push(promptText);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const textOutput = response.text || "";
    const cleanedText = textOutput.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleanedText);
    return ReviewArraySchema.parse(parsed);
  }

  public async autoTagReview(reviewText: string, apiKey?: string): Promise<string[]> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) return [];

    const ai = new GoogleGenAI({ apiKey: key });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract 2 to 4 key product benefit/attribute tags from this review text: "${reviewText}". Output ONLY a JSON string array.`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const textOutput = response.text || "";
    try {
      const cleaned = textOutput.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fallback
    }
    return [];
  }
}
