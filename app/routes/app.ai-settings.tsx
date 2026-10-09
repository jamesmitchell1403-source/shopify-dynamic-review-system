import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useActionData } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Text,
  Badge,
  DataTable,
  Select,
  ProgressBar,
  Box,
  Divider,
} from "@shopify/polaris";
import { DeleteIcon, RefreshIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { getShopAIKeysFromShopify, saveShopAIKeysToShopify, ExpiredKeyItem } from "../services/shopifyMetafields.server";
import { ensureAiJobsRestored, syncAiJobsToShopify } from "../services/reviewPersistence.server";
import { testAIProviderKey } from "../services/ai/keyTester.server";
import {
  checkAndPurgeExpiredKeys,
  isKeyInExpiredHistory,
  computeExpirationDate,
  getValidityMonths,
} from "../services/ai/keyLifecycle.server";

function safeIsoString(val: any): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function safeFormatDate(d: Date): string {
  try {
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await ensureTablesExist().catch(() => {});
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    let aiJobs: any[] = [];

    try {
      await ensureAiJobsRestored(admin, shop);

      aiJobs = await db.aiGenerationJob.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
      });
    } catch (jobErr) {
      console.warn("AI generation jobs load warning:", jobErr);
    }

    // Run auto-expiration check: removes keys older than 3 months (free) or 12 months (paid)
    // CRITICAL GUARANTEE: Does NOT touch or delete any review data!
    const purgeResult = await checkAndPurgeExpiredKeys(admin, shop).catch(() => ({
      purgedClaude: false,
      purgedGemini: false,
      purgedOpenai: false,
      expiredKeys: [],
      expiredNotices: {},
      activeKeys: {
        anthropicApiKey: "",
        geminiApiKey: "",
        openaiApiKey: "",
        anthropicKeyAddedAt: null,
        geminiKeyAddedAt: null,
        openaiKeyAddedAt: null,
        anthropicPlanType: "free" as const,
        geminiPlanType: "free" as const,
        openaiPlanType: "free" as const,
      },
    }));

    const shopifyCloudKeys = await getShopAIKeysFromShopify(admin).catch(() => null);
    const localSettings = await db.shopSettings.findUnique({ where: { shop } }).catch(() => null);

    const nowIso = new Date().toISOString();
    const claudeKeyFinal =
      purgeResult.activeKeys.anthropicApiKey ||
      shopifyCloudKeys?.anthropicApiKey ||
      localSettings?.anthropicApiKey ||
      "";
    const geminiKeyFinal =
      purgeResult.activeKeys.geminiApiKey ||
      shopifyCloudKeys?.geminiApiKey ||
      localSettings?.geminiApiKey ||
      "";
    const openaiKeyFinal =
      purgeResult.activeKeys.openaiApiKey ||
      shopifyCloudKeys?.openaiApiKey ||
      (localSettings as any)?.openaiApiKey ||
      "";

    const anthropicKeyAddedAt =
      purgeResult.activeKeys.anthropicKeyAddedAt ||
      shopifyCloudKeys?.anthropicKeyAddedAt ||
      safeIsoString(localSettings?.anthropicKeyAddedAt) ||
      (claudeKeyFinal ? nowIso : null);

    const geminiKeyAddedAt =
      purgeResult.activeKeys.geminiKeyAddedAt ||
      shopifyCloudKeys?.geminiKeyAddedAt ||
      safeIsoString(localSettings?.geminiKeyAddedAt) ||
      (geminiKeyFinal ? nowIso : null);

    const openaiKeyAddedAt =
      purgeResult.activeKeys.openaiKeyAddedAt ||
      shopifyCloudKeys?.openaiKeyAddedAt ||
      safeIsoString((localSettings as any)?.openaiKeyAddedAt) ||
      (openaiKeyFinal ? nowIso : null);

    const mergedSettings = {
      shop,
      anthropicApiKey: claudeKeyFinal,
      geminiApiKey: geminiKeyFinal,
      openaiApiKey: openaiKeyFinal,
      anthropicKeyAddedAt,
      geminiKeyAddedAt,
      openaiKeyAddedAt,
      anthropicPlanType:
        purgeResult.activeKeys.anthropicPlanType ||
        shopifyCloudKeys?.anthropicPlanType ||
        (localSettings as any)?.anthropicPlanType ||
        "free",
      geminiPlanType:
        purgeResult.activeKeys.geminiPlanType ||
        shopifyCloudKeys?.geminiPlanType ||
        (localSettings as any)?.geminiPlanType ||
        "free",
      openaiPlanType:
        purgeResult.activeKeys.openaiPlanType ||
        shopifyCloudKeys?.openaiPlanType ||
        (localSettings as any)?.openaiPlanType ||
        "free",
      expiredKeys: purgeResult.expiredKeys || [],
      expiredNotices: purgeResult.expiredNotices || {},
    };

    return json({ settings: mergedSettings, aiJobs });
  } catch (err: any) {
    console.error("AI settings DB loader error:", err);
    const fallbackSettings = {
      shop: "",
      anthropicApiKey: "",
      geminiApiKey: "",
      openaiApiKey: "",
      anthropicKeyAddedAt: null,
      geminiKeyAddedAt: null,
      openaiKeyAddedAt: null,
      anthropicPlanType: "free" as const,
      geminiPlanType: "free" as const,
      openaiPlanType: "free" as const,
      expiredKeys: [],
      expiredNotices: {},
    };
    return json({ settings: fallbackSettings, aiJobs: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    await ensureTablesExist().catch(() => {});
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    // 1. DELETE SINGLE AUDIT JOB
    if (intent === "deleteJob") {
      const jobId = formData.get("jobId") as string;
      if (jobId) {
        await db.aiGenerationJob.deleteMany({
          where: { id: jobId, shop },
        }).catch(() => {});
        await syncAiJobsToShopify(admin, shop, true).catch(() => {});
      }
      return json({ success: true, message: "Audit history record deleted." });
    }

    // 2. CLEAR ALL AUDIT JOBS
    if (intent === "clearAllJobs") {
      await db.aiGenerationJob.deleteMany({
        where: { shop },
      }).catch(() => {});
      await syncAiJobsToShopify(admin, shop, true).catch(() => {});
      return json({ success: true, message: "All audit history records cleared." });
    }

    // Retrieve current existing keys and expired keys blacklist
    const existingCloud = await getShopAIKeysFromShopify(admin).catch(() => null);
    const existingDb = await db.shopSettings.findUnique({ where: { shop } }).catch(() => null);

    const oldAnthropic = existingCloud?.anthropicApiKey ?? existingDb?.anthropicApiKey ?? "";
    const oldGemini = existingCloud?.geminiApiKey ?? existingDb?.geminiApiKey ?? "";
    const oldOpenai = existingCloud?.openaiApiKey ?? (existingDb as any)?.openaiApiKey ?? "";

    // 3. RESET TIMER FOR A SPECIFIC PROVIDER
    if (intent === "resetTimer") {
      const provider = formData.get("provider") as string;
      const nowIso = new Date().toISOString();

      const metafieldUpdate: any = {};
      if (provider === "claude") metafieldUpdate.anthropicKeyAddedAt = nowIso;
      if (provider === "gemini") metafieldUpdate.geminiKeyAddedAt = nowIso;
      if (provider === "openai") metafieldUpdate.openaiKeyAddedAt = nowIso;

      await saveShopAIKeysToShopify(admin, metafieldUpdate).catch(() => false);

      try {
        if (provider === "claude") {
          await db.shopSettings.update({ where: { shop }, data: { anthropicKeyAddedAt: new Date(nowIso) } });
        } else if (provider === "gemini") {
          await db.shopSettings.update({ where: { shop }, data: { geminiKeyAddedAt: new Date(nowIso) } });
        } else if (provider === "openai") {
          await db.shopSettings.update({ where: { shop }, data: { openaiKeyAddedAt: new Date(nowIso) } });
        }
      } catch (dbErr) {
        console.warn("DB update error on resetTimer:", dbErr);
      }

      return json({ success: true, message: `Validity timer reset for ${provider.toUpperCase()}.` });
    }

    // 4. TEST PROVIDER KEY LIVE
    if (intent === "testKey") {
      const provider = formData.get("provider") as "claude" | "gemini" | "openai";
      let apiKey = ((formData.get("apiKey") as string) || "").trim();

      // If masked key was submitted for testing, retrieve the unmasked key from storage
      if (apiKey.includes("•")) {
        if (provider === "claude") apiKey = oldAnthropic;
        if (provider === "gemini") apiKey = oldGemini;
        if (provider === "openai") apiKey = oldOpenai;
      }

      const testResult = await testAIProviderKey(provider, apiKey);
      return json({ testResult });
    }

    // 5. DEFAULT ACTION: SAVE API KEYS & ACCOUNT VALIDITY TIERS
    const anthropicApiKeyRaw = formData.get("anthropicApiKey") as string | null;
    const geminiApiKeyRaw = formData.get("geminiApiKey") as string | null;
    const openaiApiKeyRaw = formData.get("openaiApiKey") as string | null;

    const anthropicPlanType = ((formData.get("anthropicPlanType") as string) || "free") as "free" | "paid";
    const geminiPlanType = ((formData.get("geminiPlanType") as string) || "free") as "free" | "paid";
    const openaiPlanType = ((formData.get("openaiPlanType") as string) || "free") as "free" | "paid";

    const isRealClaude = Boolean(anthropicApiKeyRaw && !anthropicApiKeyRaw.includes("•") && anthropicApiKeyRaw.trim().length > 0);
    const isRealGemini = Boolean(geminiApiKeyRaw && !geminiApiKeyRaw.includes("•") && geminiApiKeyRaw.trim().length > 0);
    const isRealOpenai = Boolean(openaiApiKeyRaw && !openaiApiKeyRaw.includes("•") && openaiApiKeyRaw.trim().length > 0);

    // If masked dots were submitted, preserve existing keys so they are NOT overwritten with dots
    const anthropicApiKey = isRealClaude
      ? anthropicApiKeyRaw!.trim()
      : anthropicApiKeyRaw && anthropicApiKeyRaw.includes("•")
      ? oldAnthropic
      : null;

    const geminiApiKey = isRealGemini
      ? geminiApiKeyRaw!.trim()
      : geminiApiKeyRaw && geminiApiKeyRaw.includes("•")
      ? oldGemini
      : null;

    const openaiApiKey = isRealOpenai
      ? openaiApiKeyRaw!.trim()
      : openaiApiKeyRaw && openaiApiKeyRaw.includes("•")
      ? oldOpenai
      : null;

    let expiredKeys: ExpiredKeyItem[] = [...(existingCloud?.expiredKeys || [])];
    try {
      if ((existingDb as any)?.expiredKeys) {
        const parsed = JSON.parse((existingDb as any).expiredKeys);
        for (const item of parsed) {
          if (!expiredKeys.some((e) => e.provider === item.provider && e.key === item.key)) {
            expiredKeys.push(item);
          }
        }
      }
    } catch (_) {}

    // ENFORCE REQUIREMENT: Check if user is attempting to re-add an expired API key
    const validationErrors: { [provider: string]: string } = {};

    if (isRealClaude && anthropicApiKey && isKeyInExpiredHistory(anthropicApiKey, "claude", expiredKeys)) {
      validationErrors.claude = "You are trying to add an expired API key. Please provide a new API key.";
    }
    if (isRealGemini && geminiApiKey && isKeyInExpiredHistory(geminiApiKey, "gemini", expiredKeys)) {
      validationErrors.gemini = "You are trying to add an expired API key. Please provide a new API key.";
    }
    if (isRealOpenai && openaiApiKey && isKeyInExpiredHistory(openaiApiKey, "openai", expiredKeys)) {
      validationErrors.openai = "You are trying to add an expired API key. Please provide a new API key.";
    }

    if (Object.keys(validationErrors).length > 0) {
      return json({
        success: false,
        validationErrors,
        message: "One or more API keys have expired previously and cannot be reused. Please provide a new API key.",
      });
    }

    const nowIso = new Date().toISOString();

    let anthropicKeyAddedAt =
      existingCloud?.anthropicKeyAddedAt ?? safeIsoString((existingDb as any)?.anthropicKeyAddedAt) ?? null;
    let geminiKeyAddedAt =
      existingCloud?.geminiKeyAddedAt ?? safeIsoString((existingDb as any)?.geminiKeyAddedAt) ?? null;
    let openaiKeyAddedAt =
      existingCloud?.openaiKeyAddedAt ?? safeIsoString((existingDb as any)?.openaiKeyAddedAt) ?? null;

    let expiredNotices: { [k: string]: string | null } = {
      ...(existingCloud?.expiredNotices || {}),
    };

    // Update timestamps when key changes or is newly set, and clear notices
    if (isRealClaude && anthropicApiKey && anthropicApiKey !== oldAnthropic) {
      anthropicKeyAddedAt = nowIso;
      expiredNotices.claude = null;
    } else if (!anthropicApiKey) {
      anthropicKeyAddedAt = null;
    } else if (anthropicApiKey && !anthropicKeyAddedAt) {
      anthropicKeyAddedAt = nowIso;
    }

    if (isRealGemini && geminiApiKey && geminiApiKey !== oldGemini) {
      geminiKeyAddedAt = nowIso;
      expiredNotices.gemini = null;
    } else if (!geminiApiKey) {
      geminiKeyAddedAt = null;
    } else if (geminiApiKey && !geminiKeyAddedAt) {
      geminiKeyAddedAt = nowIso;
    }

    if (isRealOpenai && openaiApiKey && openaiApiKey !== oldOpenai) {
      openaiKeyAddedAt = nowIso;
      expiredNotices.openai = null;
    } else if (!openaiApiKey) {
      openaiKeyAddedAt = null;
    } else if (openaiApiKey && !openaiKeyAddedAt) {
      openaiKeyAddedAt = nowIso;
    }

    let finalClaudePlan = anthropicPlanType;
    let finalGeminiPlan = geminiPlanType;
    let finalOpenaiPlan = openaiPlanType;

    // Auto-detect tier via live API inspection if genuine new key is provided
    if (isRealClaude && anthropicApiKey && anthropicApiKey !== oldAnthropic) {
      try {
        const testRes = await testAIProviderKey("claude", anthropicApiKey);
        if (testRes.success && testRes.detectedTier) finalClaudePlan = testRes.detectedTier;
      } catch (_) {}
    }
    if (isRealGemini && geminiApiKey && geminiApiKey !== oldGemini) {
      try {
        const testRes = await testAIProviderKey("gemini", geminiApiKey);
        if (testRes.success && testRes.detectedTier) finalGeminiPlan = testRes.detectedTier;
      } catch (_) {}
    }
    if (isRealOpenai && openaiApiKey && openaiApiKey !== oldOpenai) {
      try {
        const testRes = await testAIProviderKey("openai", openaiApiKey);
        if (testRes.success && testRes.detectedTier) finalOpenaiPlan = testRes.detectedTier;
      } catch (_) {}
    }

    // 1. Save permanently to Shopify Cloud (Shop Metafields) — survives all Render resets
    await saveShopAIKeysToShopify(admin, {
      anthropicApiKey,
      geminiApiKey,
      openaiApiKey,
      anthropicKeyAddedAt,
      geminiKeyAddedAt,
      openaiKeyAddedAt,
      anthropicPlanType: finalClaudePlan,
      geminiPlanType: finalGeminiPlan,
      openaiPlanType: finalOpenaiPlan,
      expiredKeys,
      expiredNotices,
    }).catch((e) => console.warn("saveShopAIKeysToShopify warn:", e));

    // 2. Also update local DB
    // CRITICAL GUARANTEE: Does NOT delete or alter any records in Review table!
    try {
      await db.shopSettings.upsert({
        where: { shop },
        update: {
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          anthropicKeyAddedAt: anthropicKeyAddedAt ? new Date(anthropicKeyAddedAt) : null,
          geminiKeyAddedAt: geminiKeyAddedAt ? new Date(geminiKeyAddedAt) : null,
          openaiKeyAddedAt: openaiKeyAddedAt ? new Date(openaiKeyAddedAt) : null,
          anthropicPlanType: finalClaudePlan,
          geminiPlanType: finalGeminiPlan,
          openaiPlanType: finalOpenaiPlan,
          expiredKeys: JSON.stringify(expiredKeys),
          expiredNotices: JSON.stringify(expiredNotices),
        },
        create: {
          shop,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          anthropicKeyAddedAt: anthropicKeyAddedAt ? new Date(anthropicKeyAddedAt) : null,
          geminiKeyAddedAt: geminiKeyAddedAt ? new Date(geminiKeyAddedAt) : null,
          openaiKeyAddedAt: openaiKeyAddedAt ? new Date(openaiKeyAddedAt) : null,
          anthropicPlanType: finalClaudePlan,
          geminiPlanType: finalGeminiPlan,
          openaiPlanType: finalOpenaiPlan,
          expiredKeys: JSON.stringify(expiredKeys),
          expiredNotices: JSON.stringify(expiredNotices),
        },
      });
    } catch (err) {
      console.warn("Prisma upsert warning, executing raw SQL fallback:", err);
      try {
        const existing = await db.$queryRawUnsafe<any[]>(`SELECT id FROM ShopSettings WHERE shop = ?`, shop);
        if (existing && existing.length > 0) {
          await db.$executeRawUnsafe(
            `UPDATE ShopSettings SET anthropicApiKey = ?, geminiApiKey = ?, openaiApiKey = ?, anthropicPlanType = ?, geminiPlanType = ?, openaiPlanType = ?, anthropicKeyAddedAt = ?, geminiKeyAddedAt = ?, openaiKeyAddedAt = ?, expiredKeys = ?, expiredNotices = ? WHERE shop = ?`,
            anthropicApiKey,
            geminiApiKey,
            openaiApiKey,
            finalClaudePlan,
            finalGeminiPlan,
            finalOpenaiPlan,
            anthropicKeyAddedAt,
            geminiKeyAddedAt,
            openaiKeyAddedAt,
            JSON.stringify(expiredKeys),
            JSON.stringify(expiredNotices),
            shop
          );
        } else {
          await db.$executeRawUnsafe(
            `INSERT INTO ShopSettings (id, shop, anthropicApiKey, geminiApiKey, openaiApiKey, anthropicPlanType, geminiPlanType, openaiPlanType, anthropicKeyAddedAt, geminiKeyAddedAt, openaiKeyAddedAt, expiredKeys, expiredNotices) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            `set_${Date.now()}`,
            shop,
            anthropicApiKey,
            geminiApiKey,
            openaiApiKey,
            finalClaudePlan,
            finalGeminiPlan,
            finalOpenaiPlan,
            anthropicKeyAddedAt,
            geminiKeyAddedAt,
            openaiKeyAddedAt,
            JSON.stringify(expiredKeys),
            JSON.stringify(expiredNotices)
          );
        }
      } catch (sqlErr) {
        console.error("Raw SQL fallback error:", sqlErr);
      }
    }

    return json({ success: true, message: "API keys and validity preferences saved successfully." });
  } catch (outerErr: any) {
    console.error("Safely caught outer action error in AI settings:", outerErr);
    return json({
      success: false,
      message: outerErr?.message || "An error occurred while saving AI settings. Please try again.",
    });
  }
}

// Client-side lifecycle calculation
function calculateValidityDetails(
  addedAt: string | null | undefined,
  hasKey: boolean,
  planType: "free" | "paid"
) {
  const validityMonths = planType === "paid" ? 12 : 3;

  if (!hasKey) {
    return {
      isConfigured: false,
      badgeTone: undefined as any,
      badgeText: "Not Configured",
      addedDateFormatted: "—",
      expiryDateFormatted: "—",
      daysRemaining: 0,
      daysElapsed: 0,
      progressPercent: 0,
      isExpired: false,
      isExpiringSoon: false,
      validityMonths,
    };
  }

  const addedDate = addedAt ? new Date(addedAt) : new Date();
  const validAddedDate = isNaN(addedDate.getTime()) ? new Date() : addedDate;
  const expiryDate = new Date(validAddedDate);
  expiryDate.setMonth(expiryDate.getMonth() + validityMonths);

  const now = new Date();
  const msRemaining = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  const totalDurationMs = Math.max(1, expiryDate.getTime() - validAddedDate.getTime());
  const msElapsed = Math.max(0, now.getTime() - validAddedDate.getTime());
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((msElapsed / totalDurationMs) * 100))
  );

  const isExpired = msRemaining <= 0;
  const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 14;

  let badgeTone: "success" | "warning" | "critical" = "success";
  let badgeText = `${daysRemaining} days remaining (${validityMonths} Mo. Plan)`;

  if (isExpired) {
    badgeTone = "critical";
    badgeText = "Expired & Removed";
  } else if (isExpiringSoon) {
    badgeTone = "warning";
    badgeText = `Due in ${daysRemaining} days`;
  }

  return {
    isConfigured: true,
    badgeTone,
    badgeText,
    addedDateFormatted: safeFormatDate(validAddedDate),
    expiryDateFormatted: safeFormatDate(expiryDate),
    daysRemaining: isNaN(daysRemaining) ? 0 : daysRemaining,
    daysElapsed: isNaN(msElapsed) ? 0 : Math.round(msElapsed / (1000 * 60 * 60 * 24)),
    progressPercent: isNaN(progressPercent) ? 0 : progressPercent,
    isExpired,
    isExpiringSoon,
    validityMonths,
  };
}

function ProviderKeyBlock({
  label,
  provider,
  keyValue,
  onKeyChange,
  placeholder,
  helpText,
  planType,
  onPlanChange,
  validity,
  expiredNotice,
  validationError,
  onResetTimer,
  onTestKey,
  isTesting,
  testResult,
}: {
  label: string;
  provider: "claude" | "gemini" | "openai";
  keyValue: string;
  onKeyChange: (val: string) => void;
  placeholder: string;
  helpText: string;
  planType: "free" | "paid";
  onPlanChange: (val: "free" | "paid") => void;
  validity: ReturnType<typeof calculateValidityDetails>;
  expiredNotice?: string | null;
  validationError?: string | null;
  onResetTimer: (p: "claude" | "gemini" | "openai") => void;
  onTestKey: (p: "claude" | "gemini" | "openai", k: string) => void;
  isTesting: boolean;
  testResult?: { success: boolean; message: string };
}) {
  return (
    <BlockStack gap="300">
      {/* 1. Rejection Error Banner (if user tries to add an expired key) */}
      {validationError && (
        <Banner tone="critical" title="Expired Key Rejected">
          <p>{validationError}</p>
        </Banner>
      )}

      {/* 2. Auto-Removal Message (if previous key expired after 3 or 12 months) */}
      {expiredNotice && !keyValue && (
        <Banner tone="warning" title="API Key Expired & Removed">
          <p>{expiredNotice}</p>
        </Banner>
      )}

      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm" fontWeight="semibold">
          {label}
        </Text>
        <Badge tone={validity.isConfigured ? validity.badgeTone : undefined}>
          {validity.badgeText}
        </Badge>
      </InlineStack>

      <InlineStack gap="300" blockAlign="end">
        <div style={{ flex: "0 0 220px" }}>
          <Select
            label="Account Validity Tier"
            options={[
              { label: "Free Account (3-Month Validity)", value: "free" },
              { label: "Paid Account (12-Month Validity)", value: "paid" },
            ]}
            value={planType}
            onChange={(val) => onPlanChange(val as "free" | "paid")}
            helpText={planType === "free" ? "Auto-expires after 3 months" : "Auto-expires after 12 months"}
          />
        </div>

        <div style={{ flex: "1 1 auto" }}>
          <TextField
            label="API Key"
            type="password"
            value={keyValue}
            onChange={onKeyChange}
            onBlur={() => {
              if (keyValue && !keyValue.includes("•") && keyValue.trim().length >= 10 && !isTesting) {
                onTestKey(provider, keyValue);
              }
            }}
            autoComplete="off"
            placeholder={placeholder}
            helpText={helpText}
            error={Boolean(validationError)}
          />
        </div>
      </InlineStack>

      {validity.isConfigured ? (
        <Box
          padding="300"
          background="bg-surface-secondary"
          borderRadius="200"
          borderWidth="025"
          borderColor="border-subdued"
        >
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  Validity Window:
                </Text>
                <Badge tone={planType === "paid" ? "info" : "attention"}>
                  {planType === "paid" ? "Paid Account (12 Months)" : "Free Account (3 Months)"}
                </Badge>
              </InlineStack>

              <InlineStack gap="100">
                <Button
                  size="micro"
                  variant="plain"
                  icon={RefreshIcon}
                  onClick={() => onResetTimer(provider)}
                >
                  Reset Timer
                </Button>
                <Button
                  size="micro"
                  variant="secondary"
                  loading={isTesting}
                  onClick={() => onTestKey(provider, keyValue)}
                >
                  Auto-Detect Tier & Test
                </Button>
              </InlineStack>
            </InlineStack>

            <ProgressBar
              progress={validity.progressPercent}
              tone={
                validity.isExpired
                  ? "critical"
                  : validity.isExpiringSoon
                  ? "highlight"
                  : "success"
              }
              size="small"
            />

            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodyXs" tone="subdued">
                Added: <strong>{validity.addedDateFormatted}</strong>
              </Text>
              <Text
                as="span"
                variant="bodyXs"
                tone={
                  validity.isExpired
                    ? "critical"
                    : validity.isExpiringSoon
                    ? "caution"
                    : "subdued"
                }
              >
                Expires: <strong>{validity.expiryDateFormatted}</strong>
              </Text>
            </InlineStack>

            {testResult && (
              <Banner tone={testResult.success ? "success" : "critical"}>
                <p>{testResult.message}</p>
              </Banner>
            )}
          </BlockStack>
        </Box>
      ) : (
        <Box
          padding="200"
          background="bg-surface-tertiary"
          borderRadius="200"
        >
          <Text as="span" variant="bodyXs" tone="subdued">
            Enter your API key and choose Free (3 Months) or Paid (12 Months) to activate automatic expiration tracking.
          </Text>
        </Box>
      )}
    </BlockStack>
  );
}

export default function AiSettingsPage() {
  const { settings, aiJobs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<any>();
  const testFetcher = useFetcher<any>();
  const resetFetcher = useFetcher<any>();

  const [claudeKey, setClaudeKey] = useState<string>(settings?.anthropicApiKey || "");
  const [geminiKey, setGeminiKey] = useState<string>(settings?.geminiApiKey || "");
  const [openaiKey, setOpenaiKey] = useState<string>(settings?.openaiApiKey || "");

  const [claudePlan, setClaudePlan] = useState<"free" | "paid">(settings?.anthropicPlanType || "free");
  const [geminiPlan, setGeminiPlan] = useState<"free" | "paid">(settings?.geminiPlanType || "free");
  const [openaiPlan, setOpenaiPlan] = useState<"free" | "paid">(settings?.openaiPlanType || "free");

  const [claudeAddedAt, setClaudeAddedAt] = useState<string | null>(settings?.anthropicKeyAddedAt || null);
  const [geminiAddedAt, setGeminiAddedAt] = useState<string | null>(settings?.geminiKeyAddedAt || null);
  const [openaiAddedAt, setOpenaiAddedAt] = useState<string | null>(settings?.openaiKeyAddedAt || null);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    [provider: string]: { success: boolean; message: string };
  }>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  useEffect(() => {
    if (testFetcher.data?.testResult) {
      const res = testFetcher.data.testResult;
      setTestResults((prev) => ({
        ...prev,
        [res.provider]: { success: res.success, message: res.message },
      }));

      // Automatically select Account Validity Tier based on live API inspection
      if (res.detectedTier) {
        if (res.provider === "claude") setClaudePlan(res.detectedTier);
        if (res.provider === "gemini") setGeminiPlan(res.detectedTier);
        if (res.provider === "openai") setOpenaiPlan(res.detectedTier);
      }

      setTestingProvider(null);
    }
  }, [testFetcher.data]);

  const claudeValidity = calculateValidityDetails(
    claudeAddedAt,
    Boolean(claudeKey && claudeKey.trim().length > 0),
    claudePlan
  );
  const geminiValidity = calculateValidityDetails(
    geminiAddedAt,
    Boolean(geminiKey && geminiKey.trim().length > 0),
    geminiPlan
  );
  const openaiValidity = calculateValidityDetails(
    openaiAddedAt,
    Boolean(openaiKey && openaiKey.trim().length > 0),
    openaiPlan
  );

  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "saveKeys");
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);
    fd.append("openaiApiKey", openaiKey);
    fd.append("anthropicPlanType", claudePlan);
    fd.append("geminiPlanType", geminiPlan);
    fd.append("openaiPlanType", openaiPlan);

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetTimer = (provider: "claude" | "gemini" | "openai") => {
    const fd = new FormData();
    fd.append("intent", "resetTimer");
    fd.append("provider", provider);
    resetFetcher.submit(fd, { method: "post" });

    const nowIso = new Date().toISOString();
    if (provider === "claude") setClaudeAddedAt(nowIso);
    if (provider === "gemini") setGeminiAddedAt(nowIso);
    if (provider === "openai") setOpenaiAddedAt(nowIso);
  };

  const handleTestKey = (provider: "claude" | "gemini" | "openai", key: string) => {
    setTestingProvider(provider);
    const fd = new FormData();
    fd.append("intent", "testKey");
    fd.append("provider", provider);
    fd.append("apiKey", key);
    testFetcher.submit(fd, { method: "post" });
  };

  const handleDeleteJob = (jobId: string) => {
    if (confirm("Are you sure you want to remove this audit log entry?")) {
      const fd = new FormData();
      fd.append("intent", "deleteJob");
      fd.append("jobId", jobId);
      submit(fd, { method: "post" });
    }
  };

  const handleClearAllJobs = () => {
    if (confirm("Are you sure you want to clear ALL AI generation audit history logs?")) {
      const fd = new FormData();
      fd.append("intent", "clearAllJobs");
      submit(fd, { method: "post" });
    }
  };

  const rows = (aiJobs || []).map((j) => {
    let formattedDate = "Recent";
    try {
      if (j.createdAt) {
        const d = new Date(j.createdAt);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toISOString().substring(0, 19).replace("T", " ");
        }
      }
    } catch {}

    return [
      formattedDate,
      (j.provider || "AI").toUpperCase(),
      j.modelUsed || "Default Model",
      j.productId
        ? j.productId === "ALL_PRODUCTS_BULK"
          ? "All Store Products"
          : j.productId.replace(/^gid:\/\/shopify\/Product\//, "Product #")
        : "Single Generation",
      (j.language || "EN").toUpperCase(),
      `${j.resultCount || 0} Reviews`,
      <Badge key={`st-${j.id}`} tone={j.status === "completed" ? "success" : "critical"}>
        {j.status || "completed"}
      </Badge>,
      <Button
        key={`del-${j.id}`}
        icon={DeleteIcon}
        tone="critical"
        size="micro"
        onClick={() => handleDeleteJob(j.id)}
      >
        Delete
      </Button>,
    ];
  });

  return (
    <Page fullWidth title="Multi-Provider AI Settings & Lifecycle Management">
      <BlockStack gap="500">
        <Banner title="Multi-Provider AI Model Configuration & Expiration Tracking" tone="info">
          <p>
            Configure <strong>Anthropic Claude</strong>, <strong>Google Gemini</strong>, and <strong>ChatGPT (OpenAI)</strong> API keys.
            Free account keys automatically expire after <strong>3 months</strong>, and paid account keys expire after <strong>12 months</strong>.
            Expired keys are automatically purged to keep your system clean, and cannot be reused.
          </p>
        </Banner>

        {/* DATA INTEGRITY GUARANTEE BANNER */}
        <Banner tone="success" title="Review Data Protection Guarantee">
          <p>
            All customer reviews, AI-generated reviews, published ratings, and storefront displays are <strong>permanently protected</strong>.
            API key expiration affects <em>only</em> review generation for that model until a new key is added. Review data is <strong>never</strong> deleted or altered by key expiration.
          </p>
        </Banner>

        {actionData?.validationErrors && (
          <Banner tone="critical" title="Action Required: Expired Key Rejected">
            <p>
              {actionData.message || "You are trying to add an expired API key. Please provide a new API key."}
            </p>
          </Banner>
        )}

        {savedSuccess && !actionData?.validationErrors && (
          <Banner tone="success" title="AI Settings Updated">
            <p>API keys and validity preferences saved successfully.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card padding="500">
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    AI Provider Configuration
                  </Text>
                  <Badge tone="info">3-Month Free / 12-Month Paid</Badge>
                </InlineStack>

                <Text as="p" tone="subdued">
                  Select your account type for each model to track its expiration period (3 months for Free accounts, 12 months for Paid accounts).
                </Text>

                <Divider />

                {/* Anthropic Claude */}
                <ProviderKeyBlock
                  label="Anthropic Claude"
                  provider="claude"
                  keyValue={claudeKey}
                  onKeyChange={setClaudeKey}
                  placeholder="sk-ant-..."
                  helpText="Required for Claude vision & text review generation."
                  planType={claudePlan}
                  onPlanChange={setClaudePlan}
                  validity={claudeValidity}
                  expiredNotice={settings?.expiredNotices?.claude}
                  validationError={actionData?.validationErrors?.claude}
                  onResetTimer={handleResetTimer}
                  onTestKey={handleTestKey}
                  isTesting={testingProvider === "claude"}
                  testResult={testResults["claude"]}
                />

                <Divider />

                {/* Google Gemini */}
                <ProviderKeyBlock
                  label="Google Gemini"
                  provider="gemini"
                  keyValue={geminiKey}
                  onKeyChange={setGeminiKey}
                  placeholder="AIzaSy..."
                  helpText="Required for Gemini multimodal & auto-tagging."
                  planType={geminiPlan}
                  onPlanChange={setGeminiPlan}
                  validity={geminiValidity}
                  expiredNotice={settings?.expiredNotices?.gemini}
                  validationError={actionData?.validationErrors?.gemini}
                  onResetTimer={handleResetTimer}
                  onTestKey={handleTestKey}
                  isTesting={testingProvider === "gemini"}
                  testResult={testResults["gemini"]}
                />

                <Divider />

                {/* ChatGPT (OpenAI) */}
                <ProviderKeyBlock
                  label="ChatGPT (OpenAI)"
                  provider="openai"
                  keyValue={openaiKey}
                  onKeyChange={setOpenaiKey}
                  placeholder="sk-proj-..."
                  helpText="Required for ChatGPT (gpt-4o / gpt-4o-mini) review generation."
                  planType={openaiPlan}
                  onPlanChange={setOpenaiPlan}
                  validity={openaiValidity}
                  expiredNotice={settings?.expiredNotices?.openai}
                  validationError={actionData?.validationErrors?.openai}
                  onResetTimer={handleResetTimer}
                  onTestKey={handleTestKey}
                  isTesting={testingProvider === "openai"}
                  testResult={testResults["openai"]}
                />

                <Button
                  variant="primary"
                  loading={navigation.state === "submitting"}
                  onClick={handleSave}
                >
                  Save API Keys & Preferences
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      AI Generation Audit History
                    </Text>
                    <Text as="p" tone="subdued">
                      Complete history of all AI review generation jobs, model IDs used, and generated counts:
                    </Text>
                  </BlockStack>

                  {aiJobs.length > 0 && (
                    <Button
                      tone="critical"
                      icon={DeleteIcon}
                      onClick={handleClearAllJobs}
                    >
                      Clear Audit History
                    </Button>
                  )}
                </InlineStack>

                {aiJobs.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No AI generation jobs recorded yet. Whenever you generate reviews, records will appear here automatically.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text"]}
                    headings={["Date & Time", "Provider", "Model ID", "Target Product", "Language", "Generated", "Status", "Actions"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error: any = useRouteError();
  console.error("AI Settings route ErrorBoundary caught:", error);
  return (
    <Page fullWidth title="AI Settings & Lifecycle Management">
      <BlockStack gap="400">
        <Banner tone="critical" title="Something went wrong loading AI Settings">
          <p>
            {error?.message || "An unexpected error occurred while loading this page. All your reviews and storefront data are completely safe."}
          </p>
        </Banner>
        <Card padding="400">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload AI Settings
          </Button>
        </Card>
      </BlockStack>
    </Page>
  );
}
