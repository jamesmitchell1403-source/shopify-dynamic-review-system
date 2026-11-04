const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "app", "routes", "app.widget-settings.tsx");
let content = fs.readFileSync(filePath, "utf8");

// Helper object for preview styling based on layoutStyle
const themeHelper = `
  // Dynamic styling for admin preview card based on selected popup style
  const isLayout3 = layoutStyle === "layout-3";
  const isLayout2 = layoutStyle === "layout-2";
  const isLayout5 = layoutStyle === "layout-5";

  const previewCardBg = isLayout3 ? "#0F291E" : isLayout2 ? "#FFF7F8" : isLayout5 ? "#FFFBF0" : "#ffffff";
  const previewCardBorder = isLayout3 ? "1px solid #166534" : isLayout2 ? "1px solid #FBCFE8" : isLayout5 ? "1px solid #FDE68A" : "1px solid #e2e8f0";
  const previewReviewerColor = isLayout3 ? "#FFFFFF" : isLayout2 ? "#831843" : isLayout5 ? "#78350F" : "#0f172a";
  const previewBodyColor = isLayout3 ? "#FFFFFF" : isLayout2 ? "#475569" : isLayout5 ? "#451A03" : "#334155";
  const previewStarsColor = isLayout3 ? "#FBBF24" : isLayout5 ? "#D97706" : "#f59e0b";
  const previewAvatarBg = isLayout3 ? "#15803D" : isLayout2 ? "#FCE7F3" : isLayout5 ? "#FDE68A" : "#e0f2fe";
  const previewAvatarColor = isLayout3 ? "#FFFFFF" : isLayout2 ? "#831843" : isLayout5 ? "#78350F" : "#0369a1";
  const previewVerifiedBg = isLayout3 ? "#166534" : isLayout2 ? "#FDF2F8" : isLayout5 ? "#FEF3C7" : "#ecfdf5";
  const previewVerifiedColor = isLayout3 ? "#4ADE80" : isLayout2 ? "#BE185D" : isLayout5 ? "#B45309" : "#059669";
  const previewVerifiedBorder = isLayout3 ? "1px solid #15803D" : isLayout2 ? "1px solid #FBCFE8" : isLayout5 ? "1px solid #FDE68A" : "1px solid #d1fae5";
  const previewCloseColor = isLayout3 ? "#94A3B8" : isLayout2 ? "#9D174D" : isLayout5 ? "#92400E" : "#94a3b8";
`;

content = content.replace(
  "  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);",
  "  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);\n" + themeHelper
);

// Replace preview card styles
const oldPreviewCard = `              {/* FLOATING REVIEW POPUP (Positioned dynamically according to position setting) */}
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
              )}`;

const newPreviewCard = `              {/* FLOATING REVIEW POPUP (Positioned dynamically according to position setting) */}
              {enabled && (
                <div
                  style={{
                    position: "absolute",
                    bottom: position.includes("bottom") ? "24px" : "auto",
                    top: position.includes("top") ? "24px" : "auto",
                    left: position.includes("left") ? "24px" : "auto",
                    right: position.includes("right") ? "24px" : "auto",
                    width: "300px",
                    background: previewCardBg,
                    borderRadius: "14px",
                    padding: "16px",
                    border: previewCardBorder,
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
                          background: previewAvatarBg,
                          color: previewAvatarColor,
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
                        <div style={{ fontSize: "14px", fontWeight: 700, color: previewReviewerColor }}>
                          Priya P.
                        </div>
                        <div style={{ color: previewStarsColor, fontSize: "12px", letterSpacing: "1px" }}>
                          ★★★★★
                        </div>
                      </div>
                    </div>

                    <span style={{ color: previewCloseColor, fontSize: "14px", cursor: "pointer", lineHeight: 1 }}>
                      ✕
                    </span>
                  </div>

                  <div style={{ fontSize: "12.5px", color: previewBodyColor, lineHeight: 1.45, marginBottom: "10px" }}>
                    Very soft and absorbent. Colour matches the photo.
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span
                      style={{
                        background: previewVerifiedBg,
                        color: previewVerifiedColor,
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: "6px",
                        border: previewVerifiedBorder,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      ✓ Verified purchase
                    </span>
                    <span style={{ fontSize: "11px", color: previewCloseColor, fontWeight: 500 }}>
                      Verified Customer
                    </span>
                  </div>
                </div>
              )}`;

const normalize = (str) => str.replace(/\r\n/g, "\n");
content = normalize(content).replace(normalize(oldPreviewCard), normalize(newPreviewCard));

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated app.widget-settings.tsx successfully!");

