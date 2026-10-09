import db from "../../db.server";
import { getShopAIKeysFromShopify } from "../shopifyMetafields.server";
import { isKeyExpired } from "./keyLifecycle.server";

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
      if (cloudKeys.anthropicApiKey && !isKeyExpired(cloudKeys.anthropicKeyAddedAt, cloudKeys.anthropicPlanType)) {
        anthropicApiKey = cloudKeys.anthropicApiKey;
      }
      if (cloudKeys.geminiApiKey && !isKeyExpired(cloudKeys.geminiKeyAddedAt, cloudKeys.geminiPlanType)) {
        geminiApiKey = cloudKeys.geminiApiKey;
      }
      if (cloudKeys.openaiApiKey && !isKeyExpired(cloudKeys.openaiKeyAddedAt, cloudKeys.openaiPlanType)) {
        openaiApiKey = cloudKeys.openaiApiKey;
      }
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
      if (settings.anthropicApiKey && !isKeyExpired(settings.anthropicKeyAddedAt, settings.anthropicPlanType)) {
        anthropicApiKey = settings.anthropicApiKey;
      } else if (settings.anthropicApiKey && isKeyExpired(settings.anthropicKeyAddedAt, settings.anthropicPlanType)) {
        anthropicApiKey = undefined;
      }

      if (settings.geminiApiKey && !isKeyExpired(settings.geminiKeyAddedAt, settings.geminiPlanType)) {
        geminiApiKey = settings.geminiApiKey;
      } else if (settings.geminiApiKey && isKeyExpired(settings.geminiKeyAddedAt, settings.geminiPlanType)) {
        geminiApiKey = undefined;
      }

      if ((settings as any).openaiApiKey && !isKeyExpired((settings as any).openaiKeyAddedAt, (settings as any).openaiPlanType)) {
        openaiApiKey = (settings as any).openaiApiKey;
      } else if ((settings as any).openaiApiKey && isKeyExpired((settings as any).openaiKeyAddedAt, (settings as any).openaiPlanType)) {
        openaiApiKey = undefined;
      }
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
