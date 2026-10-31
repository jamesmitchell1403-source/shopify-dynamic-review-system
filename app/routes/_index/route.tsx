import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useState } from "react";

export const meta: MetaFunction = () => [
  { title: "AI Dynamic Review System - Shopify Product Reviews & Social Proof" },
  { name: "description", content: "Elevate your Shopify store conversions with AI-assisted review drafts, marketplace imports, and rotating floating social proof widgets." },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {};
};

export default function App() {
  const [shopUrl, setShopUrl] = useState("");
  const [activeLayout, setActiveLayout] = useState<"layout-1" | "layout-2" | "layout-3" | "layout-4" | "layout-5">("layout-1");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    let cleanShop = shopUrl.trim().toLowerCase();
    if (!cleanShop) return;

    if (!cleanShop.includes(".")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    } else {
      cleanShop = cleanShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }

    window.location.href = `/auth/login?shop=${encodeURIComponent(cleanShop)}`;
    e.preventDefault();
  };

  return (
    <div className="landing-root">
      <style>{`
        * { box-sizing: border-box; }
        .landing-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #fafafc;
          color: #0f172a;
          line-height: 1.6;
          overflow-x: hidden;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
        }

        /* Top Header */
        .landing-header {
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .nav-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 72px;
        }
        .brand-logo {
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }
        .brand-logo span { color: #6366f1; }
        .nav-links {
          display: flex;
          gap: 28px;
          font-size: 14px;
          font-weight: 600;
          color: #475569;
        }
        .nav-links a {
          color: #475569;
          text-decoration: none;
          transition: color 0.15s;
        }
        .nav-links a:hover { color: #0f172a; }
        .btn-header-install {
          background: #0f172a;
          color: #ffffff;
          padding: 10px 20px;
          border-radius: 9999px;
          font-size: 13.5px;
          font-weight: 700;
          text-decoration: none;
          transition: background 0.15s;
        }
        .btn-header-install:hover { background: #1e293b; }

        /* Hero */
        .hero {
          padding: 64px 0 88px 0;
          text-align: center;
          background: radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.08) 0%, rgba(250, 250, 252, 0) 70%);
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #eef2ff;
          border: 1px solid #e0e7ff;
          color: #4f46e5;
          padding: 6px 16px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 24px;
        }
        .hero-title {
          font-size: 50px;
          font-weight: 900;
          letter-spacing: -1.2px;
          line-height: 1.15;
          color: #0f172a;
          max-width: 860px;
          margin: 0 auto 20px auto;
        }
        .hero-title span {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-subtitle {
          font-size: 19px;
          color: #64748b;
          max-width: 660px;
          margin: 0 auto 36px auto;
        }

        /* 1-Click Install Form in Hero */
        .install-box {
          max-width: 540px;
          margin: 0 auto 52px auto;
          background: #ffffff;
          padding: 8px 8px 8px 18px;
          border-radius: 9999px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .install-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14.5px;
          color: #0f172a;
          background: transparent;
        }
        .btn-install-submit {
          background: #4f46e5;
          color: #ffffff;
          border: none;
          padding: 12px 26px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .btn-install-submit:hover { background: #4338ca; }

        /* Hero Device Mockup */
        .hero-phone-wrap {
          display: flex;
          justify-content: center;
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }
        .phone-frame {
          width: 330px;
          height: 600px;
          background: #ffffff;
          border: 10px solid #0f172a;
          border-radius: 46px;
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          text-align: left;
        }
        .phone-notch {
          width: 90px;
          height: 16px;
          background: #0f172a;
          border-radius: 0 0 12px 12px;
          margin: 0 auto 12px auto;
          flex-shrink: 0;
        }

        .hero-floating-chip {
          position: absolute;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 18px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          font-weight: 700;
          z-index: 10;
          text-align: left;
        }
        .chip-left { top: 120px; left: 80px; }
        .chip-right { bottom: 140px; right: 80px; }

        @media (max-width: 900px) {
          .hero-floating-chip { display: none; }
          .nav-links { display: none; }
          .hero-title { font-size: 36px; }
        }

        /* Section Layouts */
        .section-wrap {
          padding: 88px 0;
          border-top: 1px solid #f1f5f9;
        }
        .section-header {
          text-align: center;
          margin-bottom: 56px;
        }
        .section-badge {
          font-size: 12px;
          font-weight: 800;
          color: #6366f1;
          background: #eef2ff;
          padding: 4px 12px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: inline-block;
          margin-bottom: 12px;
        }
        .section-title {
          font-size: 36px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.5px;
          margin-bottom: 12px;
        }
        .section-desc {
          font-size: 16px;
          color: #64748b;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Before vs After Dual Frame */
        .transform-stage {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 48px;
          flex-wrap: wrap;
        }
        .transform-card {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .transform-label {
          font-size: 14px;
          font-weight: 800;
          padding: 6px 18px;
          border-radius: 9999px;
          margin-bottom: 20px;
        }
        .label-before { background: #fee2e2; color: #dc2626; }
        .label-after { background: #dcfce7; color: #15803d; }

        /* 5 Layouts Showcase Grid */
        .layout-nav-pills {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 40px;
          flex-wrap: wrap;
        }
        .pill-btn {
          padding: 9px 20px;
          border-radius: 9999px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pill-btn.active {
          background: #4f46e5;
          color: #ffffff;
          border-color: #4f46e5;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }

        /* Zig-Zag Feature Spotlights */
        .spotlight-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
          margin-bottom: 88px;
        }
        .spotlight-row.reverse {
          direction: rtl;
        }
        .spotlight-row.reverse > * {
          direction: ltr;
        }
        .spotlight-content h3 {
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 16px;
          line-height: 1.25;
        }
        .spotlight-content p {
          font-size: 16px;
          color: #475569;
          margin-bottom: 24px;
        }
        .spotlight-bullets {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .spotlight-bullets li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }
        .bullet-check {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #eef2ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .spotlight-visual-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.05);
        }

        /* 3x2 Platform Grid */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 860px) {
          .features-grid { grid-template-columns: 1fr; }
          .spotlight-row { grid-template-columns: 1fr; gap: 32px; }
          .spotlight-row.reverse { direction: ltr; }
        }
        .grid-box {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }
        .grid-box-icon {
          font-size: 28px;
          margin-bottom: 16px;
        }
        .grid-box-title {
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .grid-box-text {
          font-size: 13.5px;
          color: #64748b;
          line-height: 1.5;
        }

        /* Bottom CTA */
        .bottom-cta {
          background: #0f172a;
          border-radius: 28px;
          padding: 64px 48px;
          text-align: center;
          color: #ffffff;
          margin-top: 60px;
          margin-bottom: 40px;
        }
        .bottom-cta h2 {
          font-size: 38px;
          font-weight: 900;
          margin-bottom: 16px;
          letter-spacing: -0.5px;
        }
        .bottom-cta p {
          font-size: 18px;
          color: #94a3b8;
          max-width: 600px;
          margin: 0 auto 36px auto;
        }

        /* Footer */
        .landing-footer {
          padding: 48px 0;
          border-top: 1px solid #e2e8f0;
          text-align: center;
          font-size: 13.5px;
          color: #94a3b8;
        }
      `}</style>

      {/* 1. Header */}
      <header className="landing-header">
        <div className="container nav-row">
          <a href="/" className="brand-logo">
            ⭐ AI Dynamic Review <span>System</span>
          </a>
          <nav className="nav-links">
            <a href="#transformation">Before vs After</a>
            <a href="#layouts">5 Review Layouts</a>
            <a href="#ai-engine">AI Review Engine</a>
            <a href="/privacy-policy">Privacy Policy</a>
          </nav>
          <a href="#install" className="btn-header-install">Install Free 🚀</a>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="hero" id="install">
        <div className="container">
          <div className="hero-badge">
            ✨ BUILT EXCLUSIVELY FOR SHOPIFY STORES
          </div>
          <h1 className="hero-title">
            Turn Store Visitors Into <span>Confident Buyers</span> With Intelligent Social Proof
          </h1>
          <p className="hero-subtitle">
            Generate authentic AI-assisted review drafts, import past marketplace feedback, and display floating trust widgets on any Shopify theme.
          </p>

          {/* 1-Click Store Installation Form */}
          <form className="install-box" onSubmit={handleSubmit}>
            <input
              type="text"
              className="install-input"
              placeholder="e.g. your-store.myshopify.com"
              value={shopUrl}
              onChange={(e) => setShopUrl(e.target.value)}
              required
            />
            <button type="submit" className="btn-install-submit">
              Install App 🚀
            </button>
          </form>

          {/* Hero Device Mockup with Floating Benefit Chips */}
          <div className="hero-phone-wrap">
            <div className="hero-floating-chip chip-left">
              <span style={{ fontSize: "22px" }}>📈</span>
              <div>
                <div style={{ color: "#059669", fontWeight: 800 }}>+34% Conversion Lift</div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Average merchant impact</div>
              </div>
            </div>

            <div className="phone-frame">
              <div className="phone-notch" />
              <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Store Mini Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "1px" }}>LUMINOUS STORE</span>
                  <span style={{ fontSize: "14px" }}>🛒</span>
                </div>
                {/* Product Image */}
                <div style={{ background: "#f1f5f9", borderRadius: "12px", height: "180px", display: "flex", alignItems: "center", justifyCenter: "center", marginBottom: "14px" }}>
                  <span style={{ fontSize: "44px", margin: "auto" }}>📦</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800 }}>6 piece towel set</div>
                <div style={{ color: "#f59e0b", fontSize: "12.5px", margin: "4px 0 8px 0" }}>★★★★★ (48 reviews)</div>
                <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "14px" }}>$29.99</div>
                <div style={{ background: "#0f172a", color: "#ffffff", textAlign: "center", padding: "10px", borderRadius: "8px", fontWeight: 700, fontSize: "13px" }}>
                  Add to cart
                </div>

                {/* Floating Review Widget */}
                <div style={{ marginTop: "auto", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e0f2fe", color: "#0284c7", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      PP
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 700 }}>Priya P.</div>
                    <div style={{ color: "#f59e0b", fontSize: "10px", marginLeft: "auto" }}>★★★★★</div>
                  </div>
                  <div style={{ fontSize: "11px", color: "#334155", lineHeight: 1.35, marginBottom: "6px" }}>
                    "Very soft and absorbent. Colour matches photo perfectly."
                  </div>
                  <div style={{ background: "#ecfdf5", color: "#059669", fontSize: "9.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>
                    ✓ Verified purchase
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-floating-chip chip-right">
              <span style={{ fontSize: "22px" }}>⚡</span>
              <div>
                <div style={{ fontWeight: 800 }}>&lt; 30ms Load Time</div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Zero impact on store speed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Transformation Section (Before vs After) */}
      <section className="section-wrap" id="transformation">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">THE CONVERSION TRANSFORMATION</span>
            <h2 className="section-title">See The Clear Difference In Buyer Trust</h2>
            <p className="section-desc">
              Compare a cold, silent product page with one elevated by authentic reviews and floating social proof.
            </p>
          </div>

          <div className="transform-stage">
            {/* Before */}
            <div className="transform-card">
              <span className="transform-label label-before">✕ BEFORE (No Social Proof)</span>
              <div className="phone-frame" style={{ borderColor: "#cbd5e1", opacity: 0.9 }}>
                <div className="phone-notch" style={{ background: "#cbd5e1" }} />
                <div style={{ padding: "16px", flex: 1 }}>
                  <div style={{ background: "#f1f5f9", borderRadius: "12px", height: "180px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "42px", opacity: 0.5, margin: "auto" }}>📦</span>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#334155" }}>6 piece towel set</div>
                  <div style={{ height: "20px", margin: "6px 0 10px 0", fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>No reviews yet</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "18px" }}>$29.99</div>
                  <div style={{ background: "#64748b", color: "#ffffff", textAlign: "center", padding: "10px", borderRadius: "8px", fontWeight: 700, fontSize: "13px" }}>
                    Add to cart
                  </div>
                  <div style={{ marginTop: "36px", padding: "14px", background: "#fff1f2", border: "1px dashed #fca5a5", borderRadius: "8px", textAlign: "center", fontSize: "11.5px", color: "#991b1b", fontWeight: 600 }}>
                    ⚠️ High buyer hesitation & cart abandonment
                  </div>
                </div>
              </div>
            </div>

            {/* After */}
            <div className="transform-card">
              <span className="transform-label label-after">✓ AFTER (AI Dynamic Reviews)</span>
              <div className="phone-frame" style={{ borderColor: "#059669", boxShadow: "0 20px 45px rgba(5, 150, 105, 0.18)" }}>
                <div className="phone-notch" style={{ background: "#059669" }} />
                <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ background: "#f1f5f9", borderRadius: "12px", height: "180px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "42px", margin: "auto" }}>📦</span>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>6 piece towel set</div>
                  <div style={{ color: "#f59e0b", fontSize: "12px", margin: "4px 0 8px 0", fontWeight: 700 }}>★★★★★ 4.9 (48 verified reviews)</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "18px" }}>$29.99</div>
                  <div style={{ background: "#0f172a", color: "#ffffff", textAlign: "center", padding: "10px", borderRadius: "8px", fontWeight: 700, fontSize: "13px" }}>
                    Add to cart
                  </div>

                  {/* Floating Popup */}
                  <div style={{ marginTop: "auto", background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e0f2fe", color: "#0369a1", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>PP</div>
                      <div style={{ fontSize: "12px", fontWeight: 700 }}>Priya P.</div>
                      <div style={{ color: "#f59e0b", fontSize: "10px", marginLeft: "auto" }}>★★★★★</div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#334155", lineHeight: 1.35, marginBottom: "6px" }}>"Very soft and absorbent. Colour matches photo perfectly."</div>
                    <div style={{ background: "#ecfdf5", color: "#059669", fontSize: "9.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>✓ Verified purchase</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The 5 Layouts Showcase */}
      <section className="section-wrap" id="layouts" style={{ background: "#ffffff" }}>
        <div className="container">
          <div className="section-header">
            <span className="section-badge">CURATED STYLES</span>
            <h2 className="section-title">5 Distinct Layouts Designed For Any Theme</h2>
            <p className="section-desc">
              Seamlessly match minimalist fashion boutiques, bold tech electronics, or luxury beauty catalogs.
            </p>
          </div>

          <div className="layout-nav-pills">
            <button type="button" className={`pill-btn ${activeLayout === "layout-1" ? "active" : ""}`} onClick={() => setActiveLayout("layout-1")}>
              1. Classic Social
            </button>
            <button type="button" className={`pill-btn ${activeLayout === "layout-2" ? "active" : ""}`} onClick={() => setActiveLayout("layout-2")}>
              2. Photo Spotlight
            </button>
            <button type="button" className={`pill-btn ${activeLayout === "layout-3" ? "active" : ""}`} onClick={() => setActiveLayout("layout-3")}>
              3. Social Dark
            </button>
            <button type="button" className={`pill-btn ${activeLayout === "layout-4" ? "active" : ""}`} onClick={() => setActiveLayout("layout-4")}>
              4. Compact Pill
            </button>
            <button type="button" className={`pill-btn ${activeLayout === "layout-5" ? "active" : ""}`} onClick={() => setActiveLayout("layout-5")}>
              5. Product Focus
            </button>
          </div>

          {/* Active Layout Showcase Card */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              width: "380px",
              background: activeLayout === "layout-3" ? "#0f172a" : "#ffffff",
              border: activeLayout === "layout-3" ? "1px solid #334155" : "1px solid #e2e8f0",
              borderRadius: activeLayout === "layout-4" ? "9999px" : "16px",
              padding: activeLayout === "layout-4" ? "14px 22px" : "18px 20px",
              boxShadow: "0 14px 34px rgba(15, 23, 42, 0.12)",
              color: activeLayout === "layout-3" ? "#ffffff" : "#0f172a",
              transition: "all 0.2s ease",
            }}>
              {/* Layout 1: Classic */}
              {activeLayout === "layout-1" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#dbeafe", color: "#1e40af", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        PP
                      </div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700 }}>Priya P.</div>
                        <div style={{ color: "#f59e0b", fontSize: "11px" }}>★★★★★</div>
                      </div>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: "14px" }}>✕</span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: 1.4, margin: "6px 0 10px 0" }}>
                    "Very soft and absorbent. Colour matches the photo perfectly."
                  </div>
                  <span style={{ background: "#ecfdf5", color: "#059669", fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "9999px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    ✓ Verified purchase
                  </span>
                </>
              )}

              {/* Layout 2: Photo Spotlight */}
              {activeLayout === "layout-2" && (
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                    🧺
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700 }}>
                      Sophia Martinez <span style={{ color: "#f59e0b", fontSize: "11px" }}>★★★★★</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px", lineHeight: 1.3 }}>
                      "Fluffy, premium cotton unboxing experience!"
                    </div>
                  </div>
                </div>
              )}

              {/* Layout 3: Social Dark */}
              {activeLayout === "layout-3" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff" }}>
                      Rachel V.
                    </div>
                    <div style={{ color: "#f59e0b", fontSize: "11px" }}>★★★★★</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#cbd5e1", marginTop: "4px", lineHeight: 1.35 }}>
                    "Super luxury finish. Customer support on WhatsApp was 10/10."
                  </div>
                </div>
              )}

              {/* Layout 4: Compact Pill */}
              {activeLayout === "layout-4" && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e0e7ff", color: "#3730a3", fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ⚡
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>Verified Buyer</span>{" "}
                    <span style={{ color: "#f59e0b", fontSize: "10.5px" }}>★★★★★</span>
                    <div style={{ fontSize: "11.5px", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Arrived in 2 days. Exactly what I needed!
                    </div>
                  </div>
                </div>
              )}

              {/* Layout 5: Product Focus */}
              {activeLayout === "layout-5" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>
                      Verified Purchase
                    </span>
                    <span style={{ color: "#f59e0b", fontSize: "11px" }}>★★★★★</span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", marginBottom: "3px" }}>
                    Deluxe 6-Piece Set
                  </div>
                  <div style={{ fontSize: "12px", color: "#334155", lineHeight: 1.4 }}>
                    "Highly recommended. Beautiful packaging and reliable quality."
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Feature Spotlights (Zig-Zag) */}
      <section className="section-wrap" id="ai-engine">
        <div className="container">
          {/* Spotlight 1: AI Engine */}
          <div className="spotlight-row">
            <div className="spotlight-content">
              <span className="section-badge">AI REVIEW ENGINE</span>
              <h3>Generate High-Converting Review Drafts in Seconds</h3>
              <p>
                Powered by dual AI models (Claude 3.5 &amp; Google Gemini) to craft believable, nuance-rich customer feedback tailored to your exact product catalog.
              </p>
              <ul className="spotlight-bullets">
                <li><span className="bullet-check">✓</span> 4 distinct tone presets (Friendly, Enthusiastic, Professional, Punchy)</li>
                <li><span className="bullet-check">✓</span> Keyword guardrails to avoid competitor mentions and prohibited words</li>
                <li><span className="bullet-check">✓</span> 100% human moderation control before any review goes live</li>
              </ul>
            </div>
            <div className="spotlight-visual-card">
              <div style={{ width: "100%", maxWidth: "380px", margin: "0 auto" }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>⚡ AI Prompt Customization</div>
                  <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px", fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
                    Tone: Friendly &amp; Relatable<br />
                    Product: 6 piece towel set<br />
                    Key Feature: Ultra-absorbent &amp; fast drying
                  </div>
                  <div style={{ background: "#4f46e5", color: "#ffffff", textAlign: "center", padding: "10px", borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}>
                    ✨ Generate 5 Authentic Drafts
                  </div>
                </div>
              </div>
            </div>
          </div>


        </div>
      </section>

      {/* 6. Shopify 3x2 Grid */}
      <section className="section-wrap" style={{ background: "#ffffff" }}>
        <div className="container">
          <div className="section-header">
            <span className="section-badge">SHOPIFY NATIVE</span>
            <h2 className="section-title">Engineered For Performance &amp; Security</h2>
            <p className="section-desc">
              Built according to official Shopify App Store standards to ensure rock-solid stability and zero store slowdown.
            </p>
          </div>

          <div className="features-grid">
            <div className="grid-box">
              <div className="grid-box-icon">⚡</div>
              <div className="grid-box-title">Zero Speed Penalty</div>
              <div className="grid-box-text">Loads asynchronously through edge CDNs with under 30ms latency. Zero impact on your Lighthouse score.</div>
            </div>
            <div className="grid-box">
              <div className="grid-box-icon">🎨</div>
              <div className="grid-box-title">Theme App Extension</div>
              <div className="grid-box-text">Activates via Shopify 2.0 Theme Editor with 1 toggle. No manual Liquid code editing required.</div>
            </div>
            <div className="grid-box">
              <div className="grid-box-icon">🔒</div>
              <div className="grid-box-title">GDPR &amp; Privacy Compliant</div>
              <div className="grid-box-text">Fully equipped with mandatory data erasure webhooks. We never sell or share merchant data.</div>
            </div>
            <div className="grid-box">
              <div className="grid-box-icon">📱</div>
              <div className="grid-box-title">Mobile-First Responsiveness</div>
              <div className="grid-box-text">Adaptive popups that float elegantly on desktop and dock seamlessly on mobile screens.</div>
            </div>
            <div className="grid-box">
              <div className="grid-box-icon">📦</div>
              <div className="grid-box-title">1-Click CSV Migration</div>
              <div className="grid-box-text">Seamlessly import reviews from Judge.me, Loox, AliExpress, Amazon, and custom CSV spreadsheets.</div>
            </div>
            <div className="grid-box">
              <div className="grid-box-icon">🌐</div>
              <div className="grid-box-title">Multi-Language Ready</div>
              <div className="grid-box-text">Automatically formats and displays review dates, names, and verification pills in your store's locale.</div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Bottom CTA */}
      <div className="container">
        <div className="bottom-cta">
          <h2>Ready To Turn Browsers Into Buyers?</h2>
          <p>Install AI Dynamic Review System today and start displaying authentic social proof in under 3 minutes.</p>
          <a href="#install" className="btn-header-install" style={{ background: "#ffffff", color: "#0f172a", fontSize: "15px", padding: "14px 34px" }}>
            Add to Shopify Store Now 🚀
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <p>© 2026 AI Dynamic Review System. Built exclusively for Shopify merchants.</p>
          <p style={{ marginTop: "8px" }}>
            <a href="/privacy-policy" style={{ color: "#4f46e5", textDecoration: "underline" }}>Privacy Policy</a> • 
            Support: <a href="mailto:developerr6620@gmail.com" style={{ color: "#4f46e5", textDecoration: "none" }}>developerr6620@gmail.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
