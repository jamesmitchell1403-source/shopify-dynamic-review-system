export interface KeyTestResult {
  success: boolean;
  message: string;
  provider: "claude" | "gemini" | "openai";
  detectedTier?: "free" | "paid";
  tierReason?: string;
  tierIndeterminate?: boolean;
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
      let detectedTier: "free" | "paid" | undefined = undefined;
      let tierReason = "Unable to determine account tier";
      let tierIndeterminate = true;

      if (rpmLimit > 0 && rpmLimit <= 5) {
        detectedTier = "free";
        tierReason = "Free tier detected (5 RPM rate limit header)";
        tierIndeterminate = false;
      } else if (rpmLimit > 5) {
        detectedTier = "paid";
        tierReason = `Paid tier detected (${rpmLimit} RPM production limit)`;
        tierIndeterminate = false;
      }

      return {
        success: true,
        message: tierIndeterminate
          ? "Anthropic Claude key verified. Unable to determine account tier — please verify and select Free (3-Month) or Paid (12-Month) tier above."
          : `Anthropic Claude key verified. ${tierReason}.`,
        provider,
        detectedTier,
        tierReason,
        tierIndeterminate,
      };
    }

    // 2. GOOGLE GEMINI
    // Queries the models endpoint directly to verify key validity
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status} response from Google Gemini`);
      }

      const jsonRes = (await res.json().catch(() => ({}))) as any;
      const modelCount = jsonRes?.models?.length || 0;

      // Google Gemini REST API does NOT expose billing or rate limit headers.
      // Free accounts (Google AI Studio) and Paid accounts (Google Cloud billing) share the same API endpoints and models.
      // Therefore, the system MUST NOT automatically classify this as Paid.
      return {
        success: true,
        message: `Google Gemini key verified successfully (${modelCount} models accessible). Unable to determine account tier automatically (Gemini API does not expose billing tier). Please select Free (3-Month) or Paid (12-Month) tier above.`,
        provider,
        detectedTier: undefined, // Never hardcode paid!
        tierReason: "Unable to determine account tier",
        tierIndeterminate: true,
      };
    }

    // 3. CHATGPT (OPENAI)
    if (provider === "openai") {
      // 3a. First verify API key authenticity via the models listing endpoint
      const modelRes = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${cleanKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!modelRes.ok) {
        const errJson = await modelRes.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${modelRes.status} response from OpenAI`);
      }

      // 3b. Key is valid! Now inspect completions rate-limits and credit balance
      const compRes = await fetch("https://api.openai.com/v1/chat/completions", {
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

      if (compRes.ok) {
        const rpmLimit = parseInt(compRes.headers.get("x-ratelimit-limit-requests") || "0", 10);
        const tpmLimit = parseInt(compRes.headers.get("x-ratelimit-limit-tokens") || "0", 10);

        let detectedTier: "free" | "paid" | undefined = undefined;
        let tierReason = "Unable to determine account tier";
        let tierIndeterminate = true;

        if (rpmLimit > 0 && rpmLimit <= 3 && tpmLimit <= 40000) {
          detectedTier = "free";
          tierReason = "Free trial / Free tier detected (3 RPM rate limit)";
          tierIndeterminate = false;
        } else if (rpmLimit >= 20 || tpmLimit >= 50000) {
          detectedTier = "paid";
          tierReason = `Paid tier detected (${rpmLimit ? `${rpmLimit} RPM` : `${tpmLimit} TPM`})`;
          tierIndeterminate = false;
        }

        return {
          success: true,
          message: tierIndeterminate
            ? "ChatGPT (OpenAI) key verified. Unable to determine account tier — please verify and select Free (3-Month) or Paid (12-Month) tier above."
            : `ChatGPT (OpenAI) key verified. ${tierReason}.`,
          provider,
          detectedTier,
          tierReason,
          tierIndeterminate,
        };
      } else {
        const errJson = await compRes.json().catch(() => ({}));
        const errMessage = errJson?.error?.message || "";
        const errCode = errJson?.error?.code || "";

        // If the key is authentic, but the OpenAI account has 0 credit balance
        if (
          errCode === "insufficient_quota" ||
          errMessage.toLowerCase().includes("no credits remaining") ||
          errMessage.toLowerCase().includes("quota")
        ) {
          return {
            success: true,
            message: `ChatGPT key is valid & connected, but has $0 credits remaining. Unable to determine account tier — please verify and select Free (3-Month) or Paid (12-Month) tier above, and recharge billing credits at platform.openai.com.`,
            provider,
            detectedTier: undefined,
            tierReason: "Unable to determine account tier",
            tierIndeterminate: true,
          };
        }

        throw new Error(errMessage || `HTTP ${compRes.status} response from OpenAI`);
      }
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
