/**
 * ADMIN UTILITY ENDPOINT: Clear sessions for a shop
 * URL: /api/admin/clear-sessions?shop=SHOP_DOMAIN&secret=SECRET
 *
 * This clears the stale/expired Shopify session stored in the production DB.
 * Protected by a secret token so it can only be called by the app admin.
 *
 * Usage:
 *   GET https://productreview.zooq.app/api/admin/clear-sessions?shop=james-practice-tiwriyta.myshopify.com&secret=revio-admin-clear-2024
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

const ADMIN_SECRET = process.env.ADMIN_CLEAR_SECRET || "revio-admin-clear-2024";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const secret = url.searchParams.get("secret");
  const action = url.searchParams.get("action") || "clear";

  // Security check
  if (secret !== ADMIN_SECRET) {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  if (action === "diag") {
    return json({
      success: true,
      diag: (globalThis as any).__AI_GEN_DIAG__ || null,
      env: {
        SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "NOT_SET",
        SHOPIFY_API_KEY_2: process.env.SHOPIFY_API_KEY_2 || "NOT_SET",
        SHOPIFY_API_SECRET_SET: Boolean(process.env.SHOPIFY_API_SECRET),
        SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "NOT_SET",
        SCOPES: process.env.SCOPES || "NOT_SET",
      },
      serverTime: new Date().toISOString(),
    });
  }

  if (action === "purge_mock_data") {
    const deletedHistory = await db.productImportHistory.deleteMany({
      where: {
        OR: [
          { productTitle: { contains: "Cotton Towel" } },
          { productTitle: { contains: "Luminous" } },
        ],
      },
    });
    return json({
      success: true,
      message: `Purged ${deletedHistory.count} mock product import history items.`,
      deletedCount: deletedHistory.count,
    });
  }

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  try {

    if (action === "list") {
      // List all sessions or sessions for the shop
      const whereClause = shop === "all" ? {} : { shop };
      const sessions = await db.session.findMany({
        where: whereClause,
        select: {
          id: true,
          shop: true,
          state: true,
          isOnline: true,
          scope: true,
          expires: true,
          accessToken: true,
        },
      });
      return json({
        success: true,
        shop,
        count: sessions.length,
        env: {
          SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "NOT_SET",
          SHOPIFY_API_KEY_2: process.env.SHOPIFY_API_KEY_2 || "NOT_SET",
          SHOPIFY_API_SECRET_SET: Boolean(process.env.SHOPIFY_API_SECRET),
          SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "NOT_SET",
          SCOPES: process.env.SCOPES || "NOT_SET",
        },
        sessions: sessions.map((s) => ({
          ...s,
          accessToken: s.accessToken ? `${s.accessToken.substring(0, 10)}...` : null,
        })),
        allShops: (await db.session.findMany({ select: { shop: true }, distinct: ["shop"] })).map((s) => s.shop),
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "clear") {
      // Delete all sessions for the shop
      const result = await db.session.deleteMany({ where: { shop } });
      console.log(`[ADMIN] Cleared ${result.count} sessions for ${shop}`);
      return json({
        success: true,
        message: `Cleared ${result.count} session(s) for ${shop}. The app will re-authenticate on next visit.`,
        shop,
        deletedCount: result.count,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === "clear_all") {
      // Clear ALL sessions (use with caution)
      const result = await db.session.deleteMany({});
      console.log(`[ADMIN] Cleared ALL ${result.count} sessions from DB`);
      return json({
        success: true,
        message: `Cleared ALL ${result.count} session(s) from database.`,
        deletedCount: result.count,
        serverTime: new Date().toISOString(),
      });
    }

    return json({ error: "Unknown action. Use ?action=list|clear|clear_all" }, { status: 400 });
  } catch (err: any) {
    console.error("[ADMIN] Session clear error:", err);
    return json({ error: err?.message || "Database error" }, { status: 500 });
  }
}

