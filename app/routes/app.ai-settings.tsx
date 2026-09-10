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
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await db.shopSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await db.shopSettings.create({ data: { shop } });
  }

  const aiJobs = await db.aiGenerationJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return json({ settings, aiJobs });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const defaultAiProvider = (formData.get("defaultAiProvider") as string) || "claude";
  const anthropicApiKey = (formData.get("anthropicApiKey") as string) || null;
  const geminiApiKey = (formData.get("geminiApiKey") as string) || null;

  await db.shopSettings.upsert({
    where: { shop },
    update: {
      defaultAiProvider,
      anthropicApiKey,
      geminiApiKey,
    },
    create: {
      shop,
      defaultAiProvider,
      anthropicApiKey,
      geminiApiKey,
    },
  });

  return json({ success: true });
}

export default function AiSettingsPage() {
  const { settings, aiJobs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [provider, setProvider] = useState<string>(settings.defaultAiProvider || "claude");
  const [claudeKey, setClaudeKey] = useState<string>(settings.anthropicApiKey || "");
  const [geminiKey, setGeminiKey] = useState<string>(settings.geminiApiKey || "");
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    const fd = new FormData();
    fd.append("defaultAiProvider", provider);
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const rows = aiJobs.map((j) => [
    j.createdAt.substring(0, 19).replace("T", " "),
    j.provider.toUpperCase(),
    j.modelUsed || "Default Model",
    j.language.toUpperCase(),
    `${j.resultCount} Reviews`,
    <Badge key={`st-${j.id}`} tone={j.status === "completed" ? "success" : "critical"}>
      {j.status}
    </Badge>,
  ]);

  return (
    <Page title="Multi-Provider AI Settings & Audit Logs">
      <BlockStack gap="500">
        <Banner title="Provider-Agnostic AI Service Layer" tone="info">
          <p>
            Configure <strong>Anthropic Claude</strong> and <strong>Google Gemini</strong> API keys. The app dynamically routes review generation requests to your primary provider with automatic fallback if rate limits or errors occur.
          </p>
        </Banner>

        {savedSuccess && (
          <Banner tone="success" title="AI Settings Updated">
            <p>AI provider keys and defaults saved successfully.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card padding="500">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">AI Provider Configuration</Text>

                <Select
                  label="Default AI Provider"
                  options={[
                    { label: "Anthropic Claude (claude-3-5-sonnet)", value: "claude" },
                    { label: "Google Gemini (gemini-2.5-flash)", value: "gemini" },
                  ]}
                  value={provider}
                  onChange={setProvider}
                />

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
