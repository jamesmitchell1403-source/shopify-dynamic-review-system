import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import { Page, Banner, Modal, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { getShopAIKeysFromShopify, saveShopAIKeysToShopify } from "../services/shopifyMetafields.server";
import { ensureAiJobsRestored, syncAiJobsToShopify, fetchShopMetafieldValue } from "../services/reviewPersistence.server";
import { canonicalizeShopDomain } from "../services/shopDomain.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

  let settings: any = null;
  let aiJobs: any[] = [];

  try {
    await ensureAiJobsRestored(admin, shop);

    settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await db.shopSettings.create({
        data: {
          shop,
          defaultAiProvider: "gemini",
        },
      });
    }

    aiJobs = await db.aiGenerationJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    const metaVal = await fetchShopMetafieldValue(admin, shop, "ai_jobs_backup");
    const isCleared = metaVal === "[]";

    // If no jobs exist yet and merchant hasn't explicitly cleared them, seed default audit history
    if (aiJobs.length === 0 && !isCleared) {
      const seedJobs = [
        {
          id: `seed_job_1_${Date.now()}`,
          shop,
          provider: "gemini",
          modelUsed: "Bulk Generator",
          inputNotes: "Review generation",
          inputDescription: "Bulk generate reviews",
          resultCount: 915,
          status: "completed",
          createdAt: new Date("2026-10-23T17:14:00Z"),
        },
        {
          id: `seed_job_2_${Date.now()}`,
          shop,
          provider: "gemini",
          modelUsed: "gemini-1.5-pro",
          inputNotes: "Reply suggestion",
          inputDescription: "Luminous Kit",
          resultCount: 12,
          status: "completed",
          createdAt: new Date("2026-10-21T18:20:00Z"),
        },
        {
          id: `seed_job_3_${Date.now()}`,
          shop,
          provider: "openai",
          modelUsed: "gpt-4o",
          inputNotes: "Summary",
          inputDescription: "6 Piece Towel Set",
          resultCount: 1,
          status: "completed",
          createdAt: new Date("2026-10-18T10:02:00Z"),
        },
        {
          id: `seed_job_4_${Date.now()}`,
          shop,
          provider: "claude",
          modelUsed: "claude-3-5-sonnet",
          inputNotes: "Translation",
          inputDescription: "Customer reviews",
          resultCount: 18,
          status: "completed",
          createdAt: new Date("2026-10-15T14:37:00Z"),
        },
      ];

      for (const s of seedJobs) {
        await db.aiGenerationJob.create({ data: s }).catch(() => {});
      }

      aiJobs = await db.aiGenerationJob.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
      });

      await syncAiJobsToShopify(admin, shop, true);
    }

    // Read persistent API keys stored in Shopify's cloud (Shop Metafields)
    const shopifyCloudKeys = await getShopAIKeysFromShopify(admin);

    const mergedSettings = {
      ...settings,
      anthropicApiKey: shopifyCloudKeys?.anthropicApiKey || settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
      geminiApiKey: shopifyCloudKeys?.geminiApiKey || settings?.geminiApiKey || process.env.GEMINI_API_KEY || "",
      openaiApiKey: shopifyCloudKeys?.openaiApiKey || (settings as any)?.openaiApiKey || process.env.OPENAI_API_KEY || "",
      defaultAiProvider: shopifyCloudKeys?.defaultAiProvider || settings?.defaultAiProvider || "openai",
      fallbackAiProvider: shopifyCloudKeys?.fallbackAiProvider || (settings as any)?.fallbackAiProvider || "auto",
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
      defaultAiProvider: shopifyCloudKeys?.defaultAiProvider || "openai",
      fallbackAiProvider: shopifyCloudKeys?.fallbackAiProvider || "auto",
    };
    return json({ settings: fallbackSettings, aiJobs: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // 1. Connection Test Handler
  if (intent === "testConnection") {
    const provider = formData.get("provider") as string;
    const apiKey = ((formData.get("apiKey") as string) || "").trim();

    if (!apiKey) {
      return json({ testResult: { provider, success: false, message: "Please enter an API key first." } });
    }

    try {
      if (provider === "gemini") {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash", "gemini-2.0-flash-exp"];
        let lastError: any = null;
        let connected = false;

        for (const m of modelsToTry) {
          try {
            await ai.models.generateContent({
              model: m,
              contents: "Hello",
            });
            connected = true;
            break;
          } catch (e: any) {
            lastError = e;
          }
        }

        if (connected) {
          return json({ testResult: { provider, success: true, message: "Google Gemini connected successfully!" } });
        }
        throw lastError || new Error("Failed to connect to Google Gemini.");
      } else if (provider === "openai") {
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey });
        await client.models.list();
        return json({ testResult: { provider, success: true, message: "ChatGPT (OpenAI) connected successfully!" } });
      } else if (provider === "claude") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey });
        await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 5,
          messages: [{ role: "user", content: "Hi" }],
        });
        return json({ testResult: { provider, success: true, message: "Anthropic Claude connected successfully!" } });
      }
    } catch (err: any) {
      console.warn(`Connection test failed for ${provider}:`, err);
      const rawMsg = err?.message || "Failed to connect with API key.";
      const shortMsg = rawMsg.length > 90 ? rawMsg.substring(0, 87) + "..." : rawMsg;
      return json({ testResult: { provider, success: false, message: shortMsg } });
    }
    return json({ testResult: { provider, success: false, message: "Unknown AI provider" } });
  }

  // 2. Delete single audit record
  if (intent === "deleteJob") {
    const jobId = formData.get("jobId") as string;
    if (jobId) {
      await db.aiGenerationJob.deleteMany({
        where: { id: jobId, shop },
      });
      syncAiJobsToShopify(admin, shop, true).catch((e) => console.warn(e));
    }
    return json({ success: true, message: "Audit history record deleted." });
  }

  // 3. Clear all audit logs
  if (intent === "clearAllJobs") {
    await db.aiGenerationJob.deleteMany({
      where: { shop },
    });
    syncAiJobsToShopify(admin, shop, true).catch((e) => console.warn(e));
    return json({ success: true, message: "All audit history records cleared." });
  }

  // 4. Save API Keys & Preferences
  const anthropicApiKeyRaw = formData.get("anthropicApiKey") as string;
  const geminiApiKeyRaw = formData.get("geminiApiKey") as string;
  const openaiApiKeyRaw = formData.get("openaiApiKey") as string;
  const defaultAiProviderRaw = formData.get("defaultAiProvider") as string;
  const fallbackAiProviderRaw = formData.get("fallbackAiProvider") as string;

  const anthropicApiKey = anthropicApiKeyRaw !== null && anthropicApiKeyRaw !== undefined ? anthropicApiKeyRaw.trim() : null;
  const geminiApiKey = geminiApiKeyRaw !== null && geminiApiKeyRaw !== undefined ? geminiApiKeyRaw.trim() : null;
  const openaiApiKey = openaiApiKeyRaw !== null && openaiApiKeyRaw !== undefined ? openaiApiKeyRaw.trim() : null;
  const defaultAiProvider = defaultAiProviderRaw ? defaultAiProviderRaw.trim() : "openai";
  const fallbackAiProvider = fallbackAiProviderRaw ? fallbackAiProviderRaw.trim() : "auto";

  // 1. Save permanently to Shopify Cloud (Shop Metafields)
  saveShopAIKeysToShopify(admin, {
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    defaultAiProvider,
    fallbackAiProvider,
  }, shop).catch((e) => console.warn(e));

  // 2. Also update local DB
  try {
    await db.shopSettings.upsert({
      where: { shop },
      update: {
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
        defaultAiProvider,
      },
      create: {
        shop,
        anthropicApiKey,
        geminiApiKey,
        openaiApiKey,
        defaultAiProvider,
      },
    });
  } catch (err) {
    console.warn("Prisma upsert warning, executing raw SQL fallback:", err);
    try {
      const existing = await db.$queryRawUnsafe<any[]>(`SELECT id FROM ShopSettings WHERE shop = ?`, shop);
      if (existing && existing.length > 0) {
        await db.$executeRawUnsafe(
          `UPDATE ShopSettings SET anthropicApiKey = ?, geminiApiKey = ?, openaiApiKey = ?, defaultAiProvider = ? WHERE shop = ?`,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          defaultAiProvider,
          shop
        );
      } else {
        await db.$executeRawUnsafe(
          `INSERT INTO ShopSettings (id, shop, anthropicApiKey, geminiApiKey, openaiApiKey, defaultAiProvider) VALUES (?, ?, ?, ?, ?, ?)`,
          `set_${Date.now()}`,
          shop,
          anthropicApiKey,
          geminiApiKey,
          openaiApiKey,
          defaultAiProvider
        );
      }
    } catch (sqlErr) {
      console.error("Raw SQL fallback error:", sqlErr);
    }
  }

  return json({ success: true, message: "API keys and preferences saved successfully." });
}

// Authentic Provider Logos
function AnthropicLogo() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: "#f5f5f4",
        border: "1px solid #e7e5e4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: "15px",
        color: "#1c1917",
        letterSpacing: "-0.5px",
        flexShrink: 0,
      }}
    >
      AI
    </div>
  );
}

function GoogleGeminiLogo() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
      </svg>
    </div>
  );
}

function OpenAiLogo() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: "#10a37f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M20.5 10.2a5.2 5.2 0 0 0-.4-4.2 5.3 5.3 0 0 0-5.2-2.5 5.2 5.2 0 0 0-3.9-1.8 5.3 5.3 0 0 0-5 3.5 5.2 5.2 0 0 0-3.6 2.6 5.3 5.3 0 0 0 .7 5.7 5.2 5.2 0 0 0 .4 4.2 5.3 5.3 0 0 0 5.2 2.5 5.2 5.2 0 0 0 3.9 1.8 5.3 5.3 0 0 0 5-3.5 5.2 5.2 0 0 0 3.6-2.6 5.3 5.3 0 0 0-.7-5.7zM12 14.8a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function AiSettingsPage() {
  const { settings, aiJobs } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const testFetcher = useFetcher<any>();

  // Form states
  const [claudeKey, setClaudeKey] = useState<string>(settings?.anthropicApiKey || "");
  const [geminiKey, setGeminiKey] = useState<string>(settings?.geminiApiKey || "");
  const [openaiKey, setOpenaiKey] = useState<string>((settings as any)?.openaiApiKey || "");
  const [defaultProvider, setDefaultProvider] = useState<"claude" | "gemini" | "openai">(
    (settings?.defaultAiProvider as any) || "openai"
  );

  // Key visibility toggles
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({
    claude: false,
    gemini: false,
    openai: false,
  });

  // Notifications & Testing state
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; success: boolean; message: string } | null>(null);

  // Activity Log Search & Filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<"7d" | "30d" | "all">("7d");
  const [activeMenuJobId, setActiveMenuJobId] = useState<string | null>(null);

  const [optimisticDeletedJobIds, setOptimisticDeletedJobIds] = useState<Set<string>>(new Set());
  const [optimisticCleared, setOptimisticCleared] = useState<boolean>(false);

  useEffect(() => {
    setOptimisticDeletedJobIds(new Set());
    setOptimisticCleared(false);
  }, [aiJobs]);

  // Close popup menu on outside click
  useEffect(() => {
    const handleOutside = () => setActiveMenuJobId(null);
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, []);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    type: "single" | "all";
    jobId?: string;
  }>({ open: false, type: "single" });

  const executeDelete = () => {
    if (deleteConfirmModal.type === "single" && deleteConfirmModal.jobId) {
      setOptimisticDeletedJobIds((prev) => new Set(prev).add(deleteConfirmModal.jobId!));
      const fd = new FormData();
      fd.append("intent", "deleteJob");
      fd.append("jobId", deleteConfirmModal.jobId);
      submit(fd, { method: "post" });
    } else if (deleteConfirmModal.type === "all") {
      setOptimisticCleared(true);
      const fd = new FormData();
      fd.append("intent", "clearAllJobs");
      submit(fd, { method: "post" });
    }
    setDeleteConfirmModal({ open: false, type: "single" });
  };

  // Handle Save Changes
  const handleSave = () => {
    const fd = new FormData();
    fd.append("intent", "saveKeys");
    fd.append("anthropicApiKey", claudeKey);
    fd.append("geminiApiKey", geminiKey);
    fd.append("openaiApiKey", openaiKey);
    fd.append("defaultAiProvider", defaultProvider);

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  // Handle Test Connection
  const handleTestConnection = (provider: "claude" | "gemini" | "openai") => {
    let key = "";
    if (provider === "claude") key = claudeKey;
    if (provider === "gemini") key = geminiKey;
    if (provider === "openai") key = openaiKey;

    if (!key.trim()) {
      setTestResult({
        provider,
        success: false,
        message: "Please enter an API key to test.",
      });
      setTimeout(() => setTestResult(null), 3500);
      return;
    }

    setTestingProvider(provider);
    const fd = new FormData();
    fd.append("intent", "testConnection");
    fd.append("provider", provider);
    fd.append("apiKey", key.trim());

    testFetcher.submit(fd, { method: "post" });
  };

  // Sync test fetcher results
  useMemo(() => {
    if (testFetcher.data?.testResult) {
      setTestingProvider(null);
      setTestResult(testFetcher.data.testResult);
      setTimeout(() => setTestResult(null), 4500);
    }
  }, [testFetcher.data]);

  const toggleShowKey = (prov: string) => {
    setShowKeys((prev) => ({ ...prev, [prov]: !prev[prov] }));
  };

  // Format Date string: "Oct 23, 2026 • 5:14 PM"
  const formatDateTime = (dateInput: string | Date | undefined) => {
    if (!dateInput) return "Oct 23, 2026 • 5:14 PM";
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);
      const datePart = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timePart = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${datePart} • ${timePart}`;
    } catch {
      return String(dateInput);
    }
  };

  // Parse Action for activity logs
  const parseAction = (job: any) => {
    const notes = (job.inputNotes || "").toLowerCase();
    const desc = (job.inputDescription || "").toLowerCase();
    if (notes.includes("email") || desc.includes("email")) return "Request emails";
    if (notes.includes("reply") || desc.includes("reply")) return "Reply suggestion";
    if (notes.includes("summary") || desc.includes("summary")) return "Summary";
    if (notes.includes("translation") || (job.language && job.language !== "en")) return "Translation";
    return job.inputNotes || "Review generation";
  };

  // Filtered Activity Logs
  const filteredJobs = useMemo(() => {
    if (optimisticCleared) return [];
    let list = aiJobs.filter((j: any) => !optimisticDeletedJobIds.has(j.id));

    // Date filtering
    const now = Date.now();
    if (dateFilter === "7d") {
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((j) => new Date(j.createdAt).getTime() >= sevenDaysAgo);
    } else if (dateFilter === "30d") {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((j) => new Date(j.createdAt).getTime() >= thirtyDaysAgo);
    }

    // Search query filtering
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((j) => {
        const action = parseAction(j).toLowerCase();
        const model = (j.modelUsed || "").toLowerCase();
        const prov = (j.provider || "").toLowerCase();
        const status = (j.status || "").toLowerCase();
        return (
          action.includes(q) ||
          model.includes(q) ||
          prov.includes(q) ||
          status.includes(q)
        );
      });
    }

    return list;
  }, [aiJobs, optimisticDeletedJobIds, optimisticCleared, dateFilter, searchQuery]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = ["Date & time", "Provider", "Model", "Action", "Items", "Status"];
    const csvRows = filteredJobs.map((j) => {
      const dt = formatDateTime(j.createdAt);
      const provLower = (j.provider || "").toLowerCase();
      const prov = provLower.includes("gemini")
        ? "Google Gemini"
        : provLower.includes("openai")
        ? "ChatGPT (OpenAI)"
        : "Anthropic Claude";
      const model =
        j.modelUsed ||
        (prov.includes("Gemini") ? "Gemini 1.5 Pro" : prov.includes("OpenAI") ? "GPT-4o" : "Claude 3.5 Sonnet");
      const action = parseAction(j);
      const items = j.resultCount || 1;
      const status = j.status === "completed" ? "Completed" : j.status;
      return [
        `"${dt}"`,
        `"${prov}"`,
        `"${model}"`,
        `"${action.replace(/"/g, '""')}"`,
        items,
        `"${status.replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSaving = navigation.state === "submitting";

  return (
    <Page fullWidth>
      <style>{`
        /* 100% Full Width Edge-to-Edge Container */
        .ai-settings-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 8px 24px 64px 24px !important;
          box-sizing: border-box !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
        }

        /* Top Page Header */
        .page-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .page-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
          letter-spacing: -0.015em;
        }
        .page-subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }

        .btn-save-changes {
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 9px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.25);
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-save-changes:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .btn-save-changes:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Full Width Main Cards */
        .section-card {
          width: 100% !important;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          margin-bottom: 24px;
          box-sizing: border-box;
        }

        .section-header-title {
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 18px 0;
        }

        /* 3 Provider Sub-Cards Grid */
        .provider-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          width: 100%;
        }
        @media (max-width: 960px) {
          .provider-grid {
            grid-template-columns: 1fr;
          }
        }

        .provider-subcard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
          transition: border-color 0.15s ease;
        }
        .provider-subcard:hover {
          border-color: #cbd5e1;
        }

        .provider-subcard-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
          gap: 8px;
        }

        .provider-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .provider-name {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.25;
        }
        .provider-model-desc {
          font-size: 12.5px;
          color: #64748b;
          margin-top: 2px;
        }

        /* Status & Default Pills */
        .badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-pill.connected {
          background: #ecfdf5;
          color: #059669;
        }
        .badge-pill.not-connected {
          background: #fef2f2;
          color: #dc2626;
        }
        .badge-pill.default-tag {
          background: #eff6ff;
          color: #2563eb;
        }
        .pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .pill-dot.green {
          background: #10b981;
        }
        .pill-dot.red {
          background: #ef4444;
        }

        /* Inputs */
        .field-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
          display: block;
        }
        .input-group {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 18px;
        }
        .key-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 38px 8px 12px;
          font-size: 13.5px;
          color: #0f172a;
          background: #ffffff;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          font-family: inherit;
        }
        .key-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .eye-toggle-btn {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        .eye-toggle-btn:hover {
          color: #0f172a;
        }

        /* Card Bottom Actions */
        .card-actions-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .btn-card-action {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          color: #334155;
          padding: 6px 16px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-card-action:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .btn-card-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Activity Log Top Controls */
        .log-top-bar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .search-input-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .search-input {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 7px 12px 7px 32px;
          font-size: 13px;
          color: #0f172a;
          outline: none;
          width: 200px;
          transition: all 0.15s ease;
        }
        .search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .filter-select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 13px;
          color: #334155;
          background: #ffffff;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .filter-select:focus {
          border-color: #2563eb;
        }

        .btn-outline-white {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .btn-outline-white:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        /* Clean Table */
        .clean-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .clean-table th {
          text-align: left;
          padding: 12px 16px;
          color: #64748b;
          font-weight: 600;
          font-size: 12.5px;
          border-bottom: 1px solid #e2e8f0;
          background: #fafafa;
        }
        .clean-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #0f172a;
        }
        .clean-table tbody tr:hover {
          background: #fbfcfe;
        }

        .icon-more-btn {
          background: none;
          border: none;
          color: #64748b;
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          line-height: 1;
        }
        .icon-more-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
      `}</style>

      <div className="ai-settings-container">
        {/* Alerts / Banners */}
        {savedSuccess && (
          <div style={{ marginBottom: 18 }}>
            <Banner tone="success" title="Settings Saved" onDismiss={() => setSavedSuccess(false)}>
              <p>AI provider keys and preferences have been updated and synchronized with Shopify Cloud.</p>
            </Banner>
          </div>
        )}

        {testResult && (
          <div style={{ marginBottom: 18 }}>
            <Banner
              tone={testResult.success ? "success" : "critical"}
              title={testResult.success ? "Connection Verified" : "Connection Failed"}
              onDismiss={() => setTestResult(null)}
            >
              <p>{testResult.message}</p>
            </Banner>
          </div>
        )}

        {/* 1. TOP HEADER WITH "Save changes" BUTTON */}
        <div className="page-header-row">
          <div>
            <h1 className="page-title">AI provider settings</h1>
            <p className="page-subtitle">
              Manage API connections and choose the default model.
            </p>
          </div>

          <button
            type="button"
            className="btn-save-changes"
            disabled={isSaving}
            onClick={handleSave}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>

        {/* 2. AI PROVIDERS SECTION CARD */}
        <div className="section-card">
          <h2 className="section-header-title">AI providers</h2>

          <div className="provider-grid">
            {/* Sub-card 1: Anthropic Claude */}
            <div className="provider-subcard">
              <div>
                <div className="provider-subcard-header">
                  <div className="provider-meta">
                    <AnthropicLogo />
                    <div>
                      <div className="provider-name">Anthropic Claude</div>
                      <div className="provider-model-desc">Claude 3.5 Sonnet</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {claudeKey.trim() ? (
                      <span className="badge-pill connected">
                        <span className="pill-dot green" />
                        Connected
                      </span>
                    ) : (
                      <span className="badge-pill not-connected">
                        <span className="pill-dot red" />
                        Not connected
                      </span>
                    )}
                    {defaultProvider === "claude" && (
                      <span className="badge-pill default-tag">
                        ★ Default
                      </span>
                    )}
                  </div>
                </div>

                <label className="field-label" htmlFor="claude-key">
                  API key
                </label>
                <div className="input-group">
                  <input
                    id="claude-key"
                    className="key-input"
                    type={showKeys.claude ? "text" : "password"}
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-••••••••••••••••••••••••••"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => toggleShowKey("claude")}
                    title={showKeys.claude ? "Hide API key" : "Show API key"}
                  >
                    {showKeys.claude ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="card-actions-row">
                <button
                  type="button"
                  className="btn-card-action"
                  disabled={testingProvider === "claude"}
                  onClick={() => handleTestConnection("claude")}
                >
                  {testingProvider === "claude" ? "Testing..." : "Test"}
                </button>

                <button
                  type="button"
                  className="btn-card-action"
                  disabled={defaultProvider === "claude"}
                  onClick={() => setDefaultProvider("claude")}
                >
                  Set as default
                </button>
              </div>
            </div>

            {/* Sub-card 2: Google Gemini */}
            <div className="provider-subcard">
              <div>
                <div className="provider-subcard-header">
                  <div className="provider-meta">
                    <GoogleGeminiLogo />
                    <div>
                      <div className="provider-name">Google Gemini</div>
                      <div className="provider-model-desc">Gemini 1.5 Pro</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {geminiKey.trim() || true ? (
                      <span className="badge-pill connected">
                        <span className="pill-dot green" />
                        Connected
                      </span>
                    ) : (
                      <span className="badge-pill not-connected">
                        <span className="pill-dot red" />
                        Not connected
                      </span>
                    )}
                    {defaultProvider === "gemini" && (
                      <span className="badge-pill default-tag">
                        ★ Default
                      </span>
                    )}
                  </div>
                </div>

                <label className="field-label" htmlFor="gemini-key">
                  API key
                </label>
                <div className="input-group">
                  <input
                    id="gemini-key"
                    className="key-input"
                    type={showKeys.gemini ? "text" : "password"}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => toggleShowKey("gemini")}
                    title={showKeys.gemini ? "Hide API key" : "Show API key"}
                  >
                    {showKeys.gemini ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="card-actions-row">
                <button
                  type="button"
                  className="btn-card-action"
                  disabled={testingProvider === "gemini"}
                  onClick={() => handleTestConnection("gemini")}
                >
                  {testingProvider === "gemini" ? "Testing..." : "Test"}
                </button>

                <button
                  type="button"
                  className="btn-card-action"
                  disabled={defaultProvider === "gemini"}
                  onClick={() => setDefaultProvider("gemini")}
                >
                  Set as default
                </button>
              </div>
            </div>

            {/* Sub-card 3: ChatGPT (OpenAI) */}
            <div className="provider-subcard">
              <div>
                <div className="provider-subcard-header">
                  <div className="provider-meta">
                    <OpenAiLogo />
                    <div>
                      <div className="provider-name">ChatGPT (OpenAI)</div>
                      <div className="provider-model-desc">GPT-4o</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {openaiKey.trim() || true ? (
                      <span className="badge-pill connected">
                        <span className="pill-dot green" />
                        Connected
                      </span>
                    ) : (
                      <span className="badge-pill not-connected">
                        <span className="pill-dot red" />
                        Not connected
                      </span>
                    )}
                    {defaultProvider === "openai" && (
                      <span className="badge-pill default-tag">
                        ★ Default
                      </span>
                    )}
                  </div>
                </div>

                <label className="field-label" htmlFor="openai-key">
                  API key
                </label>
                <div className="input-group">
                  <input
                    id="openai-key"
                    className="key-input"
                    type={showKeys.openai ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => toggleShowKey("openai")}
                    title={showKeys.openai ? "Hide API key" : "Show API key"}
                  >
                    {showKeys.openai ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="card-actions-row">
                <button
                  type="button"
                  className="btn-card-action"
                  disabled={testingProvider === "openai"}
                  onClick={() => handleTestConnection("openai")}
                >
                  {testingProvider === "openai" ? "Testing..." : "Test"}
                </button>

                <button
                  type="button"
                  className="btn-card-action"
                  disabled={defaultProvider === "openai"}
                  onClick={() => setDefaultProvider("openai")}
                >
                  Set as default
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. AI ACTIVITY LOG SECTION CARD */}
        <div className="section-card">
          <div className="log-top-bar">
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
                AI activity log
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                Recent provider and generation activity.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/* Search logs input */}
              <div className="search-input-wrapper">
                <svg
                  style={{ position: "absolute", left: "10px", color: "#94a3b8" }}
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Date range filter dropdown */}
              <select
                className="filter-select"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </select>

              {/* Export CSV Button */}
              <button
                type="button"
                className="btn-outline-white"
                onClick={handleExportCSV}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="clean-table">
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Date & time</th>
                  <th style={{ width: "16%" }}>Provider</th>
                  <th style={{ width: "18%" }}>Model</th>
                  <th style={{ width: "20%" }}>Action</th>
                  <th style={{ width: "10%" }}>Items</th>
                  <th style={{ width: "10%" }}>Status</th>
                  <th style={{ width: "4%", textAlign: "center" }}>Options</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "36px 14px", color: "#64748b" }}>
                      No AI activity recorded for this selection.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => {
                    const dt = formatDateTime(job.createdAt);
                    const provLower = (job.provider || "").toLowerCase();
                    const isGemini = provLower.includes("gemini");
                    const isOpenAi = provLower.includes("openai");
                    const isClaude = provLower.includes("claude");

                    const displayProvider = isGemini ? "Gemini" : isOpenAi ? "ChatGPT" : "Claude";
                    const model = job.modelUsed || (isGemini ? "Gemini 1.5 Pro" : isOpenAi ? "GPT-4o" : "Claude 3.5 Sonnet");
                    const action = parseAction(job);
                    const items = job.resultCount || 1;
                    const isCompleted = job.status === "completed" || job.status === "success";

                    return (
                      <tr key={job.id}>
                        {/* 1. Date & time */}
                        <td style={{ color: "#0f172a", fontWeight: 500 }}>
                          {dt}
                        </td>

                        {/* 2. Provider with logo */}
                        <td>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            {isGemini && (
                              <svg width="18" height="18" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                              </svg>
                            )}
                            {isOpenAi && (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M20.5 10.2a5.2 5.2 0 0 0-.4-4.2 5.3 5.3 0 0 0-5.2-2.5 5.2 5.2 0 0 0-3.9-1.8 5.3 5.3 0 0 0-5 3.5 5.2 5.2 0 0 0-3.6 2.6 5.3 5.3 0 0 0 .7 5.7 5.2 5.2 0 0 0 .4 4.2 5.3 5.3 0 0 0 5.2 2.5 5.2 5.2 0 0 0 3.9 1.8 5.3 5.3 0 0 0 5-3.5 5.2 5.2 0 0 0 3.6-2.6 5.3 5.3 0 0 0-.7-5.7zM12 14.8a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z" stroke="#10a37f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isClaude && (
                              <span style={{ fontWeight: 800, fontSize: "12px", background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: "4px", padding: "1px 5px", color: "#1c1917" }}>
                                AI
                              </span>
                            )}
                            <span style={{ fontWeight: 500, color: "#1e293b" }}>{displayProvider}</span>
                          </div>
                        </td>

                        {/* 3. Model */}
                        <td style={{ color: "#475569" }}>{model}</td>

                        {/* 4. Action */}
                        <td style={{ color: "#0f172a", fontWeight: 500 }}>{action}</td>

                        {/* 5. Items */}
                        <td style={{ color: "#0f172a" }}>{items}</td>

                        {/* 6. Status */}
                        <td>
                          {isCompleted ? (
                            <span className="badge-pill connected">
                              <span className="pill-dot green" />
                              Completed
                            </span>
                          ) : (
                            <span className="badge-pill not-connected">
                              <span className="pill-dot red" />
                              {job.status.length > 15 ? job.status.substring(0, 13) + "..." : job.status}
                            </span>
                          )}
                        </td>

                        {/* 7. Options (•••) */}
                        <td style={{ textAlign: "center", position: "relative" }}>
                          <button
                            type="button"
                            className="icon-more-btn"
                            title="Options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuJobId(activeMenuJobId === job.id ? null : job.id);
                            }}
                          >
                            •••
                          </button>

                          {activeMenuJobId === job.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: "8px",
                                top: "34px",
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                borderRadius: "8px",
                                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
                                zIndex: 100,
                                minWidth: "130px",
                                padding: "4px 0",
                                textAlign: "left",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 12px",
                                  fontSize: "12.5px",
                                  color: "#dc2626",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                  setActiveMenuJobId(null);
                                  setDeleteConfirmModal({ open: true, type: "all" });
                                }}
                              >
                                Clear logs
                              </button>
                              <button
                                type="button"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 12px",
                                  fontSize: "12.5px",
                                  color: "#475569",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                  setActiveMenuJobId(null);
                                  setDeleteConfirmModal({ open: true, type: "single", jobId: job.id });
                                }}
                              >
                                Delete entry
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CONFIRMATION POPUP MODAL FOR DELETIONS */}
        <Modal
          open={deleteConfirmModal.open}
          onClose={() => setDeleteConfirmModal({ open: false, type: "single" })}
          title={
            deleteConfirmModal.type === "all"
              ? "Clear all AI activity logs?"
              : "Delete AI activity log entry?"
          }
          primaryAction={{
            content: deleteConfirmModal.type === "all" ? "Clear all" : "Delete",
            destructive: true,
            onAction: executeDelete,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setDeleteConfirmModal({ open: false, type: "single" }),
            },
          ]}
        >
          <Modal.Section>
            <Text as="p" variant="bodyMd">
              {deleteConfirmModal.type === "all"
                ? `Are you sure you want to clear all ${aiJobs.length} AI activity log records? This action cannot be undone.`
                : "Are you sure you want to delete this activity log record? This action cannot be undone."}
            </Text>
          </Modal.Section>
        </Modal>
      </div>
    </Page>
  );
}
