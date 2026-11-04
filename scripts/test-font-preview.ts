import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";
const htmlPath = path.join(artifactDir, "font_test_preview.html");
const pngPath = path.join(artifactDir, "font_test_preview.png");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      margin: 0 auto;
      background: #f8faf8;
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0e291e;
      -webkit-font-smoothing: antialiased;
      padding: 40px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #eaf5ef;
      color: #08533c;
      border: 1px solid #d1ebd9;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 48px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.15;
      color: #0a281e;
      margin-bottom: 18px;
      max-width: 680px;
    }
    h1 span { color: #059669; }
    p {
      font-size: 17px;
      color: #446153;
      line-height: 1.6;
      margin-bottom: 24px;
      font-weight: 400;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 30px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e1eee6;
      border-radius: 16px;
      padding: 24px;
    }
    .card h3 {
      font-size: 16.5px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      color: #0a281e;
    }
    .card p {
      font-size: 14px;
      color: #4d665a;
      line-height: 1.5;
      margin-bottom: 0;
    }
  </style>
</head>
<body>
  <div class="pill">★ Social Proof for Your Shopify Store</div>
  <h1>Turn Visitors Into Buyers With <span>AI Product Reviews.</span></h1>
  <p>Import, manage and showcase product reviews with AI help.</p>
  
  <div class="grid">
    <div class="card">
      <h3>Show Review Popups & Ratings</h3>
      <p>Display social proof on product pages and across your store.</p>
    </div>
    <div class="card">
      <h3>Draft Reviews with AI</h3>
      <p>Use OpenAI, Claude or Gemini to create review drafts, then edit.</p>
    </div>
    <div class="card">
      <h3>Bulk Import Reviews from CSV</h3>
      <p>Save time with automatic column mapping.</p>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf-8");

const edgeExe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const cmd = `"${edgeExe}" --headless --disable-gpu --hide-scrollbars --window-size=1200,600 --screenshot="${pngPath}" "file:///${htmlPath.replace(/\\\\/g, "/")}"`;
execSync(cmd, { stdio: "inherit" });
console.log("Screenshot saved to:", pngPath);

