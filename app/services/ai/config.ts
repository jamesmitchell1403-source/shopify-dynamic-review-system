import db from "../../db.server";
import { getShopAIKeysFromShopify } from "../shopifyMetafields.server";

export interface AIConfig {
  defaultProvider: "claude" | "gemini" | "openai";
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  hasClaudeKey: boolean;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
  hasAnyKey: boolean;
}

export async function getShopAIConfig(shopDomain: string, admin?: any): Promise<AIConfig> {
  let defaultProvider: "claude" | "gemini" | "openai" = "claude";
  let anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  let geminiApiKey = process.env.GEMINI_API_KEY;
  let openaiApiKey = process.env.OPENAI_API_KEY;

  if (admin) {
    const cloudKeys = await getShopAIKeysFromShopify(admin);
    if (cloudKeys) {
      if (cloudKeys.anthropicApiKey) anthropicApiKey = cloudKeys.anthropicApiKey;
      if (cloudKeys.geminiApiKey) geminiApiKey = cloudKeys.geminiApiKey;
      if (cloudKeys.openaiApiKey) openaiApiKey = cloudKeys.openaiApiKey;
    }
  }

  try {
    const settings = await db.shopSettings.findUnique({
      where: { shop: shopDomain },
    });

    if (settings) {
      if (settings.defaultAiProvider) {
        defaultProvider = settings.defaultAiProvider as "claude" | "gemini" | "openai";
      }
      if (settings.anthropicApiKey) anthropicApiKey = settings.anthropicApiKey;
      if (settings.geminiApiKey) geminiApiKey = settings.geminiApiKey;
      if ((settings as any).openaiApiKey) openaiApiKey = (settings as any).openaiApiKey;
    }
  } catch (error) {
    console.warn("Error fetching ShopSettings in getShopAIConfig:", error);
  }

  const hasClaudeKey = Boolean(anthropicApiKey && anthropicApiKey.trim().length > 0);
  const hasGeminiKey = Boolean(geminiApiKey && geminiApiKey.trim().length > 0);
  const hasOpenaiKey = Boolean(openaiApiKey && openaiApiKey.trim().length > 0);
  const hasAnyKey = hasClaudeKey || hasGeminiKey || hasOpenaiKey;

  if (hasClaudeKey) defaultProvider = "claude";
  else if (hasGeminiKey) defaultProvider = "gemini";
  else if (hasOpenaiKey) defaultProvider = "openai";

  return {
    defaultProvider,
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    hasClaudeKey,
    hasGeminiKey,
    hasOpenaiKey,
    hasAnyKey,
  };
}
