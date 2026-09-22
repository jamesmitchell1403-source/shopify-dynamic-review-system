import db from "../../db.server";

export interface AIConfig {
  defaultProvider: "claude" | "gemini" | "openai";
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}

export async function getShopAIConfig(shopDomain: string): Promise<AIConfig> {
  try {
    const settings = await db.shopSettings.findUnique({
      where: { shop: shopDomain },
    });

    return {
      defaultProvider: (settings?.defaultAiProvider as "claude" | "gemini" | "openai") || "claude",
      anthropicApiKey: settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
      geminiApiKey: settings?.geminiApiKey || process.env.GEMINI_API_KEY,
      openaiApiKey: (settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY,
    };
  } catch (error) {
    return {
      defaultProvider: "claude",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    };
  }
}
