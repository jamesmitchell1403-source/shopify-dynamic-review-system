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
  Checkbox,
  Badge,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings: any = null;
  try {
    settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await db.shopSettings.create({
        data: { shop },
      });
    }
  } catch (err) {
    console.error("Widget settings DB error:", err);
    settings = {
      shop,
      widgetPosition: "bottom-left",
      widgetLayoutStyle: "layout-1",
      widgetDelaySeconds: 4,
      widgetDisplayDuration: 7,
      widgetRotationInterval: 12,
      widgetMaxPerSession: 10,
      widgetEnabled: true,
    };
  }

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const widgetPosition = formData.get("widgetPosition") as string;
  const widgetLayoutStyle = (formData.get("widgetLayoutStyle") as string) || "layout-1";
  const widgetDelaySeconds = parseInt((formData.get("widgetDelaySeconds") as string) || "4", 10);
  const widgetDisplayDuration = parseInt((formData.get("widgetDisplayDuration") as string) || "7", 10);
  const widgetRotationInterval = parseInt((formData.get("widgetRotationInterval") as string) || "12", 10);
  const widgetMaxPerSession = parseInt((formData.get("widgetMaxPerSession") as string) || "10", 10);
  const widgetEnabled = formData.get("widgetEnabled") === "true";

  await db.shopSettings.upsert({
    where: { shop },
    update: {
      widgetPosition,
      widgetLayoutStyle,
      widgetDelaySeconds,
      widgetDisplayDuration,
      widgetRotationInterval,
      widgetMaxPerSession,
      widgetEnabled,
    },
    create: {
      shop,
      widgetPosition,
      widgetLayoutStyle,
      widgetDelaySeconds,
      widgetDisplayDuration,
      widgetRotationInterval,
      widgetMaxPerSession,
      widgetEnabled,
    },
  });

  return json({ success: true });
}

export default function WidgetSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [position, setPosition] = useState<string>(settings.widgetPosition || "bottom-left");
  const [layoutStyle, setLayoutStyle] = useState<string>(settings.widgetLayoutStyle || "layout-1");
  const [delay, setDelay] = useState<string>(String(settings.widgetDelaySeconds ?? 4));
  const [duration, setDuration] = useState<string>(String(settings.widgetDisplayDuration ?? 7));
  const [rotation, setRotation] = useState<string>(String(settings.widgetRotationInterval ?? 12));
  const [maxPerSession, setMaxPerSession] = useState<string>(String(settings.widgetMaxPerSession ?? 10));
  const [enabled, setEnabled] = useState<boolean>(settings.widgetEnabled ?? true);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    const fd = new FormData();
    fd.append("widgetPosition", position);
    fd.append("widgetLayoutStyle", layoutStyle);
    fd.append("widgetDelaySeconds", delay);
    fd.append("widgetDisplayDuration", duration);
    fd.append("widgetRotationInterval", rotation);
    fd.append("widgetMaxPerSession", maxPerSession);
    fd.append("widgetEnabled", enabled ? "true" : "false");

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <Page fullWidth title="Dynamic PDP Review Widget Settings (Module A)">
      <BlockStack gap="500">
        <Banner title="Non-Intrusive Floating PDP Review Notifications" tone="info">
          <p>Configure how rotating review notifications appear on Product Detail Pages (PDP). Choose from 5 beautiful card design layouts to match your store branding.</p>
        </Banner>

        {savedSuccess && (
          <Banner tone="success" title="Settings Saved">
            <p>Your PDP widget settings have been updated successfully!</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card padding="500">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Widget Configuration</Text>

                <Checkbox
                  label="Enable Dynamic Floating Review Widget"
                  checked={enabled}
                  onChange={setEnabled}
                />

                <Select
                  label="Screen Position"
                  options={[
                    { label: "Bottom Left (Recommended)", value: "bottom-left" },
                    { label: "Bottom Right", value: "bottom-right" },
                    { label: "Top Left", value: "top-left" },
                    { label: "Top Right", value: "top-right" },
                  ]}
                  value={position}
                  onChange={setPosition}
                />

                <Select
                  label="Popup Card Design Layout (5 Options)"
                  options={[
                    { label: "Layout 1: Minimalist Classic (Clean White & Avatar)", value: "layout-1" },
                    { label: "Layout 2: Pastel Spotlight (Warm Pink & Product Image)", value: "layout-2" },
                    { label: "Layout 3: Dark Mode Modern (Charcoal & Gold Stars)", value: "layout-3" },
                    { label: "Layout 4: Elegant Quote (Big Quotation Mark Icon)", value: "layout-4" },
                    { label: "Layout 5: Organic Wave Pill (Gold Gradient & Wave Card)", value: "layout-5" },
                  ]}
                  value={layoutStyle}
                  onChange={setLayoutStyle}
                  helpText="Select your favorite card design style to display on storefront PDP."
                />

                <TextField
                  label="Initial Display Delay (Seconds)"
                  type="number"
                  value={delay}
                  onChange={setDelay}
                  autoComplete="off"
                  helpText="Delay after page load before first review slides in."
                />

                <TextField
                  label="Display Duration (Seconds)"
                  type="number"
                  value={duration}
                  onChange={setDuration}
                  autoComplete="off"
                  helpText="How long each review notification stays visible."
                />

                <TextField
                  label="Rotation Interval (Seconds)"
                  type="number"
                  value={rotation}
                  onChange={setRotation}
                  autoComplete="off"
                  helpText="Time between auto-dismiss and next review appearance."
                />

                <TextField
                  label="Max Reviews per Session"
                  type="number"
                  value={maxPerSession}
                  onChange={setMaxPerSession}
                  autoComplete="off"
                  helpText="Reviews cycle continuously in an infinite loop."
                />

                <Button
                  variant="primary"
                  loading={navigation.state === "submitting"}
                  onClick={handleSave}
                >
                  Save Widget Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Live PDP Storefront Preview (Layout: {layoutStyle.toUpperCase()})</Text>
                <Text as="p" tone="subdued">Interactive preview of the selected popup layout style as seen by shoppers on desktop and mobile:</Text>

                <div style={{
                  position: "relative",
                  width: "100%",
                  height: "400px",
                  backgroundColor: layoutStyle === "layout-3" ? "#0F172A" : "#F8FAFC",
                  borderRadius: "16px",
                  border: "2px dashed #CBD5E1",
                  overflow: "hidden",
                  padding: "20px",
                  boxSizing: "border-box",
                  transition: "all 0.3s ease"
                }}>
                  <div style={{ fontSize: "13px", color: layoutStyle === "layout-3" ? "#94A3B8" : "#64748B", fontWeight: 600 }}>
                    [ Live PDP Storefront Preview — Position: {position} | Style: {layoutStyle} ]
                  </div>

                  {/* LAYOUT 1: MINIMALIST CLASSIC */}
                  {layoutStyle === "layout-1" && (
                    <div style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "24px" : "auto",
                      top: position.includes("top") ? "24px" : "auto",
                      left: position.includes("left") ? "24px" : "auto",
                      right: position.includes("right") ? "24px" : "auto",
                      width: "340px",
                      backgroundColor: "#FFFFFF",
                      borderRadius: "16px",
                      padding: "16px 18px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                      border: "1px solid #E2E8F0",
                      display: enabled ? "block" : "none",
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#F1F5F9", color: "#334155", fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #CBD5E1" }}>
                            RV
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "14px", color: "#0F172A" }}>Rachel V.</div>
                            <div style={{ color: "#F59E0B", fontSize: "12px" }}>★★★★★</div>
                          </div>
                        </div>
                        <span style={{ color: "#94A3B8", fontSize: "18px", cursor: "pointer" }}>×</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.4", marginBottom: "12px" }}>
                        “Transformed my old board! So much smoother and no more sticky spots, feels like new.”
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748B" }}>
                        <span style={{ color: "#10B981", fontWeight: 600 }}>✓ Verified Purchase</span>
                        <span>Verified Customer</span>
                      </div>
                    </div>
                  )}

                  {/* LAYOUT 2: PASTEL SPOTLIGHT */}
                  {layoutStyle === "layout-2" && (
                    <div style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "24px" : "auto",
                      top: position.includes("top") ? "24px" : "auto",
                      left: position.includes("left") ? "24px" : "auto",
                      right: position.includes("right") ? "24px" : "auto",
                      width: "340px",
                      backgroundColor: "#FFF7F8",
                      borderRadius: "20px",
                      padding: "16px 18px",
                      boxShadow: "0 12px 30px rgba(220, 100, 140, 0.15)",
                      border: "1px solid #FBCFE8",
                      display: enabled ? "block" : "none",
                      fontFamily: "sans-serif"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "#FCE7F3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                            🛍️
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "14px", color: "#831843" }}>Rachel V. <span style={{ color: "#F59E0B" }}>★★★★★</span></div>
                            <div style={{ fontSize: "11px", color: "#9D174D" }}>Verified Purchase</div>
                          </div>
                        </div>
                        <span style={{ color: "#9D174D", fontSize: "18px" }}>×</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.45", marginBottom: "10px" }}>
                        “Transformed my old board! So much smoother and no more sticky spots, feels like new.”
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#BE185D" }}>
                        <span style={{ fontWeight: 600 }}>✓ Verified Purchase</span>
                        <span style={{ background: "#FF9900", color: "#000000", fontWeight: 700, fontSize: "10px", padding: "3px 7px", borderRadius: "4px" }}>By Amazon</span>
                      </div>
                    </div>
                  )}

                  {/* LAYOUT 3: DARK MODE MODERN */}
                  {layoutStyle === "layout-3" && (
                    <div style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "24px" : "auto",
                      top: position.includes("top") ? "24px" : "auto",
                      left: position.includes("left") ? "24px" : "auto",
                      right: position.includes("right") ? "24px" : "auto",
                      width: "340px",
                      backgroundColor: "#0F291E",
                      borderRadius: "16px",
                      padding: "16px 18px",
                      boxShadow: "0 12px 35px rgba(0, 0, 0, 0.4)",
                      border: "1px solid #166534",
                      display: enabled ? "block" : "none",
                      fontFamily: "sans-serif"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#15803D", color: "#FFFFFF", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            RV
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "14px", color: "#F8FAFC" }}>Rachel V. <span style={{ color: "#FBBF24" }}>★★★★★</span></div>
                          </div>
                        </div>
                        <span style={{ color: "#94A3B8", fontSize: "18px" }}>×</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#E2E8F0", lineHeight: "1.45", marginBottom: "12px" }}>
                        “Transformed my old board! So much smoother and no more sticky spots, feels like new.”
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "#4ADE80", fontWeight: 600 }}>✓ Verified Purchase</span>
                        <span style={{ color: "#94A3B8" }}>Verified Customer</span>
                      </div>
                    </div>
                  )}

                  {/* LAYOUT 4: ELEGANT QUOTE CARD */}
                  {layoutStyle === "layout-4" && (
                    <div style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "24px" : "auto",
                      top: position.includes("top") ? "24px" : "auto",
                      left: position.includes("left") ? "24px" : "auto",
                      right: position.includes("right") ? "24px" : "auto",
                      width: "340px",
                      backgroundColor: "#FFFFFF",
                      borderRadius: "16px",
                      padding: "18px 20px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
                      border: "1px solid #E2E8F0",
                      display: enabled ? "block" : "none",
                      fontFamily: "serif"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                        <div style={{ fontSize: "36px", color: "#F87171", lineHeight: 1 }}>“</div>
                        <span style={{ color: "#94A3B8", fontSize: "18px", fontFamily: "sans-serif" }}>×</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: "#1E293B", fontFamily: "sans-serif", marginBottom: "4px" }}>
                        Rachel V. <span style={{ color: "#F59E0B" }}>★★★★★</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.5", fontStyle: "italic", marginBottom: "10px" }}>
                        Transformed my old board! So much smoother and no more sticky spots, feels like new.
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "sans-serif", color: "#64748B" }}>
                        <span style={{ color: "#10B981", fontWeight: 600 }}>✓ Verified Purchase</span>
                        <span>Verified Customer</span>
                      </div>
                    </div>
                  )}

                  {/* LAYOUT 5: ORGANIC WAVE PILL */}
                  {layoutStyle === "layout-5" && (
                    <div style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "24px" : "auto",
                      top: position.includes("top") ? "24px" : "auto",
                      left: position.includes("left") ? "24px" : "auto",
                      right: position.includes("right") ? "24px" : "auto",
                      width: "340px",
                      backgroundColor: "#FFFBF0",
                      borderRadius: "24px",
                      padding: "16px 18px",
                      boxShadow: "0 12px 35px rgba(245, 158, 11, 0.15)",
                      border: "1px solid #FDE68A",
                      display: enabled ? "block" : "none",
                      fontFamily: "sans-serif"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#F59E0B", color: "#FFFFFF", fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            RV
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "14px", color: "#78350F" }}>Rachel V.</div>
                            <div style={{ color: "#D97706", fontSize: "12px" }}>★★★★★</div>
                          </div>
                        </div>
                        <span style={{ color: "#92400E", fontSize: "18px" }}>×</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#451A03", lineHeight: "1.45", marginBottom: "12px" }}>
                        “Transformed my old board! So much smoother and no more sticky spots, feels like new.”
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "#059669", fontWeight: 600 }}>✓ Verified Purchase</span>
                        <span style={{ color: "#78350F" }}>Verified Customer</span>
                      </div>
                    </div>
                  )}
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
