import sharp from "sharp";
import fs from "fs";
import path from "path";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";

// =========================================================================
// REFERENCE 1: Floating Corner Social Proof Review Popup on Product Page
// Clean Shopify product page with the app's floating customer review popup
// =========================================================================
const svgPopupRef1 = `
<svg width="1400" height="950" viewBox="0 0 1400 950" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap');
      * { font-family: 'Manrope', -apple-system, sans-serif; }
      .shadow-frame { filter: drop-shadow(0 16px 36px rgba(6, 78, 59, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 20px 45px rgba(6, 78, 59, 0.22)); }
      .shadow-badge { filter: drop-shadow(0 4px 12px rgba(6, 78, 59, 0.06)); }
    </style>
    <linearGradient id="bgGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f2f7f4"/>
      <stop offset="100%" stop-color="#e7f1eb"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1400" height="950" fill="url(#bgGrad1)"/>

  <!-- Top Title -->
  <g transform="translate(80, 45)">
    <rect x="0" y="0" width="190" height="28" rx="14" fill="#e8f7ee" stroke="#a7f3d0" stroke-width="1"/>
    <text x="14" y="19" font-size="12" font-weight="800" fill="#065f46" letter-spacing="1">DESIGN REFERENCE 1</text>
    <text x="0" y="65" font-size="30" font-weight="850" fill="#064e3b" letter-spacing="-0.5">Corner Social Proof Popup on Product Page</text>
    <text x="0" y="92" font-size="15" font-weight="500" fill="#4a6357">Shows how the app's floating customer review popup appears on the live product page to drive conversions.</text>
  </g>

  <!-- Main Product Page Frame -->
  <g transform="translate(80, 155)" class="shadow-frame">
    <!-- Window Outer -->
    <rect width="1240" height="740" rx="20" fill="#ffffff" stroke="#d5e5db" stroke-width="1.5"/>

    <!-- Browser Bar -->
    <rect width="1240" height="50" rx="20" fill="#f8faf8"/>
    <rect y="30" width="1240" height="20" fill="#f8faf8"/>
    <line x1="0" y1="50" x2="1240" y2="50" stroke="#e1eee6" stroke-width="1"/>
    <circle cx="28" cy="25" r="6" fill="#ef4444"/>
    <circle cx="48" cy="25" r="6" fill="#f59e0b"/>
    <circle cx="68" cy="25" r="6" fill="#10b981"/>

    <!-- URL Pill -->
    <rect x="96" y="10" width="460" height="30" rx="15" fill="#ffffff" stroke="#d5e5db" stroke-width="1"/>
    <circle cx="114" cy="25" r="4" fill="#059669"/>
    <text x="128" y="30" font-size="12" font-weight="600" fill="#2d4a3e">https://store.myshopify.com/products/the-classic-leather-tote</text>

    <!-- Page Status Indicator -->
    <rect x="1060" y="11" width="156" height="28" rx="14" fill="#e8f7ee"/>
    <text x="1074" y="29" font-size="11.5" font-weight="750" fill="#065f46">● Single Product Page</text>

    <!-- Product Layout: Left Image Gallery, Right Product Details -->
    <g transform="translate(60, 80)">
      <!-- Left: Product Image Box -->
      <g>
        <rect width="460" height="420" rx="16" fill="#f8faf8" stroke="#e1eee6"/>
        <!-- Leather Tote Graphic -->
        <path d="M 170 190 C 170 130, 290 130, 290 190" stroke="#064e3b" stroke-width="10" fill="none" stroke-linecap="round"/>
        <path d="M 130 190 L 330 190 L 350 350 L 110 350 Z" fill="#059669" rx="12"/>
        <path d="M 150 200 L 310 200 L 320 330 L 140 330 Z" fill="#064e3b" opacity="0.15"/>
        <rect x="210" y="240" width="40" height="25" rx="5" fill="#f59e0b"/>

        <!-- Mini Thumbnails -->
        <g transform="translate(0, 440)">
          <rect x="0" y="0" width="80" height="80" rx="10" fill="#e8f7ee" stroke="#059669" stroke-width="2"/>
          <rect x="95" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
          <rect x="190" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
          <rect x="285" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
        </g>
      </g>

      <!-- Right: Product Purchase Details -->
      <g transform="translate(510, 20)">
        <text x="0" y="16" font-size="12" font-weight="800" fill="#059669" letter-spacing="1">BESTSELLER IN STORE</text>
        <text x="0" y="52" font-size="28" font-weight="850" fill="#0a281e">The Luxe Everyday Leather Tote</text>

        <!-- Star Rating Widget -->
        <g transform="translate(0, 72)">
          <text x="0" y="16" font-size="17" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="85" y="16" font-size="14" font-weight="800" fill="#0a281e">4.9</text>
          <text x="115" y="16" font-size="13" font-weight="600" fill="#64748b">(2,548 Reviews)</text>
          <rect x="235" y="0" width="125" height="22" rx="4" fill="#e8f7ee"/>
          <text x="245" y="15" font-size="11" font-weight="750" fill="#065f46">✓ Verified Reviews</text>
        </g>

        <!-- Price -->
        <g transform="translate(0, 120)">
          <text x="0" y="24" font-size="26" font-weight="900" fill="#064e3b">$185.00</text>
          <text x="105" y="22" font-size="16" font-weight="500" fill="#94a3b8" text-decoration="line-through">$240.00</text>
          <rect x="180" y="4" width="75" height="24" rx="4" fill="#fef2f2"/>
          <text x="190" y="20" font-size="11.5" font-weight="800" fill="#dc2626">SAVE 23%</text>
        </g>

        <!-- Color Options -->
        <g transform="translate(0, 180)">
          <text x="0" y="14" font-size="13" font-weight="700" fill="#4a6357">Color: Emerald Green</text>
          <circle cx="16" cy="38" r="14" fill="#064e3b" stroke="#059669" stroke-width="2.5"/>
          <circle cx="56" cy="38" r="14" fill="#1e293b"/>
          <circle cx="96" cy="38" r="14" fill="#92400e"/>
        </g>

        <!-- CTA Buttons -->
        <g transform="translate(0, 260)">
          <rect width="320" height="50" rx="25" fill="#064e3b"/>
          <text x="105" y="31" font-size="15" font-weight="800" fill="#ffffff">Add to Cart</text>

          <rect y="62" width="320" height="50" rx="25" fill="#059669"/>
          <text x="110" y="93" font-size="15" font-weight="800" fill="#ffffff">Buy It Now</text>
        </g>

        <!-- Trust Badges -->
        <g transform="translate(0, 400)">
          <text x="0" y="16" font-size="13" font-weight="700" fill="#065f46">✓ Free 2-Day Shipping  •  ✓ 30-Day Returns  •  ✓ 2-Year Warranty</text>
        </g>
      </g>
    </g>

    <!-- ======================================================== -->
    <!-- APP FEATURE: FLOATING PRODUCT REVIEW POPUP (BOTTOM LEFT) -->
    <!-- ======================================================== -->
    <g transform="translate(50, 480)" class="shadow-popup">
      <rect width="440" height="175" rx="18" fill="#ffffff" stroke="#a7f3d0" stroke-width="2"/>

      <!-- Top Header Pill -->
      <g transform="translate(18, 16)">
        <circle cx="6" cy="6" r="4" fill="#10b981"/>
        <text x="18" y="10" font-size="11" font-weight="800" fill="#065f46" letter-spacing="0.5">NEW PRODUCT REVIEW</text>
        <rect x="290" y="-2" width="115" height="20" rx="10" fill="#e8f7ee"/>
        <text x="298" y="12" font-size="10" font-weight="750" fill="#059669">Verified Purchase</text>
      </g>

      <line x1="18" y1="42" x2="422" y2="42" stroke="#f1f5f3" stroke-width="1.5"/>

      <!-- Content -->
      <g transform="translate(18, 56)">
        <!-- Product Thumbnail inside popup -->
        <rect width="64" height="64" rx="12" fill="#ecfdf5" stroke="#d5e5db"/>
        <path d="M 22 44 C 22 28, 42 28, 42 44" stroke="#064e3b" stroke-width="3" fill="none"/>
        <rect x="18" y="32" width="28" height="24" rx="3" fill="#059669"/>

        <!-- Reviewer Text -->
        <g transform="translate(76, 4)">
          <text x="0" y="14" font-size="14" font-weight="800" fill="#0a281e">Sarah Jenkins</text>
          <text x="0" y="32" font-size="13" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="65" y="32" font-size="11" font-weight="600" fill="#64748b">2 mins ago</text>

          <text x="0" y="52" font-size="12.5" font-weight="600" fill="#2d4a3e">"The craftsmanship is stunning! Fits my 15-inch laptop perfectly."</text>
          <text x="0" y="70" font-size="10.5" font-weight="600" fill="#059669">Verified buyer of The Luxe Everyday Leather Tote</text>
        </g>
      </g>
    </g>

    <!-- Annotation Arrow pointing to popup -->
    <g transform="translate(520, 540)">
      <line x1="0" y1="20" x2="-20" y2="20" stroke="#059669" stroke-width="2" stroke-dasharray="4,4"/>
      <circle cx="-20" cy="20" r="4" fill="#059669"/>
      <rect x="0" y="-10" width="310" height="60" rx="10" fill="#e8f7ee" stroke="#a7f3d0"/>
      <text x="14" y="14" font-size="12" font-weight="800" fill="#064e3b">App Feature: Live Review Popup</text>
      <text x="14" y="32" font-size="11" font-weight="500" fill="#2d4a3e">Triggers specifically on the product page,</text>
      <text x="14" y="46" font-size="11" font-weight="500" fill="#2d4a3e">showing social proof for the exact active product.</text>
    </g>
  </g>
</svg>
`;

// =========================================================================
// REFERENCE 2: Dynamic Toast Notification & Sticky Social Proof Bar
// Modern minimal product page with sleek floating toast
// =========================================================================
const svgPopupRef2 = `
<svg width="1400" height="950" viewBox="0 0 1400 950" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap');
      * { font-family: 'Manrope', -apple-system, sans-serif; }
      .shadow-frame { filter: drop-shadow(0 16px 36px rgba(6, 78, 59, 0.08)); }
      .shadow-popup { filter: drop-shadow(0 20px 45px rgba(6, 78, 59, 0.22)); }
    </style>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fdfbf9"/>
      <stop offset="100%" stop-color="#f2f7f4"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1400" height="950" fill="url(#bgGrad2)"/>

  <!-- Top Title -->
  <g transform="translate(80, 45)">
    <rect x="0" y="0" width="190" height="28" rx="14" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
    <text x="14" y="19" font-size="12" font-weight="800" fill="#047857" letter-spacing="1">DESIGN REFERENCE 2</text>
    <text x="0" y="65" font-size="30" font-weight="850" fill="#064e3b" letter-spacing="-0.5">Sleek Social Proof Toast on Product Page</text>
    <text x="0" y="92" font-size="15" font-weight="500" fill="#4a6357">Compact horizontal social proof notification toast with customer avatar, star rating, and direct product quote.</text>
  </g>

  <!-- Main Product Page Frame -->
  <g transform="translate(80, 155)" class="shadow-frame">
    <!-- Window Outer -->
    <rect width="1240" height="740" rx="20" fill="#ffffff" stroke="#d5e5db" stroke-width="1.5"/>

    <!-- Browser Bar -->
    <rect width="1240" height="50" rx="20" fill="#f8faf8"/>
    <rect y="30" width="1240" height="20" fill="#f8faf8"/>
    <line x1="0" y1="50" x2="1240" y2="50" stroke="#e1eee6" stroke-width="1"/>
    <circle cx="28" cy="25" r="6" fill="#ef4444"/>
    <circle cx="48" cy="25" r="6" fill="#f59e0b"/>
    <circle cx="68" cy="25" r="6" fill="#10b981"/>

    <!-- URL Pill -->
    <rect x="96" y="10" width="460" height="30" rx="15" fill="#ffffff" stroke="#d5e5db" stroke-width="1"/>
    <circle cx="114" cy="25" r="4" fill="#059669"/>
    <text x="128" y="30" font-size="12" font-weight="600" fill="#2d4a3e">https://store.myshopify.com/products/cloud-wool-runners</text>

    <!-- Page Status Indicator -->
    <rect x="1060" y="11" width="156" height="28" rx="14" fill="#e8f7ee"/>
    <text x="1074" y="29" font-size="11.5" font-weight="750" fill="#065f46">● Single Product Page</text>

    <!-- Product Layout: Left Image Gallery, Right Product Details -->
    <g transform="translate(60, 80)">
      <!-- Left: Sneaker Image Box -->
      <g>
        <rect width="460" height="420" rx="16" fill="#f8faf8" stroke="#e1eee6"/>
        <!-- Sneaker Graphic -->
        <path d="M 140 280 C 180 270, 260 210, 340 220 C 370 250, 380 280, 380 300 L 140 300 Z" fill="#059669"/>
        <path d="M 130 300 L 390 300 L 390 320 L 130 320 Z" fill="#ffffff" stroke="#064e3b" stroke-width="2"/>
        <circle cx="210" cy="240" r="5" fill="#f59e0b"/>

        <!-- Mini Thumbnails -->
        <g transform="translate(0, 440)">
          <rect x="0" y="0" width="80" height="80" rx="10" fill="#e8f7ee" stroke="#059669" stroke-width="2"/>
          <rect x="95" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
          <rect x="190" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
          <rect x="285" y="0" width="80" height="80" rx="10" fill="#f8faf8" stroke="#e1eee6"/>
        </g>
      </g>

      <!-- Right: Product Purchase Details -->
      <g transform="translate(510, 20)">
        <text x="0" y="16" font-size="12" font-weight="800" fill="#059669" letter-spacing="1">HOT ITEM — SELLING FAST</text>
        <text x="0" y="52" font-size="28" font-weight="850" fill="#0a281e">The Cloud-Knit Wool Runner</text>

        <!-- Star Rating Widget -->
        <g transform="translate(0, 72)">
          <text x="0" y="16" font-size="17" font-weight="700" fill="#f59e0b">★★★★★</text>
          <text x="85" y="16" font-size="14" font-weight="800" fill="#0a281e">4.8</text>
          <text x="115" y="16" font-size="13" font-weight="600" fill="#64748b">(3,890 Reviews)</text>
          <rect x="235" y="0" width="135" height="22" rx="4" fill="#e8f7ee"/>
          <text x="245" y="15" font-size="11" font-weight="750" fill="#065f46">✓ 99% Recommended</text>
        </g>

        <!-- Price -->
        <g transform="translate(0, 120)">
          <text x="0" y="24" font-size="26" font-weight="900" fill="#064e3b">$145.00</text>
          <text x="105" y="22" font-size="14" font-weight="600" fill="#059669">● In Stock (Ships today)</text>
        </g>

        <!-- Size Selector -->
        <g transform="translate(0, 180)">
          <text x="0" y="14" font-size="13" font-weight="700" fill="#4a6357">Select Size (US Men)</text>
          <rect x="0" y="28" width="50" height="36" rx="8" fill="#f8faf8" stroke="#d5e5db"/>
          <text x="16" y="51" font-size="13" font-weight="700" fill="#4a6357">9</text>
          <rect x="60" y="28" width="50" height="36" rx="8" fill="#064e3b"/>
          <text x="74" y="51" font-size="13" font-weight="700" fill="#ffffff">9.5</text>
          <rect x="120" y="28" width="50" height="36" rx="8" fill="#f8faf8" stroke="#d5e5db"/>
          <text x="134" y="51" font-size="13" font-weight="700" fill="#4a6357">10</text>
          <rect x="180" y="28" width="50" height="36" rx="8" fill="#f8faf8" stroke="#d5e5db"/>
          <text x="192" y="51" font-size="13" font-weight="700" fill="#4a6357">10.5</text>
        </g>

        <!-- CTA Buttons -->
        <g transform="translate(0, 270)">
          <rect width="320" height="50" rx="25" fill="#064e3b"/>
          <text x="105" y="31" font-size="15" font-weight="800" fill="#ffffff">Add to Cart</text>

          <rect y="62" width="320" height="50" rx="25" fill="#059669"/>
          <text x="110" y="93" font-size="15" font-weight="800" fill="#ffffff">Buy It Now</text>
        </g>
      </g>
    </g>

    <!-- ======================================================== -->
    <!-- APP FEATURE: SLEEK REVIEW TOAST POPUP (FLOATING BOTTOM)  -->
    <!-- ======================================================== -->
    <g transform="translate(50, 520)" class="shadow-popup">
      <rect width="520" height="110" rx="16" fill="#ffffff" stroke="#059669" stroke-width="1.8"/>

      <!-- Header Strip -->
      <path d="M 0 16 C 0 7.16 7.16 0 16 0 L 504 0 C 512.84 0 520 7.16 520 16 L 520 28 L 0 28 Z" fill="#064e3b"/>
      <circle cx="16" cy="14" r="3.5" fill="#34d399"/>
      <text x="26" y="18" font-size="10.5" font-weight="800" fill="#ffffff" letter-spacing="0.5">PRODUCT REVIEW NOTIFICATION</text>
      <text x="390" y="18" font-size="9.5" font-weight="700" fill="#a7f3d0">Product Page Only</text>

      <!-- Content Row -->
      <g transform="translate(18, 42)">
        <circle cx="26" cy="26" r="24" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1.5"/>
        <text x="16" y="32" font-size="14" font-weight="800" fill="#059669">MK</text>

        <g transform="translate(62, 4)">
          <text x="0" y="14" font-size="13" font-weight="800" fill="#0a281e">Michael K. <tspan font-size="11" font-weight="600" fill="#64748b">• 4 mins ago</tspan></text>
          <text x="0" y="32" font-size="12" font-weight="700" fill="#f59e0b">★★★★★  <tspan font-weight="600" fill="#2d4a3e">"Game changer for daily walks! Super lightweight."</tspan></text>
          <text x="0" y="50" font-size="10.5" font-weight="700" fill="#059669">✓ Verified Purchase of Cloud-Knit Wool Runner</text>
        </g>
      </g>
    </g>

    <!-- Annotation Arrow pointing to toast -->
    <g transform="translate(600, 550)">
      <line x1="0" y1="20" x2="-20" y2="20" stroke="#059669" stroke-width="2" stroke-dasharray="4,4"/>
      <circle cx="-20" cy="20" r="4" fill="#059669"/>
      <rect x="0" y="-10" width="310" height="60" rx="10" fill="#e8f7ee" stroke="#a7f3d0"/>
      <text x="14" y="14" font-size="12" font-weight="800" fill="#064e3b">App Feature: Compact Review Toast</text>
      <text x="14" y="32" font-size="11" font-weight="500" fill="#2d4a3e">Minimal floating toast highlighting live reviews</text>
      <text x="14" y="46" font-size="11" font-weight="500" fill="#2d4a3e">for this specific product to build immediate trust.</text>
    </g>
  </g>
</svg>
`;

async function renderPopupReferences() {
  const file1 = path.join(artifactDir, "popup_reference_1_card.png");
  const file2 = path.join(artifactDir, "popup_reference_2_toast.png");

  console.log("Generating Popup Reference 1...");
  await sharp(Buffer.from(svgPopupRef1)).png({ quality: 95 }).toFile(file1);
  console.log("Saved: " + file1);

  console.log("Generating Popup Reference 2...");
  await sharp(Buffer.from(svgPopupRef2)).png({ quality: 95 }).toFile(file2);
  console.log("Saved: " + file2);
}

renderPopupReferences().catch(console.error);

