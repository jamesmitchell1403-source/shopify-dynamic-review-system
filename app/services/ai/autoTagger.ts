import { ClaudeProvider } from "./providers/claudeProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { getShopAIConfig } from "./config";

export async function autoTagReviewText(shopDomain: string, reviewText: string): Promise<string[]> {
  const config = await getShopAIConfig(shopDomain);
  
  // High volume auto-tagging prefers Gemini for lower cost/latency, or fallback to Claude
  if (config.geminiApiKey) {
    const gemini = new GeminiProvider();
    const tags = await gemini.autoTagReview(reviewText, config.geminiApiKey);
    if (tags.length > 0) return tags;
  }

  if (config.anthropicApiKey) {
    const claude = new ClaudeProvider();
    return await claude.autoTagReview(reviewText, config.anthropicApiKey);
  }

  // Basic fallback keyword matching if no API key is available
  const keywords = ["moisturizing", "dry-skin", "oily-skin", "fast-shipping", "long-lasting", "sensitive-skin", "lightweight", "great-scent"];
  const matched = keywords.filter((k) => reviewText.toLowerCase().includes(k.replace("-", " ")));
  return matched.length > 0 ? matched : ["verified-purchase"];
}
