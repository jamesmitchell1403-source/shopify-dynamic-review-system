import sharp from "sharp";
import fs from "fs";
import path from "path";

const outputDir = "public/app-store-assets";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// -------------------------------------------------------------
// HELPER SVG GENERATOR TEMPLATE
// Dimensions: 1600 x 900 (Shopify App Store Feature Banner Standard)
// Style: Matches screenshots with clean light canvas, rounded container,
// browser navbar, product column, product details, and the floating social proof popup.
// -------------------------------------------------------------

function getStars(count: number): string {
  return "★".repeat(count) + "☆".repeat(5 - count);
}

// 1. Feature Image 1: Live Storefront Social Proof (Floating popup on Product Page)
const svg1 = `
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .shadow-card { filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 16px 36px rgba(15, 23, 42, 0.16)); }
    </style>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="shoppayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5a31f4"/>
      <stop offset="100%" stop-color="#4624cd"/>
    </linearGradient>
    <linearGradient id="placeholderGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>

  <!-- Background Canvas -->
  <rect width="1600" height="900" fill="#f8fafc"/>

  <!-- Top Bar: Header -->
  <g class="font-sans" transform="translate(64, 42)">
    <text x="0" y="28" font-size="28" font-weight="800" fill="#0f172a">Live storefront preview</text>
    
    <!-- Location Pill -->
    <rect x="330" y="6" width="130" height="30" rx="15" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
    <circle cx="346" cy="21" r="4" fill="#2563eb"/>
    <text x="358" y="26" font-size="13" font-weight="600" fill="#1d4ed8">Bottom left</text>

    <!-- Theme status pill -->
    <rect x="475" y="6" width="220" height="30" rx="15" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
    <circle cx="493" cy="21" r="4" fill="#10b981"/>
    <text x="506" y="26" font-size="13" font-weight="600" fill="#065f46">App embed enabled on theme</text>

    <!-- Viewport Switcher Buttons -->
    <rect x="1330" y="4" width="105" height="34" rx="8" fill="#0f172a"/>
    <text x="1362" y="26" font-size="14" font-weight="700" fill="#ffffff">Desktop</text>
    
    <rect x="1445" y="4" width="95" height="34" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="1476" y="26" font-size="14" font-weight="600" fill="#64748b">Mobile</text>
  </g>

  <!-- Main Storefront Frame (The Card) -->
  <g class="font-sans shadow-card" transform="translate(64, 96)">
    <!-- White Card Base -->
    <rect width="1472" height="710" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

    <!-- Browser Mockup Top Bar -->
    <rect width="1472" height="46" rx="16" fill="#f8fafc"/>
    <rect y="36" width="1472" height="10" fill="#f8fafc"/>
    <line x1="0" y1="46" x2="1472" y2="46" stroke="#e2e8f0" stroke-width="1"/>

    <!-- Traffic Lights -->
    <circle cx="30" cy="23" r="6" fill="#ef4444"/>
    <circle cx="48" cy="23" r="6" fill="#f59e0b"/>
    <circle cx="66" cy="23" r="6" fill="#10b981"/>

    <!-- Browser URL input -->
    <rect x="436" y="10" width="600" height="26" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="470" y="27" font-size="12" fill="#64748b">https://develops-test-store.myshopify.com/products/luminous-kit</text>

    <!-- Store Announcement Banner -->
    <rect y="46" width="1472" height="34" fill="#0f172a"/>
    <text x="736" y="68" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">
      ✨ FREE SHIPPING ON ORDERS OVER $50 • 30-DAY SATISFACTION GUARANTEE
    </text>

    <!-- Store Header / Nav -->
    <g transform="translate(48, 80)">
      <text x="0" y="38" font-size="20" font-weight="900" fill="#0f172a" letter-spacing="2">LUMINOUS<tspan fill="#2563eb">GEMS</tspan></text>
      
      <text x="360" y="38" font-size="14" font-weight="500" fill="#475569">Home</text>
      <text x="430" y="38" font-size="14" font-weight="500" fill="#475569">Catalog</text>
      <text x="515" y="38" font-size="14" font-weight="800" fill="#0f172a">Product</text>
      <line x1="515" y1="44" x2="570" y2="44" stroke="#2563eb" stroke-width="2"/>
      <text x="600" y="38" font-size="14" font-weight="500" fill="#475569">Reviews</text>
      <text x="685" y="38" font-size="14" font-weight="500" fill="#475569">About</text>

      <line x1="-48" y1="56" x2="1424" y2="56" stroke="#f1f5f9" stroke-width="1"/>
    </g>

    <!-- Product Layout: Left Image + Right Details -->
    <g transform="translate(48, 160)">
      <!-- Left Column: Product Image Box -->
      <rect x="0" y="0" width="460" height="470" rx="12" fill="url(#placeholderGrad)" stroke="#e2e8f0" stroke-width="1"/>
      <rect x="20" y="20" width="96" height="24" rx="4" fill="#2563eb"/>
      <text x="68" y="36" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">BESTSELLER</text>

      <!-- Placeholder Camera / Graphic Icon -->
      <g transform="translate(195, 180)" fill="none" stroke="#94a3b8" stroke-width="2">
        <rect x="0" y="0" width="70" height="60" rx="8"/>
        <circle cx="35" cy="30" r="16"/>
        <circle cx="54" cy="14" r="3" fill="#94a3b8"/>
      </g>
      <text x="230" y="275" font-size="15" font-weight="600" fill="#64748b" text-anchor="middle">Luminous Kit Product Image</text>

      <!-- Right Column: Product Info & Actions -->
      <g transform="translate(520, 10)">
        <text x="0" y="16" font-size="12" font-weight="800" fill="#64748b" letter-spacing="1">DEVELOPER TEST STORE OFFICIAL</text>
        <text x="0" y="56" font-size="34" font-weight="800" fill="#0f172a">Luminous Kit</text>
        
        <!-- Stars & Review Count -->
        <text x="0" y="90" font-size="18" fill="#f59e0b" letter-spacing="2">★★★★★</text>
        <text x="120" y="89" font-size="14" font-weight="700" fill="#0f172a">5.0</text>
        <text x="150" y="89" font-size="14" font-weight="600" fill="#2563eb">•  20 customer reviews</text>

        <!-- Price -->
        <text x="0" y="140" font-size="32" font-weight="800" fill="#0f172a">$50.99</text>
        <text x="120" y="140" font-size="18" font-weight="500" fill="#94a3b8" text-decoration="line-through">$63.74</text>
        <rect x="200" y="120" width="75" height="24" rx="4" fill="#fef2f2"/>
        <text x="237" y="136" font-size="12" font-weight="800" fill="#dc2626" text-anchor="middle">Save 20%</text>

        <!-- In Stock Badge -->
        <circle cx="6" cy="176" r="4" fill="#10b981"/>
        <text x="18" y="180" font-size="13" font-weight="600" fill="#059669">In stock, ready to dispatch</text>

        <!-- Options: Pills -->
        <text x="0" y="222" font-size="13" font-weight="700" fill="#334155">Options: Standard Pack</text>
        <rect x="0" y="234" width="100" height="38" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5"/>
        <text x="50" y="258" font-size="13" font-weight="700" fill="#2563eb" text-anchor="middle">Standard</text>
        
        <rect x="110" y="234" width="90" height="38" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="155" y="258" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">Deluxe</text>

        <rect x="210" y="234" width="115" height="38" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="267" y="258" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">Bundle Set</text>

        <!-- ATC and Qty Row -->
        <rect x="0" y="296" width="100" height="48" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="50" y="326" font-size="15" font-weight="600" fill="#0f172a" text-anchor="middle">-   1   +</text>

        <rect x="115" y="296" width="460" height="48" rx="8" fill="#0f172a"/>
        <text x="345" y="326" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">🛒  Add to cart</text>

        <!-- Buy with Shop Pay -->
        <rect x="0" y="356" width="575" height="48" rx="8" fill="url(#shoppayGrad)"/>
        <text x="287" y="386" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle">Buy with Shop Pay</text>

        <!-- Delivery note -->
        <text x="0" y="434" font-size="13" fill="#64748b">📦 Order within <tspan font-weight="700" fill="#0f172a">3 hours</tspan> for delivery by <tspan font-weight="700" fill="#0f172a">Friday</tspan></text>
      </g>
    </g>

    <!-- FLOATING REVIEW POPUP (EXACT MATCH TO REFERENCE SCREENSHOT) -->
    <g class="shadow-popup" transform="translate(48, 510)">
      <rect width="360" height="155" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

      <!-- User Avatar Circle -->
      <circle cx="42" cy="40" r="20" fill="#e0f2fe"/>
      <text x="42" y="45" font-size="14" font-weight="800" fill="#0284c7" text-anchor="middle">SM</text>

      <!-- Reviewer Name + Stars -->
      <text x="74" y="34" font-size="15" font-weight="800" fill="#0f172a">Sophia Martinez</text>
      <text x="74" y="52" font-size="13" fill="#f59e0b" letter-spacing="1">★★★★★</text>

      <!-- Close icon 'x' -->
      <text x="335" y="34" font-size="14" fill="#94a3b8" font-weight="600">✕</text>

      <!-- Review Content Text -->
      <text x="22" y="85" font-size="13" fill="#334155" font-weight="500">Very satisfied with Demo Bundle. Well</text>
      <text x="22" y="103" font-size="13" fill="#334155" font-weight="500">packaged and reliable finish.</text>

      <!-- Verified Purchase Badge -->
      <rect x="22" y="117" width="138" height="24" rx="4" fill="#ecfdf5" stroke="#d1fae5" stroke-width="1"/>
      <text x="32" y="133" font-size="11" font-weight="700" fill="#059669">✓ Verified purchase</text>
    </g>
  </g>

  <!-- Bottom Helper Note -->
  <g class="font-sans" transform="translate(64, 840)">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#64748b" stroke-width="1.5"/>
    <text x="10" y="14" font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">i</text>
    <text x="28" y="14" font-size="13" fill="#64748b">
      Preview uses real store catalog &amp; reviews. Live popups automatically rotate and adapt dynamically to your theme colors.
    </text>
  </g>
</svg>
`;

// 2. Feature Image 2: Multi-Position & Display Control (Bottom Left, Bottom Right, Floating)
const svg2 = `
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .shadow-card { filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 16px 36px rgba(15, 23, 42, 0.16)); }
    </style>
    <linearGradient id="shoppayGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5a31f4"/>
      <stop offset="100%" stop-color="#4624cd"/>
    </linearGradient>
    <linearGradient id="placeholderGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="#f8fafc"/>

  <!-- Top Bar: Header -->
  <g class="font-sans" transform="translate(64, 42)">
    <text x="0" y="28" font-size="28" font-weight="800" fill="#0f172a">Widget Placement &amp; Timing Controls</text>
    
    <rect x="460" y="6" width="135" height="30" rx="15" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
    <circle cx="476" cy="21" r="4" fill="#2563eb"/>
    <text x="488" y="26" font-size="13" font-weight="600" fill="#1d4ed8">Bottom right</text>

    <rect x="610" y="6" width="180" height="30" rx="15" fill="#fdf4ff" stroke="#f0abfc" stroke-width="1"/>
    <circle cx="628" cy="21" r="4" fill="#c026d3"/>
    <text x="640" y="26" font-size="13" font-weight="600" fill="#a21caf">Rotation: 4s interval</text>

    <!-- Right Switcher -->
    <rect x="1330" y="4" width="105" height="34" rx="8" fill="#0f172a"/>
    <text x="1362" y="26" font-size="14" font-weight="700" fill="#ffffff">Desktop</text>
    
    <rect x="1445" y="4" width="95" height="34" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="1476" y="26" font-size="14" font-weight="600" fill="#64748b">Mobile</text>
  </g>

  <!-- Main Storefront Frame -->
  <g class="font-sans shadow-card" transform="translate(64, 96)">
    <rect width="1472" height="710" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

    <!-- Browser Bar -->
    <rect width="1472" height="46" rx="16" fill="#f8fafc"/>
    <rect y="36" width="1472" height="10" fill="#f8fafc"/>
    <line x1="0" y1="46" x2="1472" y2="46" stroke="#e2e8f0" stroke-width="1"/>

    <circle cx="30" cy="23" r="6" fill="#ef4444"/>
    <circle cx="48" cy="23" r="6" fill="#f59e0b"/>
    <circle cx="66" cy="23" r="6" fill="#10b981"/>

    <rect x="436" y="10" width="600" height="26" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="470" y="27" font-size="12" fill="#64748b">https://develops-test-store.myshopify.com/products/6-piece-towel-set</text>

    <!-- Header / Nav -->
    <g transform="translate(48, 60)">
      <text x="0" y="38" font-size="20" font-weight="900" fill="#0f172a" letter-spacing="2">HOME<tspan fill="#2563eb">LIVING</tspan></text>
      <text x="360" y="38" font-size="14" font-weight="500" fill="#475569">Home</text>
      <text x="430" y="38" font-size="14" font-weight="500" fill="#475569">Catalog</text>
      <text x="515" y="38" font-size="14" font-weight="800" fill="#0f172a">Bath &amp; Towels</text>
      <line x1="515" y1="44" x2="615" y2="44" stroke="#2563eb" stroke-width="2"/>
      <text x="645" y="38" font-size="14" font-weight="500" fill="#475569">Reviews</text>
      <line x1="-48" y1="56" x2="1424" y2="56" stroke="#f1f5f9" stroke-width="1"/>
    </g>

    <!-- PDP Layout -->
    <g transform="translate(48, 140)">
      <!-- Left: Minimal Clean Image Box (Like 2nd screenshot) -->
      <rect x="0" y="0" width="460" height="490" rx="12" fill="url(#placeholderGrad2)" stroke="#e2e8f0" stroke-width="1"/>
      
      <g transform="translate(195, 190)" fill="none" stroke="#94a3b8" stroke-width="2">
        <rect x="0" y="0" width="70" height="60" rx="8"/>
        <polyline points="10 45 25 30 45 45"/>
        <polyline points="35 40 50 25 60 40"/>
        <circle cx="50" cy="18" r="4" fill="#94a3b8"/>
      </g>
      <text x="230" y="285" font-size="15" font-weight="600" fill="#64748b" text-anchor="middle">Product image placeholder</text>

      <!-- Right Column: Product Info -->
      <g transform="translate(520, 20)">
        <text x="0" y="40" font-size="36" font-weight="800" fill="#0f172a">6 piece towel set</text>
        
        <!-- Stars -->
        <text x="0" y="78" font-size="18" fill="#f59e0b" letter-spacing="2">★★★★★</text>
        <text x="120" y="77" font-size="14" font-weight="600" fill="#64748b">(48 reviews)</text>

        <!-- Price -->
        <text x="0" y="130" font-size="34" font-weight="800" fill="#0f172a">$29.99</text>

        <!-- ATC Button -->
        <rect x="0" y="165" width="560" height="52" rx="8" fill="#0f172a"/>
        <text x="280" y="198" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Add to cart</text>

        <!-- Skeleton Content Lines (Matching 2nd screenshot right column) -->
        <rect x="0" y="250" width="560" height="12" rx="6" fill="#e2e8f0"/>
        <rect x="0" y="274" width="480" height="12" rx="6" fill="#e2e8f0"/>
        <rect x="0" y="298" width="340" height="12" rx="6" fill="#e2e8f0"/>

        <!-- Feature Points -->
        <g transform="translate(0, 345)">
          <circle cx="12" cy="12" r="10" fill="#ecfdf5"/>
          <text x="12" y="16" font-size="12" font-weight="800" fill="#059669" text-anchor="middle">✓</text>
          <text x="34" y="16" font-size="14" font-weight="600" fill="#334155">100% Turkish Cotton - Ultra Soft &amp; Absorbent</text>

          <circle cx="12" cy="46" r="10" fill="#ecfdf5"/>
          <text x="12" y="50" font-size="12" font-weight="800" fill="#059669" text-anchor="middle">✓</text>
          <text x="34" y="50" font-size="14" font-weight="600" fill="#334155">Machine washable &amp; fade-resistant colors</text>
        </g>
      </g>
    </g>

    <!-- FLOATING REVIEW POPUP (POSITIONED BOTTOM RIGHT) -->
    <g class="shadow-popup" transform="translate(1060, 500)">
      <rect width="360" height="160" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

      <!-- Avatar PP -->
      <circle cx="42" cy="40" r="20" fill="#e0f2fe"/>
      <text x="42" y="45" font-size="14" font-weight="800" fill="#0284c7" text-anchor="middle">PP</text>

      <text x="74" y="34" font-size="15" font-weight="800" fill="#0f172a">Priya P.</text>
      <text x="74" y="52" font-size="13" fill="#f59e0b" letter-spacing="1">★★★★★</text>

      <text x="335" y="34" font-size="14" fill="#94a3b8" font-weight="600">✕</text>

      <text x="22" y="85" font-size="13" fill="#334155" font-weight="500">Very soft and absorbent. Colour matches</text>
      <text x="22" y="103" font-size="13" fill="#334155" font-weight="500">the photo perfectly. Highly recommend!</text>

      <rect x="22" y="120" width="138" height="24" rx="4" fill="#ecfdf5" stroke="#d1fae5" stroke-width="1"/>
      <text x="32" y="136" font-size="11" font-weight="700" fill="#059669">✓ Verified purchase</text>
    </g>
  </g>

  <!-- Bottom Helper Note -->
  <g class="font-sans" transform="translate(64, 840)">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#64748b" stroke-width="1.5"/>
    <text x="10" y="14" font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">i</text>
    <text x="28" y="14" font-size="13" fill="#64748b">
      Configure popup display duration (seconds), delay before first review, and maximum impressions per customer session.
    </text>
  </g>
</svg>
`;

// 3. Feature Image 3: AI-Powered Review Generator (Single & Bulk Generation Dashboard)
const svg3 = `
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .shadow-card { filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.08)); }
      .shadow-box { filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.04)); }
    </style>
  </defs>

  <rect width="1600" height="900" fill="#f8fafc"/>

  <!-- Top Bar: Header -->
  <g class="font-sans" transform="translate(64, 42)">
    <text x="0" y="28" font-size="28" font-weight="800" fill="#0f172a">AI Review Generator Dashboard</text>
    
    <rect x="420" y="6" width="160" height="30" rx="15" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
    <circle cx="436" cy="21" r="4" fill="#2563eb"/>
    <text x="448" y="26" font-size="13" font-weight="600" fill="#1d4ed8">Single Product Tab</text>

    <rect x="590" y="6" width="190" height="30" rx="15" fill="#fdf4ff" stroke="#f0abfc" stroke-width="1"/>
    <circle cx="608" cy="21" r="4" fill="#9333ea"/>
    <text x="620" y="26" font-size="13" font-weight="600" fill="#7e22ce">Claude + Gemini AI</text>

    <!-- View Mode Switcher -->
    <rect x="1330" y="4" width="105" height="34" rx="8" fill="#0f172a"/>
    <text x="1362" y="26" font-size="14" font-weight="700" fill="#ffffff">Modular</text>
    
    <rect x="1445" y="4" width="95" height="34" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="1476" y="26" font-size="14" font-weight="600" fill="#64748b">Preset</text>
  </g>

  <!-- 2x2 Grid Layout within Container -->
  <g class="font-sans" transform="translate(64, 96)">
    
    <!-- CARD 1: 1. Select Product -->
    <g class="shadow-box" transform="translate(0, 0)">
      <rect width="720" height="345" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <circle cx="36" cy="36" r="16" fill="#f1f5f9"/>
      <text x="36" y="41" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">🛍️</text>
      <text x="66" y="36" font-size="18" font-weight="800" fill="#0f172a">1. Select Product</text>
      <text x="66" y="54" font-size="12" fill="#64748b">Choose a product from your Shopify catalog to generate reviews.</text>

      <!-- Search Input -->
      <rect x="24" y="80" width="672" height="42" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="44" y="106" font-size="14" fill="#94a3b8">🔍 Search product by title or SKU...</text>

      <!-- Selected Product Box -->
      <rect x="24" y="140" width="672" height="85" rx="10" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <rect x="40" y="152" width="60" height="60" rx="8" fill="#e2e8f0"/>
      <text x="70" y="187" font-size="20" text-anchor="middle">📦</text>
      <text x="115" y="176" font-size="16" font-weight="700" fill="#0f172a">Luminous Kit</text>
      <text x="115" y="196" font-size="13" fill="#64748b">5 real reviews  •  Avg. 4.6 ★</text>
      <text x="640" y="186" font-size="13" font-weight="700" fill="#2563eb">Change</text>

      <!-- Verified Product Badge -->
      <rect x="24" y="246" width="672" height="70" rx="8" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1"/>
      <text x="44" y="275" font-size="13" font-weight="700" fill="#166534">✓ Catalog Synced with Shopify Admin</text>
      <text x="44" y="297" font-size="12" fill="#15803d">Targeting: Standard Pack, Deluxe Set, Bundle Gift Box</text>
    </g>

    <!-- CARD 2: 2. Review Settings -->
    <g class="shadow-box" transform="translate(752, 0)">
      <rect width="720" height="345" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <circle cx="36" cy="36" r="16" fill="#f1f5f9"/>
      <text x="36" y="41" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">⚙️</text>
      <text x="66" y="36" font-size="18" font-weight="800" fill="#0f172a">2. Review Settings</text>
      <text x="66" y="54" font-size="12" fill="#64748b">Customize the tone, volume, and generation details.</text>

      <!-- Review Tone Options -->
      <text x="24" y="90" font-size="13" font-weight="700" fill="#334155">Review Tone</text>
      <rect x="24" y="102" width="145" height="34" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5"/>
      <text x="96" y="124" font-size="12" font-weight="700" fill="#2563eb" text-anchor="middle">Friendly &amp; Relatable</text>

      <rect x="180" y="102" width="150" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="255" y="124" font-size="12" font-weight="600" fill="#475569" text-anchor="middle">Enthusiastic &amp; Excited</text>

      <rect x="340" y="102" width="155" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="417" y="124" font-size="12" font-weight="600" fill="#475569" text-anchor="middle">Professional &amp; Detailed</text>

      <rect x="505" y="102" width="120" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="565" y="124" font-size="12" font-weight="600" fill="#475569" text-anchor="middle">Short &amp; Punchy</text>

      <!-- Review Count -->
      <text x="24" y="170" font-size="13" font-weight="700" fill="#334155">Number of Reviews to Generate</text>
      <rect x="24" y="182" width="60" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="54" y="204" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">1</text>
      
      <rect x="94" y="182" width="60" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="124" y="204" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">3</text>

      <rect x="164" y="182" width="60" height="34" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5"/>
      <text x="194" y="204" font-size="13" font-weight="800" fill="#2563eb" text-anchor="middle">5</text>

      <rect x="234" y="182" width="60" height="34" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="264" y="204" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">10</text>

      <!-- Key Features Input -->
      <text x="24" y="250" font-size="13" font-weight="700" fill="#334155">Key Features (Optional)</text>
      <rect x="24" y="262" width="672" height="42" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="40" y="288" font-size="13" fill="#64748b">e.g. long battery life, fast shipping, luxury unboxing experience</text>
    </g>

    <!-- CARD 3: 3. Advanced Options -->
    <g class="shadow-box" transform="translate(0, 365)">
      <rect width="720" height="355" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <circle cx="36" cy="36" r="16" fill="#f1f5f9"/>
      <text x="36" y="41" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">🎛️</text>
      <text x="66" y="36" font-size="18" font-weight="800" fill="#0f172a">3. Advanced Options</text>
      <text x="66" y="54" font-size="12" fill="#64748b">Refine your reviews with AI suggestions and custom exclusions.</text>

      <!-- Option 1 -->
      <rect x="24" y="75" width="672" height="56" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="44" y="98" font-size="14" font-weight="700" fill="#0f172a">✨ AI Suggestions</text>
      <text x="44" y="118" font-size="12" fill="#64748b">Use AI to highlight product benefits and unique selling points.</text>
      <text x="670" y="108" font-size="14" fill="#94a3b8">›</text>

      <!-- Option 2 -->
      <rect x="24" y="142" width="672" height="56" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="44" y="165" font-size="14" font-weight="700" fill="#0f172a">🚫 Exclude Keywords</text>
      <text x="44" y="185" font-size="12" fill="#64748b">Add words or phrases to avoid in AI generation.</text>
      <text x="670" y="175" font-size="14" fill="#94a3b8">›</text>

      <!-- Option 3 -->
      <rect x="24" y="209" width="672" height="56" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="44" y="232" font-size="14" font-weight="700" fill="#0f172a">👤 Customer Profile</text>
      <text x="44" y="252" font-size="12" fill="#64748b">Target specific customer types (e.g., new buyers, professionals).</text>
      <text x="670" y="242" font-size="14" fill="#94a3b8">›</text>

      <!-- Option 4 -->
      <rect x="24" y="276" width="672" height="56" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="44" y="299" font-size="14" font-weight="700" fill="#0f172a">📄 Review Format</text>
      <text x="44" y="319" font-size="12" fill="#64748b">Choose how reviews should be structured (pros &amp; cons, rating breakdown).</text>
      <text x="670" y="309" font-size="14" fill="#94a3b8">›</text>
    </g>

    <!-- CARD 4: 4. Review Generation Summary -->
    <g class="shadow-box" transform="translate(752, 365)">
      <rect width="720" height="355" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <circle cx="36" cy="36" r="16" fill="#f1f5f9"/>
      <text x="36" y="41" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">📊</text>
      <text x="66" y="36" font-size="18" font-weight="800" fill="#0f172a">4. Review Generation Summary</text>
      <text x="66" y="54" font-size="12" fill="#64748b">Verify product details and generation settings before creating reviews.</text>

      <!-- 2x3 Summary Stat Grid -->
      <g transform="translate(24, 75)">
        <!-- Stat 1 -->
        <rect x="0" y="0" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="20" y="26" font-size="11" font-weight="700" fill="#64748b">PRODUCT</text>
        <text x="20" y="46" font-size="14" font-weight="800" fill="#0f172a">Luminous Kit</text>

        <!-- Stat 2 -->
        <rect x="348" y="0" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="368" y="26" font-size="11" font-weight="700" fill="#64748b">LANGUAGE</text>
        <text x="368" y="46" font-size="14" font-weight="800" fill="#0f172a">English (US)</text>

        <!-- Stat 3 -->
        <rect x="0" y="72" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="20" y="98" font-size="11" font-weight="700" fill="#64748b">TONE</text>
        <text x="20" y="118" font-size="14" font-weight="800" fill="#0f172a">Friendly &amp; Relatable</text>

        <!-- Stat 4 -->
        <rect x="348" y="72" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="368" y="98" font-size="11" font-weight="700" fill="#64748b">KEY FEATURES</text>
        <text x="368" y="118" font-size="14" font-weight="800" fill="#0f172a">Battery, Unboxing</text>

        <!-- Stat 5 -->
        <rect x="0" y="144" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="20" y="170" font-size="11" font-weight="700" fill="#64748b">COUNT</text>
        <text x="20" y="190" font-size="14" font-weight="800" fill="#0f172a">5 Reviews</text>

        <!-- Stat 6 -->
        <rect x="348" y="144" width="324" height="60" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="368" y="170" font-size="11" font-weight="700" fill="#64748b">AI ENGINE</text>
        <text x="368" y="190" font-size="14" font-weight="800" fill="#2563eb">Claude 3.5 + Gemini</text>
      </g>

      <!-- Action Button -->
      <rect x="24" y="280" width="672" height="50" rx="8" fill="#0f172a"/>
      <text x="360" y="312" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle">
        ✨ Generate 5 Authentic Reviews
      </text>
    </g>

  </g>

  <!-- Bottom Helper Note -->
  <g class="font-sans" transform="translate(64, 840)">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#64748b" stroke-width="1.5"/>
    <text x="10" y="14" font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">i</text>
    <text x="28" y="14" font-size="13" fill="#64748b">
      All generated reviews are saved directly into your Shopify admin review inbox with full editing, moderation, and approval controls.
    </text>
  </g>
</svg>
`;

// 4. Feature Image 4: Manual Reviews & Moderation Hub
const svg4 = `
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .shadow-card { filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.08)); }
      .shadow-box { filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.04)); }
    </style>
  </defs>

  <rect width="1600" height="900" fill="#f8fafc"/>

  <!-- Top Bar: Header -->
  <g class="font-sans" transform="translate(64, 42)">
    <text x="0" y="28" font-size="28" font-weight="800" fill="#0f172a">Manual Review Submission &amp; Moderation</text>
    
    <rect x="520" y="6" width="160" height="30" rx="15" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
    <circle cx="536" cy="21" r="4" fill="#2563eb"/>
    <text x="548" y="26" font-size="13" font-weight="600" fill="#1d4ed8">Manual Review Tab</text>

    <rect x="690" y="6" width="170" height="30" rx="15" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
    <circle cx="708" cy="21" r="4" fill="#10b981"/>
    <text x="720" y="26" font-size="13" font-weight="600" fill="#065f46">Verified Order Match</text>

    <!-- View Mode Switcher -->
    <rect x="1330" y="4" width="105" height="34" rx="8" fill="#0f172a"/>
    <text x="1362" y="26" font-size="14" font-weight="700" fill="#ffffff">Step Flow</text>
    
    <rect x="1445" y="4" width="95" height="34" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="1476" y="26" font-size="14" font-weight="600" fill="#64748b">History</text>
  </g>

  <!-- 2x2 Grid Layout for 4 Steps -->
  <g class="font-sans" transform="translate(64, 96)">
    
    <!-- Step 1: Order Details -->
    <g class="shadow-box" transform="translate(0, 0)">
      <rect width="720" height="345" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <text x="24" y="38" font-size="18" font-weight="800" fill="#0f172a">Step 1: Order Details</text>
      <line x1="24" y1="46" x2="185" y2="46" stroke="#0f172a" stroke-width="2"/>
      
      <!-- Order match badge -->
      <rect x="520" y="20" width="175" height="26" rx="13" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
      <text x="532" y="37" font-size="12" font-weight="700" fill="#059669">✓ Order matched: #1042</text>

      <!-- Product Select -->
      <text x="24" y="85" font-size="13" font-weight="600" fill="#334155">Product</text>
      <rect x="24" y="98" width="672" height="42" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="40" y="124" font-size="14" font-weight="600" fill="#0f172a">Luminous Kit</text>
      <text x="670" y="124" font-size="13" fill="#94a3b8">⌄</text>

      <!-- Order number + Rating grid -->
      <g transform="translate(24, 165)">
        <!-- Order Number -->
        <text x="0" y="0" font-size="13" font-weight="600" fill="#334155">Order number</text>
        <rect x="0" y="12" width="310" height="42" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="16" y="38" font-size="14" font-weight="600" fill="#0f172a">#1042</text>

        <!-- Rating -->
        <text x="340" y="0" font-size="13" font-weight="600" fill="#334155">Rating</text>
        <rect x="340" y="12" width="332" height="42" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
        <text x="360" y="39" font-size="20" fill="#f59e0b" letter-spacing="4">★★★★★</text>
      </g>

      <!-- Help hint -->
      <rect x="24" y="250" width="672" height="65" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="40" y="278" font-size="12" font-weight="700" fill="#475569">💡 Automatic Customer Verification</text>
      <text x="40" y="298" font-size="12" fill="#64748b">Order number will verify customer email against Shopify Orders to award the Verified Badge.</text>
    </g>

    <!-- Step 2: Customer & Source -->
    <g class="shadow-box" transform="translate(752, 0)">
      <rect width="720" height="345" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <text x="24" y="38" font-size="18" font-weight="800" fill="#0f172a">Step 2: Customer &amp; Source</text>
      <line x1="24" y1="46" x2="225" y2="46" stroke="#0f172a" stroke-width="2"/>

      <!-- Customer Name -->
      <text x="24" y="85" font-size="13" font-weight="600" fill="#334155">Customer name</text>
      <rect x="24" y="98" width="672" height="42" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="40" y="124" font-size="14" font-weight="600" fill="#0f172a">Rachel V.</text>

      <!-- Source of Feedback -->
      <text x="24" y="175" font-size="13" font-weight="600" fill="#334155">Source of feedback</text>
      <g transform="translate(24, 188)">
        <!-- WhatsApp -->
        <rect x="0" y="0" width="115" height="38" rx="19" fill="#0f172a"/>
        <text x="57" y="24" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">WhatsApp</text>

        <!-- Email -->
        <rect x="130" y="0" width="95" height="38" rx="19" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="177" y="24" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">Email</text>

        <!-- Phone -->
        <rect x="240" y="0" width="95" height="38" rx="19" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="287" y="24" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">Phone</text>

        <!-- DM / Social -->
        <rect x="350" y="0" width="115" height="38" rx="19" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="407" y="24" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">Instagram DM</text>
      </g>

      <rect x="24" y="250" width="672" height="65" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="40" y="278" font-size="12" font-weight="700" fill="#475569">Omnichannel Feedback Integration</text>
      <text x="40" y="298" font-size="12" fill="#64748b">Store reviews captured over chat, email support tickets, and post-purchase surveys.</text>
    </g>

    <!-- Step 3: Review & Media -->
    <g class="shadow-box" transform="translate(0, 365)">
      <rect width="720" height="355" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <text x="24" y="38" font-size="18" font-weight="800" fill="#0f172a">Step 3: Review &amp; Media</text>
      <line x1="24" y1="46" x2="200" y2="46" stroke="#0f172a" stroke-width="2"/>

      <!-- Textarea -->
      <text x="24" y="75" font-size="13" font-weight="600" fill="#334155">Review text (customer's own words)</text>
      <rect x="24" y="88" width="672" height="110" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <text x="40" y="115" font-size="13" fill="#0f172a">"The Luminous kit exceeded my expectations. Beautiful packaging, quick delivery,</text>
      <text x="40" y="135" font-size="13" fill="#0f172a">and the glow lasts all day long. Customer support on WhatsApp was super helpful!"</text>

      <!-- Media Upload Box (Dashed) -->
      <rect x="24" y="215" width="672" height="110" rx="8" fill="#fafafa" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 6"/>
      <text x="360" y="260" font-size="24" text-anchor="middle">📷</text>
      <text x="360" y="285" font-size="13" font-weight="600" fill="#475569" text-anchor="middle">
        Add customer photo or video (with their permission)
      </text>
      <text x="360" y="305" font-size="11" fill="#94a3b8" text-anchor="middle">PNG, JPG, MP4 up to 25MB</text>
    </g>

    <!-- Step 4: Verification & Actions -->
    <g class="shadow-box" transform="translate(752, 365)">
      <rect width="720" height="355" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <text x="24" y="38" font-size="18" font-weight="800" fill="#0f172a">Step 4: Verification &amp; Actions</text>
      <line x1="24" y1="46" x2="245" y2="46" stroke="#0f172a" stroke-width="2"/>

      <!-- Toggle 1: Verified badge -->
      <g transform="translate(24, 85)">
        <text x="0" y="20" font-size="14" font-weight="600" fill="#0f172a">Verified badge (auto, order matched)</text>
        <!-- Toggle switch ON -->
        <rect x="620" y="2" width="48" height="26" rx="13" fill="#0f172a"/>
        <circle cx="654" cy="15" r="10" fill="#ffffff"/>
      </g>

      <line x1="24" y1="135" x2="696" y2="135" stroke="#f1f5f9" stroke-width="1"/>

      <!-- Toggle 2: Confirm permission -->
      <g transform="translate(24, 155)">
        <text x="0" y="20" font-size="14" font-weight="600" fill="#0f172a">I confirm the customer wrote this review</text>
        <!-- Toggle switch ON -->
        <rect x="620" y="2" width="48" height="26" rx="13" fill="#0f172a"/>
        <circle cx="654" cy="15" r="10" fill="#ffffff"/>
      </g>

      <line x1="24" y1="205" x2="696" y2="205" stroke="#f1f5f9" stroke-width="1"/>

      <!-- Compliance Info Note -->
      <text x="24" y="235" font-size="12" fill="#64748b">
        Compliant with FTC testimonial guidelines &amp; Shopify Merchant Standards.
      </text>

      <!-- Action Buttons Row -->
      <g transform="translate(24, 270)">
        <rect x="0" y="0" width="190" height="46" rx="8" fill="#0f172a"/>
        <text x="95" y="28" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">Save for approval</text>

        <rect x="205" y="0" width="110" height="46" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
        <text x="260" y="28" font-size="14" font-weight="600" fill="#475569" text-anchor="middle">Cancel</text>
      </g>
    </g>

  </g>

  <!-- Bottom Helper Note -->
  <g class="font-sans" transform="translate(64, 840)">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#64748b" stroke-width="1.5"/>
    <text x="10" y="14" font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">i</text>
    <text x="28" y="14" font-size="13" fill="#64748b">
      All manually entered reviews are marked with the authentic source and can be reviewed before publishing to your live theme.
    </text>
  </g>
</svg>
`;

async function renderAll() {
  console.log("Rendering Feature 1...");
  await sharp(Buffer.from(svg1))
    .png()
    .toFile(path.join(outputDir, "01_live_storefront_social_proof.png"));

  console.log("Rendering Feature 2...");
  await sharp(Buffer.from(svg2))
    .png()
    .toFile(path.join(outputDir, "02_widget_placement_and_controls.png"));

  console.log("Rendering Feature 3...");
  await sharp(Buffer.from(svg3))
    .png()
    .toFile(path.join(outputDir, "03_ai_review_generator_dashboard.png"));

  console.log("Rendering Feature 4...");
  await sharp(Buffer.from(svg4))
    .png()
    .toFile(path.join(outputDir, "04_manual_reviews_and_moderation.png"));

  console.log("All 4 Feature Images generated successfully in 1600x900 resolution!");
}

renderAll().catch(err => {
  console.error("Rendering failed:", err);
  process.exit(1);
});
