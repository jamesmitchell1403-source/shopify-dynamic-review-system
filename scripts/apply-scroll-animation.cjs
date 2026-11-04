const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "app", "routes", "_index", "route.tsx");
let content = fs.readFileSync(filePath, "utf8");

// 1. Add CSS for .animate-on-scroll
const animationCss = `
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
`;

content = content.replace(
  "/* Sharp, clean, polished headings across all sections */",
  animationCss + "\n        /* Sharp, clean, polished headings across all sections */"
);

// 2. Add IntersectionObserver in useEffect
const observerEffect = `
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
`;

content = content.replace(
  "  return (\n    <div className=\"landing-root\">",
  observerEffect + "\n  return (\n    <div className=\"landing-root\">"
);

// 3. Add .animate-on-scroll to all 8 sections
content = content.replace(
  '<section className="hero-section">',
  '<section className="hero-section animate-on-scroll">'
);

content = content.replace(
  '<section className="features-section" id="features">',
  '<section className="features-section animate-on-scroll" id="features">'
);

content = content.replace(
  '<section className="popup-showcase-section" id="review-popups">',
  '<section className="popup-showcase-section animate-on-scroll" id="review-popups">'
);

content = content.replace(
  '<section className="benefits-section" id="benefits">',
  '<section className="benefits-section animate-on-scroll" id="benefits">'
);

content = content.replace(
  '<section className="difference-section">',
  '<section className="difference-section animate-on-scroll">'
);

content = content.replace(
  '<section className="how-it-works-section" id="how-it-works">',
  '<section className="how-it-works-section animate-on-scroll" id="how-it-works">'
);

content = content.replace(
  '<section className="faq-section" id="faq">',
  '<section className="faq-section animate-on-scroll" id="faq">'
);

content = content.replace(
  '<section className="bottom-cta-wrap">',
  '<section className="bottom-cta-wrap animate-on-scroll">'
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully added slide-up scroll animation to all sections (header & footer untouched)!");

