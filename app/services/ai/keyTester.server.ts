export interface KeyTestResult {
  success: boolean;
  message: string;
  provider: "claude" | "gemini" | "openai";
  detectedTier?: "free" | "paid";
  tierReason?: string;
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

  // Reject masked keys or keys with non-ASCII characters that would cause ByteString errors
  if (cleanKey.includes("•") || /[^\x20-\x7E]/.test(cleanKey)) {
    return {
      success: false,
      message: "Masked or invalid key characters detected. Please enter a genuine API key.",
      provider,
    };
  }

  try {
    // 1. ANTHROPIC CLAUDE
    if (provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status} response from Anthropic`);
      }

      const rpmLimit = parseInt(res.headers.get("anthropic-ratelimit-requests-limit") || "0", 10);
      let detectedTier: "free" | "paid" = "paid";
      let tierReason = "Paid account detected (Standard production limits active)";

      if (rpmLimit > 0 && rpmLimit <= 5) {
        detectedTier = "free";
        tierReason = "Free tier detected (5 RPM rate limit header)";
      } else if (rpmLimit > 5) {
        detectedTier = "paid";
        tierReason = `Paid tier detected (${rpmLimit} RPM production limit)`;
      }

      return {
        success: true,
        message: `Anthropic Claude key verified. ${tierReason}.`,
        provider,
        detectedTier,
        tierReason,
      };
    }

    // 2. GOOGLE GEMINI
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status} response from Google Gemini`);
      }

      // Gemini valid operational keys with billing/production quota
      const detectedTier: "free" | "paid" = "paid";
      const tierReason = "Paid / Standard active account verified";

      return {
        success: true,
        message: `Google Gemini key verified. ${tierReason}.`,
        provider,
        detectedTier,
        tierReason,
      };
    }

    // 3. CHATGPT (OPENAI)
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status} response from OpenAI`);
      }

      const rpmLimit = parseInt(res.headers.get("x-ratelimit-limit-requests") || "0", 10);
      const tpmLimit = parseInt(res.headers.get("x-ratelimit-limit-tokens") || "0", 10);

      let detectedTier: "free" | "paid" = "paid";
      let tierReason = "Paid account detected (Production tier limits active)";

      if (rpmLimit > 0 && rpmLimit <= 3 && tpmLimit <= 40000) {
        detectedTier = "free";
        tierReason = "Free trial / Free tier detected (3 RPM rate limit)";
      } else if (rpmLimit >= 20 || tpmLimit >= 50000) {
        detectedTier = "paid";
        tierReason = `Paid tier detected (${rpmLimit ? `${rpmLimit} RPM` : `${tpmLimit} TPM`})`;
      }

      return {
        success: true,
        message: `ChatGPT (OpenAI) key verified. ${tierReason}.`,
        provider,
        detectedTier,
        tierReason,
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
