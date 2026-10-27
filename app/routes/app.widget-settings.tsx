import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, Banner } from "@shopify/polaris";
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
          widgetDelaySeconds: 1,
          widgetDisplayDuration: 10,
          widgetRotationInterval: 2,
          widgetMaxPerSession: 20,
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
      widgetDelaySeconds: 1,
      widgetDisplayDuration: 10,
      widgetRotationInterval: 2,
      widgetMaxPerSession: 20,
      widgetEnabled: true,
    };
  }

  // Fetch real active products from Shopify Storefront Catalog
  let storefrontProducts: any[] = [];
  let currencyCode = "USD";
  let myshopifyDomain = shop;

  try {
    const gqlRes = await admin.graphql(`
      #graphql
      query getStorefrontProductsForPreview {
        products(first: 25, query: "status:active") {
          nodes {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              nodes {
                price
              }
            }
          }
        }
        shop {
          name
          currencyCode
          myshopifyDomain
        }
      }
    `);

    const gqlData: any = await gqlRes.json();
    const rawNodes = gqlData?.data?.products?.nodes || [];
    if (gqlData?.data?.shop?.currencyCode) {
      currencyCode = gqlData.data.shop.currencyCode;
    }
    if (gqlData?.data?.shop?.myshopifyDomain) {
      myshopifyDomain = gqlData.data.shop.myshopifyDomain;
    }

    let shopName = "My Store";
    if (gqlData?.data?.shop?.name) {
      shopName = gqlData.data.shop.name;
    } else {
      shopName = (myshopifyDomain || shop || "My Store")
        .replace(".myshopify.com", "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    if (rawNodes.length > 0) {
      storefrontProducts = rawNodes.map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle || "",
        imageUrl: p.featuredImage?.url || null,
        altText: p.featuredImage?.altText || p.title,
        price: p.variants?.nodes?.[0]?.price || "29.99",
      }));
    }
  } catch (err) {
    console.warn("Could not fetch storefront products for preview:", err);
  }

  // Fetch real reviews for preview
  let sampleReviews: any[] = [];
  try {
    sampleReviews = await db.review.findMany({
      where: { shop, isPublished: true },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        productId: true,
        productHandle: true,
        reviewerName: true,
        rating: true,
        bodyShort: true,
        bodyFull: true,
        isVerifiedPurchase: true,
      },
    });
  } catch (err) {
    console.warn("Could not fetch sample reviews:", err);
  }

  let finalShopName = (myshopifyDomain || shop || "My Store")
    .replace(".myshopify.com", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return json({
    settings,
    shop,
    shopName: finalShopName,
    currencyCode,
    myshopifyDomain,
    products: storefrontProducts,
    reviews: sampleReviews,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = canonicalizeShopDomain(session.shop);

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

  syncSettingsToShopify(admin, shop, updatedSettings).catch((err) => console.warn(err));

  return json({ success: true });
}

export default function WidgetSettingsPage() {
  const { settings, shop, shopName, currencyCode, myshopifyDomain, products, reviews } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Widget settings states
  const [enabled, setEnabled] = useState<boolean>(settings.widgetEnabled ?? true);
  const [layoutStyle, setLayoutStyle] = useState<string>(settings.widgetLayoutStyle || "layout-1");
  const [position, setPosition] = useState<string>(settings.widgetPosition || "bottom-left");
  const [delay, setDelay] = useState<number>(settings.widgetDelaySeconds ?? 1);
  const [duration, setDuration] = useState<number>(settings.widgetDisplayDuration ?? 10);
  const [rotation, setRotation] = useState<number>(settings.widgetRotationInterval ?? 2);
  const [maxPerSession, setMaxPerSession] = useState<number>(settings.widgetMaxPerSession ?? 20);

  // Storefront preview states
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const fallbackProduct = {
    id: "sample-product",
    title: "6 piece luxury towel set",
    handle: "6-piece-luxury-towel-set",
    imageUrl: "https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=600&q=80",
    price: "29.99",
    altText: "6 piece towel set",
  };

  const productList = (products && products.length > 0) ? products : [fallbackProduct];
  const [selectedHandle, setSelectedHandle] = useState<string>(productList[0]?.handle || "6-piece-luxury-towel-set");

  const activeProduct = productList.find((p: any) => p.handle === selectedHandle) || productList[0] || fallbackProduct;

  // Find review matching selected product, or fallback to any published review, or default review
  const matchingReview = (reviews || []).find((r: any) =>
    r.productId === activeProduct.id ||
    (activeProduct.id && r.productId?.endsWith(activeProduct.id.replace("gid://shopify/Product/", ""))) ||
    r.productHandle === activeProduct.handle
  ) || (reviews && reviews.length > 0 ? reviews[0] : null);

  const previewReview = matchingReview ? {
    name: matchingReview.reviewerName || "Verified Customer",
    rating: matchingReview.rating || 5,
    text: matchingReview.bodyShort || matchingReview.bodyFull || "Very soft and absorbent. Colour matches the photo.",
    verified: matchingReview.isVerifiedPurchase ?? true,
  } : {
    name: "Priya P.",
    rating: 5,
    text: "Very soft and absorbent. Colour matches the photo.",
    verified: true,
  };

  const getInitials = (name: string) => {
    if (!name) return "VP";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const formatPrice = (price: string | number, curr: string) => {
    const num = typeof price === "number" ? price : parseFloat(String(price));
    if (isNaN(num)) return `$${price}`;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: curr || "USD",
      }).format(num);
    } catch {
      return `$${num.toFixed(2)}`;
    }
  };

  const shopSubdomain = (myshopifyDomain || shop || "").replace(".myshopify.com", "");
  const liveStorefrontUrl = `https://${myshopifyDomain || shop}/products/${activeProduct.handle}`;
  const themeEditorUrl = `https://admin.shopify.com/store/${shopSubdomain}/themes/current/editor?previewPath=%2Fproducts%2F${activeProduct.handle}`;

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

  const positionLabelMap: Record<string, string> = {
    "bottom-left": "Bottom left",
    "bottom-right": "Bottom right",
    "top-left": "Top left",
    "top-right": "Top right",
  };

  const activePositionLabel = positionLabelMap[position] || "Bottom left";

  return (
    <Page fullWidth>
      <style>{`
        /* 100% Full Width Edge-to-Edge Container */
        .widget-settings-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 8px 24px 64px 24px !important;
          box-sizing: border-box !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
        }

        /* Top Header Card */
        .header-card {
          width: 100% !important;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
          box-sizing: border-box;
        }

        /* Toggle Switch */
        .switch-track {
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
        .switch-track.active {
          background: #22c55e;
        }
        .switch-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease;
        }
        .switch-track.active .switch-thumb {
          transform: translateX(22px);
        }

        /* Main Two-Column Layout */
        .main-grid {
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 24px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 960px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Settings Card */
        .settings-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          box-sizing: border-box;
        }

        .section-heading {
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 18px 0;
        }

        .field-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .select-input {
          width: 100%;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 13.5px;
          color: #0f172a;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .select-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        /* Modern Blue Progress Slider */
        .blue-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          margin: 0;
        }
        .blue-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.4);
          border: 2px solid #ffffff;
          transition: transform 0.1s ease;
        }
        .blue-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .slider-badge {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          min-width: 56px;
          text-align: center;
          flex-shrink: 0;
        }

        .btn-save-blue {
          width: 100%;
          background: #2563eb;
          color: #ffffff;
          font-weight: 600;
          font-size: 14px;
          padding: 11px 24px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: background 0.15s ease;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.25);
        }
        .btn-save-blue:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .btn-save-blue:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Preview Canvas */
        .preview-outer-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          box-sizing: border-box;
        }

        .canvas-box {
          position: relative;
          width: 100%;
          min-height: 480px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 26px;
          box-sizing: border-box;
          overflow: hidden;
        }
      `}</style>

      <div className="widget-settings-container">
        {savedSuccess && (
          <div style={{ marginBottom: "20px" }}>
            <Banner tone="success" title="Settings Saved" onDismiss={() => setSavedSuccess(false)}>
              <p>Your review popup widget settings have been saved and synced to your storefront!</p>
            </Banner>
          </div>
        )}

        {/* 1. TOP HEADER CARD (Matches Reference Screenshot) */}
        <div className="header-card">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#eff6ff",
                border: "1px solid #dbeafe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <polygon points="12 8 13.09 10.26 15.5 10.61 13.75 12.31 14.18 14.7 12 13.55 9.82 14.7 10.25 12.31 8.5 10.61 10.91 10.26 12 8" fill="#2563eb" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0, lineHeight: 1.25 }}>
                Review popup widget
              </h1>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0 0 0" }}>
                Show real customer reviews on your product pages.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
              Widget enabled
            </span>
            <div
              className={`switch-track ${enabled ? "active" : ""}`}
              onClick={() => setEnabled(!enabled)}
            >
              <div className="switch-thumb" />
            </div>
          </div>
        </div>

        {/* 2. TWO-COLUMN MAIN LAYOUT */}
        <div className="main-grid">
          {/* LEFT COLUMN: WIDGET SETTINGS */}
          <div className="settings-card">
            <h2 className="section-heading">Widget settings</h2>

            {/* Row 1: Popup style & Position dropdowns side-by-side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "26px" }}>
              <div>
                <label className="field-label" htmlFor="popup-style-select">
                  Popup style
                </label>
                <select
                  id="popup-style-select"
                  className="select-input"
                  value={layoutStyle}
                  onChange={(e) => setLayoutStyle(e.target.value)}
                >
                  <option value="layout-1">Classic</option>
                  <option value="layout-2">Photo</option>
                  <option value="layout-3">Social</option>
                  <option value="layout-4">Pill</option>
                  <option value="layout-5">Product</option>
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="position-select">
                  Position
                </label>
                <select
                  id="position-select"
                  className="select-input"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                </select>
              </div>
            </div>

            {/* Row 2: Display timing header */}
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: "0 0 18px 0" }}>
              Display timing
            </h3>

            {/* Slider 1: First popup after */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a", marginBottom: "8px" }}>
                First popup after
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  className="blue-slider"
                  value={delay}
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((delay - 1) / 29) * 100}%, #e2e8f0 ${((delay - 1) / 29) * 100}%, #e2e8f0 100%)`,
                  }}
                  onChange={(e) => setDelay(Number(e.target.value))}
                />
                <div className="slider-badge">{delay} sec</div>
              </div>
            </div>

            {/* Slider 2: Each review visible for */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a", marginBottom: "8px" }}>
                Each review visible for
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  className="blue-slider"
                  value={duration}
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((duration - 3) / 27) * 100}%, #e2e8f0 ${((duration - 3) / 27) * 100}%, #e2e8f0 100%)`,
                  }}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
                <div className="slider-badge">{duration} sec</div>
              </div>
            </div>

            {/* Slider 3: Gap between popups */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a", marginBottom: "8px" }}>
                Gap between popups
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  className="blue-slider"
                  value={rotation}
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((rotation - 1) / 19) * 100}%, #e2e8f0 ${((rotation - 1) / 19) * 100}%, #e2e8f0 100%)`,
                  }}
                  onChange={(e) => setRotation(Number(e.target.value))}
                />
                <div className="slider-badge">{rotation} sec</div>
              </div>
            </div>

            {/* Slider 4: Max reviews per session */}
            <div style={{ marginBottom: "28px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a", marginBottom: "8px" }}>
                Max reviews per session
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  className="blue-slider"
                  value={maxPerSession}
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((maxPerSession - 1) / 24) * 100}%, #e2e8f0 ${((maxPerSession - 1) / 24) * 100}%, #e2e8f0 100%)`,
                  }}
                  onChange={(e) => setMaxPerSession(Number(e.target.value))}
                />
                <div className="slider-badge">{maxPerSession}</div>
              </div>
            </div>

            {/* Save Button */}
            <button
              type="button"
              className="btn-save-blue"
              onClick={handleSave}
              disabled={navigation.state === "submitting"}
            >
              {navigation.state === "submitting" ? "Saving settings..." : "Save settings"}
            </button>
          </div>

          {/* RIGHT COLUMN: LIVE STOREFRONT PREVIEW */}
          <div className="preview-outer-card">
            {/* Header: Title + Location Badge + Device Switcher */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  Live storefront preview
                </h2>

                <span
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #dbeafe",
                    color: "#2563eb",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: "9999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {activePositionLabel}
                </span>
              </div>

              {/* Desktop vs Mobile Toggle */}
              <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: previewDevice === "desktop" ? "#ffffff" : "transparent",
                    color: previewDevice === "desktop" ? "#0f172a" : "#64748b",
                    fontWeight: previewDevice === "desktop" ? 600 : 500,
                    fontSize: "12px",
                    cursor: "pointer",
                    boxShadow: previewDevice === "desktop" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: previewDevice === "mobile" ? "#ffffff" : "transparent",
                    color: previewDevice === "mobile" ? "#0f172a" : "#64748b",
                    fontWeight: previewDevice === "mobile" ? 600 : 500,
                    fontSize: "12px",
                    cursor: "pointer",
                    boxShadow: previewDevice === "mobile" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  Mobile
                </button>
              </div>
            </div>

            {/* Product Selector & Live Theme Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "9px 13px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              {/* Left: Product Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 230px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
                  Product:
                </span>
                <select
                  value={selectedHandle}
                  onChange={(e) => setSelectedHandle(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    maxWidth: "280px",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "7px",
                    padding: "5px 9px",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "#0f172a",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {productList.map((p: any) => (
                    <option key={p.handle || p.id} value={p.handle}>
                      {p.title} ({formatPrice(p.price, currencyCode)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Right: Live Theme Links */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <a
                  href={liveStorefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "7px",
                    padding: "5px 11px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#0f172a",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    textDecoration: "none",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  View on live store
                </a>

                <a
                  href={themeEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "7px",
                    padding: "5px 11px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#2563eb",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    textDecoration: "none",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Theme editor
                </a>
              </div>
            </div>

            {/* Storefront Canvas Box (Desktop vs Mobile) */}
            {previewDevice === "desktop" ? (
              <div
                style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "14px",
                  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* 1. Realistic Browser Chrome Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: "#f1f5f9",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {/* Window Action Dots */}
                  <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
                    <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                    <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                    <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  </div>

                  {/* Address Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "7px",
                      padding: "4px 14px",
                      fontSize: "11.5px",
                      color: "#475569",
                      maxWidth: "460px",
                      width: "100%",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                      https://{myshopifyDomain || shop}/products/{activeProduct.handle}
                    </span>
                  </div>

                  {/* Refresh Icon */}
                  <div style={{ color: "#94a3b8" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </div>
                </div>

                {/* 2. Scrollable Website Content Area */}
                <div
                  style={{
                    maxHeight: "560px",
                    overflowY: "auto",
                    position: "relative",
                    background: "#ffffff",
                  }}
                >
                  {/* Website Announcement Bar */}
                  <div
                    style={{
                      background: "#0f172a",
                      color: "#ffffff",
                      padding: "7px 16px",
                      textAlign: "center",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                    }}
                  >
                    ✨ FREE SHIPPING ON ORDERS OVER $50 • 30-DAY SATISFACTION GUARANTEE
                  </div>

                  {/* Store Header & Navigation */}
                  <header
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 24px",
                      borderBottom: "1px solid #f1f5f9",
                      background: "#ffffff",
                      position: "sticky",
                      top: 0,
                      zIndex: 8,
                    }}
                  >
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "1px", textTransform: "uppercase" }}>
                      {shopName}
                    </div>

                    <nav style={{ display: "flex", gap: "20px", fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                      <span style={{ color: "#2563eb", cursor: "pointer" }}>Home</span>
                      <span style={{ cursor: "pointer" }}>Shop Catalog</span>
                      <span style={{ cursor: "pointer" }}>Best Sellers</span>
                      <span style={{ cursor: "pointer" }}>Reviews</span>
                      <span style={{ cursor: "pointer" }}>About Us</span>
                    </nav>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px", color: "#0f172a" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <div style={{ position: "relative" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        <span style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-8px",
                          background: "#2563eb",
                          color: "#ffffff",
                          fontSize: "9px",
                          fontWeight: 700,
                          width: "14px",
                          height: "14px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          1
                        </span>
                      </div>
                    </div>
                  </header>

                  {/* Breadcrumb Trail */}
                  <div style={{ padding: "12px 24px 0 24px", fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Home</span>
                    <span>/</span>
                    <span>Catalog</span>
                    <span>/</span>
                    <span style={{ color: "#0f172a", fontWeight: 600 }}>{activeProduct.title}</span>
                  </div>

                  {/* Main Product Layout (Shopify Dawn Style) */}
                  <div style={{ padding: "18px 24px 30px 24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "28px", alignItems: "start" }}>
                    {/* Left: Product Media Gallery */}
                    <div>
                      {/* Main Featured Image with Bestseller Badge */}
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          height: "300px",
                          background: "#f8fafc",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {activeProduct.imageUrl ? (
                          <img
                            src={activeProduct.imageUrl}
                            alt={activeProduct.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ textAlign: "center", color: "#94a3b8" }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="3" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <div style={{ fontSize: "12px", marginTop: "6px" }}>Product Image</div>
                          </div>
                        )}
                        <span
                          style={{
                            position: "absolute",
                            top: "10px",
                            left: "10px",
                            background: "#2563eb",
                            color: "#ffffff",
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "4px",
                            letterSpacing: "0.5px",
                            textTransform: "uppercase",
                          }}
                        >
                          Bestseller
                        </span>
                      </div>

                      {/* Thumbnail Gallery Row */}
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        {[1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            style={{
                              width: "60px",
                              height: "60px",
                              borderRadius: "6px",
                              border: idx === 1 ? "2px solid #2563eb" : "1px solid #e2e8f0",
                              background: "#f8fafc",
                              overflow: "hidden",
                              cursor: "pointer",
                            }}
                          >
                            {activeProduct.imageUrl ? (
                              <img src={activeProduct.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: idx === 1 ? 1 : 0.7 }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", background: "#f1f5f9" }} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Trust Badges */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "8px",
                          marginTop: "16px",
                          padding: "10px",
                          background: "#f8fafc",
                          borderRadius: "8px",
                          border: "1px solid #f1f5f9",
                          textAlign: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "15px" }}>🚚</div>
                          <div style={{ fontSize: "10px", fontWeight: 600, color: "#334155", marginTop: "2px" }}>Free Shipping</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "15px" }}>🛡️</div>
                          <div style={{ fontSize: "10px", fontWeight: 600, color: "#334155", marginTop: "2px" }}>Quality Tested</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "15px" }}>🔄</div>
                          <div style={{ fontSize: "10px", fontWeight: 600, color: "#334155", marginTop: "2px" }}>30-Day Returns</div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Product Buy Box */}
                    <div>
                      {/* Vendor */}
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                        {shopName} Official
                      </div>

                      {/* Title */}
                      <h1 style={{ fontSize: "19px", fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0", lineHeight: 1.3 }}>
                        {activeProduct.title}
                      </h1>

                      {/* Star Rating summary */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <div style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "1px" }}>
                          {"★".repeat(previewReview.rating)}{"☆".repeat(5 - previewReview.rating)}
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>
                          {previewReview.rating}.0
                        </span>
                        <span style={{ color: "#64748b", fontSize: "12px" }}>•</span>
                        <span style={{ fontSize: "12px", color: "#2563eb", textDecoration: "underline", cursor: "pointer" }}>
                          {reviews?.length ? reviews.length : 48} customer reviews
                        </span>
                      </div>

                      {/* Price Block */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
                          {formatPrice(activeProduct.price, currencyCode)}
                        </span>
                        <span style={{ fontSize: "13px", color: "#94a3b8", textDecoration: "line-through" }}>
                          {formatPrice(Number(activeProduct.price) * 1.25, currencyCode)}
                        </span>
                        <span
                          style={{
                            background: "#fee2e2",
                            color: "#dc2626",
                            fontSize: "10.5px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "9999px",
                          }}
                        >
                          Save 20%
                        </span>
                      </div>

                      {/* Stock Availability */}
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: "9999px", marginBottom: "14px" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                        In stock, ready to dispatch
                      </div>

                      {/* Options / Variants */}
                      <div style={{ marginBottom: "14px" }}>
                        <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#0f172a", marginBottom: "6px" }}>
                          Options: <span style={{ fontWeight: 400, color: "#475569" }}>Standard Pack</span>
                        </div>
                        <div style={{ display: "flex", gap: "7px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "6px", border: "2px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontSize: "11px", fontWeight: 600 }}>Standard</span>
                          <span style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", fontSize: "11px", fontWeight: 500 }}>Deluxe</span>
                          <span style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", fontSize: "11px", fontWeight: 500 }}>Bundle Set</span>
                        </div>
                      </div>

                      {/* Quantity & Add to Cart */}
                      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff" }}>
                          <button type="button" style={{ border: "none", background: "none", padding: "6px 10px", cursor: "pointer", fontSize: "13px", color: "#475569" }}>-</button>
                          <span style={{ padding: "0 6px", fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>1</span>
                          <button type="button" style={{ border: "none", background: "none", padding: "6px 10px", cursor: "pointer", fontSize: "13px", color: "#475569" }}>+</button>
                        </div>

                        <button
                          type="button"
                          style={{
                            flex: 1,
                            padding: "9px 16px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            cursor: "default",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                            boxShadow: "0 2px 4px rgba(15, 23, 42, 0.15)",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                          </svg>
                          Add to cart
                        </button>
                      </div>

                      {/* Buy with Shop Pay */}
                      <button
                        type="button"
                        style={{
                          width: "100%",
                          padding: "9px 16px",
                          background: "#5a31f4",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12.5px",
                          fontWeight: 700,
                          cursor: "default",
                          marginBottom: "14px",
                          boxShadow: "0 2px 5px rgba(90, 49, 244, 0.2)",
                        }}
                      >
                        Buy with Shop Pay
                      </button>

                      {/* Delivery prompt */}
                      <div style={{ fontSize: "11px", color: "#475569", display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
                        <span>🚚</span>
                        <span>Order within <strong>3 hours</strong> for delivery by <strong>Friday</strong></span>
                      </div>

                      {/* Accordions */}
                      <div style={{ borderTop: "1px solid #e2e8f0" }}>
                        <div style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", fontSize: "11.5px", fontWeight: 600, color: "#0f172a" }}>
                          <span>Product Details & Care</span>
                          <span>−</span>
                        </div>
                        <div style={{ padding: "3px 0 8px 0", fontSize: "11px", color: "#64748b", lineHeight: 1.5 }}>
                          Crafted with exceptional care and premium quality materials for everyday comfort and lasting durability. Curated by {shopName}.
                        </div>

                        <div style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", fontSize: "11.5px", fontWeight: 600, color: "#0f172a" }}>
                          <span>Shipping & Free Returns</span>
                          <span>+</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Rating Banner */}
                  <div
                    style={{
                      margin: "0 24px 24px 24px",
                      padding: "14px 18px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
                        Customer Rating: 4.9 out of 5 stars
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        Based on verified customer reviews on this store
                      </div>
                    </div>
                    <div style={{ color: "#f59e0b", fontSize: "15px", letterSpacing: "2px" }}>
                      ★★★★★
                    </div>
                  </div>

                  {/* Storefront Footer */}
                  <footer
                    style={{
                      background: "#0f172a",
                      color: "#94a3b8",
                      padding: "20px 24px",
                      fontSize: "10.5px",
                      borderTop: "1px solid #1e293b",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff", marginBottom: "2px" }}>
                          {shopName}
                        </div>
                        <div>Your trusted destination for premium storefront essentials.</div>
                      </div>
                      <div style={{ display: "flex", gap: "12px", color: "#cbd5e1" }}>
                        <span>Search</span>
                        <span>Privacy Policy</span>
                        <span>Terms</span>
                        <span>Contact</span>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>© 2026, {shopName}. Powered by Shopify</div>
                      <div style={{ display: "flex", gap: "6px", fontSize: "9.5px", color: "#64748b" }}>
                        <span>VISA</span> • <span>MASTERCARD</span> • <span>AMEX</span> • <span>PAYPAL</span> • <span>APPLE PAY</span>
                      </div>
                    </div>
                  </footer>
                </div>

                {/* 3. Floating Review Popup Widget Pinned to Corner */}
                {enabled && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: position.includes("bottom") ? "20px" : "auto",
                      top: position.includes("top") ? "65px" : "auto",
                      left: position.includes("left") ? "20px" : "auto",
                      right: position.includes("right") ? "20px" : "auto",
                      width: layoutStyle === "layout-4" ? "320px" : "290px",
                      background: layoutStyle === "layout-3" ? "#0f172a" : "#ffffff",
                      borderRadius: layoutStyle === "layout-4" ? "9999px" : "12px",
                      padding: layoutStyle === "layout-4" ? "12px 18px" : "14px 16px",
                      border: layoutStyle === "layout-3" ? "1px solid #334155" : "1px solid #e2e8f0",
                      boxShadow: "0 10px 28px rgba(0, 0, 0, 0.16)",
                      zIndex: 25,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* Layout 1: Classic */}
                    {layoutStyle === "layout-1" && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: "#dbeafe",
                                color: "#1e40af",
                                fontSize: "12px",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(previewReview.name)}
                            </div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                                {previewReview.name}
                              </div>
                              <div style={{ color: "#f59e0b", fontSize: "11px", letterSpacing: "1px" }}>
                                {"★".repeat(previewReview.rating)}{"☆".repeat(5 - previewReview.rating)}
                              </div>
                            </div>
                          </div>

                          <span style={{ color: "#94a3b8", fontSize: "14px", cursor: "pointer", lineHeight: 1 }}>
                            ✕
                          </span>
                        </div>

                        <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: 1.4, margin: "6px 0 8px 0" }}>
                          {previewReview.text}
                        </div>

                        {previewReview.verified && (
                          <div>
                            <span
                              style={{
                                background: "#ecfdf5",
                                color: "#059669",
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "3px 9px",
                                borderRadius: "9999px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              ✓ Verified purchase
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Layout 2: Photo Spotlight */}
                    {layoutStyle === "layout-2" && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0, overflow: "hidden" }}>
                          {activeProduct.imageUrl ? (
                            <img src={activeProduct.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            "🧺"
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
                            {previewReview.name} <span style={{ color: "#f59e0b", fontSize: "11px" }}>{"★".repeat(previewReview.rating)}</span>
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#475569", marginTop: "1px", lineHeight: 1.3 }}>
                            {previewReview.text}
                          </div>
                          {previewReview.verified && (
                            <span style={{ fontSize: "10px", color: "#059669", fontWeight: 600, marginTop: "2px", display: "inline-block" }}>
                              ✓ Verified purchase
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Layout 3: Social / Dark Mode */}
                    {layoutStyle === "layout-3" && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#334155", color: "#f8fafc", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {getInitials(previewReview.name)}
                            </div>
                            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#ffffff" }}>
                              {previewReview.name}
                            </div>
                          </div>
                          <span style={{ color: "#f59e0b", fontSize: "11px" }}>{"★".repeat(previewReview.rating)}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.4, margin: "4px 0 6px 0" }}>
                          {previewReview.text}
                        </div>
                        {previewReview.verified && (
                          <div style={{ fontSize: "10.5px", color: "#38bdf8", fontWeight: 600 }}>
                            ✓ Verified purchase
                          </div>
                        )}
                      </>
                    )}

                    {/* Layout 4: Pill Card */}
                    {layoutStyle === "layout-4" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#dbeafe", color: "#1e40af", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {getInitials(previewReview.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {previewReview.name} <span style={{ color: "#f59e0b", fontSize: "11px" }}>{"★".repeat(previewReview.rating)}</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {previewReview.text}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Layout 5: Product Spotlight */}
                    {layoutStyle === "layout-5" && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>
                            Customer Review
                          </span>
                          <span style={{ color: "#f59e0b", fontSize: "11px" }}>{"★".repeat(previewReview.rating)}</span>
                        </div>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a", marginBottom: "3px" }}>
                          {previewReview.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#334155", lineHeight: 1.4 }}>
                          {previewReview.text}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Disabled Overlay */}
                {!enabled && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(15, 23, 42, 0.88)",
                      color: "#ffffff",
                      padding: "8px 16px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      backdropFilter: "blur(4px)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 30,
                    }}
                  >
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
                    Widget is paused. Switch toggle to preview live popups.
                  </div>
                )}
              </div>
            ) : (
              /* Mobile Smartphone Mockup Frame */
              <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "10px 0", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div
                  style={{
                    width: "360px",
                    maxWidth: "100%",
                    height: "580px",
                    background: "#ffffff",
                    borderRadius: "32px",
                    border: "8px solid #1e293b",
                    boxShadow: "0 20px 40px -10px rgba(15, 23, 42, 0.25)",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxSizing: "border-box",
                  }}
                >
                  {/* Smartphone Top Speaker Notch */}
                  <div
                    style={{
                      width: "80px",
                      height: "12px",
                      background: "#1e293b",
                      borderRadius: "0 0 10px 10px",
                      margin: "0 auto 8px auto",
                      zIndex: 30,
                    }}
                  />

                  {/* Scrollable Mobile Website Area */}
                  <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
                    {/* Mobile Announcement Bar */}
                    <div style={{ background: "#0f172a", color: "#ffffff", padding: "5px 10px", textAlign: "center", fontSize: "10px", fontWeight: 600 }}>
                      ✨ FREE SHIPPING OVER $50
                    </div>

                    {/* Mobile Store Header */}
                    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f1f5f9", background: "#ffffff" }}>
                      <span style={{ fontSize: "16px", cursor: "pointer" }}>☰</span>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", letterSpacing: "1px" }}>{shopName}</span>
                      <span style={{ fontSize: "16px", cursor: "pointer" }}>🛒</span>
                    </header>

                    {/* Mobile Breadcrumb */}
                    <div style={{ padding: "8px 14px 0 14px", fontSize: "10px", color: "#64748b" }}>
                      Home / Catalog / <span style={{ color: "#0f172a", fontWeight: 600 }}>{activeProduct.title}</span>
                    </div>

                    {/* Mobile Product Content */}
                    <div style={{ padding: "12px 14px 24px 14px" }}>
                      {/* Product Image */}
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          height: "200px",
                          background: "#f8fafc",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                          overflow: "hidden",
                          marginBottom: "12px",
                        }}
                      >
                        {activeProduct.imageUrl ? (
                          <img
                            src={activeProduct.imageUrl}
                            alt={activeProduct.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px" }}>
                            Product Image
                          </div>
                        )}
                        <span
                          style={{
                            position: "absolute",
                            top: "8px",
                            left: "8px",
                            background: "#2563eb",
                            color: "#ffffff",
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            textTransform: "uppercase",
                          }}
                        >
                          Bestseller
                        </span>
                      </div>

                      {/* Mobile Product Details */}
                      <div>
                        <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {shopName} Official
                        </div>
                        <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "2px 0 6px 0", lineHeight: 1.3 }}>
                          {activeProduct.title}
                        </h4>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                          <span style={{ color: "#f59e0b", fontSize: "12px" }}>
                            {"★".repeat(previewReview.rating)}
                          </span>
                          <span style={{ color: "#64748b", fontSize: "11px" }}>
                            ({reviews?.length ? reviews.length : 48} reviews)
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px" }}>
                          <span style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                            {formatPrice(activeProduct.price, currencyCode)}
                          </span>
                          <span style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "line-through" }}>
                            {formatPrice(Number(activeProduct.price) * 1.25, currencyCode)}
                          </span>
                          <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: "9.5px", fontWeight: 700, padding: "1px 5px", borderRadius: "9999px" }}>
                            Save 20%
                          </span>
                        </div>

                        <button
                          type="button"
                          style={{
                            width: "100%",
                            padding: "9px 14px",
                            borderRadius: "6px",
                            background: "#0f172a",
                            border: "none",
                            color: "#ffffff",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            marginBottom: "8px",
                          }}
                        >
                          Add to cart
                        </button>

                        <button
                          type="button"
                          style={{
                            width: "100%",
                            padding: "9px 14px",
                            borderRadius: "6px",
                            background: "#5a31f4",
                            border: "none",
                            color: "#ffffff",
                            fontSize: "12px",
                            fontWeight: 700,
                            marginBottom: "12px",
                          }}
                        >
                          Buy with Shop Pay
                        </button>

                        <div style={{ fontSize: "10.5px", color: "#64748b", lineHeight: 1.4, borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                          🚚 Free shipping & 30-day returns guaranteed.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating Review Popup Widget (Mobile) */}
                  {enabled && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: position.includes("bottom") ? "14px" : "auto",
                        top: position.includes("top") ? "36px" : "auto",
                        left: "12px",
                        right: "12px",
                        background: layoutStyle === "layout-3" ? "#0f172a" : "#ffffff",
                        borderRadius: layoutStyle === "layout-4" ? "9999px" : "10px",
                        padding: layoutStyle === "layout-4" ? "10px 14px" : "11px 12px",
                        border: layoutStyle === "layout-3" ? "1px solid #334155" : "1px solid #e2e8f0",
                        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
                        zIndex: 35,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: layoutStyle === "layout-3" ? "#334155" : "#dbeafe",
                            color: layoutStyle === "layout-3" ? "#ffffff" : "#1e40af",
                            fontSize: "11px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(previewReview.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, color: layoutStyle === "layout-3" ? "#ffffff" : "#0f172a" }}>
                              {previewReview.name}
                            </span>
                            <span style={{ color: "#f59e0b", fontSize: "10.5px" }}>{"★".repeat(previewReview.rating)}</span>
                          </div>
                          <div style={{ fontSize: "11px", color: layoutStyle === "layout-3" ? "#cbd5e1" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {previewReview.text}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Note below canvas */}
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Preview uses your real store catalog & reviews. Use "View on live store" or "Theme editor" to inspect the active theme.</span>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
