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
import db, { ensureTablesExist } from "../db.server";
import { ensureReviewsAndSettingsRestored, syncSettingsToShopify } from "../services/reviewPersistence.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureReviewsAndSettingsRestored(admin, shop);
  } catch (e) {
    console.error("Safely caught restore warning in widget settings:", e);
  }

  let settings: any = null;
  try {
    settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await db.shopSettings.create({
        data: {
          shop,
          widgetPosition: "bottom-left",
          widgetLayoutStyle: "layout-1",
          widgetDelaySeconds: 1,
          widgetDisplayDuration: 10,
          widgetRotationInterval: 2,
          widgetMaxPerSession: 20,
          widgetEnabled: true,
        },
      });
    } else if (settings.widgetPosition === "bottom-right") {
      // Upgrade existing default setting from bottom-right to bottom-left as requested
      settings = await db.shopSettings.update({
        where: { shop },
        data: { widgetPosition: "bottom-left" },
      });
    }
  } catch (err) {
    console.error("Widget settings DB error:", err);
    settings = {
      shop,
      widgetPosition: "bottom-left",
      widgetLayoutStyle: "layout-1",
      widgetDelaySeconds: 1,
      widgetDisplayDuration: 10,
      widgetRotationInterval: 2,
      widgetMaxPerSession: 20,
      widgetEnabled: true,
    };
  }

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const widgetPosition = (formData.get("widgetPosition") as string) || "bottom-left";
  const widgetLayoutStyle = (formData.get("widgetLayoutStyle") as string) || "layout-1";
  const widgetDelaySeconds = parseInt((formData.get("widgetDelaySeconds") as string) || "1", 10);
  const widgetDisplayDuration = parseInt((formData.get("widgetDisplayDuration") as string) || "10", 10);
  const widgetRotationInterval = parseInt((formData.get("widgetRotationInterval") as string) || "2", 10);
  const widgetMaxPerSession = parseInt((formData.get("widgetMaxPerSession") as string) || "20", 10);
  const widgetEnabled = formData.get("widgetEnabled") === "true";

  const updatedSettings = await db.shopSettings.upsert({
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

  await syncSettingsToShopify(admin, shop, updatedSettings);

  return json({ success: true });
}

export default function WidgetSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [position, setPosition] = useState<string>(settings.widgetPosition || "bottom-left");
  const [layoutStyle, setLayoutStyle] = useState<string>(settings.widgetLayoutStyle || "layout-1");
  const [delay, setDelay] = useState<string>(String(settings.widgetDelaySeconds ?? 1));
  const [duration, setDuration] = useState<string>(String(settings.widgetDisplayDuration ?? 10));
  const [rotation, setRotation] = useState<string>(String(settings.widgetRotationInterval ?? 2));
  const [maxPerSession, setMaxPerSession] = useState<string>(String(settings.widgetMaxPerSession ?? 20));
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
                  minHeight: "460px",
                  backgroundColor: layoutStyle === "layout-3" ? "#0F172A" : "#FFFFFF",
                  borderRadius: "16px",
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                  padding: "24px",
                  boxSizing: "border-box",
                  transition: "all 0.3s ease",
                  color: layoutStyle === "layout-3" ? "#F8FAFC" : "#0F172A"
                }}>
                  {/* TOP DEMO HEADER */}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: "16px",
                    paddingBottom: "10px",
                    borderBottom: layoutStyle === "layout-3" ? "1px solid #1E293B" : "1px solid #F1F5F9"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: layoutStyle === "layout-3" ? "#64748B" : "#94A3B8", letterSpacing: "0.5px" }}>
                      🛒 LIVE PDP STOREFRONT PREVIEW — POSITION: {position.toUpperCase()} | STYLE: {layoutStyle.toUpperCase()}
                    </div>
                  </div>

                  {/* TWO COLUMN SHOPIFY PDP DEMO LAYOUT */}
                  <div style={{ display: "flex", gap: "24px", opacity: 0.85 }}>
                    {/* LEFT COLUMN: DEMO PRODUCT IMAGE PLACEHOLDER */}
                    <div style={{ width: "45%", flexShrink: 0 }}>
                      <div style={{
                        width: "100%",
                        height: "220px",
                        backgroundColor: layoutStyle === "layout-3" ? "#1E293B" : "#F8FAFC",
                        borderRadius: "12px",
                        border: layoutStyle === "layout-3" ? "1px solid #334155" : "1px solid #E2E8F0",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: layoutStyle === "layout-3" ? "#94A3B8" : "#64748B"
                      }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span style={{ fontSize: "12px", marginTop: "8px", fontWeight: 600 }}>Demo Product Image</span>
                      </div>

                      {/* THUMBNAIL GALLERY */}
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {[1, 2, 3].map((idx) => (
                          <div key={idx} style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "6px",
                            backgroundColor: layoutStyle === "layout-3" ? "#1E293B" : "#F1F5F9",
                            border: idx === 1 ? "2px solid #3B82F6" : "1px solid #CBD5E1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            color: "#94A3B8"
                          }}>
                            Thumb {idx}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: DEMO PRODUCT DETAILS */}
                    <div style={{ width: "55%", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>
                        MY STORE
                      </div>
                      <div style={{ fontSize: "17px", fontWeight: 800, lineHeight: 1.25 }}>
                        Product Title
                      </div>
                      
                      {/* RATING & PRICE */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#F59E0B", fontSize: "12px", fontWeight: 600 }}>★★★★★</span>
                        <span style={{ color: layoutStyle === "layout-3" ? "#94A3B8" : "#64748B", fontSize: "11px" }}>(48 reviews)</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                        <span style={{ fontSize: "15px", fontWeight: 800 }}>$89.99 USD</span>
                      </div>

                      {/* CALL TO ACTION BUTTONS */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
                        <div style={{
                          width: "100%",
                          padding: "8px",
                          textAlign: "center",
                          borderRadius: "6px",
                          border: layoutStyle === "layout-3" ? "1px solid #475569" : "1px solid #0F172A",
                          fontWeight: 700,
                          fontSize: "12px",
                          color: layoutStyle === "layout-3" ? "#F8FAFC" : "#0F172A"
                        }}>
                          Add to cart
                        </div>
                        <div style={{
                          width: "100%",
                          padding: "8px",
                          textAlign: "center",
                          borderRadius: "6px",
                          backgroundColor: layoutStyle === "layout-3" ? "#38BDF8" : "#0F172A",
                          color: layoutStyle === "layout-3" ? "#0F172A" : "#FFFFFF",
                          fontWeight: 700,
                          fontSize: "12px"
                        }}>
                          Buy it now
                        </div>
                      </div>
                    </div>
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
                        <span style={{ background: "#000000", color: "#ffffff", fontWeight: 600, fontSize: "11px", padding: "3px 8px", borderRadius: "6px" }}>
                          By Amazon
                        </span>
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
