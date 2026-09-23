import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
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
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { getShopAIKeysFromShopify, saveShopAIKeysToShopify } from "../services/shopifyMetafields.server";
import { ensureAiJobsRestored, syncAiJobsToShopify } from "../services/reviewPersistence.server";

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

    const mergedSettings = {
      ...settings,
      anthropicApiKey: shopifyCloudKeys?.anthropicApiKey || settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
      geminiApiKey: shopifyCloudKeys?.geminiApiKey || settings?.geminiApiKey || process.env.GEMINI_API_KEY || "",
      openaiApiKey: shopifyCloudKeys?.openaiApiKey || (settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY || "",
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

  if (intent === "clearAllJobs") {
    await db.aiGenerationJob.deleteMany({
      where: { shop },
    });
    await syncAiJobsToShopify(admin, shop, true);
    return json({ success: true, message: "All audit history records cleared." });
  }

  // DEFAULT ACTION: Save API keys
  const anthropicApiKeyRaw = formData.get("anthropicApiKey") as string;
  const geminiApiKeyRaw = formData.get("geminiApiKey") as string;
  const openaiApiKeyRaw = formData.get("openaiApiKey") as string;

  const anthropicApiKey = anthropicApiKeyRaw !== null && anthropicApiKeyRaw !== undefined ? anthropicApiKeyRaw.trim() : null;
  const geminiApiKey = geminiApiKeyRaw !== null && geminiApiKeyRaw !== undefined ? geminiApiKeyRaw.trim() : null;
  const openaiApiKey = openaiApiKeyRaw !== null && openaiApiKeyRaw !== undefined ? openaiApiKeyRaw.trim() : null;

  // 1. Save permanently to Shopify Cloud (Shop Metafields) — survives all Render resets
  await saveShopAIKeysToShopify(admin, {
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
  });

  // 2. Also update local DB
  try {
    await db.shopSettings.upsert({
      where: { shop },
      update: {
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
      },
      create: {
        shop,
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
      },
    });
  } catch (err) {
    console.warn("Prisma upsert warning, executing raw SQL fallback:", err);
    try {
      const existing = await db.$queryRawUnsafe<any[]>(`SELECT id FROM ShopSettings WHERE shop = ?`, shop);
      if (existing && existing.length > 0) {
        await db.$executeRawUnsafe(
          `UPDATE ShopSettings SET anthropicApiKey = ?, geminiApiKey = ?, openaiApiKey = ? WHERE shop = ?`,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          shop
        );
      } else {
        await db.$executeRawUnsafe(
          `INSERT INTO ShopSettings (id, shop, anthropicApiKey, geminiApiKey, openaiApiKey) VALUES (?, ?, ?, ?, ?)`,
          `set_${Date.now()}`,
          shop,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey
        );
      }
    } catch (sqlErr) {
      console.error("Raw SQL fallback error:", sqlErr);
    }
  }

  return json({ success: true, message: "API keys saved successfully." });
}

export default function AiSettingsPage() {
  const { settings, aiJobs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [claudeKey, setClaudeKey] = useState<string>(settings?.anthropicApiKey || "");
  const [geminiKey, setGeminiKey] = useState<string>(settings?.geminiApiKey || "");
  const [openaiKey, setOpenaiKey] = useState<string>((settings as any)?.openaiApiKey || "");
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "saveKeys");
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);
    fd.append("openaiApiKey", openaiKey);

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
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
    j.productId ? (j.productId === "ALL_PRODUCTS_BULK" ? "All Store Products" : j.productId.replace(/^gid:\/\/shopify\/Product\//, "Product #")) : "Single Generation",
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
        <Banner title="Provider-Agnostic AI Service Layer" tone="info">
          <p>
            Configure <strong>Anthropic Claude</strong>, <strong>Google Gemini</strong>, and <strong>ChatGPT (OpenAI)</strong> API keys. Saved API keys remain active for review generation until intentionally removed.
          </p>
        </Banner>

        {savedSuccess && (
          <Banner tone="success" title="AI Settings Updated">
            <p>AI provider keys saved successfully.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card padding="500">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">AI Provider Configuration</Text>

                <TextField
                  label="Anthropic Claude API Key"
                  type="password"
                  value={claudeKey}
                  onChange={setClaudeKey}
                  autoComplete="off"
                  placeholder="sk-ant-..."
                  helpText="Required for Claude vision & text review generation."
                />

                <TextField
                  label="Google Gemini API Key"
                  type="password"
                  value={geminiKey}
                  onChange={setGeminiKey}
                  autoComplete="off"
                  placeholder="AIzaSy..."
                  helpText="Required for Gemini multimodal & auto-tagging."
                />

                <TextField
                  label="ChatGPT (OpenAI) API Key"
                  type="password"
                  value={openaiKey}
                  onChange={setOpenaiKey}
                  autoComplete="off"
                  placeholder="sk-proj-..."
                  helpText="Required for ChatGPT (gpt-4o / gpt-4o-mini) review generation."
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

          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">AI Generation Audit History</Text>
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
                  <Text as="p" tone="subdued">No AI generation jobs recorded yet. Whenever you generate reviews, records will appear here automatically.</Text>
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
