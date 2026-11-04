import sharp from "sharp";
import fs from "fs";
import path from "path";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";

// Clean image showcasing ONLY the Review Popup Styles (No product page clutter)
const svgPopupsOnly = `
<svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap');
      * { font-family: 'Manrope', -apple-system, sans-serif; }
      .shadow-card { filter: drop-shadow(0 14px 32px rgba(6, 78, 59, 0.12)); }
    </style>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8faf8"/>
      <stop offset="100%" stop-color="#edf6f0"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="800" fill="url(#bgGrad)"/>

  <!-- Header -->
  <g transform="translate(60, 50)">
    <rect x="0" y="0" width="160" height="26" rx="13" fill="#e8f7ee" stroke="#a7f3d0"/>
    <text x="14" y="18" font-size="11.5" font-weight="800" fill="#065f46" letter-spacing="1">APP FEATURE</text>
    <text x="0" y="60" font-size="32" font-weight="850" fill="#064e3b" letter-spacing="-0.5">Product Review Popup Styles</text>
    <text x="0" y="88" font-size="15" font-weight="500" fill="#4a6357">These are the customizable review popups that appear on the product page to show social proof and drive sales.</text>
  </g>

  <!-- ========================================== -->
  <!-- POPUP STYLE 1: Standard Review Card Popup   -->
  <!-- ========================================== -->
  <g transform="translate(60, 180)" class="shadow-card">
    <rect width="510" height="230" rx="20" fill="#ffffff" stroke="#c9e4d5" stroke-width="1.5"/>

    <!-- Header Pill -->
    <g transform="translate(24, 20)">
      <rect x="0" y="0" width="120" height="24" rx="12" fill="#e8f7ee"/>
      <circle cx="12" cy="12" r="4" fill="#059669"/>
      <text x="22" y="16" font-size="11" font-weight="800" fill="#065f46">NEW REVIEW</text>

      <text x="360" y="16" font-size="12" font-weight="600" fill="#94a3b8">2 mins ago</text>
    </g>

    <line x1="24" y1="56" x2="486" y2="56" stroke="#f1f5f3" stroke-width="1.5"/>

    <!-- Body -->
    <g transform="translate(24, 72)">
      <!-- Product / Reviewer Thumbnail -->
      <rect width="64" height="64" rx="14" fill="#ecfdf5" stroke="#d1fae5"/>
      <circle cx="32" cy="26" r="12" fill="#059669"/>
      <path d="M 16 54 C 16 42, 48 42, 48 54" fill="#059669"/>

      <!-- Text -->
      <g transform="translate(80, 4)">
        <text x="0" y="16" font-size="15" font-weight="800" fill="#0a281e">Sarah Jenkins</text>
        <rect x="110" y="2" width="105" height="18" rx="4" fill="#e8f7ee"/>
        <text x="116" y="15" font-size="10.5" font-weight="750" fill="#059669">✓ Verified Buyer</text>

        <!-- Stars -->
        <text x="0" y="38" font-size="14" font-weight="700" fill="#f59e0b">★★★★★</text>

        <!-- Quote -->
        <text x="0" y="60" font-size="13" font-weight="600" fill="#2d4a3e">"Great quality! Really love this product. Exceeded expectations."</text>
      </g>
    </g>

    <!-- Footer Tag -->
    <g transform="translate(24, 185)">
      <rect x="0" y="0" width="462" height="30" rx="8" fill="#f8faf8"/>
      <text x="12" y="20" font-size="11.5" font-weight="600" fill="#556d62">Product: <tspan font-weight="750" fill="#064e3b">The Luxe Everyday Leather Tote</tspan></text>
    </g>

    <!-- Label Underneath -->
    <text x="0" y="265" font-size="13" font-weight="750" fill="#064e3b">Style A: Detailed Review Card with Verified Badge</text>
  </g>

  <!-- ========================================== -->
  <!-- POPUP STYLE 2: Compact Product Review Toast -->
  <!-- ========================================== -->
  <g transform="translate(630, 180)" class="shadow-card">
    <rect width="510" height="230" rx="20" fill="#ffffff" stroke="#c9e4d5" stroke-width="1.5"/>

    <!-- Emerald Header Banner -->
    <path d="M 0 20 C 0 8.95 8.95 0 20 0 L 490 0 C 501.05 0 510 8.95 510 20 L 510 38 L 0 38 Z" fill="#064e3b"/>
    <circle cx="20" cy="19" r="4" fill="#34d399"/>
    <text x="32" y="23" font-size="11.5" font-weight="800" fill="#ffffff" letter-spacing="0.5">PRODUCT REVIEW ALERT</text>
    <text x="380" y="23" font-size="11" font-weight="700" fill="#a7f3d0">Product Page Only</text>

    <!-- Body -->
    <g transform="translate(24, 58)">
      <!-- Thumbnail -->
      <rect width="64" height="64" rx="14" fill="#f0fdf4" stroke="#a7f3d0"/>
      <path d="M 20 44 C 20 28, 44 28, 44 44" stroke="#059669" stroke-width="3" fill="none"/>
      <rect x="18" y="32" width="28" height="22" rx="3" fill="#064e3b"/>

      <!-- Text Content -->
      <g transform="translate(80, 8)">
        <text x="0" y="14" font-size="13.5" font-weight="800" fill="#0a281e">Marcus V. <tspan font-size="11" font-weight="500" fill="#94a3b8">from Chicago • 4 mins ago</tspan></text>
        <text x="0" y="34" font-size="13" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="600" fill="#2d4a3e">"Stunning finish and super fast shipping!"</tspan></text>
        <text x="0" y="52" font-size="11.5" font-weight="700" fill="#059669">✓ Verified Purchase of Leather Tote</text>
      </g>
    </g>

    <!-- Social proof stats footer -->
    <g transform="translate(24, 185)">
      <rect x="0" y="0" width="462" height="30" rx="8" fill="#e8f7ee"/>
      <text x="12" y="20" font-size="11.5" font-weight="750" fill="#065f46">★ 4.9 Rating based on 2,548+ real store reviews</text>
    </g>

    <!-- Label Underneath -->
    <text x="0" y="265" font-size="13" font-weight="750" fill="#064e3b">Style B: Sleek Header Toast Notification</text>
  </g>

  <!-- ========================================== -->
  <!-- POPUP STYLE 3: Minimal Floating Pill Toast -->
  <!-- ========================================== -->
  <g transform="translate(60, 500)" class="shadow-card">
    <rect width="510" height="110" rx="18" fill="#ffffff" stroke="#c9e4d5" stroke-width="1.5"/>
    <g transform="translate(20, 24)">
      <!-- Avatar with Star badge -->
      <circle cx="30" cy="30" r="26" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="2"/>
      <text x="18" y="36" font-size="16" font-weight="800" fill="#059669">ER</text>

      <g transform="translate(72, 8)">
        <text x="0" y="16" font-size="14" font-weight="800" fill="#0a281e">Elena R. just reviewed this product</text>
        <text x="0" y="36" font-size="13" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="600" fill="#2d4a3e">"Durable, elegant and looks amazing."</tspan></text>
      </g>
    </g>
    <text x="0" y="145" font-size="13" font-weight="750" fill="#064e3b">Style C: Minimal Floating Avatar Pill</text>
  </g>

  <!-- ========================================== -->
  <!-- POPUP STYLE 4: Trust Badge & Star Aggregate -->
  <!-- ========================================== -->
  <g transform="translate(630, 500)" class="shadow-card">
    <rect width="510" height="110" rx="18" fill="#ffffff" stroke="#c9e4d5" stroke-width="1.5"/>
    <g transform="translate(24, 24)">
      <!-- Trust Shield -->
      <rect width="60" height="60" rx="14" fill="#e8f7ee"/>
      <path d="M 30 16 L 44 22 L 44 34 C 44 42, 30 48, 30 48 C 30 48, 16 42, 16 34 L 16 22 Z" fill="#059669"/>
      <path d="M 24 32 L 28 36 L 36 26" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>

      <g transform="translate(76, 8)">
        <text x="0" y="16" font-size="14" font-weight="800" fill="#0a281e">Trusted by 10,000+ Happy Customers</text>
        <text x="0" y="36" font-size="13" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="600" fill="#4a6357">4.9 / 5.0 Average Store Rating</tspan></text>
      </g>
    </g>
    <text x="0" y="145" font-size="13" font-weight="750" fill="#064e3b">Style D: Floating Social Proof Trust Badge</text>
  </g>

  <!-- Footer Notice -->
  <g transform="translate(60, 710)">
    <rect x="0" y="0" width="1080" height="40" rx="10" fill="#e8f7ee" stroke="#a7f3d0"/>
    <text x="20" y="25" font-size="12.5" font-weight="750" fill="#065f46">⚡ Display Logic: Configured to pop up exclusively on the Product Page to reassure buyers right before checkout.</text>
  </g>
</svg>
`;

async function main() {
  const outFile = path.join(artifactDir, "review_popups_showcase.png");
  console.log("Generating Review Popups Showcase...");
  await sharp(Buffer.from(svgPopupsOnly)).png({ quality: 95 }).toFile(outFile);
  console.log("Saved: " + outFile);
}

main().catch(console.error);

