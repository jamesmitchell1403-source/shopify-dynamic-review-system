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
  let cloudKeysFound = false;

  // 1. Read persistent keys from Shopify Metafields (Cloud is source of truth when present)
  if (admin) {
    try {
      const cloudKeys = await getShopAIKeysFromShopify(admin, shopDomain);
      if (cloudKeys) {
        cloudKeysFound = true;
        anthropicApiKey = (cloudKeys.anthropicApiKey || "").trim();
        geminiApiKey = (cloudKeys.geminiApiKey || "").trim();
        openaiApiKey = (cloudKeys.openaiApiKey || "").trim();
        if (cloudKeys.defaultAiProvider) {
          defaultProvider = cloudKeys.defaultAiProvider as "claude" | "gemini" | "openai";
        }
      }
    } catch (_) {}
  }

  // 2. Read from Database settings only if cloud keys were not retrieved
  if (!cloudKeysFound) {
    try {
      const settings = await db.shopSettings.findUnique({
        where: { shop: shopDomain },
      });

      if (settings) {
        if (settings.defaultAiProvider) {
          defaultProvider = settings.defaultAiProvider as "claude" | "gemini" | "openai";
        }
        anthropicApiKey = (settings.anthropicApiKey || "").trim();
        geminiApiKey = (settings.geminiApiKey || "").trim();
        openaiApiKey = ((settings as any).openaiApiKey || "").trim();
      }
    } catch (error) {
      console.warn("Error fetching ShopSettings in getShopAIConfig:", error);
    }
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
