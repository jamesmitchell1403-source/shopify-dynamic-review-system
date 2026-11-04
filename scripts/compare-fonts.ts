import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";
const htmlPath = path.join(artifactDir, "font_comparison.html");
const pngPath = path.join(artifactDir, "font_comparison.png");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..800;1,9..40,400..800&family=Manrope:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      margin: 0 auto;
      background: #f8faf8;
      color: #0e291e;
      -webkit-font-smoothing: antialiased;
      padding: 30px;
    }
    .row {
      background: #ffffff;
      border: 1px solid #e1eee6;
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 4px 14px rgba(6, 78, 59, 0.04);
    }
    .tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #059669;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 38px;
      font-weight: 800;
      color: #0a281e;
      margin-bottom: 8px;
      letter-spacing: -0.025em;
    }
    h2 span { color: #059669; }
    p {
      font-size: 16px;
      color: #4a6357;
      line-height: 1.5;
    }
    .manrope { font-family: 'Manrope', sans-serif; }
    .dmsans { font-family: 'DM Sans', sans-serif; }
    .poppins { font-family: 'Poppins', sans-serif; }
  </style>
</head>
<body>
  <!-- 1. Manrope -->
  <div class="row manrope">
    <div class="tag">Font 1: Manrope (Modern, Sharp, Geometric, Highly Legible)</div>
    <h2>Turn Visitors Into Buyers With <span>AI Product Reviews.</span></h2>
    <p>Everything You Need in One App — Import, manage and showcase product reviews with AI help.</p>
  </div>

  <!-- 2. DM Sans -->
  <div class="row dmsans">
    <div class="tag">Font 2: DM Sans (Clean, Polished, Contemporary SaaS)</div>
    <h2>Turn Visitors Into Buyers With <span>AI Product Reviews.</span></h2>
    <p>Everything You Need in One App — Import, manage and showcase product reviews with AI help.</p>
  </div>

  <!-- 3. Poppins -->
  <div class="row poppins">
    <div class="tag">Font 3: Poppins (Geometric, Open, Vibrant & Friendly)</div>
    <h2>Turn Visitors Into Buyers With <span>AI Product Reviews.</span></h2>
    <p>Everything You Need in One App — Import, manage and showcase product reviews with AI help.</p>
  </div>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf-8");

const edgeExe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const cmd = `"${edgeExe}" --headless --disable-gpu --hide-scrollbars --window-size=1200,900 --screenshot="${pngPath}" "file:///${htmlPath.replace(/\\\\/g, "/")}"`;
execSync(cmd, { stdio: "inherit" });
console.log("Screenshot saved to:", pngPath);

