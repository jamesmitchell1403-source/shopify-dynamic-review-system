import fs from "fs";
import path from "path";
import { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const filePath = path.join(process.cwd(), "extensions", "dynamic-review-widget", "assets", "review-widget.js");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    content = "// Widget script missing";
  }

  const autoCssInject = `
(function() {
  if (!document.getElementById('rw-widget-style')) {
    const link = document.createElement('link');
    link.id = 'rw-widget-style';
    link.rel = 'stylesheet';
    link.href = 'https://shopify-dynamic-review-system.onrender.com/apps/reviews/widget.css';
    document.head.appendChild(link);
  }
})();
`;

  return new Response(autoCssInject + "\n" + content, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
