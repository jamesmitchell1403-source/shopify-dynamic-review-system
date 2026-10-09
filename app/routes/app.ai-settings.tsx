import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
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
import { getShopAIKeysFromShopify, saveShopAIKeysToShopify } from "../services/shopifyMetafields.server";
import { ensureAiJobsRestored, syncAiJobsToShopify } from "../services/reviewPersistence.server";
import { testAIProviderKey } from "../services/ai/keyTester.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings: any = null;
  let aiJobs: any[] = [];

  try {
    await ensureAiJobsRestored(admin, shop);

    settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await db.shopSettings.create({ data: { shop } });
    }

    aiJobs = await db.aiGenerationJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    // Read persistent API keys stored in Shopify's cloud (Shop Metafields)
    const shopifyCloudKeys = await getShopAIKeysFromShopify(admin);

    const anthropicApiKey =
      shopifyCloudKeys?.anthropicApiKey || settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
    const geminiApiKey =
      shopifyCloudKeys?.geminiApiKey || settings?.geminiApiKey || process.env.GEMINI_API_KEY || "";
    const openaiApiKey =
      shopifyCloudKeys?.openaiApiKey || (settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY || "";

    const aiRotationDays =
      shopifyCloudKeys?.aiRotationDays || (settings as any)?.aiRotationDays || 90;

    const defaultAddedDate = settings?.updatedAt
      ? new Date(settings.updatedAt).toISOString()
      : new Date().toISOString();

    const anthropicKeyAddedAt =
      shopifyCloudKeys?.anthropicKeyAddedAt ||
      (settings?.anthropicKeyAddedAt
        ? new Date(settings.anthropicKeyAddedAt).toISOString()
        : anthropicApiKey
        ? defaultAddedDate
        : null);

    const geminiKeyAddedAt =
      shopifyCloudKeys?.geminiKeyAddedAt ||
      (settings?.geminiKeyAddedAt
        ? new Date(settings.geminiKeyAddedAt).toISOString()
        : geminiApiKey
        ? defaultAddedDate
        : null);

    const openaiKeyAddedAt =
      shopifyCloudKeys?.openaiKeyAddedAt ||
      (settings?.openaiKeyAddedAt
        ? new Date(settings.openaiKeyAddedAt).toISOString()
        : openaiApiKey
        ? defaultAddedDate
        : null);

    const mergedSettings = {
      ...settings,
      anthropicApiKey,
      geminiApiKey,
      openaiApiKey,
      aiRotationDays,
      anthropicKeyAddedAt,
      geminiKeyAddedAt,
      openaiKeyAddedAt,
    };

    return json({ settings: mergedSettings, aiJobs });
  } catch (err) {
    console.error("AI settings DB loader error:", err);
    const shopifyCloudKeys = await getShopAIKeysFromShopify(admin);
    const fallbackSettings = {
      shop,
      anthropicApiKey: shopifyCloudKeys?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
      geminiApiKey: shopifyCloudKeys?.geminiApiKey || process.env.GEMINI_API_KEY || "",
      openaiApiKey: shopifyCloudKeys?.openaiApiKey || process.env.OPENAI_API_KEY || "",
      aiRotationDays: shopifyCloudKeys?.aiRotationDays || 90,
      anthropicKeyAddedAt: shopifyCloudKeys?.anthropicKeyAddedAt || null,
      geminiKeyAddedAt: shopifyCloudKeys?.geminiKeyAddedAt || null,
      openaiKeyAddedAt: shopifyCloudKeys?.openaiKeyAddedAt || null,
    };
    return json({ settings: fallbackSettings, aiJobs: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await ensureTablesExist();
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
      });
      await syncAiJobsToShopify(admin, shop, true);
    }
    return json({ success: true, message: "Audit history record deleted." });
  }

  // 2. CLEAR ALL AUDIT JOBS
  if (intent === "clearAllJobs") {
    await db.aiGenerationJob.deleteMany({
      where: { shop },
    });
    await syncAiJobsToShopify(admin, shop, true);
    return json({ success: true, message: "All audit history records cleared." });
  }

  // 3. RESET ROTATION TIMER FOR A SPECIFIC PROVIDER
  if (intent === "resetTimer") {
    const provider = formData.get("provider") as string;
    const nowIso = new Date().toISOString();

    const metafieldUpdate: any = {};
    if (provider === "claude") metafieldUpdate.anthropicKeyAddedAt = nowIso;
    if (provider === "gemini") metafieldUpdate.geminiKeyAddedAt = nowIso;
    if (provider === "openai") metafieldUpdate.openaiKeyAddedAt = nowIso;

    await saveShopAIKeysToShopify(admin, metafieldUpdate);

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

    return json({ success: true, message: `Rotation timer reset for ${provider.toUpperCase()}.` });
  }

  // 4. TEST PROVIDER KEY LIVE
  if (intent === "testKey") {
    const provider = formData.get("provider") as "claude" | "gemini" | "openai";
    const apiKey = (formData.get("apiKey") as string) || "";
    const testResult = await testAIProviderKey(provider, apiKey);
    return json({ testResult });
  }

  // 5. DEFAULT ACTION: Save API keys & rotation policy
  const anthropicApiKeyRaw = formData.get("anthropicApiKey") as string;
  const geminiApiKeyRaw = formData.get("geminiApiKey") as string;
  const openaiApiKeyRaw = formData.get("openaiApiKey") as string;
  const aiRotationDaysRaw = formData.get("aiRotationDays") as string;
  const aiRotationDays = aiRotationDaysRaw ? parseInt(aiRotationDaysRaw, 10) : 90;

  const anthropicApiKey =
    anthropicApiKeyRaw !== null && anthropicApiKeyRaw !== undefined ? anthropicApiKeyRaw.trim() : null;
  const geminiApiKey =
    geminiApiKeyRaw !== null && geminiApiKeyRaw !== undefined ? geminiApiKeyRaw.trim() : null;
  const openaiApiKey =
    openaiApiKeyRaw !== null && openaiApiKeyRaw !== undefined ? openaiApiKeyRaw.trim() : null;

  // Retrieve current existing keys to know if any were added/updated
  const existingCloud = await getShopAIKeysFromShopify(admin);
  const existingDb = await db.shopSettings.findUnique({ where: { shop } });

  const oldAnthropic = existingCloud?.anthropicApiKey ?? existingDb?.anthropicApiKey ?? "";
  const oldGemini = existingCloud?.geminiApiKey ?? existingDb?.geminiApiKey ?? "";
  const oldOpenai = existingCloud?.openaiApiKey ?? (existingDb as any)?.openaiApiKey ?? "";

  const nowIso = new Date().toISOString();

  let anthropicKeyAddedAt =
    existingCloud?.anthropicKeyAddedAt ?? (existingDb as any)?.anthropicKeyAddedAt ?? null;
  let geminiKeyAddedAt =
    existingCloud?.geminiKeyAddedAt ?? (existingDb as any)?.geminiKeyAddedAt ?? null;
  let openaiKeyAddedAt =
    existingCloud?.openaiKeyAddedAt ?? (existingDb as any)?.openaiKeyAddedAt ?? null;

  // Update timestamps if key was changed or newly set
  if (anthropicApiKey && anthropicApiKey !== oldAnthropic) {
    anthropicKeyAddedAt = nowIso;
  } else if (!anthropicApiKey) {
    anthropicKeyAddedAt = null;
  } else if (anthropicApiKey && !anthropicKeyAddedAt) {
    anthropicKeyAddedAt = nowIso;
  }

  if (geminiApiKey && geminiApiKey !== oldGemini) {
    geminiKeyAddedAt = nowIso;
  } else if (!geminiApiKey) {
    geminiKeyAddedAt = null;
  } else if (geminiApiKey && !geminiKeyAddedAt) {
    geminiKeyAddedAt = nowIso;
  }

  if (openaiApiKey && openaiApiKey !== oldOpenai) {
    openaiKeyAddedAt = nowIso;
  } else if (!openaiApiKey) {
    openaiKeyAddedAt = null;
  } else if (openaiApiKey && !openaiKeyAddedAt) {
    openaiKeyAddedAt = nowIso;
  }

  // 1. Save permanently to Shopify Cloud (Shop Metafields) — survives all Render resets
  await saveShopAIKeysToShopify(admin, {
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicKeyAddedAt,
    geminiKeyAddedAt,
    openaiKeyAddedAt,
    aiRotationDays,
  });

  // 2. Also update local DB
  try {
    await db.shopSettings.upsert({
      where: { shop },
      update: {
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
        aiRotationDays,
        anthropicKeyAddedAt: anthropicKeyAddedAt ? new Date(anthropicKeyAddedAt) : null,
        geminiKeyAddedAt: geminiKeyAddedAt ? new Date(geminiKeyAddedAt) : null,
        openaiKeyAddedAt: openaiKeyAddedAt ? new Date(openaiKeyAddedAt) : null,
      },
      create: {
        shop,
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
        aiRotationDays,
        anthropicKeyAddedAt: anthropicKeyAddedAt ? new Date(anthropicKeyAddedAt) : null,
        geminiKeyAddedAt: geminiKeyAddedAt ? new Date(geminiKeyAddedAt) : null,
        openaiKeyAddedAt: openaiKeyAddedAt ? new Date(openaiKeyAddedAt) : null,
      },
    });
  } catch (err) {
    console.warn("Prisma upsert warning, executing raw SQL fallback:", err);
    try {
      const existing = await db.$queryRawUnsafe<any[]>(`SELECT id FROM ShopSettings WHERE shop = ?`, shop);
      if (existing && existing.length > 0) {
        await db.$executeRawUnsafe(
          `UPDATE ShopSettings SET anthropicApiKey = ?, geminiApiKey = ?, openaiApiKey = ?, aiRotationDays = ?, anthropicKeyAddedAt = ?, geminiKeyAddedAt = ?, openaiKeyAddedAt = ? WHERE shop = ?`,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          aiRotationDays,
          anthropicKeyAddedAt,
          geminiKeyAddedAt,
          openaiKeyAddedAt,
          shop
        );
      } else {
        await db.$executeRawUnsafe(
          `INSERT INTO ShopSettings (id, shop, anthropicApiKey, geminiApiKey, openaiApiKey, aiRotationDays, anthropicKeyAddedAt, geminiKeyAddedAt, openaiKeyAddedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `set_${Date.now()}`,
          shop,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          aiRotationDays,
          anthropicKeyAddedAt,
          geminiKeyAddedAt,
          openaiKeyAddedAt
        );
      }
    } catch (sqlErr) {
      console.error("Raw SQL fallback error:", sqlErr);
    }
  }

  return json({ success: true, message: "API keys and rotation settings saved successfully." });
}

// Helper to calculate countdown, expiration, and percentage elapsed
function calculateRotation(addedAt: string | null | undefined, hasKey: boolean, rotationDays: number) {
  if (!hasKey || !addedAt) {
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
    };
  }

  const addedDate = new Date(addedAt);
  const now = new Date();
  const msElapsed = Math.max(0, now.getTime() - addedDate.getTime());
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const daysRemaining = rotationDays - daysElapsed;
  const expiryDate = new Date(addedDate.getTime() + rotationDays * 24 * 60 * 60 * 1000);

  const progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / rotationDays) * 100)));

  const isExpired = daysRemaining <= 0;
  const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 14;

  let badgeTone: "success" | "warning" | "critical" = "success";
  let badgeText = `${daysRemaining} days remaining`;

  if (isExpired) {
    badgeTone = "critical";
    const daysOverdue = Math.abs(daysRemaining);
    badgeText = daysOverdue === 0 ? "Rotation Due Today" : `Rotation Overdue (${daysOverdue}d)`;
  } else if (isExpiringSoon) {
    badgeTone = "warning";
    badgeText = `Due in ${daysRemaining} days`;
  }

  const addedDateFormatted = addedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const expiryDateFormatted = expiryDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    isConfigured: true,
    badgeTone,
    badgeText,
    addedDateFormatted,
    expiryDateFormatted,
    daysRemaining,
    daysElapsed,
    progressPercent,
    isExpired,
    isExpiringSoon,
  };
}

function ProviderKeyBlock({
  label,
  provider,
  keyValue,
  onKeyChange,
  placeholder,
  helpText,
  rotation,
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
  rotation: ReturnType<typeof calculateRotation>;
  onResetTimer: (p: "claude" | "gemini" | "openai") => void;
  onTestKey: (p: "claude" | "gemini" | "openai", k: string) => void;
  isTesting: boolean;
  testResult?: { success: boolean; message: string };
}) {
  return (
    <BlockStack gap="200">
      <TextField
        label={label}
        type="password"
        value={keyValue}
        onChange={onKeyChange}
        autoComplete="off"
        placeholder={placeholder}
        helpText={helpText}
      />

      {rotation.isConfigured ? (
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
                  Rotation Status:
                </Text>
                <Badge tone={rotation.badgeTone}>{rotation.badgeText}</Badge>
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
                  Test Connection
                </Button>
              </InlineStack>
            </InlineStack>

            <ProgressBar
              progress={rotation.progressPercent}
              tone={
                rotation.isExpired
                  ? "critical"
                  : rotation.isExpiringSoon
                  ? "highlight"
                  : "success"
              }
              size="small"
            />

            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodyXs" tone="subdued">
                Configured: <strong>{rotation.addedDateFormatted}</strong>
              </Text>
              <Text
                as="span"
                variant="bodyXs"
                tone={
                  rotation.isExpired
                    ? "critical"
                    : rotation.isExpiringSoon
                    ? "caution"
                    : "subdued"
                }
              >
                Next Due: <strong>{rotation.expiryDateFormatted}</strong>
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
        <InlineStack align="space-between" blockAlign="center">
          <Badge tone={undefined}>Not Configured</Badge>
          <Text as="span" variant="bodyXs" tone="subdued">
            Enter key to activate rotation tracking
          </Text>
        </InlineStack>
      )}
    </BlockStack>
  );
}

export default function AiSettingsPage() {
  const { settings, aiJobs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const testFetcher = useFetcher<any>();
  const resetFetcher = useFetcher<any>();

  const [claudeKey, setClaudeKey] = useState<string>(settings?.anthropicApiKey || "");
  const [geminiKey, setGeminiKey] = useState<string>(settings?.geminiApiKey || "");
  const [openaiKey, setOpenaiKey] = useState<string>((settings as any)?.openaiApiKey || "");
  const [rotationDays, setRotationDays] = useState<string>(
    String((settings as any)?.aiRotationDays || 90)
  );

  const [claudeAddedAt, setClaudeAddedAt] = useState<string | null>(
    (settings as any)?.anthropicKeyAddedAt || null
  );
  const [geminiAddedAt, setGeminiAddedAt] = useState<string | null>(
    (settings as any)?.geminiKeyAddedAt || null
  );
  const [openaiAddedAt, setOpenaiAddedAt] = useState<string | null>(
    (settings as any)?.openaiKeyAddedAt || null
  );

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
      setTestingProvider(null);
    }
  }, [testFetcher.data]);

  const claudeRotation = calculateRotation(
    claudeAddedAt,
    Boolean(claudeKey && claudeKey.trim().length > 0),
    Number(rotationDays)
  );
  const geminiRotation = calculateRotation(
    geminiAddedAt,
    Boolean(geminiKey && geminiKey.trim().length > 0),
    Number(rotationDays)
  );
  const openaiRotation = calculateRotation(
    openaiAddedAt,
    Boolean(openaiKey && openaiKey.trim().length > 0),
    Number(rotationDays)
  );

  // Compute overall rotation alert warnings
  const overdueProviders: string[] = [];
  const expiringSoonProviders: string[] = [];

  if (claudeRotation.isConfigured) {
    if (claudeRotation.isExpired) overdueProviders.push("Anthropic Claude");
    else if (claudeRotation.isExpiringSoon)
      expiringSoonProviders.push(`Anthropic Claude (${claudeRotation.daysRemaining}d left)`);
  }
  if (geminiRotation.isConfigured) {
    if (geminiRotation.isExpired) overdueProviders.push("Google Gemini");
    else if (geminiRotation.isExpiringSoon)
      expiringSoonProviders.push(`Google Gemini (${geminiRotation.daysRemaining}d left)`);
  }
  if (openaiRotation.isConfigured) {
    if (openaiRotation.isExpired) overdueProviders.push("ChatGPT (OpenAI)");
    else if (openaiRotation.isExpiringSoon)
      expiringSoonProviders.push(`ChatGPT (OpenAI) (${openaiRotation.daysRemaining}d left)`);
  }

  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "saveKeys");
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);
    fd.append("openaiApiKey", openaiKey);
    fd.append("aiRotationDays", rotationDays);

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

  const rows = aiJobs.map((j) => [
    new Date(j.createdAt).toISOString().substring(0, 19).replace("T", " "),
    j.provider.toUpperCase(),
    j.modelUsed || "Default Model",
    j.productId
      ? j.productId === "ALL_PRODUCTS_BULK"
        ? "All Store Products"
        : j.productId.replace(/^gid:\/\/shopify\/Product\//, "Product #")
      : "Single Generation",
    j.language.toUpperCase(),
    `${j.resultCount} Reviews`,
    <Badge key={`st-${j.id}`} tone={j.status === "completed" ? "success" : "critical"}>
      {j.status}
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
  ]);

  return (
    <Page fullWidth title="Multi-Provider AI Settings & Audit Logs">
      <BlockStack gap="500">
        <Banner title="Provider-Agnostic AI Service Layer & Lifecycle Tracking" tone="info">
          <p>
            Configure <strong>Anthropic Claude</strong>, <strong>Google Gemini</strong>, and <strong>ChatGPT (OpenAI)</strong> API keys.
            The system automatically tracks expiration and rotation cycles to ensure continuous, uninterrupted review generation.
          </p>
        </Banner>

        {/* Dynamic Rotation Alerts */}
        {overdueProviders.length > 0 && (
          <Banner tone="critical" title="Action Required: AI API Key Rotation Overdue">
            <p>
              The following configured API keys have passed their <strong>{rotationDays}-day rotation policy</strong>:{" "}
              <strong>{overdueProviders.join(", ")}</strong>. Generating new keys in your provider developer consoles maintains account security and prevents service interruptions.
            </p>
          </Banner>
        )}

        {expiringSoonProviders.length > 0 && overdueProviders.length === 0 && (
          <Banner tone="warning" title="Upcoming AI Key Rotation Notice">
            <p>
              The following AI keys are approaching their rotation schedule:{" "}
              <strong>{expiringSoonProviders.join(", ")}</strong>. Please prepare replacement keys soon.
            </p>
          </Banner>
        )}

        {savedSuccess && (
          <Banner tone="success" title="AI Settings Updated">
            <p>API keys and rotation preferences saved successfully.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    AI Provider Configuration
                  </Text>
                  <Badge tone="info">Automatic Rotation Active</Badge>
                </InlineStack>

                <Select
                  label="Rotation Reminder Policy"
                  options={[
                    { label: "30 Days (Monthly — Strict Security)", value: "30" },
                    { label: "60 Days (Every 2 Months)", value: "60" },
                    { label: "90 Days (Quarterly — Recommended)", value: "90" },
                    { label: "180 Days (Semi-Annual)", value: "180" },
                    { label: "365 Days (Annual)", value: "365" },
                  ]}
                  value={rotationDays}
                  onChange={setRotationDays}
                  helpText="Sets the reminder schedule to rotate your AI keys. The system counts down days remaining and warns you before expiration."
                />

                <Divider />

                {/* Anthropic Claude */}
                <ProviderKeyBlock
                  label="Anthropic Claude API Key"
                  provider="claude"
                  keyValue={claudeKey}
                  onKeyChange={setClaudeKey}
                  placeholder="sk-ant-..."
                  helpText="Required for Claude vision & text review generation."
                  rotation={claudeRotation}
                  onResetTimer={handleResetTimer}
                  onTestKey={handleTestKey}
                  isTesting={testingProvider === "claude"}
                  testResult={testResults["claude"]}
                />

                <Divider />

                {/* Google Gemini */}
                <ProviderKeyBlock
                  label="Google Gemini API Key"
                  provider="gemini"
                  keyValue={geminiKey}
                  onKeyChange={setGeminiKey}
                  placeholder="AIzaSy..."
                  helpText="Required for Gemini multimodal & auto-tagging."
                  rotation={geminiRotation}
                  onResetTimer={handleResetTimer}
                  onTestKey={handleTestKey}
                  isTesting={testingProvider === "gemini"}
                  testResult={testResults["gemini"]}
                />

                <Divider />

                {/* ChatGPT (OpenAI) */}
                <ProviderKeyBlock
                  label="ChatGPT (OpenAI) API Key"
                  provider="openai"
                  keyValue={openaiKey}
                  onKeyChange={setOpenaiKey}
                  placeholder="sk-proj-..."
                  helpText="Required for ChatGPT (gpt-4o / gpt-4o-mini) review generation."
                  rotation={openaiRotation}
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
