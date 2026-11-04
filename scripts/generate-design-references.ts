import sharp from "sharp";
import fs from "fs";
import path from "path";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

// -------------------------------------------------------------
// DESIGN REFERENCE 1: Modern Clean E-Commerce Layout (Cards & Grid)
// -------------------------------------------------------------
const svgRef1 = `
<svg width="1400" height="1350" viewBox="0 0 1400 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap');
      * { font-family: 'Manrope', -apple-system, sans-serif; }
      .shadow-main { filter: drop-shadow(0 14px 34px rgba(6, 78, 59, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 18px 40px rgba(6, 78, 59, 0.18)); }
      .shadow-card { filter: drop-shadow(0 4px 16px rgba(6, 78, 59, 0.04)); }
    </style>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f4f8f5"/>
      <stop offset="100%" stop-color="#eaf4ee"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>

  <!-- Background Canvas -->
  <rect width="1400" height="1350" fill="url(#bgGrad)"/>

  <!-- Top Title Banner -->
  <g transform="translate(80, 45)">
    <rect x="0" y="0" width="190" height="28" rx="14" fill="#e8f7ee" stroke="#a7f3d0" stroke-width="1"/>
    <text x="14" y="19" font-size="12" font-weight="800" fill="#065f46" letter-spacing="1">REFERENCE OPTION 1</text>
    <text x="0" y="65" font-size="32" font-weight="850" fill="#064e3b" letter-spacing="-0.5">Modern Clean E-Commerce Layout</text>
    <text x="0" y="94" font-size="15" font-weight="500" fill="#4a6357">Structured review cards, 5-star distribution breakdown, buyer sentiment pills, and product-page-only social proof popup.</text>
  </g>

  <!-- Main Product Page Frame -->
  <g transform="translate(80, 165)" class="shadow-main">
    <!-- Window Outer -->
    <rect width="1240" height="1130" rx="22" fill="#ffffff" stroke="#d5e5db" stroke-width="1.5"/>

    <!-- Browser Bar -->
    <rect width="1240" height="52" rx="22" fill="#f8faf8"/>
    <rect y="32" width="1240" height="20" fill="#f8faf8"/>
    <line x1="0" y1="52" x2="1240" y2="52" stroke="#e1eee6" stroke-width="1"/>
    <!-- Window Dots -->
    <circle cx="28" cy="26" r="6" fill="#ef4444"/>
    <circle cx="48" cy="26" r="6" fill="#f59e0b"/>
    <circle cx="68" cy="26" r="6" fill="#10b981"/>
    <!-- URL Pill -->
    <rect x="96" y="11" width="480" height="30" rx="15" fill="#ffffff" stroke="#d5e5db" stroke-width="1"/>
    <circle cx="114" cy="26" r="4" fill="#059669"/>
    <text x="128" y="31" font-size="12" font-weight="600" fill="#2d4a3e">https://store.myshopify.com/products/minimalist-leather-backpack</text>
    <rect x="1080" y="12" width="136" height="28" rx="14" fill="#e8f7ee"/>
    <text x="1094" y="30" font-size="11.5" font-weight="700" fill="#065f46">● Product Page Active</text>

    <!-- Product Header Context -->
    <g transform="translate(40, 75)">
      <!-- Product Thumbnail -->
      <rect width="72" height="72" rx="12" fill="#f1f5f3" stroke="#e1eee6"/>
      <path d="M 22 48 L 34 32 L 44 42 L 52 30 L 62 48 Z" fill="#a7f3d0"/>
      <circle cx="34" cy="24" r="5" fill="#f59e0b"/>

      <text x="92" y="28" font-size="20" font-weight="800" fill="#0a281e">The Minimalist Everyday Leather Backpack</text>
      <text x="92" y="52" font-size="14" font-weight="700" fill="#065f46">★★★★★  4.9</text>
      <text x="180" y="52" font-size="13" font-weight="500" fill="#64748b">(1,248 verified customer reviews)  •  $195.00  •  In Stock</text>

      <!-- Write Review Button -->
      <rect x="1000" y="12" width="160" height="44" rx="22" fill="#064e3b"/>
      <text x="1035" y="39" font-size="14" font-weight="750" fill="#ffffff">✍ Write a Review</text>
    </g>

    <line x1="40" y1="170" x2="1200" y2="170" stroke="#eef4f0" stroke-width="1.5"/>

    <!-- Review Summary Card (Split 3 Columns) -->
    <g transform="translate(40, 195)">
      <rect width="1160" height="155" rx="16" fill="#fbfdfc" stroke="#e1eee6" stroke-width="1"/>

      <!-- Col 1: Big Score -->
      <g transform="translate(32, 26)">
        <text x="0" y="52" font-size="56" font-weight="900" fill="#0a281e">4.9</text>
        <text x="0" y="82" font-size="20" font-weight="700" fill="#f59e0b">★★★★★</text>
        <text x="0" y="104" font-size="12.5" font-weight="500" fill="#556d62">Based on 1,248 ratings</text>
        <rect x="0" y="112" width="180" height="22" rx="6" fill="#e8f7ee"/>
        <text x="10" y="127" font-size="11" font-weight="750" fill="#065f46">✓ 98% Recommend this product</text>
      </g>

      <line x1="280" y1="20" x2="280" y2="135" stroke="#eef4f0" stroke-width="1"/>

      <!-- Col 2: Star Bars -->
      <g transform="translate(310, 24)">
        <!-- 5 Star -->
        <text x="0" y="18" font-size="12" font-weight="700" fill="#4a6357">5 Star</text>
        <rect x="48" y="8" width="220" height="10" rx="5" fill="#eaf1ec"/>
        <rect x="48" y="8" width="195" height="10" rx="5" fill="#f59e0b"/>
        <text x="280" y="18" font-size="12" font-weight="600" fill="#556d62">88% (1,098)</text>

        <!-- 4 Star -->
        <text x="0" y="42" font-size="12" font-weight="700" fill="#4a6357">4 Star</text>
        <rect x="48" y="32" width="220" height="10" rx="5" fill="#eaf1ec"/>
        <rect x="48" y="32" width="22" height="10" rx="5" fill="#f59e0b"/>
        <text x="280" y="42" font-size="12" font-weight="600" fill="#556d62">9% (112)</text>

        <!-- 3 Star -->
        <text x="0" y="66" font-size="12" font-weight="700" fill="#4a6357">3 Star</text>
        <rect x="48" y="56" width="220" height="10" rx="5" fill="#eaf1ec"/>
        <rect x="48" y="56" width="6" height="10" rx="5" fill="#f59e0b"/>
        <text x="280" y="66" font-size="12" font-weight="600" fill="#556d62">2% (25)</text>

        <!-- 2 Star -->
        <text x="0" y="90" font-size="12" font-weight="700" fill="#4a6357">2 Star</text>
        <rect x="48" y="80" width="220" height="10" rx="5" fill="#eaf1ec"/>
        <rect x="48" y="80" width="3" height="10" rx="5" fill="#f59e0b"/>
        <text x="280" y="90" font-size="12" font-weight="600" fill="#556d62">0.6% (8)</text>

        <!-- 1 Star -->
        <text x="0" y="114" font-size="12" font-weight="700" fill="#4a6357">1 Star</text>
        <rect x="48" y="104" width="220" height="10" rx="5" fill="#eaf1ec"/>
        <rect x="48" y="104" width="2" height="10" rx="5" fill="#f59e0b"/>
        <text x="280" y="114" font-size="12" font-weight="600" fill="#556d62">0.4% (5)</text>
      </g>

      <line x1="690" y1="20" x2="690" y2="135" stroke="#eef4f0" stroke-width="1"/>

      <!-- Col 3: Customer Mentions -->
      <g transform="translate(720, 24)">
        <text x="0" y="18" font-size="12" font-weight="800" fill="#0a281e" letter-spacing="0.5">MOST MENTIONED BY BUYERS</text>
        <g transform="translate(0, 32)">
          <rect x="0" y="0" width="165" height="26" rx="13" fill="#ffffff" stroke="#d5e5db"/>
          <text x="12" y="17" font-size="11.5" font-weight="600" fill="#2d4a3e">✨ Laptop Protection (512)</text>
          <rect x="175" y="0" width="160" height="26" rx="13" fill="#ffffff" stroke="#d5e5db"/>
          <text x="187" y="17" font-size="11.5" font-weight="600" fill="#2d4a3e">📦 2-Day Delivery (390)</text>

          <rect x="0" y="34" width="150" height="26" rx="13" fill="#ffffff" stroke="#d5e5db"/>
          <text x="12" y="51" font-size="11.5" font-weight="600" fill="#2d4a3e">🎒 Commute Friendly (310)</text>
          <rect x="160" y="34" width="140" height="26" rx="13" fill="#ffffff" stroke="#d5e5db"/>
          <text x="172" y="51" font-size="11.5" font-weight="600" fill="#2d4a3e">💎 Premium Feel (245)</text>
        </g>
      </g>
    </g>

    <!-- Filter Buttons Bar -->
    <g transform="translate(40, 375)">
      <rect x="0" y="0" width="125" height="34" rx="17" fill="#064e3b"/>
      <text x="18" y="22" font-size="12.5" font-weight="700" fill="#ffffff">All Reviews (1,248)</text>

      <rect x="135" y="0" width="135" height="34" rx="17" fill="#ffffff" stroke="#d5e5db"/>
      <text x="150" y="22" font-size="12.5" font-weight="600" fill="#4a6357">📷 With Photos (412)</text>

      <rect x="280" y="0" width="120" height="34" rx="17" fill="#ffffff" stroke="#d5e5db"/>
      <text x="295" y="22" font-size="12.5" font-weight="600" fill="#4a6357">★ 5 Stars (1,098)</text>

      <rect x="410" y="0" width="145" height="34" rx="17" fill="#ffffff" stroke="#d5e5db"/>
      <text x="424" y="22" font-size="12.5" font-weight="600" fill="#4a6357">✓ Verified Only (1,190)</text>

      <text x="1020" y="22" font-size="13" font-weight="600" fill="#556d62">Sort: Most Recent ▾</text>
    </g>

    <!-- 2 Review Cards in 2 Columns -->
    <g transform="translate(40, 430)">
      <!-- Card 1 -->
      <g class="shadow-card">
        <rect width="565" height="380" rx="18" fill="#ffffff" stroke="#e1eee6" stroke-width="1"/>
        <!-- Reviewer Info -->
        <g transform="translate(24, 24)">
          <circle cx="20" cy="20" r="20" fill="#d1fae5"/>
          <text x="14" y="25" font-size="14" font-weight="800" fill="#065f46">JM</text>
          <text x="52" y="18" font-size="15" font-weight="800" fill="#0a281e">Jessica Miller</text>
          <rect x="52" y="24" width="105" height="18" rx="4" fill="#e8f7ee"/>
          <text x="58" y="37" font-size="10.5" font-weight="750" fill="#059669">✓ Verified Purchase</text>
          <text x="460" y="18" font-size="12" font-weight="500" fill="#94a3b8">2 days ago</text>
        </g>

        <!-- Stars & Title -->
        <g transform="translate(24, 88)">
          <text x="0" y="0" font-size="14" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="0" y="26" font-size="15.5" font-weight="800" fill="#0a281e">Exceeded all my commute expectations!</text>
          <text x="0" y="52" font-size="13" font-weight="500" fill="#4a6357" width="510">
            The dedicated laptop sleeve fits my 15.6" MacBook safely with thick padding.
          </text>
          <text x="0" y="72" font-size="13" font-weight="500" fill="#4a6357">
            The leather texture is buttery soft yet weather resistant. Worth every dollar!
          </text>

          <!-- Photo Attachment Placeholder -->
          <g transform="translate(0, 92)">
            <rect width="70" height="70" rx="8" fill="#f1f5f3" stroke="#d5e5db"/>
            <text x="14" y="42" font-size="11" font-weight="700" fill="#059669">Photo 1</text>
            <rect x="80" y="0" width="70" height="70" rx="8" fill="#f1f5f3" stroke="#d5e5db"/>
            <text x="94" y="42" font-size="11" font-weight="700" fill="#059669">Photo 2</text>
          </g>

          <!-- Merchant Reply -->
          <g transform="translate(0, 180)">
            <rect width="515" height="48" rx="8" fill="#f4f8f5" stroke="#d5e5db"/>
            <line x1="0" y1="0" x2="0" y2="48" stroke="#059669" stroke-width="4"/>
            <text x="14" y="18" font-size="11.5" font-weight="800" fill="#064e3b">Response from Merchant:</text>
            <text x="14" y="36" font-size="11.5" font-weight="500" fill="#2d4a3e">Thank you Jessica! So glad the padded sleeve keeps your MacBook protected.</text>
          </g>
        </g>

        <!-- Footer -->
        <g transform="translate(24, 345)">
          <text x="0" y="16" font-size="12" font-weight="600" fill="#64748b">Color: Obsidian Black • Size: 24L</text>
          <text x="440" y="16" font-size="12" font-weight="700" fill="#065f46">👍 Helpful (48)</text>
        </g>
      </g>

      <!-- Card 2 -->
      <g transform="translate(595, 0)" class="shadow-card">
        <rect width="565" height="380" rx="18" fill="#ffffff" stroke="#e1eee6" stroke-width="1"/>
        <!-- Reviewer Info -->
        <g transform="translate(24, 24)">
          <circle cx="20" cy="20" r="20" fill="#ecfdf5"/>
          <text x="14" y="25" font-size="14" font-weight="800" fill="#059669">DS</text>
          <text x="52" y="18" font-size="15" font-weight="800" fill="#0a281e">David Sterling</text>
          <rect x="52" y="24" width="105" height="18" rx="4" fill="#e8f7ee"/>
          <text x="58" y="37" font-size="10.5" font-weight="750" fill="#059669">✓ Verified Purchase</text>
          <text x="460" y="18" font-size="12" font-weight="500" fill="#94a3b8">4 days ago</text>
        </g>

        <!-- Stars & Title -->
        <g transform="translate(24, 88)">
          <text x="0" y="0" font-size="14" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="0" y="26" font-size="15.5" font-weight="800" fill="#0a281e">Impeccable craftsmanship and sleek aesthetics</text>
          <text x="0" y="52" font-size="13" font-weight="500" fill="#4a6357">
            The Japanese YKK zippers glide smoothly and the stitching is laser accurate.
          </text>
          <text x="0" y="72" font-size="13" font-weight="500" fill="#4a6357">
            Traveled across three countries this week and it still looks brand new.
          </text>

          <!-- Photo Attachment Placeholder -->
          <g transform="translate(0, 92)">
            <rect width="70" height="70" rx="8" fill="#f1f5f3" stroke="#d5e5db"/>
            <text x="14" y="42" font-size="11" font-weight="700" fill="#059669">Photo 1</text>
          </g>

          <!-- Merchant Reply -->
          <g transform="translate(0, 180)">
            <rect width="515" height="48" rx="8" fill="#f4f8f5" stroke="#d5e5db"/>
            <line x1="0" y1="0" x2="0" y2="48" stroke="#059669" stroke-width="4"/>
            <text x="14" y="18" font-size="11.5" font-weight="800" fill="#064e3b">Response from Merchant:</text>
            <text x="14" y="36" font-size="11.5" font-weight="500" fill="#2d4a3e">Safe travels David! We engineered our zippers to withstand hundreds of flights.</text>
          </g>
        </g>

        <!-- Footer -->
        <g transform="translate(24, 345)">
          <text x="0" y="16" font-size="12" font-weight="600" fill="#64748b">Color: Vintage Cognac • Size: 24L</text>
          <text x="440" y="16" font-size="12" font-weight="700" fill="#065f46">👍 Helpful (32)</text>
        </g>
      </g>
    </g>

    <!-- Load More -->
    <g transform="translate(500, 840)">
      <rect width="240" height="42" rx="21" fill="#ffffff" stroke="#059669" stroke-width="1.5"/>
      <text x="44" y="26" font-size="13" font-weight="750" fill="#064e3b">Load More Reviews (1,246) ↓</text>
    </g>

    <!-- ======================================================== -->
    <!-- PRODUCT PAGE ONLY: FLOATING REVIEW POPUP NOTIFICATION    -->
    <!-- ======================================================== -->
    <g transform="translate(48, 890)" class="shadow-popup">
      <!-- Popup Card Background -->
      <rect width="440" height="150" rx="16" fill="#ffffff" stroke="#a7f3d0" stroke-width="1.5"/>

      <!-- Tag Indicator: Product Page Only -->
      <g transform="translate(18, 14)">
        <circle cx="5" cy="5" r="4" fill="#10b981"/>
        <text x="16" y="9" font-size="10.5" font-weight="800" fill="#065f46" letter-spacing="0.5">PRODUCT PAGE EXCLUSIVE POPUP</text>
        <rect x="270" y="-3" width="130" height="18" rx="9" fill="#f0fdf4"/>
        <text x="280" y="10" font-size="9.5" font-weight="700" fill="#059669">Active on /products/*</text>
      </g>

      <line x1="18" y1="36" x2="422" y2="36" stroke="#f1f5f3" stroke-width="1"/>

      <!-- Content -->
      <g transform="translate(18, 50)">
        <!-- Product Thumbnail -->
        <rect width="52" height="52" rx="10" fill="#ecfdf5" stroke="#d5e5db"/>
        <path d="M 16 36 L 24 24 L 32 32 L 38 22 L 46 36 Z" fill="#6ee7b7"/>

        <g transform="translate(64, 4)">
          <text x="0" y="14" font-size="13" font-weight="800" fill="#0a281e">Sarah L. from Austin, TX</text>
          <text x="0" y="30" font-size="11.5" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="500" fill="#059669">Verified Buyer</tspan></text>
          <text x="0" y="48" font-size="12" font-weight="600" fill="#4a6357">"Literally obsessed with the color and quality!"</text>
          <text x="0" y="66" font-size="10.5" font-weight="500" fill="#94a3b8">Purchased this bag 12m ago • Verified by AI System</text>
        </g>
      </g>
    </g>

    <!-- Callout Annotation on the Popup -->
    <g transform="translate(520, 940)">
      <path d="M 0 35 L -20 35" stroke="#059669" stroke-width="2" stroke-dasharray="4,4"/>
      <circle cx="-20" cy="35" r="4" fill="#059669"/>
      <rect x="0" y="0" width="340" height="70" rx="10" fill="#e8f7ee" stroke="#a7f3d0"/>
      <text x="14" y="24" font-size="12" font-weight="800" fill="#064e3b">⚡ Product-Page-Only Trigger Logic</text>
      <text x="14" y="44" font-size="11" font-weight="500" fill="#2d4a3e">Popup appears specifically on product pages, highlighting</text>
      <text x="14" y="58" font-size="11" font-weight="500" fill="#2d4a3e">real buyer reviews for that exact active product.</text>
    </g>
  </g>
</svg>
`;

// -------------------------------------------------------------
// DESIGN REFERENCE 2: Media-Rich & Community Editorial Layout
// -------------------------------------------------------------
const svgRef2 = `
<svg width="1400" height="1350" viewBox="0 0 1400 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap');
      * { font-family: 'Manrope', -apple-system, sans-serif; }
      .shadow-main { filter: drop-shadow(0 14px 34px rgba(6, 78, 59, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 18px 40px rgba(6, 78, 59, 0.18)); }
      .shadow-card { filter: drop-shadow(0 4px 16px rgba(6, 78, 59, 0.04)); }
    </style>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fdfbf9"/>
      <stop offset="100%" stop-color="#f4f7f5"/>
    </linearGradient>
  </defs>

  <!-- Background Canvas -->
  <rect width="1400" height="1350" fill="url(#bgGrad2)"/>

  <!-- Top Title Banner -->
  <g transform="translate(80, 45)">
    <rect x="0" y="0" width="190" height="28" rx="14" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
    <text x="14" y="19" font-size="12" font-weight="800" fill="#047857" letter-spacing="1">REFERENCE OPTION 2</text>
    <text x="0" y="65" font-size="32" font-weight="850" fill="#064e3b" letter-spacing="-0.5">Media-Rich &amp; Fit-Gauge Layout</text>
    <text x="0" y="94" font-size="15" font-weight="500" fill="#4a6357">Features customer photo strip gallery, sizing/comfort attribute meters, timeline reviews, and floating pill toast.</text>
  </g>

  <!-- Main Product Page Frame -->
  <g transform="translate(80, 165)" class="shadow-main">
    <!-- Window Outer -->
    <rect width="1240" height="1130" rx="22" fill="#ffffff" stroke="#d5e5db" stroke-width="1.5"/>

    <!-- Browser Bar -->
    <rect width="1240" height="52" rx="22" fill="#f8faf8"/>
    <rect y="32" width="1240" height="20" fill="#f8faf8"/>
    <line x1="0" y1="52" x2="1240" y2="52" stroke="#e1eee6" stroke-width="1"/>
    <!-- Window Dots -->
    <circle cx="28" cy="26" r="6" fill="#ef4444"/>
    <circle cx="48" cy="26" r="6" fill="#f59e0b"/>
    <circle cx="68" cy="26" r="6" fill="#10b981"/>
    <!-- URL Pill -->
    <rect x="96" y="11" width="460" height="30" rx="15" fill="#ffffff" stroke="#d5e5db" stroke-width="1"/>
    <circle cx="114" cy="26" r="4" fill="#059669"/>
    <text x="128" y="31" font-size="12" font-weight="600" fill="#2d4a3e">https://store.myshopify.com/products/cloud-merino-wool-runner</text>
    <rect x="1080" y="12" width="136" height="28" rx="14" fill="#e8f7ee"/>
    <text x="1094" y="30" font-size="11.5" font-weight="700" fill="#065f46">● Product Page Active</text>

    <!-- Product Header Context -->
    <g transform="translate(40, 75)">
      <!-- Sneaker Thumbnail -->
      <rect width="72" height="72" rx="12" fill="#f8faf8" stroke="#e1eee6"/>
      <path d="M 18 52 C 28 50, 40 40, 56 42 C 60 48, 62 52, 62 54 L 18 54 Z" fill="#059669"/>
      <circle cx="34" cy="30" r="4" fill="#f59e0b"/>

      <text x="92" y="28" font-size="20" font-weight="800" fill="#0a281e">The Cloud-Knit Merino Wool Runner</text>
      <text x="92" y="52" font-size="14" font-weight="700" fill="#065f46">★★★★★  4.8</text>
      <text x="180" y="52" font-size="13" font-weight="500" fill="#64748b">(2,840 verified customer reviews)  •  $145.00  •  Free Shipping</text>

      <!-- Write Review Button -->
      <rect x="1000" y="12" width="160" height="44" rx="22" fill="#064e3b"/>
      <text x="1035" y="39" font-size="14" font-weight="750" fill="#ffffff">✍ Write a Review</text>
    </g>

    <line x1="40" y1="170" x2="1200" y2="170" stroke="#eef4f0" stroke-width="1.5"/>

    <!-- UGC Customer Photo & Video Strip -->
    <g transform="translate(40, 190)">
      <text x="0" y="16" font-size="14" font-weight="800" fill="#0a281e" letter-spacing="0.5">REAL CUSTOMER PHOTOS &amp; VIDEOS (482 UPLOADS)</text>

      <g transform="translate(0, 30)">
        <!-- Photo 1 -->
        <rect x="0" y="0" width="115" height="115" rx="12" fill="#e2e8f0" stroke="#cbd5e1"/>
        <text x="24" y="62" font-size="12" font-weight="700" fill="#475569">Photo 1</text>
        <rect x="8" y="8" width="40" height="18" rx="4" fill="rgba(0,0,0,0.6)"/>
        <text x="14" y="21" font-size="10" font-weight="700" fill="#ffffff">★ 5.0</text>

        <!-- Photo 2 -->
        <rect x="130" y="0" width="115" height="115" rx="12" fill="#d1fae5" stroke="#a7f3d0"/>
        <text x="154" y="62" font-size="12" font-weight="700" fill="#065f46">Photo 2</text>
        <rect x="138" y="8" width="40" height="18" rx="4" fill="rgba(0,0,0,0.6)"/>
        <text x="144" y="21" font-size="10" font-weight="700" fill="#ffffff">★ 5.0</text>

        <!-- Photo 3 -->
        <rect x="260" y="0" width="115" height="115" rx="12" fill="#fef3c7" stroke="#fde68a"/>
        <text x="284" y="62" font-size="12" font-weight="700" fill="#92400e">Photo 3</text>
        <rect x="268" y="8" width="40" height="18" rx="4" fill="rgba(0,0,0,0.6)"/>
        <text x="274" y="21" font-size="10" font-weight="700" fill="#ffffff">★ 5.0</text>

        <!-- Photo 4 -->
        <rect x="390" y="0" width="115" height="115" rx="12" fill="#ede9fe" stroke="#ddd6fe"/>
        <text x="414" y="62" font-size="12" font-weight="700" fill="#5b21b6">Photo 4</text>
        <rect x="398" y="8" width="40" height="18" rx="4" fill="rgba(0,0,0,0.6)"/>
        <text x="404" y="21" font-size="10" font-weight="700" fill="#ffffff">★ 5.0</text>

        <!-- View All Photos Tile -->
        <rect x="520" y="0" width="115" height="115" rx="12" fill="#f1f5f3" stroke="#059669" stroke-width="1.5" stroke-dasharray="4,4"/>
        <text x="542" y="55" font-size="13" font-weight="800" fill="#064e3b">+478</text>
        <text x="536" y="75" font-size="11" font-weight="600" fill="#059669">View All</text>
      </g>
    </g>

    <!-- Fit, Sizing & Comfort Breakdown Meters -->
    <g transform="translate(730, 205)">
      <rect width="470" height="145" rx="16" fill="#f8faf8" stroke="#e1eee6" stroke-width="1"/>
      <text x="20" y="26" font-size="12" font-weight="800" fill="#0a281e" letter-spacing="0.5">CUSTOMER SIZING &amp; FIT RATINGS</text>

      <!-- Meter 1: Sizing -->
      <g transform="translate(20, 40)">
        <text x="0" y="16" font-size="11.5" font-weight="700" fill="#4a6357">Size</text>
        <rect x="50" y="6" width="300" height="12" rx="6" fill="#e2e8f0"/>
        <rect x="180" y="4" width="40" height="16" rx="8" fill="#059669"/>
        <text x="365" y="16" font-size="11" font-weight="700" fill="#065f46">True to Size (94%)</text>
        <text x="50" y="28" font-size="9" fill="#94a3b8">Runs Small</text>
        <text x="185" y="28" font-size="9" fill="#059669" font-weight="700">Perfect</text>
        <text x="320" y="28" font-size="9" fill="#94a3b8">Runs Large</text>
      </g>

      <!-- Meter 2: Comfort -->
      <g transform="translate(20, 85)">
        <text x="0" y="16" font-size="11.5" font-weight="700" fill="#4a6357">Comfort</text>
        <rect x="50" y="6" width="300" height="12" rx="6" fill="#e2e8f0"/>
        <rect x="50" y="6" width="285" height="12" rx="6" fill="#10b981"/>
        <text x="365" y="16" font-size="11" font-weight="700" fill="#065f46">10/10 All-Day (96%)</text>
      </g>
    </g>

    <line x1="40" y1="380" x2="1200" y2="380" stroke="#eef4f0" stroke-width="1.5"/>

    <!-- Single Column Timeline Review Feed -->
    <g transform="translate(40, 405)">
      <!-- Review 1 -->
      <g>
        <rect width="1160" height="185" rx="16" fill="#ffffff" stroke="#e1eee6" stroke-width="1"/>
        <g transform="translate(28, 24)">
          <!-- Avatar + Name -->
          <circle cx="20" cy="20" r="20" fill="#ecfdf5"/>
          <text x="14" y="25" font-size="14" font-weight="800" fill="#059669">AR</text>
          <text x="54" y="18" font-size="16" font-weight="800" fill="#0a281e">Alex Rivera</text>
          <rect x="54" y="24" width="100" height="18" rx="4" fill="#e8f7ee"/>
          <text x="60" y="37" font-size="10.5" font-weight="750" fill="#059669">✓ Verified Buyer</text>

          <text x="260" y="20" font-size="12" font-weight="600" fill="#64748b">Usual Size: 10.5 • Fit: Spot On • Color: Haze Grey</text>
          <text x="1020" y="20" font-size="12" font-weight="500" fill="#94a3b8">3 days ago</text>

          <!-- Stars & Text -->
          <text x="0" y="70" font-size="14" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="75" y="70" font-size="15" font-weight="800" fill="#0a281e">Walked 22,000 steps across Tokyo on day 1 — zero blisters!</text>
          <text x="0" y="96" font-size="13" font-weight="500" fill="#4a6357">
            The merino wool upper breathes so well and adjusts to swelling feet. Didn't even need breaking in. Highly recommended!
          </text>

          <!-- Helpful Button -->
          <g transform="translate(0, 118)">
            <text x="0" y="14" font-size="12" font-weight="700" fill="#059669">👍 Was this review helpful? Yes (84) • No (1)</text>
          </g>
        </g>
      </g>

      <!-- Review 2 -->
      <g transform="translate(0, 205)">
        <rect width="1160" height="185" rx="16" fill="#ffffff" stroke="#e1eee6" stroke-width="1"/>
        <g transform="translate(28, 24)">
          <!-- Avatar + Name -->
          <circle cx="20" cy="20" r="20" fill="#fef3c7"/>
          <text x="14" y="25" font-size="14" font-weight="800" fill="#b45309">KC</text>
          <text x="54" y="18" font-size="16" font-weight="800" fill="#0a281e">Kelly Chen</text>
          <rect x="54" y="24" width="100" height="18" rx="4" fill="#e8f7ee"/>
          <text x="60" y="37" font-size="10.5" font-weight="750" fill="#059669">✓ Verified Buyer</text>

          <text x="260" y="20" font-size="12" font-weight="600" fill="#64748b">Usual Size: 8.0 • Fit: True to Size • Color: Forest Emerald</text>
          <text x="1020" y="20" font-size="12" font-weight="500" fill="#94a3b8">5 days ago</text>

          <!-- Stars & Text -->
          <text x="0" y="70" font-size="14" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="75" y="70" font-size="15" font-weight="800" fill="#0a281e">Looks chic with joggers or jeans and washable!</text>
          <text x="0" y="96" font-size="13" font-weight="500" fill="#4a6357">
            Threw them in the delicate cycle inside a wash bag and they came out pristine. The cushion in the arch support is fantastic.
          </text>

          <!-- Helpful Button -->
          <g transform="translate(0, 118)">
            <text x="0" y="14" font-size="12" font-weight="700" fill="#059669">👍 Was this review helpful? Yes (52) • No (0)</text>
          </g>
        </g>
      </g>
    </g>

    <!-- ======================================================== -->
    <!-- PRODUCT PAGE ONLY: FLOATING SLEEK PILL TOAST POPUP       -->
    <!-- ======================================================== -->
    <g transform="translate(48, 885)" class="shadow-popup">
      <rect width="460" height="155" rx="16" fill="#ffffff" stroke="#059669" stroke-width="1.8"/>

      <!-- Header Banner with Product Badge -->
      <path d="M 0 16 C 0 7.16 7.16 0 16 0 L 444 0 C 452.84 0 460 7.16 460 16 L 460 36 L 0 36 Z" fill="#064e3b"/>
      <circle cx="20" cy="18" r="4" fill="#34d399"/>
      <text x="32" y="22" font-size="11" font-weight="800" fill="#ffffff" letter-spacing="0.5">PRODUCT PAGE EXCLUSIVE SOCIAL PROOF</text>
      <text x="340" y="22" font-size="10" font-weight="700" fill="#a7f3d0">Page: /products/*</text>

      <!-- Content -->
      <g transform="translate(20, 52)">
        <!-- Sneaker Miniature -->
        <rect width="56" height="56" rx="10" fill="#f0fdf4" stroke="#a7f3d0"/>
        <path d="M 12 40 C 20 38, 30 30, 44 32 C 48 38, 50 40, 50 42 L 12 42 Z" fill="#059669"/>
        <circle cx="24" cy="22" r="3" fill="#f59e0b"/>

        <g transform="translate(70, 4)">
          <text x="0" y="14" font-size="13" font-weight="800" fill="#0a281e">Michael from Seattle just rated this item:</text>
          <text x="0" y="32" font-size="12" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="600" fill="#2d4a3e">"Game changer for daily walks!"</tspan></text>
          <text x="0" y="50" font-size="10.5" font-weight="500" fill="#64748b">Verified Purchase • 4 minutes ago • Size 11</text>
          <rect x="0" y="58" width="130" height="16" rx="4" fill="#e8f7ee"/>
          <text x="8" y="70" font-size="9.5" font-weight="750" fill="#065f46">✓ Verified Review System</text>
        </g>
      </g>
    </g>

    <!-- Callout Annotation on the Toast -->
    <g transform="translate(540, 940)">
      <path d="M 0 35 L -20 35" stroke="#059669" stroke-width="2" stroke-dasharray="4,4"/>
      <circle cx="-20" cy="35" r="4" fill="#059669"/>
      <rect x="0" y="0" width="340" height="70" rx="10" fill="#e8f7ee" stroke="#a7f3d0"/>
      <text x="14" y="24" font-size="12" font-weight="800" fill="#064e3b">⚡ Product-Targeted Toast Trigger</text>
      <text x="14" y="44" font-size="11" font-weight="500" fill="#2d4a3e">Configured to fire ONLY on single product detail pages.</text>
      <text x="14" y="58" font-size="11" font-weight="500" fill="#2d4a3e">Never triggers on collection, home, cart, or blog pages.</text>
    </g>
  </g>
</svg>
`;

async function main() {
  const out1 = path.join(artifactDir, "design_reference_1_clean_grid.png");
  const out2 = path.join(artifactDir, "design_reference_2_media_rich.png");

  console.log("Rendering SVG 1 to PNG...");
  await sharp(Buffer.from(svgRef1)).png({ quality: 95 }).toFile(out1);
  console.log("Saved: " + out1);

  console.log("Rendering SVG 2 to PNG...");
  await sharp(Buffer.from(svgRef2)).png({ quality: 95 }).toFile(out2);
  console.log("Saved: " + out2);
}

main().catch(console.error);

