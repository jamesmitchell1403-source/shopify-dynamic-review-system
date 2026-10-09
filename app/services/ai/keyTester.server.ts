import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface KeyTestResult {
  success: boolean;
  message: string;
  provider: "claude" | "gemini" | "openai";
}

export async function testAIProviderKey(
  provider: "claude" | "gemini" | "openai",
  apiKey: string
): Promise<KeyTestResult> {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) {
    return {
      success: false,
      message: "No API key provided to test.",
      provider,
    };
  }

  try {
    if (provider === "claude") {
      const client = new Anthropic({ apiKey: cleanKey });
      try {
        await client.models.list({ limit: 1 });
      } catch (listErr: any) {
        // Fallback to minimal haiku call if models.list isn't supported on account
        await client.messages.create({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        });
      }
      return {
        success: true,
        message: "Anthropic Claude API key is valid and operational.",
        provider,
      };
    }

    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "ping",
      });
      return {
        success: true,
        message: "Google Gemini API key is valid and operational.",
        provider,
      };
    }

    if (provider === "openai") {
      const openai = new OpenAI({ apiKey: cleanKey });
      await openai.models.list();
      return {
        success: true,
        message: "ChatGPT (OpenAI) API key is valid and operational.",
        provider,
      };
    }

    return {
      success: false,
      message: "Unknown AI provider.",
      provider,
    };
  } catch (err: any) {
    const errorMsg = err?.message || err?.toString() || "Connection error";
    return {
      success: false,
      message: `Verification failed: ${errorMsg}`,
      provider,
    };
  }
}
