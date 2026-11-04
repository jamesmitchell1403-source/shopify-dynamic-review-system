import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const artifactDir = "C:\\Users\\windows\\.gemini\\antigravity\\brain\\94451fe4-5f1f-4c37-b247-8d6af81ec570";
const htmlPath = path.join(artifactDir, "emerald_landing_page.html");
const pngPath = path.join(artifactDir, "emerald_landing_page_preview.png");

// Read app/routes/_index/route.tsx to extract CSS and JSX converted to HTML
const routeTsx = fs.readFileSync(path.join(process.cwd(), "app/routes/_index/route.tsx"), "utf-8");

// Extract styles
const styleMatch = routeTsx.match(/<style>\{`([\s\S]+?)`\}<\/style>/);
const css = styleMatch ? styleMatch[1] : "";

// Generate a faithful standalone HTML version for screenshotting
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1200, initial-scale=1.0">
  <title>AI Dynamic Review System</title>
  <style>
    ${css}
    body { width: 1200px; margin: 0 auto; background: #f8faf8; }
  </style>
</head>
<body>
  <div class="landing-root">
    <div class="bg-glow-1"></div>
    <div class="bg-glow-2"></div>

    <!-- Header -->
    <header class="site-header">
      <div class="container nav-wrapper">
        <a href="/" class="logo-wrap">
          <div class="logo-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div class="logo-text">
            AI Dynamic <span>Review System</span>
          </div>
        </a>

        <nav class="nav-menu">
          <a href="#features" class="nav-link">Features</a>
          <a href="#benefits" class="nav-link">Benefits</a>
          <a href="#how-it-works" class="nav-link">How It Works</a>
          <a href="#faq" class="nav-link">FAQ</a>
          <a href="/privacy-policy" class="nav-link">Privacy Policy</a>
        </nav>

        <button class="btn-install-header">Install App →</button>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="hero-section">
      <div class="container hero-grid">
        <div>
          <div class="pill-tag">★ Social Proof for Your Shopify Store</div>
          <h1 class="hero-title">
            Showcase product reviews, popups and trust badges to turn visitors into <span class="highlight">confident buyers.</span>
          </h1>
          <p class="hero-sub">
            Import, manage and showcase product reviews with AI help.
          </p>

          <div class="trust-checklist">
            <div class="trust-check-item">
              <span class="trust-check-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              Build Trust
            </div>
            <div class="trust-check-item">
              <span class="trust-check-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              Increase Sales
            </div>
            <div class="trust-check-item">
              <span class="trust-check-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              Save Time
            </div>
          </div>
        </div>

        <div class="hero-visual-container">
          <div class="floating-review-top">
            <div class="avatar-circle">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80" alt="Sarah J." />
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #0a281e;">Sarah J.</div>
              <div style="color: #f59e0b; font-size: 11px; margin-bottom: 2px;">★★★★★</div>
              <div class="review-text-bubble">Great quality! Really love this product.</div>
              <div style="font-size: 10px; color: #059669; font-weight: 700; margin-top: 3px;">✓ Verified Purchase</div>
            </div>
          </div>

          <div class="browser-header-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>

          <div class="product-preview-layout">
            <div class="product-img-box">
              <img src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=80" alt="Premium Leather Handbag" />
              <div class="thumbnails-row">
                <span class="thumb-box" style="background: #e8ded4;"></span>
                <span class="thumb-box" style="background: #cbb7a1;"></span>
                <span class="thumb-box" style="background: #6c8074;"></span>
              </div>
            </div>

            <div class="rating-summary-box">
              <div class="stars-row">★★★★★</div>
              <div class="rating-score">4.8 (2.5k reviews)</div>
              <div class="verified-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified Purchase
              </div>
            </div>
          </div>

          <div class="floating-popup-bottom">
            <img src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=100&q=80" alt="Product" class="popup-bag-thumb" />
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #059669; font-weight: 800;">🟢 New Review</span>
                <span style="color: #f59e0b; font-size: 11px;">★★★★★</span>
              </div>
              <div style="color: #2d4a3e; font-size: 11px; font-weight: 500;">This product is amazing! Highly recommend!</div>
            </div>
          </div>

          <div class="floating-trust-right">
            <div>
              <div style="font-size: 10.5px; font-weight: 700; color: #446153;">Trusted by 10K+ Happy Customers</div>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <div class="avatar-stack">
                  <img class="avatar-stack-item" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                  <img class="avatar-stack-item" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                  <img class="avatar-stack-item" src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                </div>
                <span style="color: #f59e0b; font-size: 11px; font-weight: 700;">★★★★★</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Powerful Features -->
    <section class="features-section" id="features">
      <div class="container">
        <div class="section-header-center">
          <span class="section-tagline">— POWERFUL FEATURES —</span>
          <h2 class="section-main-title">Everything You Need in One App</h2>
        </div>

        <div class="features-grid-3x2">
          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Show Review Popups, Star Ratings and Trust Badges</h3>
              <p>Display social proof on product pages and across your store.</p>
            </div>
          </div>

          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="15" x2="23" y2="15" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="15" x2="4" y2="15" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Draft Reviews with AI</h3>
              <p>Use OpenAI, Claude or Gemini to create review drafts, then edit.</p>
            </div>
          </div>

          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Bulk Import Reviews from CSV</h3>
              <p>Save time with automatic column mapping.</p>
            </div>
          </div>

          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="8" y1="8" x2="16" y2="8" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="8" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Manage Reviews in One Place</h3>
              <p>Edit, approve and publish all reviews from a single dashboard.</p>
            </div>
          </div>

          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Theme App Extension</h3>
              <p>Add widgets in a few clicks, no code needed.</p>
            </div>
          </div>

          <div class="feature-card-item">
            <div class="feature-icon-sq">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div class="feature-item-content">
              <h3>Customizable Popups</h3>
              <p>Match timing, position and style to your brand.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Key Benefits -->
    <section class="benefits-section" id="benefits">
      <div class="container benefits-layout-grid">
        <div class="benefits-left-col">
          <div class="pill-tag" style="background: #e8f7ee; color: #064e3b;">◎ KEY BENEFITS</div>
          <h2>More Trust. More Sales. Less Effort.</h2>
          <p>
            Build credibility with real customer feedback, showcase social proof and save hours of manual work — all from one simple app.
          </p>
        </div>

        <div class="benefits-2x2">
          <div class="benefit-sub-item">
            <div class="benefit-circle-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <h4>Build shopper confidence</h4>
              <p>Real reviews and trust badges help shoppers buy with trust.</p>
            </div>
          </div>

          <div class="benefit-sub-item">
            <div class="benefit-circle-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div>
              <h4>Increase conversion rates</h4>
              <p>Social proof reduces hesitation and drives more sales.</p>
            </div>
          </div>

          <div class="benefit-sub-item">
            <div class="benefit-circle-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h4>Save time &amp; automate</h4>
              <p>AI drafts and bulk import streamline your workflow.</p>
            </div>
          </div>

          <div class="benefit-sub-item">
            <div class="benefit-circle-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h4>Keep full control</h4>
              <p>Moderate, edit and approve reviews easily.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- See The Difference -->
    <section class="difference-section">
      <div class="container">
        <div class="section-header-center">
          <span class="section-tagline">SEE THE DIFFERENCE</span>
          <h2 class="section-main-title">From Empty to Engaging</h2>
          <p class="section-desc-sub">Turn your store into a trust-building machine with reviews, popups and badges.</p>
        </div>

        <div class="comparison-cards-row">
          <div class="comparison-card">
            <span class="comp-badge-pill without">Without the App</span>
            <div class="comp-browser-top">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <div class="comp-content-grid">
              <div class="comp-img-placeholder">
                <img src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=300&q=80" alt="Product" />
              </div>
              <div>
                <div class="skeleton-line" style="width: 85%;"></div>
                <div class="skeleton-line" style="width: 65%;"></div>
                <div class="skeleton-line" style="width: 45%;"></div>
                <div class="empty-stars-text">No reviews yet</div>
                <div style="color: #cbd5e1; font-size: 14px; letter-spacing: 2px; margin-top: 4px;">☆☆☆☆☆</div>
              </div>
            </div>
          </div>

          <div class="comparison-arrow">➔</div>

          <div class="comparison-card">
            <span class="comp-badge-pill with">With the App</span>
            <div class="comp-browser-top">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <div class="comp-content-grid">
              <div class="comp-img-placeholder">
                <img src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=300&q=80" alt="Product" />
                <div class="thumbnails-row">
                  <span class="thumb-box" style="background: #e8ded4;"></span>
                  <span class="thumb-box" style="background: #cbb7a1;"></span>
                  <span class="thumb-box" style="background: #6c8074;"></span>
                </div>
              </div>
              <div>
                <div style="color: #f59e0b; font-size: 13px; letter-spacing: 2px;">★★★★★</div>
                <div style="font-size: 13px; font-weight: 700; color: #0a281e; margin: 2px 0 6px 0;">4.8 (2.5k reviews)</div>
                <div class="verified-pill">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Verified Purchase
                </div>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 8px 10px; margin-top: 10px; display: flex; gap: 8px; align-items: center;">
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&q=80" alt="Customer" style="width: 22px; height: 22px; border-radius: 50%;" />
                  <div>
                    <div style="color: #f59e0b; font-size: 9px;">★★★★★</div>
                    <div style="font-size: 10.5px; font-weight: 700; color: #065f46;">Amazing quality!</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="how-it-works-section" id="how-it-works">
      <div class="container">
        <div class="section-header-center">
          <span class="section-tagline">HOW IT WORKS</span>
          <h2 class="section-main-title">Get Started in 3 Simple Steps</h2>
        </div>

        <div class="steps-flex-row">
          <div class="step-box-card">
            <div class="step-icon-bubble">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div class="step-content-area">
              <div class="step-num-title-row">
                <span class="step-num-circle">1</span>
                <div class="step-title">Install the app</div>
              </div>
              <div class="step-desc">Add the app from the Shopify app store.</div>
            </div>
          </div>

          <div class="step-arrow-divider">➔</div>

          <div class="step-box-card">
            <div class="step-icon-bubble">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div class="step-content-area">
              <div class="step-num-title-row">
                <span class="step-num-circle">2</span>
                <div class="step-title">Configure &amp; customize</div>
              </div>
              <div class="step-desc">Set up AI, import reviews and style your popups.</div>
            </div>
          </div>

          <div class="step-arrow-divider">➔</div>

          <div class="step-box-card">
            <div class="step-icon-bubble">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </div>
            <div class="step-content-area">
              <div class="step-num-title-row">
                <span class="step-num-circle">3</span>
                <div class="step-title">Showcase &amp; grow</div>
              </div>
              <div class="step-desc">Display reviews, popups and badges on your store.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Bottom CTA Banner -->
    <section class="bottom-cta-wrap">
      <div class="container">
        <div class="cta-dark-card">
          <div class="cta-left-content">
            <div class="cta-star-badge">★</div>
            <div>
              <h3 class="cta-title">Ready to Build Trust and Drive More Sales?</h3>
              <p class="cta-sub">Install the app today and start showcasing real reviews, popups and trust badges on your store.</p>
            </div>
          </div>

          <div class="cta-right-action">
            <button class="btn-cta-white">Install App →</button>
            <span class="cta-mini-caption">No coding. No hassle. Just results.</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="site-footer">
      <div class="container">
        <div class="footer-row">
          <div class="logo-wrap">
            <div class="logo-icon-box" style="width: 32px; height: 32px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div class="logo-text" style="font-size: 15px;">
              AI Dynamic <span>Review System</span>
            </div>
          </div>

          <div class="footer-links">
            <a href="#features" class="footer-link">Features</a>
            <a href="#benefits" class="footer-link">Benefits</a>
            <a href="#how-it-works" class="footer-link">How It Works</a>
            <a href="#faq" class="footer-link">FAQ</a>
            <a href="/privacy-policy" class="footer-link">Privacy Policy</a>
            <a href="mailto:developerr6620@gmail.com" class="footer-link">Support</a>
          </div>
        </div>

        <div class="copyright-text">
          © 2026 AI Dynamic Review System. All rights reserved.
        </div>
      </div>
    </footer>
  </div>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf-8");
console.log("Written HTML to:", htmlPath);

// Run headless edge to capture high-res full page screenshot
const edgeExe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const cmd = `"${edgeExe}" --headless --disable-gpu --hide-scrollbars --window-size=1200,2400 --screenshot="${pngPath}" "file:///${htmlPath.replace(/\\\\/g, "/")}"`;

console.log("Capturing screenshot with Edge...");
try {
  execSync(cmd, { stdio: "inherit" });
  console.log("Screenshot captured successfully to:", pngPath);
} catch (err) {
  console.error("Screenshot error:", err);
}
