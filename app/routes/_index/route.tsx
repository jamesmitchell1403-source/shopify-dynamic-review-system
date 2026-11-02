import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useState, useEffect } from "react";

export const meta: MetaFunction = () => [
  { title: "AI Dynamic Review System - Showcase Reviews, Popups & Trust Badges" },
  {
    name: "description",
    content:
      "Showcase product reviews, popups and trust badges to turn visitors into confident buyers. Import, manage and showcase product reviews with AI help.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {};
};

export default function App() {
  const [shopUrl, setShopUrl] = useState("");
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"all" | "photos" | "5star" | "verified">("all");
  const [activeReviewLayout, setActiveReviewLayout] = useState<"grid" | "list">("grid");
  const [isWriteReviewModalOpen, setIsWriteReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [helpfulCounts, setHelpfulCounts] = useState<{ [key: string]: number }>({
    r1: 46,
    r2: 31,
    r3: 24,
  });

  const handleHelpfulClick = (id: string) => {
    setHelpfulCounts((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1,
    }));
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 85;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      window.history.pushState(null, "", `#${id}`);
    }
  };

  const scrollToTop = (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    window.history.pushState(null, "", window.location.pathname);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const id = window.location.hash.replace("#", "");
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          const headerOffset = 85;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }, 150);
      }
    }
  }, []);

  const handleInstallSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let cleanShop = shopUrl.trim().toLowerCase();
    if (!cleanShop) return;

    if (!cleanShop.includes(".")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    } else {
      cleanShop = cleanShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }

    window.location.href = `/auth/login?shop=${encodeURIComponent(cleanShop)}`;
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="landing-root">
      {/* Google Fonts: Manrope (Modern, Sharp, Geometric & Ultra-Clean) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { margin: 0; padding: 0; }
        #features, #reviews-demo, #benefits, #how-it-works, #faq {
          scroll-margin-top: 90px;
        }

        .landing-root,
        .landing-root button,
        .landing-root input,
        .landing-root textarea {
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .landing-root {
          background: #f8faf8;
          color: #0e291e;
          line-height: 1.6;
          overflow-x: clip;
          position: relative;
        }

        /* Sharp, clean, polished headings across all sections */
        h1, h2, h3, h4,
        .hero-title,
        .section-main-title,
        .cta-title,
        .logo-text,
        .btn-install-header,
        .btn-cta-white,
        .btn-modal-submit,
        .pill-tag,
        .benefits-left-col h2,
        .feature-item-content h3,
        .benefit-sub-item h4,
        .step-title,
        .faq-question,
        .modal-title,
        .rating-score,
        .comp-badge-pill {
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 800;
        }

        .hero-title {
          font-size: 46px;
          line-height: 1.18;
          letter-spacing: -0.03em;
        }
        .section-main-title {
          letter-spacing: -0.025em;
        }
        .cta-title {
          letter-spacing: -0.02em;
        }

        /* Subtle organic background glow */
        .bg-glow-1 {
          position: absolute;
          top: 0;
          right: 0;
          width: 650px;
          height: 650px;
          background: radial-gradient(circle, rgba(167, 243, 208, 0.35) 0%, rgba(248, 250, 248, 0) 70%);
          pointer-events: none;
          z-index: 0;
        }
        .bg-glow-2 {
          position: absolute;
          top: 900px;
          left: -150px;
          width: 550px;
          height: 550px;
          background: radial-gradient(circle, rgba(209, 250, 229, 0.4) 0%, rgba(248, 250, 248, 0) 70%);
          pointer-events: none;
          z-index: 0;
        }

        .container {
          max-width: 1140px;
          margin: 0 auto;
          padding: 0 24px;
          position: relative;
          z-index: 1;
        }

        /* Header / Navbar */
        .site-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(248, 250, 248, 0.94);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(226, 238, 230, 0.8);
          padding: 16px 0;
        }
        .nav-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .logo-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }
        .logo-icon-box {
          width: 38px;
          height: 38px;
          background: #064e3b;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 3px 10px rgba(6, 78, 59, 0.25);
        }
        .logo-text {
          font-size: 17px;
          font-weight: 800;
          color: #064e3b;
          letter-spacing: -0.3px;
        }
        .logo-text span {
          color: #092f24;
          font-weight: 500;
          margin-left: 4px;
        }

        .nav-menu {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .nav-link {
          color: #2d4a3e;
          font-size: 14.5px;
          font-weight: 500;
          text-decoration: none;
          transition: color 0.18s ease;
        }
        .nav-link:hover {
          color: #059669;
        }

        .btn-install-header {
          background: #064e3b;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          padding: 10px 22px;
          border-radius: 9999px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(6, 78, 59, 0.2);
        }
        .btn-install-header:hover {
          background: #043c2c;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(6, 78, 59, 0.28);
        }

        /* Hero Section */
        .hero-section {
          padding: 60px 0 80px 0;
        }
        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          align-items: center;
        }

        .pill-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #eaf5ef;
          color: #08533c;
          border: 1px solid #d1ebd9;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 700;
          margin-bottom: 22px;
          letter-spacing: 0.2px;
        }
        .hero-title {
          font-size: 46px;
          font-weight: 900;
          line-height: 1.18;
          color: #0a281e;
          letter-spacing: -1.2px;
          margin-bottom: 20px;
        }
        .hero-title .highlight {
          color: #059669;
        }
        .hero-sub {
          font-size: 17.5px;
          color: #446153;
          line-height: 1.5;
          margin-bottom: 34px;
          max-width: 480px;
        }

        /* Trust Checklist (under hero text) */
        .trust-checklist {
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
          padding-top: 8px;
        }
        .trust-check-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          font-weight: 700;
          color: #1f3b2f;
        }
        .trust-check-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #059669;
        }

        /* Hero Visual (Right Side) */
        .hero-visual-container {
          position: relative;
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid #e1eee6;
          box-shadow: 0 20px 45px -10px rgba(6, 78, 59, 0.08);
          padding: 24px;
        }
        .browser-header-dots {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 18px;
        }
        .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .dot.red { background: #fda4af; }
        .dot.yellow { background: #fde047; }
        .dot.green { background: #86efac; }

        .product-preview-layout {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 20px;
          align-items: center;
        }
        .product-img-box {
          background: #f4f8f5;
          border-radius: 14px;
          padding: 12px;
          text-align: center;
        }
        .product-img-box img {
          width: 100%;
          height: 140px;
          object-fit: contain;
          border-radius: 8px;
        }
        .thumbnails-row {
          display: flex;
          gap: 6px;
          justify-content: center;
          margin-top: 8px;
        }
        .thumb-box {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: #eaf1ec;
          border: 1px solid #d5e5db;
        }

        .rating-summary-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stars-row {
          color: #f59e0b;
          font-size: 15px;
          letter-spacing: 2px;
        }
        .rating-score {
          font-size: 14px;
          font-weight: 700;
          color: #0a281e;
        }
        .verified-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #d1fae5;
          color: #065f46;
          font-size: 11.5px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 9999px;
          width: fit-content;
        }

        /* Floating Badge 1: Top Right (Sarah J.) */
        .floating-review-top {
          position: absolute;
          top: -24px;
          right: -20px;
          background: #ffffff;
          border-radius: 16px;
          padding: 12px 16px;
          border: 1px solid #d5ece0;
          box-shadow: 0 14px 30px rgba(6, 78, 59, 0.12);
          display: flex;
          gap: 12px;
          align-items: flex-start;
          width: 230px;
        }
        .avatar-circle {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #dbeafe;
          overflow: hidden;
          flex-shrink: 0;
        }
        .avatar-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .review-text-bubble {
          font-size: 11.5px;
          color: #2b4539;
          line-height: 1.35;
        }

        /* Floating Badge 2: Bottom Popup ("New Review") */
        .floating-popup-bottom {
          position: absolute;
          bottom: -22px;
          left: 30px;
          background: #ffffff;
          border-radius: 14px;
          padding: 10px 14px;
          border: 1px solid #d5ece0;
          box-shadow: 0 12px 28px rgba(6, 78, 59, 0.12);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11.5px;
        }
        .popup-bag-thumb {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #f2f7f4;
          object-fit: cover;
        }

        /* Floating Badge 3: Right Trust Card ("Trusted by 10K+") */
        .floating-trust-right {
          position: absolute;
          bottom: 40px;
          right: -24px;
          background: #ffffff;
          border-radius: 14px;
          padding: 10px 14px;
          border: 1px solid #d5ece0;
          box-shadow: 0 12px 28px rgba(6, 78, 59, 0.12);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .avatar-stack {
          display: flex;
          margin-right: 4px;
        }
        .avatar-stack-item {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          margin-left: -8px;
          background: #cbd5e1;
          object-fit: cover;
        }
        .avatar-stack-item:first-child {
          margin-left: 0;
        }

        /* SECTION COMMON HEADINGS */
        .section-header-center {
          text-align: center;
          margin-bottom: 52px;
        }
        .section-tagline {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #059669;
          margin-bottom: 10px;
          display: block;
        }
        .section-main-title {
          font-size: 36px;
          font-weight: 800;
          color: #0a281e;
          letter-spacing: -0.8px;
        }
        .section-desc-sub {
          font-size: 16px;
          color: #4a6357;
          margin-top: 10px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        /* SECTION 2: Powerful Features 3x2 Grid */
        .features-section {
          padding: 80px 0;
        }
        .features-grid-3x2 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .feature-card-item {
          background: #ffffff;
          border: 1px solid #e1eee6;
          border-radius: 18px;
          padding: 28px 24px;
          box-shadow: 0 4px 14px rgba(6, 78, 59, 0.03);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }
        .feature-card-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(6, 78, 59, 0.08);
          border-color: #c9e4d5;
        }
        .feature-icon-sq {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #e8f7ee;
          color: #064e3b;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .feature-item-content h3 {
          font-size: 16.5px;
          font-weight: 750;
          color: #0a281e;
          margin-bottom: 8px;
          line-height: 1.35;
        }
        .feature-item-content p {
          font-size: 14px;
          color: #4d665a;
          line-height: 1.45;
        }

        /* SECTION: Product Page Review Widget Showcase */
        .product-reviews-showcase-section {
          padding: 80px 0;
          background: #fbfdfc;
          border-top: 1px solid #e8f1eb;
        }
        .product-page-frame {
          background: #ffffff;
          border: 1px solid #e1eee6;
          border-radius: 24px;
          box-shadow: 0 18px 45px rgba(6, 78, 59, 0.06);
          overflow: hidden;
        }
        .store-browser-bar {
          background: #f4f8f5;
          border-bottom: 1px solid #e1eee6;
          padding: 12px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .store-url-pill {
          background: #ffffff;
          border: 1px solid #d5e5db;
          border-radius: 9999px;
          padding: 5px 16px;
          font-size: 12.5px;
          color: #2d4a3e;
          font-weight: 500;
        }
        .layout-switcher-tabs {
          display: flex;
          background: #e8f1ec;
          border-radius: 9999px;
          padding: 3px;
          gap: 2px;
        }
        .layout-tab-btn {
          border: none;
          background: transparent;
          color: #4a6357;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .layout-tab-btn.active {
          background: #ffffff;
          color: #064e3b;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .product-context-bar {
          padding: 16px 24px;
          border-bottom: 1px solid #eef4f0;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .product-context-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .product-context-thumb {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          background: #f4f8f5;
          object-fit: cover;
          border: 1px solid #e1eee6;
        }
        .product-context-title {
          font-size: 16px;
          font-weight: 800;
          color: #0a281e;
          margin-bottom: 3px;
        }
        .product-context-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          flex-wrap: wrap;
        }
        .stars-mini {
          color: #f59e0b;
          letter-spacing: 1px;
        }
        .rating-num {
          font-weight: 800;
          color: #0a281e;
        }
        .rating-count {
          color: #556d62;
        }
        .stock-badge {
          color: #059669;
          font-weight: 700;
          font-size: 12px;
          margin-left: 6px;
        }
        .btn-write-review {
          background: #064e3b;
          color: #ffffff;
          border: none;
          padding: 9px 20px;
          border-radius: 9999px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .btn-write-review:hover {
          background: #043c2c;
          transform: translateY(-1px);
        }

        /* Review Summary Aggregation Block */
        .review-summary-card {
          background: #fbfdfc;
          border-bottom: 1px solid #eef4f0;
          padding: 32px 28px;
          display: grid;
          grid-template-columns: 1.1fr 1.6fr 1.3fr;
          gap: 32px;
          align-items: center;
        }
        .summary-score-col {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          border-right: 1px solid #eef4f0;
          padding-right: 24px;
        }
        .score-big {
          font-size: 52px;
          font-weight: 900;
          color: #0a281e;
          line-height: 1;
          margin-bottom: 8px;
        }
        .stars-big {
          color: #f59e0b;
          font-size: 20px;
          letter-spacing: 2px;
          margin-bottom: 6px;
        }
        .score-caption {
          font-size: 13.5px;
          color: #556d62;
          font-weight: 500;
          margin-bottom: 10px;
        }
        .recommend-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #e8f7ee;
          color: #065f46;
          font-size: 12px;
          font-weight: 700;
          padding: 5px 10px;
          border-radius: 6px;
        }

        .summary-bars-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-right: 1px solid #eef4f0;
          padding-right: 24px;
        }
        .bar-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12.5px;
        }
        .bar-label {
          width: 50px;
          color: #4a6357;
          font-weight: 600;
        }
        .bar-track {
          flex: 1;
          height: 8px;
          background: #eaf1ec;
          border-radius: 9999px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: #f59e0b;
          border-radius: 9999px;
        }
        .bar-val {
          width: 42px;
          text-align: right;
          color: #556d62;
          font-weight: 600;
        }

        .summary-highlights-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tag-box-title {
          font-size: 13px;
          font-weight: 800;
          color: #0a281e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .tag-pills-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tag-pill {
          background: #ffffff;
          border: 1px solid #d5e5db;
          color: #2d4a3e;
          font-size: 12px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 9999px;
        }

        /* Review Toolbar: Filters & Sorting */
        .review-toolbar {
          padding: 16px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #eef4f0;
          background: #ffffff;
          flex-wrap: wrap;
          gap: 14px;
        }
        .filter-pills-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .filter-pill-btn {
          border: 1px solid #d5e5db;
          background: #ffffff;
          color: #4a6357;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .filter-pill-btn.active {
          background: #064e3b;
          color: #ffffff;
          border-color: #064e3b;
        }
        .sort-dropdown-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #4a6357;
          font-weight: 600;
        }
        .sort-select {
          border: 1px solid #d5e5db;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 13px;
          color: #0a281e;
          font-weight: 600;
          background: #ffffff;
          outline: none;
        }

        /* Review Cards Display */
        .reviews-display-container {
          padding: 28px;
          background: #ffffff;
        }
        .reviews-display-container.grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .reviews-display-container.list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .customer-review-card {
          background: #ffffff;
          border: 1px solid #e1eee6;
          border-radius: 18px;
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 4px 12px rgba(6, 78, 59, 0.02);
          transition: all 0.2s ease;
        }
        .customer-review-card:hover {
          border-color: #a7f3d0;
          box-shadow: 0 8px 20px rgba(6, 78, 59, 0.06);
        }
        .reviewer-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .reviewer-info-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .reviewer-avatar-img {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          object-fit: cover;
          border: 1.5px solid #d5e5db;
        }
        .reviewer-name {
          font-size: 14px;
          font-weight: 750;
          color: #0a281e;
          line-height: 1.2;
        }
        .verified-buyer-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #059669;
          font-size: 11px;
          font-weight: 700;
          margin-top: 2px;
        }
        .review-date-text {
          font-size: 12px;
          color: #839b8f;
        }
        .review-card-stars {
          color: #f59e0b;
          font-size: 14px;
          letter-spacing: 1.5px;
          margin-bottom: 10px;
        }
        .review-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0a281e;
          margin-bottom: 8px;
          line-height: 1.35;
        }
        .review-card-body {
          font-size: 13.5px;
          color: #4a6357;
          line-height: 1.55;
          margin-bottom: 14px;
        }
        .review-photos-grid {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
        }
        .review-photo-thumb {
          width: 68px;
          height: 68px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid #d5e5db;
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .review-photo-thumb:hover {
          transform: scale(1.05);
        }
        .merchant-response-box {
          background: #f4f8f5;
          border-left: 3px solid #059669;
          padding: 10px 14px;
          border-radius: 0 10px 10px 0;
          font-size: 12px;
          color: #2b4539;
          margin-bottom: 14px;
          line-height: 1.45;
        }
        .merchant-response-author {
          font-weight: 800;
          color: #064e3b;
          margin-bottom: 3px;
        }
        .review-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #f1f7f3;
          padding-top: 12px;
          font-size: 12px;
          color: #71897c;
        }
        .helpful-btn {
          background: transparent;
          border: none;
          color: #556d62;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .helpful-btn:hover {
          color: #059669;
        }

        .show-more-reviews-bar {
          text-align: center;
          padding: 20px 0 10px 0;
          border-top: 1px solid #eef4f0;
          margin-top: 10px;
        }
        .btn-load-more {
          background: #ffffff;
          border: 1.5px solid #d5e5db;
          color: #064e3b;
          font-size: 13.5px;
          font-weight: 700;
          padding: 10px 24px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-load-more:hover {
          background: #f0fdf4;
          border-color: #059669;
        }

        /* SECTION 3: Key Benefits (Left text + 2x2 grid) */
        .benefits-section {
          padding: 80px 0;
          background: #ffffff;
          border-top: 1px solid #e8f1eb;
          border-bottom: 1px solid #e8f1eb;
        }
        .benefits-layout-grid {
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 60px;
          align-items: center;
        }
        .benefits-left-col h2 {
          font-size: 38px;
          font-weight: 850;
          line-height: 1.18;
          color: #0a281e;
          letter-spacing: -0.8px;
          margin-bottom: 18px;
        }
        .benefits-left-col p {
          font-size: 16.5px;
          color: #4d665a;
          line-height: 1.55;
        }
        .benefits-2x2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
        }
        .benefit-sub-item {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .benefit-circle-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e8f7ee;
          color: #059669;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .benefit-sub-item h4 {
          font-size: 16px;
          font-weight: 750;
          color: #0a281e;
          margin-bottom: 6px;
        }
        .benefit-sub-item p {
          font-size: 13.5px;
          color: #556d62;
          line-height: 1.45;
        }

        /* SECTION 4: See The Difference (Before vs After) */
        .difference-section {
          padding: 90px 0;
        }
        .comparison-cards-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
          margin-top: 20px;
        }
        .comparison-card {
          flex: 1;
          max-width: 490px;
          background: #ffffff;
          border: 1px solid #e1eee6;
          border-radius: 20px;
          padding: 24px;
          position: relative;
          box-shadow: 0 10px 30px rgba(6, 78, 59, 0.05);
        }
        .comp-badge-pill {
          position: absolute;
          top: -14px;
          left: 24px;
          font-size: 12px;
          font-weight: 750;
          padding: 5px 14px;
          border-radius: 9999px;
        }
        .comp-badge-pill.without {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        .comp-badge-pill.with {
          background: #064e3b;
          color: #ffffff;
          box-shadow: 0 4px 10px rgba(6, 78, 59, 0.25);
        }

        .comp-browser-top {
          display: flex;
          gap: 5px;
          margin-bottom: 16px;
        }
        .comp-content-grid {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 16px;
          align-items: center;
        }
        .comp-img-placeholder {
          background: #f8faf9;
          border-radius: 12px;
          padding: 8px;
          text-align: center;
        }
        .comp-img-placeholder img {
          width: 100%;
          height: 100px;
          object-fit: contain;
        }

        .skeleton-line {
          height: 10px;
          background: #e2e8f0;
          border-radius: 4px;
          margin-bottom: 8px;
        }
        .empty-stars-text {
          font-size: 12.5px;
          color: #94a3b8;
          margin-top: 8px;
        }

        .comparison-arrow {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #e8f7ee;
          color: #059669;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 800;
          flex-shrink: 0;
        }

        /* SECTION 5: How It Works (3 Steps) */
        .how-it-works-section {
          padding: 80px 0;
          background: #ffffff;
          border-top: 1px solid #e8f1eb;
        }
        .steps-flex-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .step-box-card {
          flex: 1;
          background: #f8faf9;
          border: 1px solid #e1eee6;
          border-radius: 18px;
          padding: 24px;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          transition: transform 0.2s ease;
        }
        .step-box-card:hover {
          transform: translateY(-2px);
          border-color: #a7f3d0;
        }
        .step-icon-bubble {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          background: #e8f7ee;
          color: #064e3b;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .step-content-area {
          display: flex;
          flex-direction: column;
        }
        .step-num-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .step-num-circle {
          width: 22px;
          height: 22px;
          background: #064e3b;
          color: #ffffff;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11.5px;
          font-weight: 800;
        }
        .step-title {
          font-size: 15.5px;
          font-weight: 750;
          color: #0a281e;
          margin-bottom: 6px;
        }
        .step-desc {
          font-size: 13.5px;
          color: #556d62;
          line-height: 1.4;
        }
        .step-arrow-divider {
          color: #059669;
          font-size: 20px;
          font-weight: bold;
          flex-shrink: 0;
        }

        /* FAQ Section */
        .faq-section {
          padding: 80px 0;
        }
        .faq-list {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .faq-item {
          background: #ffffff;
          border: 1px solid #e1eee6;
          border-radius: 14px;
          padding: 20px 24px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .faq-item:hover {
          border-color: #a7f3d0;
        }
        .faq-question {
          font-size: 16px;
          font-weight: 700;
          color: #0a281e;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .faq-toggle-icon {
          font-size: 18px;
          color: #059669;
          font-weight: 700;
        }
        .faq-answer {
          margin-top: 12px;
          font-size: 14.5px;
          color: #4a6357;
          line-height: 1.5;
          padding-top: 10px;
          border-top: 1px solid #f1f7f3;
        }

        /* SECTION 7: Dark Bottom CTA Banner */
        .bottom-cta-wrap {
          padding: 40px 0 80px 0;
        }
        .cta-dark-card {
          background: #043c2c;
          border-radius: 28px;
          padding: 44px 50px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          color: #ffffff;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 45px rgba(4, 60, 44, 0.28);
        }
        .cta-left-content {
          display: flex;
          gap: 20px;
          align-items: center;
        }
        .cta-star-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: #059669;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
        }
        .cta-title {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          margin-bottom: 6px;
        }
        .cta-sub {
          font-size: 14.5px;
          color: #a7f3d0;
          max-width: 520px;
          line-height: 1.45;
        }
        .cta-right-action {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .btn-cta-white {
          background: #ffffff;
          color: #064e3b;
          font-size: 15px;
          font-weight: 750;
          padding: 12px 28px;
          border-radius: 9999px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }
        .btn-cta-white:hover {
          background: #f0fdf4;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .cta-mini-caption {
          font-size: 11.5px;
          color: #a7f3d0;
          letter-spacing: 0.2px;
        }

        /* Footer */
        .site-footer {
          border-top: 1px solid #e2ece6;
          background: #ffffff;
          padding: 44px 0 32px 0;
        }
        .footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 24px;
        }
        .footer-links {
          display: flex;
          gap: 24px;
          align-items: center;
          flex-wrap: wrap;
        }
        .footer-link {
          color: #446153;
          font-size: 14px;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .footer-link:hover {
          color: #059669;
        }
        .copyright-text {
          font-size: 13px;
          color: #71897c;
          text-align: center;
          border-top: 1px solid #eef4f0;
          padding-top: 20px;
        }

        /* Install Store Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(6, 78, 59, 0.5);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-box {
          background: #ffffff;
          border-radius: 24px;
          max-width: 480px;
          width: 100%;
          padding: 32px;
          box-shadow: 0 25px 60px rgba(6, 78, 59, 0.2);
          position: relative;
        }
        .modal-close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          background: #f1f7f3;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          font-size: 16px;
          cursor: pointer;
          color: #446153;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-title {
          font-size: 22px;
          font-weight: 800;
          color: #0a281e;
          margin-bottom: 8px;
        }
        .modal-sub {
          font-size: 14px;
          color: #4d665a;
          margin-bottom: 24px;
        }
        .modal-input-field {
          width: 100%;
          border: 1.5px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s ease;
          margin-bottom: 16px;
        }
        .modal-input-field:focus {
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }
        .btn-modal-submit {
          width: 100%;
          background: #064e3b;
          color: #ffffff;
          padding: 13px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .btn-modal-submit:hover {
          background: #043c2c;
        }

        /* Mobile Navigation */
        .mobile-menu-btn {
          display: none;
          background: transparent;
          border: none;
          cursor: pointer;
          color: #064e3b;
          padding: 6px;
        }
        .mobile-nav-drawer {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-bottom: 1px solid #e1eee6;
          padding: 16px 24px;
          gap: 12px;
          box-shadow: 0 12px 28px rgba(6, 78, 59, 0.08);
        }
        .mobile-nav-link {
          color: #2d4a3e;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          padding: 10px 0;
          border-bottom: 1px solid #f1f7f3;
          display: block;
        }
        .mobile-nav-link:hover {
          color: #059669;
        }

        /* Responsive Breakpoints */
        @media (max-width: 900px) {
          .nav-menu { display: none; }
          .mobile-menu-btn { display: flex; align-items: center; justify-content: center; }
          .btn-install-header { padding: 8px 16px; font-size: 13px; }
          .hero-grid { grid-template-columns: 1fr; gap: 40px; }
          .features-grid-3x2 { grid-template-columns: 1fr; }
          .benefits-layout-grid { grid-template-columns: 1fr; gap: 36px; }
          .comparison-cards-row { flex-direction: column; }
          .steps-flex-row { flex-direction: column; }
          .step-arrow-divider { transform: rotate(90deg); margin: 6px 0; }
          .cta-dark-card { flex-direction: column; text-align: center; padding: 36px 24px; }
          .cta-left-content { flex-direction: column; text-align: center; }
          .hero-title { font-size: 36px; }

          /* Product Reviews Showcase Responsive */
          .review-summary-card {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .summary-score-col,
          .summary-bars-col {
            border-right: none;
            border-bottom: 1px solid #eef4f0;
            padding-right: 0;
            padding-bottom: 20px;
          }
          .reviews-display-container.grid {
            grid-template-columns: 1fr;
          }
          .store-browser-bar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      {/* Decorative background glow elements */}
      <div className="bg-glow-1" />
      <div className="bg-glow-2" />

      {/* 1. Header (Navbar) */}
      <header className="site-header">
        <div className="container nav-wrapper">
          <a href="/" onClick={scrollToTop} className="logo-wrap">
            <div className="logo-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div className="logo-text">
              AI Dynamic <span>Review System</span>
            </div>
          </a>

          <nav className="nav-menu">
            <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="nav-link">Features</a>
            <a href="#reviews-demo" onClick={(e) => scrollToSection(e, "reviews-demo")} className="nav-link">Product Reviews</a>
            <a href="#benefits" onClick={(e) => scrollToSection(e, "benefits")} className="nav-link">Benefits</a>
            <a href="#how-it-works" onClick={(e) => scrollToSection(e, "how-it-works")} className="nav-link">How It Works</a>
            <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="nav-link">FAQ</a>
            {/* Privacy Policy link added as requested */}
            <a href="/privacy-policy" className="nav-link">Privacy Policy</a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="btn-install-header"
            >
              Install App →
            </button>

            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {isMobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="mobile-nav-link">Features</a>
            <a href="#reviews-demo" onClick={(e) => scrollToSection(e, "reviews-demo")} className="mobile-nav-link">Product Reviews</a>
            <a href="#benefits" onClick={(e) => scrollToSection(e, "benefits")} className="mobile-nav-link">Benefits</a>
            <a href="#how-it-works" onClick={(e) => scrollToSection(e, "how-it-works")} className="mobile-nav-link">How It Works</a>
            <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="mobile-nav-link">FAQ</a>
            <a href="/privacy-policy" className="mobile-nav-link">Privacy Policy</a>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section className="hero-section">
        <div className="container hero-grid">
          {/* Left Column: Copy & Checklist (Buttons Removed as requested) */}
          <div>
            <div className="pill-tag">
              ★ Social Proof for Your Shopify Store
            </div>
            <h1 className="hero-title">
              Turn Visitors Into Buyers With{" "}
              <span className="highlight">AI Product Reviews.</span>
            </h1>
            <p className="hero-sub">
              Import, manage and showcase product reviews with AI help.
            </p>

            {/* Checklist with Build Trust, Increase Sales, Save Time */}
            <div className="trust-checklist">
              <div className="trust-check-item">
                <span className="trust-check-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Build Trust
              </div>
              <div className="trust-check-item">
                <span className="trust-check-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </span>
                Increase Sales
              </div>
              <div className="trust-check-item">
                <span className="trust-check-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                Save Time
              </div>
            </div>
          </div>

          {/* Right Column: Visual Product Mockup with Floating Review Cards */}
          <div className="hero-visual-container">
            {/* Top-Right Floating Card: Sarah J. */}
            <div className="floating-review-top">
              <div className="avatar-circle">
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
                  alt="Sarah J."
                />
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0a281e" }}>Sarah J.</div>
                <div style={{ color: "#f59e0b", fontSize: "11px", marginBottom: "2px" }}>★★★★★</div>
                <div className="review-text-bubble">
                  Great quality! Really love this product.
                </div>
                <div style={{ fontSize: "10px", color: "#059669", fontWeight: 700, marginTop: "3px" }}>
                  ✓ Verified Purchase
                </div>
              </div>
            </div>

            {/* Browser top dots */}
            <div className="browser-header-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>

            {/* Product Card Layout */}
            <div className="product-preview-layout">
              <div className="product-img-box">
                <img
                  src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=80"
                  alt="Premium Leather Handbag"
                />
                <div className="thumbnails-row">
                  <span className="thumb-box" style={{ background: "#e8ded4" }} />
                  <span className="thumb-box" style={{ background: "#cbb7a1" }} />
                  <span className="thumb-box" style={{ background: "#6c8074" }} />
                </div>
              </div>

              <div className="rating-summary-box">
                <div className="stars-row">★★★★★</div>
                <div className="rating-score">4.8 (2.5k reviews)</div>
                <div className="verified-pill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Verified Purchase
                </div>
              </div>
            </div>

            {/* Bottom-Center Floating Review Popup */}
            <div className="floating-popup-bottom">
              <img
                src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=100&q=80"
                alt="Product"
                className="popup-bag-thumb"
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#059669", fontWeight: 800 }}>🟢 New Review</span>
                  <span style={{ color: "#f59e0b", fontSize: "11px" }}>★★★★★</span>
                </div>
                <div style={{ color: "#2d4a3e", fontSize: "11px", fontWeight: 500 }}>
                  This product is amazing! Highly recommend!
                </div>
              </div>
            </div>

            {/* Middle-Right Floating Trust Card */}
            <div className="floating-trust-right">
              <div>
                <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#446153" }}>
                  Trusted by 10K+ Happy Customers
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <div className="avatar-stack">
                    <img className="avatar-stack-item" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                    <img className="avatar-stack-item" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                    <img className="avatar-stack-item" src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=60&q=80" alt="Customer" />
                  </div>
                  <span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 700 }}>★★★★★</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Powerful Features (3x2 Grid) */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">— POWERFUL FEATURES —</span>
            <h2 className="section-main-title">Everything You Need in One App</h2>
          </div>

          <div className="features-grid-3x2">
            {/* Feature 1: Show Review Popups, Star Ratings & Trust Badges */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div className="feature-item-content">
                <h3>Show Review Popups, Star Ratings and Trust Badges</h3>
                <p>Display social proof on product pages and across your store.</p>
              </div>
            </div>

            {/* Feature 2: Draft Reviews with AI */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <div className="feature-item-content">
                <h3>Draft Reviews with AI</h3>
                <p>Use OpenAI, Claude or Gemini to create review drafts, then edit.</p>
              </div>
            </div>

            {/* Feature 3: Bulk Import Reviews from CSV */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="feature-item-content">
                <h3>Bulk Import Reviews from CSV</h3>
                <p>Save time with automatic column mapping.</p>
              </div>
            </div>

            {/* Feature 4: Manage Reviews in One Place */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="8" y1="8" x2="16" y2="8" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                  <line x1="8" y1="16" x2="12" y2="16" />
                </svg>
              </div>
              <div className="feature-item-content">
                <h3>Manage Reviews in One Place</h3>
                <p>Edit, approve and publish all reviews from a single dashboard.</p>
              </div>
            </div>

            {/* Feature 5: Theme App Extension */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </div>
              <div className="feature-item-content">
                <h3>Theme App Extension</h3>
                <p>Add widgets in a few clicks, no code needed.</p>
              </div>
            </div>

            {/* Feature 6: Customizable Popups */}
            <div className="feature-card-item">
              <div className="feature-icon-sq">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div className="feature-item-content">
                <h3>Customizable Popups</h3>
                <p>Match timing, position and style to your brand.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Product Page Reviews Section & Live Widget Layout Showcase */}
      <section className="product-reviews-showcase-section" id="reviews-demo">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">— STOREFRONT PRODUCT PAGE WIDGET —</span>
            <h2 className="section-main-title">Real Reviews That Build Instant Trust</h2>
            <p className="section-desc-sub">
              See how the AI Dynamic Review widget renders directly on your Shopify product pages — fully customizable, responsive, and conversion-optimized.
            </p>
          </div>

          <div className="product-page-frame">
            {/* Store Browser Bar */}
            <div className="store-browser-bar">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                <span className="store-url-pill" style={{ marginLeft: "8px" }}>
                  https://your-store.myshopify.com/products/the-luxe-leather-tote
                </span>
              </div>

              {/* View Layout Switcher (Grid vs List) */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Layout:</span>
                <div className="layout-switcher-tabs">
                  <button
                    className={`layout-tab-btn ${activeReviewLayout === "grid" ? "active" : ""}`}
                    onClick={() => setActiveReviewLayout("grid")}
                  >
                    Grid View
                  </button>
                  <button
                    className={`layout-tab-btn ${activeReviewLayout === "list" ? "active" : ""}`}
                    onClick={() => setActiveReviewLayout("list")}
                  >
                    List View
                  </button>
                </div>
              </div>
            </div>

            {/* Product Context Bar */}
            <div className="product-context-bar">
              <div className="product-context-info">
                <img
                  src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=160&auto=format&fit=crop&q=80"
                  alt="The Luxe Everyday Leather Tote"
                  className="product-context-thumb"
                />
                <div>
                  <h3 className="product-context-title">The Luxe Everyday Leather Tote</h3>
                  <div className="product-context-meta">
                    <span className="stars-mini">★★★★★</span>
                    <span className="rating-num">4.9</span>
                    <span className="rating-count">(2,548 customer reviews)</span>
                    <span className="stock-badge">● In Stock • Ships in 24 hrs</span>
                  </div>
                </div>
              </div>

              <button
                className="btn-write-review"
                onClick={() => setIsWriteReviewModalOpen(true)}
              >
                <span>✍</span>
                <span>Write a Review</span>
              </button>
            </div>

            {/* Review Aggregation Summary Breakdown */}
            <div className="review-summary-card">
              {/* Overall Score */}
              <div className="summary-score-col">
                <div className="score-big">4.9</div>
                <div className="stars-big">★★★★★</div>
                <div className="score-caption">Based on 2,548 customer ratings</div>
                <div className="recommend-badge">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>98% of buyers recommend this product</span>
                </div>
              </div>

              {/* Star Progress Bars */}
              <div className="summary-bars-col">
                <div className="bar-row">
                  <span className="bar-label">5 Star</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: "88%" }} />
                  </div>
                  <span className="bar-val">88% (2,242)</span>
                </div>
                <div className="bar-row">
                  <span className="bar-label">4 Star</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: "9%" }} />
                  </div>
                  <span className="bar-val">9% (230)</span>
                </div>
                <div className="bar-row">
                  <span className="bar-label">3 Star</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: "2%" }} />
                  </div>
                  <span className="bar-val">2% (51)</span>
                </div>
                <div className="bar-row">
                  <span className="bar-label">2 Star</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: "0.6%" }} />
                  </div>
                  <span className="bar-val">0.6% (15)</span>
                </div>
                <div className="bar-row">
                  <span className="bar-label">1 Star</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: "0.4%" }} />
                  </div>
                  <span className="bar-val">0.4% (10)</span>
                </div>
              </div>

              {/* Highlights & Mentions */}
              <div className="summary-highlights-col">
                <div className="tag-box-title">Buyer Sentiment Highlights</div>
                <div className="tag-pills-row">
                  <span className="tag-pill">✨ Superior Leather (840)</span>
                  <span className="tag-pill">📦 Fast 2-Day Shipping (612)</span>
                  <span className="tag-pill">💼 Fits 15" Laptops (498)</span>
                  <span className="tag-pill">👌 Sturdy Stitching (415)</span>
                  <span className="tag-pill">💎 Luxury Feel (320)</span>
                </div>
              </div>
            </div>

            {/* Filter and Sorting Toolbar */}
            <div className="review-toolbar">
              <div className="filter-pills-wrap">
                <button
                  className={`filter-pill-btn ${reviewFilter === "all" ? "active" : ""}`}
                  onClick={() => setReviewFilter("all")}
                >
                  All Reviews (2,548)
                </button>
                <button
                  className={`filter-pill-btn ${reviewFilter === "photos" ? "active" : ""}`}
                  onClick={() => setReviewFilter("photos")}
                >
                  📷 With Photos (742)
                </button>
                <button
                  className={`filter-pill-btn ${reviewFilter === "5star" ? "active" : ""}`}
                  onClick={() => setReviewFilter("5star")}
                >
                  ★ 5 Stars Only (2,242)
                </button>
                <button
                  className={`filter-pill-btn ${reviewFilter === "verified" ? "active" : ""}`}
                  onClick={() => setReviewFilter("verified")}
                >
                  ✓ Verified Purchases (2,410)
                </button>
              </div>

              <div className="sort-dropdown-wrap">
                <span>Sort by:</span>
                <select className="sort-select" defaultValue="recent">
                  <option value="recent">Most Recent</option>
                  <option value="highest">Highest Rating</option>
                  <option value="helpful">Most Helpful</option>
                  <option value="photos">With Photos First</option>
                </select>
              </div>
            </div>

            {/* Customer Review Cards Display */}
            <div className={`reviews-display-container ${activeReviewLayout}`}>
              {/* Review 1 */}
              <div className="customer-review-card">
                <div>
                  <div className="reviewer-header-row">
                    <div className="reviewer-info-left">
                      <img
                        src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
                        alt="Sarah Jenkins"
                        className="reviewer-avatar-img"
                      />
                      <div>
                        <div className="reviewer-name">Sarah Jenkins</div>
                        <div className="verified-buyer-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Verified Purchase</span>
                        </div>
                      </div>
                    </div>
                    <span className="review-date-text">2 days ago</span>
                  </div>

                  <div className="review-card-stars">★★★★★</div>
                  <h4 className="review-card-title">Exceeded all my expectations! Best everyday tote.</h4>
                  <p className="review-card-body">
                    The leather smells incredible and the craftsmanship is unmatched. Fits my 15-inch laptop, water bottle, and planner with room to spare. Definitely worth every penny and arrived in 2 days!
                  </p>

                  <div className="review-photos-grid">
                    <img
                      src="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&auto=format&fit=crop&q=80"
                      alt="Customer review photo"
                      className="review-photo-thumb"
                    />
                    <img
                      src="https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=200&auto=format&fit=crop&q=80"
                      alt="Customer review photo inside"
                      className="review-photo-thumb"
                    />
                  </div>

                  <div className="merchant-response-box">
                    <div className="merchant-response-author">Response from Store Owner:</div>
                    Thank you so much Sarah! We take huge pride in our full-grain leather selection and love hearing that your laptop fits effortlessly.
                  </div>
                </div>

                <div className="review-footer-row">
                  <span>Color: Caramel Brown • Size: Large</span>
                  <button
                    className="helpful-btn"
                    onClick={() => handleHelpfulClick("r1")}
                  >
                    <span>👍 Helpful</span>
                    <span>({helpfulCounts.r1})</span>
                  </button>
                </div>
              </div>

              {/* Review 2 */}
              <div className="customer-review-card">
                <div>
                  <div className="reviewer-header-row">
                    <div className="reviewer-info-left">
                      <img
                        src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80"
                        alt="Marcus Vance"
                        className="reviewer-avatar-img"
                      />
                      <div>
                        <div className="reviewer-name">Marcus Vance</div>
                        <div className="verified-buyer-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Verified Purchase</span>
                        </div>
                      </div>
                    </div>
                    <span className="review-date-text">5 days ago</span>
                  </div>

                  <div className="review-card-stars">★★★★★</div>
                  <h4 className="review-card-title">Stunning finish and super fast shipping.</h4>
                  <p className="review-card-body">
                    I bought this as an anniversary gift for my partner. The stitching is immaculate and the presentation packaging was top tier. She uses it every day for work and always gets compliments.
                  </p>

                  <div className="review-photos-grid">
                    <img
                      src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=200&auto=format&fit=crop&q=80"
                      alt="Customer review photo packaging"
                      className="review-photo-thumb"
                    />
                  </div>
                </div>

                <div className="review-footer-row">
                  <span>Color: Noir Black • Size: Large</span>
                  <button
                    className="helpful-btn"
                    onClick={() => handleHelpfulClick("r2")}
                  >
                    <span>👍 Helpful</span>
                    <span>({helpfulCounts.r2})</span>
                  </button>
                </div>
              </div>

              {/* Review 3 */}
              <div className="customer-review-card">
                <div>
                  <div className="reviewer-header-row">
                    <div className="reviewer-info-left">
                      <img
                        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                        alt="Elena Rostova"
                        className="reviewer-avatar-img"
                      />
                      <div>
                        <div className="reviewer-name">Elena Rostova</div>
                        <div className="verified-buyer-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Verified Purchase</span>
                        </div>
                      </div>
                    </div>
                    <span className="review-date-text">1 week ago</span>
                  </div>

                  <div className="review-card-stars">★★★★★</div>
                  <h4 className="review-card-title">Durable, elegant, and looks even better in person.</h4>
                  <p className="review-card-body">
                    I was skeptical buying leather accessories online, but this exceeded all pictures. Structurally solid, doesn't sag when loaded, and the internal zipper compartments keep everything organized.
                  </p>

                  <div className="merchant-response-box">
                    <div className="merchant-response-author">Response from Store Owner:</div>
                    Thrilled to hear this Elena! Thank you for trusting us with your daily carry!
                  </div>
                </div>

                <div className="review-footer-row">
                  <span>Color: Olive Green • Size: Medium</span>
                  <button
                    className="helpful-btn"
                    onClick={() => handleHelpfulClick("r3")}
                  >
                    <span>👍 Helpful</span>
                    <span>({helpfulCounts.r3})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Bar: Load More Button */}
            <div className="show-more-reviews-bar">
              <button
                className="btn-load-more"
                onClick={() => alert("Showing all 2,548 reviews loaded seamlessly!")}
              >
                Load More Reviews (2,545 Remaining) ↓
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Key Benefits Section */}
      <section className="benefits-section" id="benefits">
        <div className="container benefits-layout-grid">
          {/* Left Column */}
          <div className="benefits-left-col">
            <div className="pill-tag" style={{ background: "#e8f7ee", color: "#064e3b" }}>
              ◎ KEY BENEFITS
            </div>
            <h2>More Trust. More Sales. Less Effort.</h2>
            <p>
              Build credibility with real customer feedback, showcase social proof and save hours of manual work — all from one simple app.
            </p>
          </div>

          {/* Right Column: 2x2 Grid */}
          <div className="benefits-2x2">
            <div className="benefit-sub-item">
              <div className="benefit-circle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <div>
                <h4>Build shopper confidence</h4>
                <p>Real reviews and trust badges help shoppers buy with trust.</p>
              </div>
            </div>

            <div className="benefit-sub-item">
              <div className="benefit-circle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </div>
              <div>
                <h4>Increase conversion rates</h4>
                <p>Social proof reduces hesitation and drives more sales.</p>
              </div>
            </div>

            <div className="benefit-sub-item">
              <div className="benefit-circle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h4>Save time &amp; automate</h4>
                <p>AI drafts and bulk import streamline your workflow.</p>
              </div>
            </div>

            <div className="benefit-sub-item">
              <div className="benefit-circle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

      {/* 5. See The Difference (From Empty to Engaging) */}
      <section className="difference-section">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">SEE THE DIFFERENCE</span>
            <h2 className="section-main-title">From Empty to Engaging</h2>
            <p className="section-desc-sub">
              Turn your store into a trust-building machine with reviews, popups and badges.
            </p>
          </div>

          <div className="comparison-cards-row">
            {/* Card Left: Without the App */}
            <div className="comparison-card">
              <span className="comp-badge-pill without">Without the App</span>
              <div className="comp-browser-top">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="comp-content-grid">
                <div className="comp-img-placeholder">
                  <img
                    src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=300&q=80"
                    alt="Product"
                  />
                </div>
                <div>
                  <div className="skeleton-line" style={{ width: "85%" }} />
                  <div className="skeleton-line" style={{ width: "65%" }} />
                  <div className="skeleton-line" style={{ width: "45%" }} />
                  <div className="empty-stars-text">No reviews yet</div>
                  <div style={{ color: "#cbd5e1", fontSize: "14px", letterSpacing: "2px", marginTop: "4px" }}>
                    ☆☆☆☆☆
                  </div>
                </div>
              </div>
            </div>

            {/* Center Arrow */}
            <div className="comparison-arrow">➔</div>

            {/* Card Right: With the App */}
            <div className="comparison-card">
              <span className="comp-badge-pill with">With the App</span>
              <div className="comp-browser-top">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="comp-content-grid">
                <div className="comp-img-placeholder">
                  <img
                    src="https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=300&q=80"
                    alt="Product"
                  />
                  <div className="thumbnails-row">
                    <span className="thumb-box" style={{ background: "#e8ded4" }} />
                    <span className="thumb-box" style={{ background: "#cbb7a1" }} />
                    <span className="thumb-box" style={{ background: "#6c8074" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "2px" }}>★★★★★</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0a281e", margin: "2px 0 6px 0" }}>
                    4.8 (2.5k reviews)
                  </div>
                  <div className="verified-pill">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Verified Purchase
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "8px 10px", marginTop: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&q=80"
                      alt="Customer"
                      style={{ width: "22px", height: "22px", borderRadius: "50%" }}
                    />
                    <div>
                      <div style={{ color: "#f59e0b", fontSize: "9px" }}>★★★★★</div>
                      <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#065f46" }}>Amazing quality!</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. How It Works (3 Steps) */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">HOW IT WORKS</span>
            <h2 className="section-main-title">Get Started in 3 Simple Steps</h2>
          </div>

          <div className="steps-flex-row">
            {/* Step 1 */}
            <div className="step-box-card">
              <div className="step-icon-bubble">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="step-content-area">
                <div className="step-title">Install the app</div>
                <div className="step-desc">
                  Add the app from the Shopify app store.
                </div>
              </div>
            </div>

            <div className="step-arrow-divider">➔</div>

            {/* Step 2 */}
            <div className="step-box-card">
              <div className="step-icon-bubble">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div className="step-content-area">
                <div className="step-title">Configure &amp; customize</div>
                <div className="step-desc">
                  Set up AI, import reviews and style your popups.
                </div>
              </div>
            </div>

            <div className="step-arrow-divider">➔</div>

            {/* Step 3 */}
            <div className="step-box-card">
              <div className="step-icon-bubble">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </div>
              <div className="step-content-area">
                <div className="step-title">Showcase &amp; grow</div>
                <div className="step-desc">
                  Display reviews, popups and badges on your store.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section className="faq-section" id="faq">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">QUESTIONS &amp; ANSWERS</span>
            <h2 className="section-main-title">Frequently Asked Questions</h2>
          </div>

          <div className="faq-list">
            {[
              {
                q: "Does this app slow down my Shopify store?",
                a: "No. The widget loads asynchronously through high-speed edge CDNs with under 30ms latency, ensuring zero impact on your store's page speed and Lighthouse scores.",
              },
              {
                q: "Can I import reviews from AliExpress or CSV files?",
                a: "Yes! You can bulk-import existing reviews in seconds using our automatic column-mapping CSV importer, complete with star ratings and customer names.",
              },
              {
                q: "How does the AI review drafting work?",
                a: "Our built-in AI assistant uses OpenAI, Claude, or Gemini to suggest natural, contextually accurate review drafts based on your product title, features, and tone.",
              },
              {
                q: "Does it support Shopify Online Store 2.0 theme app extensions?",
                a: "Yes. It installs cleanly as a native Theme App Extension. You can enable or disable widgets directly inside your Shopify Theme Editor with zero code edits.",
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="faq-item"
                onClick={() => toggleFaq(idx)}
              >
                <div className="faq-question">
                  <span>{faq.q}</span>
                  <span className="faq-toggle-icon">
                    {openFaq === idx ? "−" : "+"}
                  </span>
                </div>
                {openFaq === idx && (
                  <div className="faq-answer">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Bottom CTA Banner (Ready to Build Trust and Drive More Sales?) */}
      <section className="bottom-cta-wrap">
        <div className="container">
          <div className="cta-dark-card">
            <div className="cta-left-content">
              <div className="cta-star-badge">★</div>
              <div>
                <h3 className="cta-title">
                  Ready to Build Trust and Drive More Sales?
                </h3>
                <p className="cta-sub">
                  Install the app today and start showcasing real reviews, popups and trust badges on your store.
                </p>
              </div>
            </div>

            <div className="cta-right-action">
              <button
                onClick={() => setIsInstallModalOpen(true)}
                className="btn-cta-white"
              >
                Install App →
              </button>
              <span className="cta-mini-caption">
                No coding. No hassle. Just results.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-row">
            <a href="/" onClick={scrollToTop} className="logo-wrap" style={{ textDecoration: "none" }}>
              <div className="logo-icon-box" style={{ width: "32px", height: "32px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div className="logo-text" style={{ fontSize: "15px" }}>
                AI Dynamic <span>Review System</span>
              </div>
            </a>

            <div className="footer-links">
              <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="footer-link">Features</a>
              <a href="#reviews-demo" onClick={(e) => scrollToSection(e, "reviews-demo")} className="footer-link">Product Reviews</a>
              <a href="#benefits" onClick={(e) => scrollToSection(e, "benefits")} className="footer-link">Benefits</a>
              <a href="#how-it-works" onClick={(e) => scrollToSection(e, "how-it-works")} className="footer-link">How It Works</a>
              <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="footer-link">FAQ</a>
              <a href="/privacy-policy" className="footer-link">Privacy Policy</a>
              <a href="mailto:developerr6620@gmail.com" className="footer-link">Support</a>
            </div>
          </div>

          <div className="copyright-text">
            © 2026 AI Dynamic Review System. All rights reserved.
          </div>
        </div>
      </footer>

      {/* 1-Click Install Modal */}
      {isInstallModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsInstallModalOpen(false)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setIsInstallModalOpen(false)}
            >
              ✕
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div className="logo-icon-box" style={{ width: "32px", height: "32px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <h3 className="modal-title" style={{ margin: 0 }}>Install on Shopify</h3>
            </div>
            <p className="modal-sub">
              Enter your Shopify store domain to connect your store and start showcasing reviews.
            </p>
            <form onSubmit={handleInstallSubmit}>
              <input
                type="text"
                placeholder="your-store-name.myshopify.com"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                className="modal-input-field"
                required
                autoFocus
              />
              <button type="submit" className="btn-modal-submit">
                Connect Store &amp; Continue →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Write a Review Modal */}
      {isWriteReviewModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setIsWriteReviewModalOpen(false);
            setReviewSubmitted(false);
          }}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px" }}
          >
            <button
              className="modal-close-btn"
              onClick={() => {
                setIsWriteReviewModalOpen(false);
                setReviewSubmitted(false);
              }}
            >
              ✕
            </button>

            {reviewSubmitted ? (
              <div style={{ textAlign: "center", padding: "20px 10px" }}>
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#e8f7ee",
                    color: "#059669",
                    fontSize: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px auto",
                  }}
                >
                  ✓
                </div>
                <h3 className="modal-title" style={{ marginBottom: "8px" }}>Review Submitted!</h3>
                <p className="modal-sub" style={{ marginBottom: "20px" }}>
                  Thank you for your feedback! Your review has been submitted for merchant verification and will appear on the store shortly.
                </p>
                <button
                  type="button"
                  className="btn-modal-submit"
                  onClick={() => {
                    setIsWriteReviewModalOpen(false);
                    setReviewSubmitted(false);
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <span style={{ fontSize: "22px" }}>✍</span>
                  <h3 className="modal-title" style={{ margin: 0 }}>Write a Review</h3>
                </div>
                <p className="modal-sub" style={{ marginBottom: "16px" }}>
                  Reviewing: <strong>The Luxe Everyday Leather Tote</strong>
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setReviewSubmitted(true);
                  }}
                >
                  {/* Rating Selector */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#0a281e", marginBottom: "6px" }}>
                      Overall Rating
                    </label>
                    <div style={{ display: "flex", gap: "6px", cursor: "pointer", fontSize: "24px" }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          onClick={() => setReviewRating(star)}
                          style={{
                            color: star <= reviewRating ? "#f59e0b" : "#cbd5e1",
                            transition: "color 0.15s ease",
                            userSelect: "none",
                          }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#0a281e", marginBottom: "6px" }}>
                        Your Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Jessica Taylor"
                        required
                        className="modal-input-field"
                        style={{ marginBottom: 0 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#0a281e", marginBottom: "6px" }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="jessica@example.com"
                        required
                        className="modal-input-field"
                        style={{ marginBottom: 0 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#0a281e", marginBottom: "6px" }}>
                      Review Headline
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Absolutely gorgeous leather quality!"
                      required
                      className="modal-input-field"
                      style={{ marginBottom: 0 }}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#0a281e", marginBottom: "6px" }}>
                      Detailed Feedback
                    </label>
                    <textarea
                      placeholder="Share details of your experience with size, durability, craftsmanship, and shipping..."
                      rows={4}
                      required
                      className="modal-input-field"
                      style={{ marginBottom: 0, resize: "vertical" }}
                    />
                  </div>

                  <button type="submit" className="btn-modal-submit">
                    Submit Verified Review →
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
