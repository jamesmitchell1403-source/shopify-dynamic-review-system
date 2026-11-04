const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "app", "routes", "_index", "route.tsx");
let content = fs.readFileSync(filePath, "utf8");

// 1. Update scroll-margin-top
content = content.replace(
  "#features, #benefits, #how-it-works, #faq {",
  "#features, #review-popups, #benefits, #how-it-works, #faq {"
);

// 2. Add CSS rules before "/* SECTION 3: Key Benefits"
const cssToAdd = `
        /* SECTION: Product Review Popups Showcase */
        .popup-showcase-section {
          padding: 85px 0;
          background: #ffffff;
          border-top: 1px solid #e8f1eb;
          border-bottom: 1px solid #e8f1eb;
        }
        .popups-grid-2x2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 26px;
          margin-bottom: 36px;
        }
        .popup-showcase-card {
          background: #ffffff;
          border: 1px solid #d5e5db;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 8px 24px rgba(6, 78, 59, 0.04);
          position: relative;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .popup-showcase-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 36px rgba(6, 78, 59, 0.08);
          border-color: #a7f3d0;
        }
        .popup-card-style-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #e8f7ee;
          color: #065f46;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 6px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .popup-page-scope-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #f1f5f3;
          color: #4a6357;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 6px;
          float: right;
        }
        .popup-preview-box {
          background: #fbfdfc;
          border: 1.5px solid #d5e5db;
          border-radius: 16px;
          padding: 20px;
          margin-top: 16px;
          margin-bottom: 14px;
        }
        .popup-scope-banner {
          background: #e8f7ee;
          border: 1.5px solid #a7f3d0;
          border-radius: 16px;
          padding: 22px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
`;

content = content.replace(
  "/* SECTION 3: Key Benefits",
  cssToAdd + "\n        /* SECTION 3: Key Benefits"
);

// 3. Add responsive breakpoint for popups
content = content.replace(
  ".features-grid-3x2 { grid-template-columns: 1fr; }",
  ".features-grid-3x2 { grid-template-columns: 1fr; }\n          .popups-grid-2x2 { grid-template-columns: 1fr; }"
);

// 4. Add navbar link
content = content.replace(
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="nav-link">Features</a>',
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="nav-link">Features</a>\n            <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="nav-link">Review Popups</a>'
);

// 5. Add mobile nav link
content = content.replace(
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="mobile-nav-link">Features</a>',
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="mobile-nav-link">Features</a>\n            <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="mobile-nav-link">Review Popups</a>'
);

// 6. Add footer link
content = content.replace(
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="footer-link">Features</a>',
  '<a href="#features" onClick={(e) => scrollToSection(e, "features")} className="footer-link">Features</a>\n              <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="footer-link">Review Popups</a>'
);

// 7. Insert the JSX section between #features and #benefits
const sectionJsx = `
      {/* 4. Product Review Popups Showcase */}
      <section className="popup-showcase-section" id="review-popups">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">— SOCIAL PROOF IN ACTION —</span>
            <h2 className="section-main-title">Real-Time Review Popups on Your Product Pages</h2>
            <p className="section-desc-sub">
              Display verified customer reviews, star ratings, and trust badges as non-intrusive popups. Proven to reduce hesitation and turn product page visitors into confident buyers.
            </p>
          </div>

          <div className="popups-grid-2x2">
            {/* Popup Style 1: Standard Review Card */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 1 • DETAIL CARD</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", borderBottom: "1px solid #eef4f0", paddingBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#059669", display: "inline-block" }} />
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#065f46", letterSpacing: "0.5px" }}>NEW PRODUCT REVIEW</span>
                  </div>
                  <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 500 }}>2 mins ago</span>
                </div>

                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
                    alt="Sarah Jenkins"
                    style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #a7f3d0" }}
                  />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "2px" }}>
                      <span style={{ fontSize: "14.5px", fontWeight: 800, color: "#0a281e" }}>Sarah Jenkins</span>
                      <span style={{ background: "#e8f7ee", color: "#059669", fontSize: "10.5px", fontWeight: 750, padding: "2px 8px", borderRadius: "4px" }}>
                        ✓ Verified Purchase
                      </span>
                    </div>
                    <div style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "1px", marginBottom: "6px" }}>★★★★★</div>
                    <p style={{ fontSize: "13px", color: "#2d4a3e", lineHeight: 1.45, margin: 0 }}>
                      "The craftsmanship is stunning! Fits my 15-inch laptop perfectly and arrived in 2 days."
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #eef4f0", fontSize: "11.5px", color: "#556d62", display: "flex", justifyContent: "space-between" }}>
                  <span>Product: <strong style={{ color: "#064e3b" }}>The Luxe Leather Tote</strong></span>
                  <span style={{ color: "#059669", fontWeight: 750 }}>5/5 Stars</span>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Highlighting individual verified customer experiences, product photos, and rating quotes.
              </div>
            </div>

            {/* Popup Style 2: Sleek Notification Toast */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 2 • HEADER TOAST</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #064e3b" }}>
                <div style={{ background: "#064e3b", color: "#ffffff", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                    <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.5px" }}>LIVE REVIEW NOTIFICATION</span>
                  </div>
                  <span style={{ fontSize: "10.5px", color: "#a7f3d0", fontWeight: 700 }}>Verified Buyer</span>
                </div>

                <div style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "#ecfdf5", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "20px" }}>👜</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#0a281e", marginBottom: "2px" }}>
                      Marcus V. <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#64748b" }}>from Chicago • 4 mins ago</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 700, marginBottom: "3px" }}>
                      ★★★★★ <span style={{ color: "#2d4a3e", fontWeight: 600 }}>"Stunning finish and super fast shipping!"</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#059669", fontWeight: 750 }}>
                      ✓ Verified Purchase of Leather Tote
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> High-impact, eye-catching social proof toasts that grab buyer attention subtly near the checkout button.
              </div>
            </div>

            {/* Popup Style 3: Minimal Floating Pill */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 3 • MINIMAL PILL</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ borderRadius: "999px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#ecfdf5", border: "1.5px solid #a7f3d0", color: "#059669", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  ER
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0a281e" }}>Elena R. just reviewed this product</div>
                  <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 700 }}>
                    ★★★★★ <span style={{ color: "#4a6357", fontWeight: 500 }}>"Durable, elegant and looks even better in person."</span>
                  </div>
                </div>
                <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 750, background: "#e8f7ee", padding: "3px 8px", borderRadius: "4px" }}>
                  Verified
                </span>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Modern, minimalist stores that want clean, lightweight social proof without obscuring product photos.
              </div>
            </div>

            {/* Popup Style 4: Store Trust & Aggregate Rating Badge */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 4 • TRUST BADGE</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#e8f7ee", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#0a281e", marginBottom: "2px" }}>
                    Trusted by 10,000+ Happy Customers
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#f59e0b", fontWeight: 700, marginBottom: "2px" }}>
                    ★★★★★ <span style={{ color: "#4a6357", fontWeight: 600 }}>4.9 / 5.0 Average Product Rating</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                    ✓ 98% of buyers recommend this store
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Establishing instant credibility and reassuring new visitors browsing higher-ticket items.
              </div>
            </div>
          </div>

          {/* Bottom Callout Banner */}
          <div className="popup-scope-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#064e3b", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "16px", flexShrink: 0 }}>
                ⚡
              </div>
              <div>
                <strong style={{ fontSize: "14.5px", color: "#064e3b", display: "block" }}>
                  Product-Page-Exclusive Triggering
                </strong>
                <span style={{ fontSize: "13px", color: "#2d4a3e" }}>
                  Our AI system detects the exact product the visitor is browsing, displaying matching reviews and verified ratings on that product page only.
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="btn-install-header"
              style={{ background: "#064e3b", color: "#ffffff", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Get Started Free →
            </button>
          </div>
        </div>
      </section>
`;

content = content.replace(
  "{/* 4. Key Benefits Section */}",
  sectionJsx + "\n      {/* 4. Key Benefits Section */}"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully applied Review Popup Showcase section to route.tsx!");
