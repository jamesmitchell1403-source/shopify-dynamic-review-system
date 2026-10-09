import db from "../../db.server";
import {
  getShopAIKeysFromShopify,
  saveShopAIKeysToShopify,
  ExpiredKeyItem,
} from "../shopifyMetafields.server";

export function getValidityMonths(planType?: string | null): number {
  return planType === "paid" ? 12 : 3;
}

export function computeExpirationDate(
  addedAt: Date | string,
  planType?: string | null
): Date {
  const date = new Date(addedAt);
  const months = getValidityMonths(planType);
  const expiry = new Date(date);
  expiry.setMonth(expiry.getMonth() + months);
  return expiry;
}

export function isKeyExpired(
  addedAt: Date | string | null | undefined,
  planType?: string | null
): boolean {
  if (!addedAt) return false;
  const expiry = computeExpirationDate(addedAt, planType);
  return Date.now() >= expiry.getTime();
}

/**
 * Checks if a key has previously expired and was blacklisted.
 * Compares exact trimmed key strings to prevent reuse.
 */
export function isKeyInExpiredHistory(
  keyToTest: string,
  provider: "claude" | "gemini" | "openai",
  expiredKeysList: ExpiredKeyItem[]
): boolean {
  const cleanKey = (keyToTest || "").trim();
  if (!cleanKey || !Array.isArray(expiredKeysList)) return false;

  return expiredKeysList.some(
    (item) => item.provider === provider && item.key.trim() === cleanKey
  );
}

/**
 * Inspects all configured AI keys for the shop.
 * If any key has passed its 3-month (free) or 12-month (paid) validity window:
 * 1. Automatically removes the key from the system.
 * 2. Archives it into the expiredKeys blacklist to prevent reuse.
 * 3. Sets the required expiredNotice.
 *
 * CRITICAL SAFETY GUARANTEE:
 * This function NEVER touches, deletes, modifies, or resets any reviews,
 * review history, ratings, tags, or storefront widget data.
 */
export async function checkAndPurgeExpiredKeys(admin: any, shop: string) {
  const shopifyCloudKeys = await getShopAIKeysFromShopify(admin);
  const localSettings = await db.shopSettings.findUnique({ where: { shop } });

  const anthropicKey =
    shopifyCloudKeys?.anthropicApiKey || localSettings?.anthropicApiKey || "";
  const geminiKey =
    shopifyCloudKeys?.geminiApiKey || localSettings?.geminiApiKey || "";
  const openaiKey =
    shopifyCloudKeys?.openaiApiKey || (localSettings as any)?.openaiApiKey || "";

  const anthropicAddedAt =
    shopifyCloudKeys?.anthropicKeyAddedAt ||
    (localSettings?.anthropicKeyAddedAt
      ? new Date(localSettings.anthropicKeyAddedAt).toISOString()
      : null);
  const geminiAddedAt =
    shopifyCloudKeys?.geminiKeyAddedAt ||
    (localSettings?.geminiKeyAddedAt
      ? new Date(localSettings.geminiKeyAddedAt).toISOString()
      : null);
  const openaiAddedAt =
    shopifyCloudKeys?.openaiKeyAddedAt ||
    ((localSettings as any)?.openaiKeyAddedAt
      ? new Date((localSettings as any).openaiKeyAddedAt).toISOString()
      : null);

  const anthropicPlan: "free" | "paid" =
    shopifyCloudKeys?.anthropicPlanType ||
    (localSettings as any)?.anthropicPlanType === "paid"
      ? "paid"
      : "free";
  const geminiPlan: "free" | "paid" =
    shopifyCloudKeys?.geminiPlanType ||
    (localSettings as any)?.geminiPlanType === "paid"
      ? "paid"
      : "free";
  const openaiPlan: "free" | "paid" =
    shopifyCloudKeys?.openaiPlanType ||
    (localSettings as any)?.openaiPlanType === "paid"
      ? "paid"
      : "free";

  let expiredKeys: ExpiredKeyItem[] = [
    ...(shopifyCloudKeys?.expiredKeys || []),
  ];

  let localExpiredKeys: ExpiredKeyItem[] = [];
  try {
    if ((localSettings as any)?.expiredKeys) {
      localExpiredKeys = JSON.parse((localSettings as any).expiredKeys);
    }
  } catch (_) {}

  // Merge unique expired keys
  for (const item of localExpiredKeys) {
    if (!expiredKeys.some((e) => e.provider === item.provider && e.key === item.key)) {
      expiredKeys.push(item);
    }
  }

  let expiredNotices: { [k: string]: string | null } = {
    ...(shopifyCloudKeys?.expiredNotices || {}),
  };
  try {
    if ((localSettings as any)?.expiredNotices) {
      const parsedLocal = JSON.parse((localSettings as any).expiredNotices);
      expiredNotices = { ...parsedLocal, ...expiredNotices };
    }
  } catch (_) {}

  let purgedClaude = false;
  let purgedGemini = false;
  let purgedOpenai = false;

  const nowIso = new Date().toISOString();

  // 1. Check Anthropic Claude
  if (anthropicKey && anthropicAddedAt && isKeyExpired(anthropicAddedAt, anthropicPlan)) {
    expiredKeys.push({
      key: anthropicKey,
      provider: "claude",
      planType: anthropicPlan,
      addedAt: anthropicAddedAt,
      expiredAt: nowIso,
    });
    expiredNotices.claude =
      anthropicPlan === "free"
        ? "Your previous API key has expired after 3 months and has been removed. Please add a new API key to continue using this AI model."
        : "Your previous API key has expired after 12 months and has been removed. Please add a new API key to continue using this AI model.";
    purgedClaude = true;
  }

  // 2. Check Google Gemini
  if (geminiKey && geminiAddedAt && isKeyExpired(geminiAddedAt, geminiPlan)) {
    expiredKeys.push({
      key: geminiKey,
      provider: "gemini",
      planType: geminiPlan,
      addedAt: geminiAddedAt,
      expiredAt: nowIso,
    });
    expiredNotices.gemini =
      geminiPlan === "free"
        ? "Your previous API key has expired after 3 months and has been removed. Please add a new API key to continue using this AI model."
        : "Your previous API key has expired after 12 months and has been removed. Please add a new API key to continue using this AI model.";
    purgedGemini = true;
  }

  // 3. Check OpenAI
  if (openaiKey && openaiAddedAt && isKeyExpired(openaiAddedAt, openaiPlan)) {
    expiredKeys.push({
      key: openaiKey,
      provider: "openai",
      planType: openaiPlan,
      addedAt: openaiAddedAt,
      expiredAt: nowIso,
    });
    expiredNotices.openai =
      openaiPlan === "free"
        ? "Your previous API key has expired after 3 months and has been removed. Please add a new API key to continue using this AI model."
        : "Your previous API key has expired after 12 months and has been removed. Please add a new API key to continue using this AI model.";
    purgedOpenai = true;
  }

  const anyPurged = purgedClaude || purgedGemini || purgedOpenai;

  if (anyPurged) {
    const updatedCloudKeys = {
      anthropicApiKey: purgedClaude ? null : anthropicKey,
      geminiApiKey: purgedGemini ? null : geminiKey,
      openaiApiKey: purgedOpenai ? null : openaiKey,
      anthropicKeyAddedAt: purgedClaude ? null : anthropicAddedAt,
      geminiKeyAddedAt: purgedGemini ? null : geminiAddedAt,
      openaiKeyAddedAt: purgedOpenai ? null : openaiAddedAt,
      anthropicPlanType: anthropicPlan,
      geminiPlanType: geminiPlan,
      openaiPlanType: openaiPlan,
      expiredKeys,
      expiredNotices,
    };

    // Save to Shopify Metafield
    await saveShopAIKeysToShopify(admin, updatedCloudKeys);

    // Save to local database
    try {
      await db.shopSettings.upsert({
        where: { shop },
        update: {
          anthropicApiKey: purgedClaude ? null : anthropicKey,
          geminiApiKey: purgedGemini ? null : geminiKey,
          openaiApiKey: purgedOpenai ? null : openaiKey,
          anthropicKeyAddedAt: purgedClaude ? null : anthropicAddedAt ? new Date(anthropicAddedAt) : null,
          geminiKeyAddedAt: purgedGemini ? null : geminiAddedAt ? new Date(geminiAddedAt) : null,
          openaiKeyAddedAt: purgedOpenai ? null : openaiAddedAt ? new Date(openaiAddedAt) : null,
          anthropicPlanType: anthropicPlan,
          geminiPlanType: geminiPlan,
          openaiPlanType: openaiPlan,
          expiredKeys: JSON.stringify(expiredKeys),
          expiredNotices: JSON.stringify(expiredNotices),
        },
        create: {
          shop,
          anthropicApiKey: purgedClaude ? null : anthropicKey,
          geminiApiKey: purgedGemini ? null : geminiKey,
          openaiApiKey: purgedOpenai ? null : openaiKey,
          anthropicPlanType: anthropicPlan,
          geminiPlanType: geminiPlan,
          openaiPlanType: openaiPlan,
          expiredKeys: JSON.stringify(expiredKeys),
          expiredNotices: JSON.stringify(expiredNotices),
        },
      });
    } catch (dbErr) {
      console.warn("DB update error during auto-purge:", dbErr);
    }
  }

  return {
    purgedClaude,
    purgedGemini,
    purgedOpenai,
    expiredKeys,
    expiredNotices,
    activeKeys: {
      anthropicApiKey: purgedClaude ? "" : anthropicKey,
      geminiApiKey: purgedGemini ? "" : geminiKey,
      openaiApiKey: purgedOpenai ? "" : openaiKey,
      anthropicKeyAddedAt: purgedClaude ? null : anthropicAddedAt,
      geminiKeyAddedAt: purgedGemini ? null : geminiAddedAt,
      openaiKeyAddedAt: purgedOpenai ? null : openaiAddedAt,
      anthropicPlanType: anthropicPlan,
      geminiPlanType: geminiPlan,
      openaiPlanType: openaiPlan,
    },
  };
}
