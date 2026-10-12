import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";
import { ensureReviewsAndSettingsRestored, syncSettingsToShopify } from "../services/reviewPersistence.server";
import { canonicalizeShopDomain } from "../services/shopDomain.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

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
          widgetDelaySeconds: 4,
          widgetDisplayDuration: 8,
          widgetRotationInterval: 5,
          widgetMaxPerSession: 6,
          widgetEnabled: true,
        },
      });
    }
  } catch (err) {
    console.error("Widget settings DB error:", err);
    settings = {
      shop,
      widgetPosition: "bottom-left",
      widgetLayoutStyle: "layout-1",
      widgetDelaySeconds: 4,
      widgetDisplayDuration: 8,
      widgetRotationInterval: 5,
      widgetMaxPerSession: 6,
      widgetEnabled: true,
    };
  }

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

  const formData = await request.formData();
  const widgetPosition = (formData.get("widgetPosition") as string) || "bottom-left";
  const widgetLayoutStyle = (formData.get("widgetLayoutStyle") as string) || "layout-1";
  const widgetDelaySeconds = parseInt((formData.get("widgetDelaySeconds") as string) || "4", 10);
  const widgetDisplayDuration = parseInt((formData.get("widgetDisplayDuration") as string) || "8", 10);
  const widgetRotationInterval = parseInt((formData.get("widgetRotationInterval") as string) || "5", 10);
  const widgetMaxPerSession = parseInt((formData.get("widgetMaxPerSession") as string) || "6", 10);
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

  // Keep all local records in sync
  await db.shopSettings.updateMany({
    data: {
      widgetPosition,
      widgetLayoutStyle,
      widgetDelaySeconds,
      widgetDisplayDuration,
      widgetRotationInterval,
      widgetMaxPerSession,
      widgetEnabled,
    },
  }).catch(() => {});

  await syncSettingsToShopify(admin, shop, updatedSettings);

  return json({ success: true });
}

export default function WidgetSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Widget settings states
  const [enabled, setEnabled] = useState<boolean>(settings.widgetEnabled ?? true);
  const [layoutStyle, setLayoutStyle] = useState<string>(settings.widgetLayoutStyle || "layout-1");
  const [position, setPosition] = useState<string>(settings.widgetPosition || "bottom-left");
  const [delay, setDelay] = useState<number>(settings.widgetDelaySeconds ?? 4);
  const [duration, setDuration] = useState<number>(settings.widgetDisplayDuration ?? 8);
  const [rotation, setRotation] = useState<number>(settings.widgetRotationInterval ?? 5);
  const [maxPerSession, setMaxPerSession] = useState<number>(settings.widgetMaxPerSession ?? 6);

  // Review source filters (Store orders, Imported, With photos only)
  const [showStoreOrders, setShowStoreOrders] = useState<boolean>(true);
  const [showImported, setShowImported] = useState<boolean>(true);
  const [withPhotosOnly, setWithPhotosOnly] = useState<boolean>(false);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    const fd = new FormData();
    fd.append("widgetPosition", position);
    fd.append("widgetLayoutStyle", layoutStyle);
    fd.append("widgetDelaySeconds", String(delay));
    fd.append("widgetDisplayDuration", String(duration));
    fd.append("widgetRotationInterval", String(rotation));
    fd.append("widgetMaxPerSession", String(maxPerSession));
    fd.append("widgetEnabled", enabled ? "true" : "false");

    submit(fd, { method: "post" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleReset = () => {
    setPosition("bottom-left");
    setLayoutStyle("layout-1");
    setDelay(4);
    setDuration(8);
    setRotation(5);
    setMaxPerSession(6);
    setEnabled(true);
    setShowStoreOrders(true);
    setShowImported(true);
    setWithPhotosOnly(false);
  };

  // Layout cards options
  const layoutOptions = [
    { id: "layout-1", label: "Classic" },
    { id: "layout-2", label: "Photo" },
    { id: "layout-3", label: "Social" },
    { id: "layout-4", label: "Pill" },
    { id: "layout-5", label: "Product" },
  ];

  // Screen position options
  const positionOptions = [
    {
      id: "bottom-left",
      label: "Bottom left",
      recommended: true,
      boxPosition: "bottom-left",
    },
    {
      id: "bottom-right",
      label: "Bottom right",
      recommended: false,
      boxPosition: "bottom-right",
    },
    {
      id: "top-left",
      label: "Top left",
      recommended: false,
      boxPosition: "top-left",
    },
    {
      id: "top-right",
      label: "Top right",
      recommended: false,
      boxPosition: "top-right",
    },
  ];

  // Human-readable active position label for badge
  const activePositionLabel = positionOptions.find((p) => p.id === position)?.label || "Bottom left";

  return (
    <Page fullWidth title="Review popup widget">
      <style>{`
        .widget-switch-track {
          width: 48px;
          height: 26px;
          border-radius: 9999px;
          background: #cbd5e1;
          display: inline-flex;
          align-items: center;
          padding: 2px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .widget-switch-track.active {
          background: #16a34a;
        }
        .widget-switch-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.2s ease;
        }
        .widget-switch-track.active .widget-switch-thumb {
          transform: translateX(22px);
        }

        .layout-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 6px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.15s ease;
          color: #475569;
        }
        .layout-btn:hover {
          border-color: #cbd5e1;
        }
        .layout-btn.active {
          border: 2px solid #2563eb;
          color: #2563eb;
          box-shadow: 0 2px 8px rgba(37,99,235,0.08);
        }

        .position-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .position-btn:hover {
          border-color: #cbd5e1;
        }
        .position-btn.active {
          border: 2px solid #2563eb;
          background: #eff6ff;
        }

        .custom-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          background: #e2e8f0;
          outline: none;
          cursor: pointer;
          margin: 8px 0;
        }
        .custom-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #cbd5e1;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .custom-range-slider::-webkit-slider-thumb:hover {
          border-color: #2563eb;
          transform: scale(1.1);
        }

        .filter-pill {
          padding: 6px 16px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .filter-pill.active {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }

        .save-btn {
          flex: 1;
          background: #0f172a;
          color: #ffffff;
          font-weight: 700;
          font-size: 14px;
          padding: 12px 24px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .save-btn:hover {
          background: #1e293b;
        }
        .reset-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          font-weight: 600;
          font-size: 14px;
          padding: 12px 20px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .reset-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
      `}</style>

      <div style={{ maxWidth: "100%", width: "100%", margin: "0 auto", paddingBottom: "48px" }}>
        {savedSuccess && (
          <div style={{ marginBottom: "20px" }}>
            <Banner tone="success" title="Settings Saved">
              <p>Your review popup widget settings have been saved successfully!</p>
            </Banner>
          </div>
        )}

        {/* 1. HEADER SECTION (Matching Reference Screenshot) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          {/* Left Title with Blue Icon Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "#dbeafe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <polygon points="12 8 13.09 10.26 15.5 10.61 13.75 12.31 14.18 14.7 12 13.55 9.82 14.7 10.25 12.31 8.5 10.61 10.91 10.26 12 8" fill="#2563eb" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a", margin: 0, lineHeight: 1.2 }}>
                Review popup widget
              </h1>
              <p style={{ fontSize: "14px", color: "#64748b", margin: "3px 0 0 0" }}>
                Show real customer reviews on your product pages
              </p>
            </div>
          </div>

          {/* Right Widget Enabled Toggle Switch */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
              Widget enabled
            </span>
            <div
              className={`widget-switch-track ${enabled ? "active" : ""}`}
              onClick={() => setEnabled(!enabled)}
            >
              <div className="widget-switch-thumb" />
            </div>
          </div>
        </div>

        {/* 2. TWO-COLUMN MAIN LAYOUT */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* LEFT COLUMN: Settings Controls */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            {/* SECTION 1: Popup layout */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "10px" }}>
                Popup layout
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                {layoutOptions.map((opt) => {
                  const isActive = layoutStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`layout-btn ${isActive ? "active" : ""}`}
                      onClick={() => setLayoutStyle(opt.id)}
                    >
                      {/* Miniature wireframe icon */}
                      <div
                        style={{
                          width: "36px",
                          height: "24px",
                          borderRadius: "4px",
                          background: isActive ? "#eff6ff" : "#f8fafc",
                          border: isActive ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "2px",
                        }}
                      >
                        {opt.id === "layout-1" && (
                          <div style={{ width: "24px", height: "14px", background: "#ffffff", borderRadius: "3px", border: "1px solid #94a3b8", display: "flex", alignItems: "center", gap: "2px", padding: "1px" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                            <div style={{ flex: 1, height: "2px", background: "#cbd5e1" }} />
                          </div>
                        )}
                        {opt.id === "layout-2" && (
                          <div style={{ width: "24px", height: "14px", background: "#ffffff", borderRadius: "3px", border: "1px solid #94a3b8", display: "flex", alignItems: "center", gap: "2px", padding: "1px" }}>
                            <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#f43f5e" }} />
                            <div style={{ flex: 1, height: "2px", background: "#cbd5e1" }} />
                          </div>
                        )}
                        {opt.id === "layout-3" && (
                          <div style={{ width: "24px", height: "14px", background: "#0f172a", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: "14px", height: "3px", background: "#f59e0b", borderRadius: "1px" }} />
                          </div>
                        )}
                        {opt.id === "layout-4" && (
                          <div style={{ width: "26px", height: "10px", borderRadius: "9999px", background: "#ffffff", border: "1px solid #94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: "14px", height: "2px", background: "#3b82f6" }} />
                          </div>
                        )}
                        {opt.id === "layout-5" && (
                          <div style={{ width: "24px", height: "14px", background: "#ffffff", borderRadius: "3px", border: "1px solid #94a3b8", display: "flex", alignItems: "center", gap: "2px", padding: "1px" }}>
                            <div style={{ width: "6px", height: "8px", borderRadius: "2px", background: "#10b981" }} />
                            <div style={{ flex: 1, height: "2px", background: "#cbd5e1" }} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: Screen position */}
            <div style={{ marginTop: "22px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "10px" }}>
                Screen position
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {positionOptions.map((pos) => {
                  const isActive = position === pos.id;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      className={`position-btn ${isActive ? "active" : ""}`}
                      onClick={() => setPosition(pos.id)}
                    >
                      {/* Miniature browser window icon with position highlight */}
                      <div
                        style={{
                          width: "42px",
                          height: "28px",
                          borderRadius: "5px",
                          background: "#ffffff",
                          border: isActive ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                          position: "relative",
                          flexShrink: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        {/* Position dot/box inside */}
                        <div
                          style={{
                            position: "absolute",
                            width: "12px",
                            height: "7px",
                            borderRadius: "2px",
                            background: isActive ? "#2563eb" : "#1e293b",
                            bottom: pos.id.includes("bottom") ? "3px" : "auto",
                            top: pos.id.includes("top") ? "3px" : "auto",
                            left: pos.id.includes("left") ? "3px" : "auto",
                            right: pos.id.includes("right") ? "3px" : "auto",
                          }}
                        />
                      </div>

                      {/* Label + Recommended Subtext */}
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: isActive ? "#1e40af" : "#0f172a" }}>
                          {pos.label}
                        </div>
                        {pos.recommended && (
                          <div style={{ fontSize: "11px", fontWeight: 500, color: "#3b82f6", marginTop: "1px" }}>
                            Recommended
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 3: Timing */}
            <div style={{ marginTop: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "14px" }}>
                Timing
              </label>

              {/* Slider 1: First popup after */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                  <span style={{ color: "#0f172a", fontWeight: 500 }}>First popup after</span>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>{delay} sec</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  className="custom-range-slider"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                />
              </div>

              {/* Slider 2: Each review visible for */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                  <span style={{ color: "#0f172a", fontWeight: 500 }}>Each review visible for</span>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>{duration} sec</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  className="custom-range-slider"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>

              {/* Slider 3: Gap between popups */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                  <span style={{ color: "#0f172a", fontWeight: 500 }}>Gap between popups</span>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>{rotation} sec</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  className="custom-range-slider"
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                />
              </div>

              {/* Slider 4: Max reviews per session */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                  <span style={{ color: "#0f172a", fontWeight: 500 }}>Max reviews per session</span>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>{maxPerSession}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  className="custom-range-slider"
                  value={maxPerSession}
                  onChange={(e) => setMaxPerSession(Number(e.target.value))}
                />
              </div>
            </div>

            {/* SECTION 4: Show reviews from */}
            <div style={{ marginTop: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "10px" }}>
                Show reviews from
              </label>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className={`filter-pill ${showStoreOrders ? "active" : ""}`}
                  onClick={() => setShowStoreOrders(!showStoreOrders)}
                >
                  Store orders
                </button>

                <button
                  type="button"
                  className={`filter-pill ${showImported ? "active" : ""}`}
                  onClick={() => setShowImported(!showImported)}
                >
                  Imported
                </button>

                <button
                  type="button"
                  className={`filter-pill ${withPhotosOnly ? "active" : ""}`}
                  onClick={() => setWithPhotosOnly(!withPhotosOnly)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  With photos only
                </button>
              </div>
            </div>

            {/* ACTION BUTTONS (Save Settings + Reset) */}
            <div style={{ marginTop: "26px", display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="save-btn"
                onClick={handleSave}
                disabled={navigation.state === "submitting"}
              >
                {navigation.state === "submitting" ? "Saving..." : "Save settings"}
              </button>
              <button
                type="button"
                className="reset-btn"
                onClick={handleReset}
              >
                Reset
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Storefront Preview */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header: Title + Position Pill */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Live storefront preview
              </h2>

              <span
                style={{
                  background: "#dbeafe",
                  color: "#1e40af",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: "9999px",
                }}
              >
                {activePositionLabel}
              </span>
            </div>

            {/* Storefront Mock Canvas Container */}
            <div
              style={{
                position: "relative",
                width: "100%",
                minHeight: "520px",
                background: "#fbfcfe",
                border: "1px solid #f1f5f9",
                borderRadius: "14px",
                padding: "26px",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              {/* Mock Product Page (PDP) */}
              <div style={{ display: "flex", gap: "22px", flexWrap: "wrap", opacity: 0.9 }}>
                {/* Product Image Placeholder Box */}
                <div
                  style={{
                    flex: "1 1 200px",
                    height: "240px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Product image
                </div>

                {/* Product Details Column */}
                <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    MY STORE
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
                    6 piece towel set
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ color: "#d97706", fontSize: "13px", letterSpacing: "1px" }}>★★★★★</span>
                    <span style={{ color: "#64748b", fontSize: "12px" }}>(48 reviews)</span>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "16px" }}>
                    $29.99
                  </div>

                  <button
                    type="button"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      color: "#0f172a",
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "8px",
                      cursor: "default",
                    }}
                  >
                    Add to cart
                  </button>

                  <button
                    type="button"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#0f172a",
                      border: "1px solid #0f172a",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "default",
                    }}
                  >
                    Buy it now
                  </button>
                </div>
              </div>

              {/* Dynamic Floating Review Popup Widget (Placed dynamically by selected position) */}
              {enabled && (
                <div
                  style={{
                    position: "absolute",
                    bottom: position.includes("bottom") ? "20px" : "auto",
                    top: position.includes("top") ? "20px" : "auto",
                    left: position.includes("left") ? "20px" : "auto",
                    right: position.includes("right") ? "20px" : "auto",
                    width: layoutStyle === "layout-4" ? "320px" : "300px",
                    background: layoutStyle === "layout-3" ? "#0f172a" : "#ffffff",
                    borderRadius: layoutStyle === "layout-4" ? "9999px" : "14px",
                    padding: layoutStyle === "layout-4" ? "12px 18px" : "16px 18px",
                    border: layoutStyle === "layout-3" ? "1px solid #334155" : "1px solid #e2e8f0",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                    zIndex: 10,
                    transition: "all 0.25s ease",
                    overflow: "hidden",
                  }}
                >
                  {/* Layout 1: Classic (Matches Reference Screenshot) */}
                  {layoutStyle === "layout-1" && (
                    <>
                      {/* Top Row: Avatar + Name/Stars + Close Icon */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: "#dbeafe",
                              color: "#1e40af",
                              fontSize: "13px",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            PP
                          </div>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                              Priya P.
                            </div>
                            <div style={{ color: "#d97706", fontSize: "12px", letterSpacing: "1px" }}>
                              ★★★★★
                            </div>
                          </div>
                        </div>

                        <span style={{ color: "#94a3b8", fontSize: "16px", cursor: "pointer", lineHeight: 1 }}>
                          ×
                        </span>
                      </div>

                      {/* Review Text */}
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.4, marginBottom: "10px" }}>
                        Very soft and absorbent. Colour matches the photo.
                      </div>

                      {/* Footer Badge: Verified purchase */}
                      <div>
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            display: "inline-block",
                          }}
                        >
                          Verified purchase
                        </span>
                      </div>

                      {/* Bottom Accent Timer Bar */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          width: "60%",
                          height: "3px",
                          background: "#f59e0b",
                        }}
                      />
                    </>
                  )}

                  {/* Layout 2: Photo Spotlight */}
                  {layoutStyle === "layout-2" && (
                    <>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                          🧺
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                            Priya P. <span style={{ color: "#d97706", fontSize: "11px" }}>★★★★★</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px", lineHeight: 1.3 }}>
                            Very soft and absorbent towel set.
                          </div>
                          <span style={{ fontSize: "10px", color: "#166534", fontWeight: 600, marginTop: "4px", display: "inline-block" }}>
                            Verified purchase
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Layout 3: Social / Dark Mode */}
                  {layoutStyle === "layout-3" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#334155", color: "#f8fafc", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            PP
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff" }}>
                            Priya P.
                          </div>
                        </div>
                        <span style={{ color: "#f59e0b", fontSize: "12px" }}>★★★★★</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.4, marginBottom: "8px" }}>
                        Very soft and absorbent. Colour matches the photo.
                      </div>
                      <div style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 600 }}>
                        ✓ Verified purchase
                      </div>
                    </>
                  )}

                  {/* Layout 4: Pill Card */}
                  {layoutStyle === "layout-4" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#dbeafe", color: "#1e40af", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        PP
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Priya P. <span style={{ color: "#d97706", fontSize: "11px" }}>★★★★★</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Very soft and absorbent towel set.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Layout 5: Product Spotlight */}
                  {layoutStyle === "layout-5" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>
                          Customer Review
                        </span>
                        <span style={{ color: "#d97706", fontSize: "12px" }}>★★★★★</span>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                        Priya P.
                      </div>
                      <div style={{ fontSize: "12px", color: "#334155", lineHeight: 1.4 }}>
                        Very soft and absorbent. Colour matches the photo.
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Disclaimer note below preview */}
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "14px" }}>
              ⓘ Preview uses sample text. Live popups show only real or imported reviews.
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
