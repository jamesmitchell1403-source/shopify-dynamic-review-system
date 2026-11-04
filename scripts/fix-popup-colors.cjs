const fs = require("fs");
const path = require("path");

// 1. Update review-widget.css
const cssPath = path.join(process.cwd(), "extensions", "dynamic-review-widget", "assets", "review-widget.css");
let css = fs.readFileSync(cssPath, "utf8");

// Replace layout-3 styles to explicitly include media layouts with pure white text
const oldLayout3 = `/* LAYOUT 3: DARK MODE MODERN */
.rw-layout-layout-3,
.rw-layout-3 {
  background: #0F291E !important;
  border: 1px solid #166534 !important;
  border-radius: 16px !important;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4) !important;
}
.rw-layout-layout-3 .rw-avatar,
.rw-layout-3 .rw-avatar {
  background: #15803D !important;
  color: #FFFFFF !important;
}
.rw-layout-layout-3 .rw-reviewer,
.rw-layout-3 .rw-reviewer {
  color: #F8FAFC !important;
}
.rw-layout-layout-3 .rw-body,
.rw-layout-3 .rw-body {
  color: #E2E8F0 !important;
  text-align: left !important;
}
.rw-layout-layout-3 .rw-stars,
.rw-layout-3 .rw-stars {
  color: #FBBF24 !important;
}
.rw-layout-layout-3 .rw-verified-badge,
.rw-layout-3 .rw-verified-badge {
  color: #4ADE80 !important;
}
.rw-layout-layout-3 .rw-close-btn,
.rw-layout-3 .rw-close-btn {
  color: #94A3B8 !important;
}`;

const newLayout3 = `/* LAYOUT 3: DARK MODE MODERN (Social) - GUARANTEED WHITE TEXT FOR ALL 3 MEDIA VARIANTS */
.rw-layout-layout-3,
.rw-layout-3 {
  background: #0F291E !important;
  border: 1px solid #166534 !important;
  border-radius: 16px !important;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4) !important;
}
.rw-layout-layout-3 .rw-avatar,
.rw-layout-3 .rw-avatar,
.rw-layout-layout-3 .rw-media-right .rw-avatar,
.rw-layout-3 .rw-media-right .rw-avatar {
  background: #15803D !important;
  color: #FFFFFF !important;
}
.rw-layout-layout-3 .rw-reviewer,
.rw-layout-3 .rw-reviewer,
.rw-layout-layout-3 .rw-media-right .rw-reviewer,
.rw-layout-3 .rw-media-right .rw-reviewer {
  color: #FFFFFF !important;
  font-weight: 700 !important;
}
.rw-layout-layout-3 .rw-body,
.rw-layout-3 .rw-body,
.rw-layout-layout-3 .rw-media-right .rw-body,
.rw-layout-3 .rw-media-right .rw-body {
  color: #FFFFFF !important;
  text-align: left !important;
}
.rw-layout-layout-3 .rw-stars,
.rw-layout-3 .rw-stars,
.rw-layout-layout-3 .rw-media-right .rw-stars,
.rw-layout-3 .rw-media-right .rw-stars {
  color: #FBBF24 !important;
}
.rw-layout-layout-3 .rw-verified-badge,
.rw-layout-3 .rw-verified-badge,
.rw-layout-layout-3 .rw-media-right .rw-verified-badge,
.rw-layout-3 .rw-media-right .rw-verified-badge {
  color: #4ADE80 !important;
}
.rw-layout-layout-3 .rw-customer-type,
.rw-layout-3 .rw-customer-type,
.rw-layout-layout-3 .rw-media-right .rw-customer-type,
.rw-layout-3 .rw-media-right .rw-customer-type {
  color: #94A3B8 !important;
}
.rw-layout-layout-3 .rw-close-btn,
.rw-layout-3 .rw-close-btn,
.rw-layout-layout-3 .rw-media-right .rw-close-btn,
.rw-layout-3 .rw-media-right .rw-close-btn {
  color: #94A3B8 !important;
}`;

// Normalize CRLF to LF for replacement
const normalize = (str) => str.replace(/\r\n/g, "\n");
css = normalize(css).replace(normalize(oldLayout3), normalize(newLayout3));

// Remove hardcoded dark text colors from .rw-media-right .rw-reviewer and .rw-media-right .rw-body
const oldMediaRightReviewer = `.rw-media-right .rw-reviewer {
  font-size: 14.5px !important;
  font-weight: 700 !important;
  color: #1e293b !important;
}`;
const newMediaRightReviewer = `.rw-media-right .rw-reviewer {
  font-size: 14.5px !important;
  font-weight: 700 !important;
}`;

const oldMediaRightBody = `.rw-media-right .rw-body {
  font-size: 13.5px !important;
  line-height: 1.45 !important;
  color: #334155 !important;
  font-weight: 500 !important;
  margin: 2px 0 4px 0 !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 3 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
}`;
const newMediaRightBody = `.rw-media-right .rw-body {
  font-size: 13.5px !important;
  line-height: 1.45 !important;
  font-weight: 500 !important;
  margin: 2px 0 4px 0 !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 3 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
}`;

css = css.replace(normalize(oldMediaRightReviewer), normalize(newMediaRightReviewer));
css = css.replace(normalize(oldMediaRightBody), normalize(newMediaRightBody));

// Add explicit layout color rules for media-right across all 5 layouts
const mediaLayoutOverrides = `
/* Layout 1: Minimalist Classic with Media */
.rw-layout-layout-1 .rw-media-right .rw-reviewer,
.rw-layout-1 .rw-media-right .rw-reviewer {
  color: #0F172A !important;
}
.rw-layout-layout-1 .rw-media-right .rw-body,
.rw-layout-1 .rw-media-right .rw-body {
  color: #334155 !important;
}
.rw-layout-layout-1 .rw-media-right .rw-customer-type,
.rw-layout-1 .rw-media-right .rw-customer-type {
  color: #64748B !important;
}

/* Layout 2: Pastel Spotlight with Media */
.rw-layout-layout-2 .rw-media-right .rw-reviewer,
.rw-layout-2 .rw-media-right .rw-reviewer {
  color: #831843 !important;
}
.rw-layout-layout-2 .rw-media-right .rw-body,
.rw-layout-2 .rw-media-right .rw-body {
  color: #475569 !important;
}
.rw-layout-layout-2 .rw-media-right .rw-customer-type,
.rw-layout-2 .rw-media-right .rw-customer-type {
  color: #9D174D !important;
}

/* Layout 4: Quote Pill with Media */
.rw-layout-layout-4 .rw-media-right .rw-reviewer,
.rw-layout-4 .rw-media-right .rw-reviewer {
  color: #0F172A !important;
}
.rw-layout-layout-4 .rw-media-right .rw-body,
.rw-layout-4 .rw-media-right .rw-body {
  color: #334155 !important;
}
.rw-layout-layout-4 .rw-media-right .rw-customer-type,
.rw-layout-4 .rw-media-right .rw-customer-type {
  color: #64748B !important;
}

/* Layout 5: Organic Wave / Product with Media */
.rw-layout-layout-5 .rw-media-right .rw-reviewer,
.rw-layout-5 .rw-media-right .rw-reviewer {
  color: #78350F !important;
}
.rw-layout-layout-5 .rw-media-right .rw-body,
.rw-layout-5 .rw-media-right .rw-body {
  color: #451A03 !important;
}
.rw-layout-layout-5 .rw-media-right .rw-customer-type,
.rw-layout-5 .rw-media-right .rw-customer-type {
  color: #92400E !important;
}
`;

css = css + "\n" + mediaLayoutOverrides;

fs.writeFileSync(cssPath, css, "utf8");
console.log("Updated review-widget.css successfully!");

// 2. Update review-widget.js to apply all layout style variants reliably
const jsPath = path.join(process.cwd(), "extensions", "dynamic-review-widget", "assets", "review-widget.js");
let js = fs.readFileSync(jsPath, "utf8");
js = normalize(js);

const oldJsClass = `    const rawStyle = settings.layoutStyle || 'layout-1';
    const layoutStyle = rawStyle.startsWith('layout-') ? rawStyle : \`layout-\${rawStyle}\`;
    const layoutClass = \`rw-layout-\${layoutStyle}\`;`;

const newJsClass = `    const rawStyle = settings.layoutStyle || 'layout-1';
    const layoutStyle = rawStyle.startsWith('layout-') ? rawStyle : \`layout-\${rawStyle}\`;
    const numStyle = layoutStyle.replace(/^layout-/, '');
    const layoutClass = \`rw-layout-\${layoutStyle} rw-\${layoutStyle} rw-layout-\${numStyle} rw-layout-layout-\${numStyle}\`;`;

js = js.replace(normalize(oldJsClass), normalize(newJsClass));
fs.writeFileSync(jsPath, js, "utf8");
console.log("Updated review-widget.js successfully!");

