import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] Received ${topic} for shop ${shop}:`, JSON.stringify(payload));

  try {
    await db.session.deleteMany({ where: { shop } });
  } catch (err) {
    console.warn("[GDPR] Shop redact error:", err);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

