export interface GeneratedReview {
  reviewerName: string;
  rating: number; // 1 to 5
  bodyShort: string; // concise persuasive snippet under 140 chars
  bodyFull: string;  // detailed full review text
  tags: string[];    // USP keywords, e.g. ["dry-skin", "moisturizing", "fast-shipping"]
}

export interface ReviewGenInput {
  imageBase64?: string;
  imageMimeType?: string;
  description: string;
  notes?: string;
  language: string; // e.g. "en", "gu", "hi"
  avoidPhrasing?: string[]; // prior outputs to avoid repetition
}

export interface AIProvider {
  providerName: "claude" | "gemini";
  generateReviews(input: ReviewGenInput, apiKey?: string): Promise<GeneratedReview[]>;
  autoTagReview(reviewText: string, apiKey?: string): Promise<string[]>;
}
