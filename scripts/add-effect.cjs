const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "app", "routes", "_index", "route.tsx");
let content = fs.readFileSync(filePath, "utf8");

const effectCode = `
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
  "const toggleFaq = (index: number) => {",
  effectCode + "\n  const toggleFaq = (index: number) => {"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully added observer effect to route.tsx!");

