import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Button,
  Banner,
  Text,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings: any = null;
  let aiJobs: any[] = [];

  try {
    settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await db.shopSettings.create({ data: { shop } });
    }

    aiJobs = await db.aiGenerationJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const mergedSettings = {
      ...settings,
      anthropicApiKey: settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
      geminiApiKey: settings?.geminiApiKey || process.env.GEMINI_API_KEY || "",
      openaiApiKey: (settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY || "",
    };

    return json({ settings: mergedSettings, aiJobs });
  } catch (err) {
    console.error("AI settings DB loader error:", err);
    const fallbackSettings = {
      shop,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      geminiApiKey: process.env.GEMINI_API_KEY || "",
      openaiApiKey: process.env.OPENAI_API_KEY || "",
    };
    return json({ settings: fallbackSettings, aiJobs: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await ensureTablesExist();
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const anthropicApiKeyRaw = formData.get("anthropicApiKey") as string;
  const geminiApiKeyRaw = formData.get("geminiApiKey") as string;
  const openaiApiKeyRaw = formData.get("openaiApiKey") as string;

  const anthropicApiKey = anthropicApiKeyRaw && anthropicApiKeyRaw.trim().length > 0 ? anthropicApiKeyRaw.trim() : null;
  const geminiApiKey = geminiApiKeyRaw && geminiApiKeyRaw.trim().length > 0 ? geminiApiKeyRaw.trim() : null;
  const openaiApiKey = openaiApiKeyRaw && openaiApiKeyRaw.trim().length > 0 ? openaiApiKeyRaw.trim() : null;

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

  return json({ success: true });
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
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);
    fd.append("openaiApiKey", openaiKey);

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const rows = aiJobs.map((j) => [
    new Date(j.createdAt).toISOString().substring(0, 19).replace("T", " "),
    j.provider.toUpperCase(),
    j.modelUsed || "Default Model",
    j.language.toUpperCase(),
    `${j.resultCount} Reviews`,
    <Badge key={`st-${j.id}`} tone={j.status === "completed" ? "success" : "critical"}>
      {j.status}
    </Badge>,
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
                <Text as="h2" variant="headingMd">AI Generation Audit History</Text>
                <Text as="p" tone="subdued">Track all AI API calls, model IDs used, and generated counts for cost auditing:</Text>

                {aiJobs.length === 0 ? (
                  <Text as="p" tone="subdued">No AI generation jobs recorded yet.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Date & Time", "Provider", "Model ID", "Language", "Generated", "Status"]}
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
