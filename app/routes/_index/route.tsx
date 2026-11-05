import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useState, useEffect } from "react";

export const meta: MetaFunction = () => [
  { title: "Revio: AI Product Reviews - Showcase Reviews, Popups & Trust Badges" },
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

  
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Slide up animation on scroll for all sections (excludes header & footer)
    const elements = document.querySelectorAll(".animate-on-scroll");
    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

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
        #features, #review-popups, #benefits, #how-it-works, #faq {
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

        
        /* Smooth Scroll-Triggered Slide Up Animation (Sections only - Excludes Header & Footer) */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(48px);
          transition: opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1), transform 0.85s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform;
        }
        .animate-on-scroll.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-on-scroll {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
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
          text-decoration: none;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .logo-wrap:hover {
          opacity: 0.92;
          transform: scale(1.02);
        }
        .logo-img {
          width: 100px;
          height: auto;
          border-radius: 14px;
          object-fit: cover;
          display: block;
          flex-shrink: 0;
          box-shadow: 0 4px 14px rgba(6, 78, 59, 0.16);
        }
        .logo-img.footer-logo-img {
          width: 100px;
          height: auto;
          border-radius: 14px;
          box-shadow: 0 3px 10px rgba(6, 78, 59, 0.14);
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
          line-height: 1.2;
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
          min-width: 24px;
          min-height: 24px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          margin-left: -8px;
          background: #cbd5e1;
          object-fit: cover;
          flex-shrink: 0;
          aspect-ratio: 1 / 1;
          box-sizing: border-box;
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

        
        /* SECTION: Product Review Popups Showcase */
        .popup-showcase-section {
          padding: 85px 0;
          background: #ffffff;
          border-top: 1px solid #e8f1eb;
          border-bottom: 1px solid #e8f1eb;
        }
        .popups-grid-2x2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 26px;
          margin-bottom: 36px;
        }
        .popup-showcase-card {
          background: #ffffff;
          border: 1px solid #d5e5db;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 8px 24px rgba(6, 78, 59, 0.04);
          position: relative;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .popup-showcase-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 36px rgba(6, 78, 59, 0.08);
          border-color: #a7f3d0;
        }
        .popup-card-style-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #e8f7ee;
          color: #065f46;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 6px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .popup-page-scope-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #f1f5f3;
          color: #4a6357;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 6px;
          float: right;
        }
        .popup-preview-box {
          background: #fbfdfc;
          border: 1.5px solid #d5e5db;
          border-radius: 16px;
          padding: 20px;
          margin-top: 16px;
          margin-bottom: 14px;
        }
        .popup-scope-banner {
          background: #e8f7ee;
          border: 1.5px solid #a7f3d0;
          border-radius: 16px;
          padding: 22px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
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
        .modal-logo-img {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          object-fit: cover;
          display: block;
          flex-shrink: 0;
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
          .logo-img { width: 90px; height: auto; }
          .hero-grid { grid-template-columns: 1fr; gap: 40px; }
          .features-grid-3x2 { grid-template-columns: 1fr; }
          .popups-grid-2x2 { grid-template-columns: 1fr; }
          .benefits-layout-grid { grid-template-columns: 1fr; gap: 36px; }
          .comparison-cards-row { flex-direction: column; }
          .steps-flex-row { flex-direction: column; }
          .step-arrow-divider { transform: rotate(90deg); margin: 6px 0; }
          .cta-dark-card { flex-direction: column; text-align: center; padding: 36px 24px; }
          .cta-left-content { flex-direction: column; text-align: center; }
          .hero-title { font-size: 36px; }
        }

        @media (max-width: 480px) {
          .logo-img { width: 80px; height: auto; }
        }
      `}</style>

      {/* Decorative background glow elements */}
      <div className="bg-glow-1" />
      <div className="bg-glow-2" />

      {/* 1. Header (Navbar) */}
      <header className="site-header">
        <div className="container nav-wrapper">
          <a href="/" onClick={scrollToTop} className="logo-wrap" aria-label="Revio: AI Product Reviews">
            <img
              src="/app-logo.png"
              alt="Revio: AI Product Reviews"
              className="logo-img"
              width="100"
              height="100"
            />
          </a>

          <nav className="nav-menu">
            <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="nav-link">Features</a>
            <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="nav-link">Review Popups</a>
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
            <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="mobile-nav-link">Review Popups</a>
            <a href="#benefits" onClick={(e) => scrollToSection(e, "benefits")} className="mobile-nav-link">Benefits</a>
            <a href="#how-it-works" onClick={(e) => scrollToSection(e, "how-it-works")} className="mobile-nav-link">How It Works</a>
            <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="mobile-nav-link">FAQ</a>
            <a href="/privacy-policy" className="mobile-nav-link">Privacy Policy</a>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section className="hero-section animate-on-scroll">
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
      <section className="features-section animate-on-scroll" id="features">
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

      
      {/* 4. Product Review Popups Showcase */}
      <section className="popup-showcase-section animate-on-scroll" id="review-popups">
        <div className="container">
          <div className="section-header-center">
            <span className="section-tagline">— SOCIAL PROOF IN ACTION —</span>
            <h2 className="section-main-title">Real-Time Review Popups on Your Product Pages</h2>
            <p className="section-desc-sub">
              Display verified customer reviews, star ratings, and trust badges as non-intrusive popups. Proven to reduce hesitation and turn product page visitors into confident buyers.
            </p>
          </div>

          <div className="popups-grid-2x2">
            {/* Popup Style 1: Standard Review Card */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 1 • DETAIL CARD</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", borderBottom: "1px solid #eef4f0", paddingBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#059669", display: "inline-block" }} />
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#065f46", letterSpacing: "0.5px" }}>NEW PRODUCT REVIEW</span>
                  </div>
                  <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 500 }}>2 mins ago</span>
                </div>

                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      minWidth: "48px",
                      minHeight: "48px",
                      maxWidth: "48px",
                      maxHeight: "48px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      aspectRatio: "1 / 1",
                      border: "1.5px solid #a7f3d0",
                      background: "#e8f7ee",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                    }}
                  >
                    <img
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
                      alt="Sarah Jenkins"
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                        display: "block",
                        aspectRatio: "1 / 1",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "2px" }}>
                      <span style={{ fontSize: "14.5px", fontWeight: 800, color: "#0a281e" }}>Sarah Jenkins</span>
                      <span style={{ background: "#e8f7ee", color: "#059669", fontSize: "10.5px", fontWeight: 750, padding: "2px 8px", borderRadius: "4px" }}>
                        ✓ Verified Purchase
                      </span>
                    </div>
                    <div style={{ color: "#f59e0b", fontSize: "13px", letterSpacing: "1px", marginBottom: "6px" }}>★★★★★</div>
                    <p style={{ fontSize: "13px", color: "#2d4a3e", lineHeight: 1.45, margin: 0 }}>
                      "The craftsmanship is stunning! Fits my 15-inch laptop perfectly and arrived in 2 days."
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #eef4f0", fontSize: "11.5px", color: "#556d62", display: "flex", justifyContent: "space-between" }}>
                  <span>Product: <strong style={{ color: "#064e3b" }}>The Luxe Leather Tote</strong></span>
                  <span style={{ color: "#059669", fontWeight: 750 }}>5/5 Stars</span>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Highlighting individual verified customer experiences, product photos, and rating quotes.
              </div>
            </div>

            {/* Popup Style 2: Sleek Notification Toast */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 2 • HEADER TOAST</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #064e3b" }}>
                <div style={{ background: "#064e3b", color: "#ffffff", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                    <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.5px" }}>LIVE REVIEW NOTIFICATION</span>
                  </div>
                  <span style={{ fontSize: "10.5px", color: "#a7f3d0", fontWeight: 700 }}>Verified Buyer</span>
                </div>

                <div style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "#ecfdf5", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "20px" }}>👜</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#0a281e", marginBottom: "2px" }}>
                      Marcus V. <span style={{ fontSize: "11.5px", fontWeight: 500, color: "#64748b" }}>from Chicago • 4 mins ago</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 700, marginBottom: "3px" }}>
                      ★★★★★ <span style={{ color: "#2d4a3e", fontWeight: 600 }}>"Stunning finish and super fast shipping!"</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#059669", fontWeight: 750 }}>
                      ✓ Verified Purchase of Leather Tote
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> High-impact, eye-catching social proof toasts that grab buyer attention subtly near the checkout button.
              </div>
            </div>

            {/* Popup Style 3: Minimal Floating Pill */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 3 • MINIMAL PILL</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ borderRadius: "999px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#ecfdf5", border: "1.5px solid #a7f3d0", color: "#059669", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  ER
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0a281e" }}>Elena R. just reviewed this product</div>
                  <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 700 }}>
                    ★★★★★ <span style={{ color: "#4a6357", fontWeight: 500 }}>"Durable, elegant and looks even better in person."</span>
                  </div>
                </div>
                <span style={{ fontSize: "10.5px", color: "#059669", fontWeight: 750, background: "#e8f7ee", padding: "3px 8px", borderRadius: "4px" }}>
                  Verified
                </span>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Modern, minimalist stores that want clean, lightweight social proof without obscuring product photos.
              </div>
            </div>

            {/* Popup Style 4: Store Trust & Aggregate Rating Badge */}
            <div className="popup-showcase-card">
              <div>
                <span className="popup-card-style-badge">STYLE 4 • TRUST BADGE</span>
                <span className="popup-page-scope-pill">● Product Page Only</span>
              </div>

              <div className="popup-preview-box" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#e8f7ee", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#0a281e", marginBottom: "2px" }}>
                    Trusted by 10,000+ Happy Customers
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#f59e0b", fontWeight: 700, marginBottom: "2px" }}>
                    ★★★★★ <span style={{ color: "#4a6357", fontWeight: 600 }}>4.9 / 5.0 Average Product Rating</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                    ✓ 98% of buyers recommend this store
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "12.5px", color: "#4d665a", lineHeight: 1.4 }}>
                <strong>Best For:</strong> Establishing instant credibility and reassuring new visitors browsing higher-ticket items.
              </div>
            </div>
          </div>

          {/* Bottom Callout Banner */}
          <div className="popup-scope-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#064e3b", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "16px", flexShrink: 0 }}>
                ⚡
              </div>
              <div>
                <strong style={{ fontSize: "14.5px", color: "#064e3b", display: "block" }}>
                  Product-Page-Exclusive Triggering
                </strong>
                <span style={{ fontSize: "13px", color: "#2d4a3e" }}>
                  Our AI system detects the exact product the visitor is browsing, displaying matching reviews and verified ratings on that product page only.
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="btn-install-header"
              style={{ background: "#064e3b", color: "#ffffff", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Get Started Free →
            </button>
          </div>
        </div>
      </section>

      {/* 4. Key Benefits Section */}
      <section className="benefits-section animate-on-scroll" id="benefits">
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
      <section className="difference-section animate-on-scroll">
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
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        minWidth: "22px",
                        minHeight: "22px",
                        borderRadius: "50%",
                        overflow: "hidden",
                        flexShrink: 0,
                        aspectRatio: "1 / 1",
                        boxSizing: "border-box",
                      }}
                    >
                      <img
                        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&q=80"
                        alt="Customer"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }}
                      />
                    </div>
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
      <section className="how-it-works-section animate-on-scroll" id="how-it-works">
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
      <section className="faq-section animate-on-scroll" id="faq">
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
      <section className="bottom-cta-wrap animate-on-scroll">
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
            <a href="/" onClick={scrollToTop} className="logo-wrap" style={{ textDecoration: "none" }} aria-label="Revio: AI Product Reviews">
              <img
                src="/app-logo.png"
                alt="Revio: AI Product Reviews"
                className="logo-img footer-logo-img"
                width="100"
                height="100"
              />
            </a>

            <div className="footer-links">
              <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="footer-link">Features</a>
              <a href="#review-popups" onClick={(e) => scrollToSection(e, "review-popups")} className="footer-link">Review Popups</a>
              <a href="#benefits" onClick={(e) => scrollToSection(e, "benefits")} className="footer-link">Benefits</a>
              <a href="#how-it-works" onClick={(e) => scrollToSection(e, "how-it-works")} className="footer-link">How It Works</a>
              <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="footer-link">FAQ</a>
              <a href="/privacy-policy" className="footer-link">Privacy Policy</a>
              <a href="mailto:developerr6620@gmail.com" className="footer-link">Support</a>
            </div>
          </div>

          <div className="copyright-text">
            © 2026 Revio: AI Product Reviews. All rights reserved.
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
              <img
                src="/app-logo.png"
                alt="Revio: AI Product Reviews Logo"
                className="modal-logo-img"
                width="36"
                height="36"
              />
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
    </div>
  );
}
