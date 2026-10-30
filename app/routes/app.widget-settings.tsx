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

  // Fetch store themes to detect which theme has the app embed enabled
  let themes: any[] = [];
  let enabledThemeId: string | null = null;
  const adminHeaders: Record<string, string> = {
    "X-Shopify-Access-Token": session.accessToken || "",
    "Content-Type": "application/json",
  };
  try {
    const themesResponse = await fetch(`https://${shop}/admin/api/2025-01/themes.json`, {
      headers: adminHeaders,
    });
    if (themesResponse.ok) {
      const themesJson: any = await themesResponse.json();
      const rawThemes = themesJson?.themes || [];

      for (const t of rawThemes) {
        let hasAppEmbed = false;
        try {
          const assetResponse = await fetch(`https://${shop}/admin/api/2025-01/themes/${t.id}/assets.json?asset[key]=config/settings_data.json`, {
            headers: adminHeaders,
          });
          if (assetResponse.ok) {
            const assetJson: any = await assetResponse.json();
            const value = assetJson?.asset?.value || "";
            if (value.includes("review_widget") || value.includes("dynamic-review-widget") || value.includes("Dynamic Review Widget") || value.includes("ai-dynamic-review")) {
              hasAppEmbed = true;
              if (!enabledThemeId) enabledThemeId = String(t.id);
            }
          }
        } catch {}

        themes.push({
          id: String(t.id),
          name: t.name,
          role: t.role,
          isMain: t.role === "main",
          hasAppEmbed,
        });
      }
    }
  } catch (err) {
    console.warn("Could not fetch themes:", err);
  }

  // If no enabled theme found via asset check, prioritize theme with "practice" or "export" (draft theme from user's editor) or main
  if (!enabledThemeId && themes.length > 0) {
    const draftWithPractice = themes.find((t: any) => t.name?.toLowerCase().includes("practice") || t.name?.toLowerCase().includes("export"));
    enabledThemeId = draftWithPractice ? draftWithPractice.id : (themes.find((t: any) => t.isMain)?.id || themes[0].id);
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
    themes,
    enabledThemeId: enabledThemeId || "",
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
  const { settings, shop, shopName, currencyCode, myshopifyDomain, products, reviews, themes, enabledThemeId } = useLoaderData<typeof loader>();
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

  // Fallback themes list if store has none returned yet
  const fallbackThemes = [
    {
      id: "draft-theme",
      name: "theme-export-james-practice...",
      role: "unpublished",
      isMain: false,
      hasAppEmbed: true,
    },
    {
      id: "live-dawn",
      name: "Dawn",
      role: "main",
      isMain: true,
      hasAppEmbed: false,
    },
  ];
  const themeList = (themes && themes.length > 0) ? themes : fallbackThemes;
  const [selectedThemeId, setSelectedThemeId] = useState<string>(enabledThemeId || themeList[0]?.id || "");
  const activeTheme = themeList.find((t: any) => t.id === selectedThemeId) || themeList[0];

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
  const liveStorefrontUrl = selectedThemeId && selectedThemeId !== "draft-theme"
    ? `https://${myshopifyDomain || shop}/products/${activeProduct.handle}?preview_theme_id=${selectedThemeId}`
    : `https://${myshopifyDomain || shop}/products/${activeProduct.handle}`;
  const themeEditorUrl = selectedThemeId && selectedThemeId !== "draft-theme"
    ? `https://admin.shopify.com/store/${shopSubdomain}/themes/${selectedThemeId}/editor?previewPath=%2Fproducts%2F${activeProduct.handle}`
    : `https://admin.shopify.com/store/${shopSubdomain}/themes/current/editor?previewPath=%2Fproducts%2F${activeProduct.handle}`;

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

          {/* RIGHT COLUMN: LIVE STOREFRONT PREVIEW (Exact match to screenshot) */}
          <div
            className="preview-outer-card"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
              position: "relative",
            }}
          >
            {/* Header: Title + Location Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Live storefront preview
              </h2>

              <span
                style={{
                  background: "#eff6ff",
                  border: "1px solid #dbeafe",
                  color: "#2563eb",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {activePositionLabel}
              </span>
            </div>

            {/* Clean Storefront Stage Box */}
            <div
              style={{
                width: "100%",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "36px 32px 60px 32px",
                position: "relative",
                minHeight: "440px",
                boxSizing: "border-box",
              }}
            >
              {/* Product Grid: Left Placeholder + Right Product Info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "36px",
                  alignItems: "start",
                }}
              >
                {/* Left: Product image placeholder box */}
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: "12px",
                    height: "260px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginBottom: "12px" }}
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>
                    Product image placeholder
                  </span>
                </div>

                {/* Right: Product Details & Add to cart */}
                <div>
                  <h3
                    style={{
                      fontSize: "24px",
                      fontWeight: 800,
                      color: "#0f172a",
                      margin: "0 0 10px 0",
                      lineHeight: 1.25,
                    }}
                  >
                    6 piece towel set
                  </h3>

                  {/* Rating Stars + Reviews Count */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <span style={{ color: "#f59e0b", fontSize: "16px", letterSpacing: "2px" }}>
                      ★★★★★
                    </span>
                    <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
                      (48 reviews)
                    </span>
                  </div>

                  {/* Price */}
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginBottom: "20px" }}>
                    $29.99
                  </div>

                  {/* Add to Cart Dark Button */}
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      height: "46px",
                      background: "#1e293b",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: "pointer",
                      marginBottom: "24px",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                    }}
                  >
                    Add to cart
                  </button>

                  {/* Skeleton Content Lines (exact match to screenshot) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ width: "100%", height: "10px", background: "#e2e8f0", borderRadius: "5px" }} />
                    <div style={{ width: "80%", height: "10px", background: "#e2e8f0", borderRadius: "5px" }} />
                    <div style={{ width: "40%", height: "10px", background: "#e2e8f0", borderRadius: "5px" }} />
                  </div>
                </div>
              </div>

              {/* FLOATING REVIEW POPUP (Positioned dynamically according to position setting) */}
              {enabled && (
                <div
                  style={{
                    position: "absolute",
                    bottom: position.includes("bottom") ? "24px" : "auto",
                    top: position.includes("top") ? "24px" : "auto",
                    left: position.includes("left") ? "24px" : "auto",
                    right: position.includes("right") ? "24px" : "auto",
                    width: "300px",
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "16px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 10px 25px -3px rgba(15, 23, 42, 0.12), 0 4px 6px -4px rgba(15, 23, 42, 0.05)",
                    zIndex: 20,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "#e0f2fe",
                          color: "#0369a1",
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
                        <div style={{ color: "#f59e0b", fontSize: "12px", letterSpacing: "1px" }}>
                          ★★★★★
                        </div>
                      </div>
                    </div>

                    <span style={{ color: "#94a3b8", fontSize: "14px", cursor: "pointer", lineHeight: 1 }}>
                      ✕
                    </span>
                  </div>

                  <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: 1.45, marginBottom: "10px" }}>
                    Very soft and absorbent. Colour matches the photo.
                  </div>

                  <div>
                    <span
                      style={{
                        background: "#ecfdf5",
                        color: "#059669",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: "6px",
                        border: "1px solid #d1fae5",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      ✓ Verified purchase
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Note below preview stage (exact match to screenshot) */}
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Preview uses sample text. Live popups show real or imported reviews.</span>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
