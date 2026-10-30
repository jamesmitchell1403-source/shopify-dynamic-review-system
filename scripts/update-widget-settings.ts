import fs from "fs";

const file = "app/routes/app.widget-settings.tsx";
let content = fs.readFileSync(file, "utf8");

const startMarker = "{/* RIGHT COLUMN: LIVE STOREFRONT PREVIEW */}";
const startIndex = content.indexOf(startMarker);

const endMarker = '<span>Preview uses your real store catalog & reviews. Use "View on live store" or "Theme editor" to inspect the active theme.</span>';
const endSearchPos = content.indexOf(endMarker, startIndex);
const closeDiv1 = content.indexOf("</div>", endSearchPos);
const closeDiv2 = content.indexOf("</div>", closeDiv1 + 6);
const finalEndIndex = closeDiv2 + 6;

if (startIndex === -1 || endSearchPos === -1) {
  console.error("Markers not found", { startIndex, endSearchPos });
  process.exit(1);
}

const replacement = `{/* RIGHT COLUMN: LIVE STOREFRONT PREVIEW (Exact match to screenshot) */}
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
          </div>`;

content = content.substring(0, startIndex) + replacement + content.substring(finalEndIndex);
fs.writeFileSync(file, content, "utf8");
console.log("Successfully updated app.widget-settings.tsx to match screenshot!");
