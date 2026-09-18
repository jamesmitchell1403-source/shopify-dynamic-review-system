import fs from "fs";
import path from "path";
import { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const filePath = path.join(process.cwd(), "extensions", "dynamic-review-widget", "assets", "review-widget.css");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    content = "/* Widget CSS missing */";
  }

  return new Response(content, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
