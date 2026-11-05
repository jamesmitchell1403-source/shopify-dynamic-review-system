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
  let defaultProvider: "claude" | "gemini" | "openai" = "openai";
  let anthropicApiKey = "";
  let geminiApiKey = "";
  let openaiApiKey = "";

  // 1. Read persistent keys from Shopify Metafields
  if (admin) {
    try {
      const cloudKeys = await getShopAIKeysFromShopify(admin);
      if (cloudKeys) {
        if (cloudKeys.anthropicApiKey) anthropicApiKey = cloudKeys.anthropicApiKey.trim();
        if (cloudKeys.geminiApiKey) geminiApiKey = cloudKeys.geminiApiKey.trim();
        if (cloudKeys.openaiApiKey) openaiApiKey = cloudKeys.openaiApiKey.trim();
        if (cloudKeys.defaultAiProvider) {
          defaultProvider = cloudKeys.defaultAiProvider as "claude" | "gemini" | "openai";
        }
      }
    } catch (_) {}
  }

  // 2. Read from Database settings (DB overrides if present)
  try {
    const settings = await db.shopSettings.findUnique({
      where: { shop: shopDomain },
    });

    if (settings) {
      if (settings.defaultAiProvider) {
        defaultProvider = settings.defaultAiProvider as "claude" | "gemini" | "openai";
      }
      if (settings.anthropicApiKey && !anthropicApiKey) anthropicApiKey = settings.anthropicApiKey.trim();
      if (settings.geminiApiKey && !geminiApiKey) geminiApiKey = settings.geminiApiKey.trim();
      if ((settings as any).openaiApiKey && !openaiApiKey) openaiApiKey = (settings as any).openaiApiKey.trim();
    }
  } catch (error) {
    console.warn("Error fetching ShopSettings in getShopAIConfig:", error);
  }

  const hasClaudeKey = Boolean(anthropicApiKey && anthropicApiKey.length > 0);
  const hasGeminiKey = Boolean(geminiApiKey && geminiApiKey.length > 0);
  const hasOpenaiKey = Boolean(openaiApiKey && openaiApiKey.length > 0);
  const hasAnyKey = hasClaudeKey || hasGeminiKey || hasOpenaiKey;

  // Ensure defaultProvider points to a provider that actually has a connected key
  if (defaultProvider === "openai" && !hasOpenaiKey) {
    if (hasGeminiKey) defaultProvider = "gemini";
    else if (hasClaudeKey) defaultProvider = "claude";
  } else if (defaultProvider === "gemini" && !hasGeminiKey) {
    if (hasOpenaiKey) defaultProvider = "openai";
    else if (hasClaudeKey) defaultProvider = "claude";
  } else if (defaultProvider === "claude" && !hasClaudeKey) {
    if (hasOpenaiKey) defaultProvider = "openai";
    else if (hasGeminiKey) defaultProvider = "gemini";
  }

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
