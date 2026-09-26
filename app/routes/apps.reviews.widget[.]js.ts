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
  const existing = document.getElementById('rw-widget-style');
  if (!existing) {
    const link = document.createElement('link');
    link.id = 'rw-widget-style';
    link.rel = 'stylesheet';
    link.href = '/apps/reviews/widget.css?v=4.0';
    document.head.appendChild(link);
  }
})();
`;

  return new Response(autoCssInject + "\n" + content, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
