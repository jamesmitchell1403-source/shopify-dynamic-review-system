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

    const reqCount = input.count || 5;
    const promptText = `You are an expert e-commerce customer review generator. Every review MUST be product-specific, grounded in actual product data, and sound like a real customer experience.

Product Description:
${input.description}
${input.notes ? `\nKey Notes / USPs:\n${input.notes}` : ""}
${input.avoidPhrasing && input.avoidPhrasing.length > 0 ? `\nAvoid repeating these prior review concepts:\n- ${input.avoidPhrasing.join("\n- ")}` : ""}

Target Language: ${input.language || "en"}.

MANDATORY REQUIREMENTS:
1. PRODUCT-GROUNDED ANALYSIS: Analyze product info in priority order: Description -> Title -> Keywords -> Features -> Specifications -> Category -> Variants -> Image. Convert product details into a natural customer experience without copying verbatim.
2. STRICT GROUNDING WHEN DETAILS ARE MINIMAL: If description is missing, rely ONLY on Title, Category, and Image. Do NOT invent unsupported details (materials, washing results, durability claims) that cannot be supported.
3. EVERY REVIEW MUST BE PRODUCT-SPECIFIC: Mention concrete details about the actual product. FORBIDDEN STANDALONE GENERIC PHRASES: "Great product, highly recommended.", "Excellent quality. Love it.", "Very happy with my purchase."
4. DIVERSITY & NATURAL VARIATION: Vary reviewerName, length, sentence structure, vocabulary, and product focus (fit vs design vs material vs color vs daily usability).
5. UNIQUE CUSTOMER NAMES: Every reviewerName MUST be a unique, realistic human name.
6. UNIQUE COMMENTS & NO REPEATED PHRASES: No two reviews can have similar sentence structures, openings, or meanings.
7. HUMAN-LIKE CONVERSATIONAL WRITING: Avoid clichés: "Amazing product!", "Absolutely love it!", "Highly recommended!", "Perfect quality!", "Best purchase ever!". Write in conversational shopper language.
8. Output ONLY a valid JSON array of exactly ${reqCount} review objects with keys: reviewerName, rating (1-5), bodyShort (<140 chars), bodyFull (2-4 sentences), tags (array of 2-3 feature keywords).`;

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
