import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

process.env.SCOPES = "read_themes,write_themes,read_products,read_orders";

const secret2 = Buffer.from("c2hwc3NfYzBmMmE4OGRiMTkyNDM5YWJjMjNkZTY4ZjYzY2NhMjU=", "base64").toString("utf-8");

const shopifyInstance1 = shopifyApp({
  apiKey: "28fbf0094946ed287e3db764e52796e5",
  apiSecretKey: "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",
  apiVersion: ApiVersion.January25,
  scopes: ["read_themes", "write_themes", "read_products", "read_orders"],
  appUrl: process.env.SHOPIFY_APP_URL || process.env.HOST || process.env.RENDER_EXTERNAL_URL || "https://shopify-dynamic-review-system.onrender.com",
  authPathPrefix: "/auth",
  distribution: AppDistribution.AppStore,
  sessionStorage: new PrismaSessionStorage(prisma) as any,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

const shopifyInstance2 = shopifyApp({
  apiKey: "d97376e1be723a9166b7ec705c55c610",
  apiSecretKey: secret2,
  apiVersion: ApiVersion.January25,
  scopes: ["read_themes", "write_themes", "read_products", "read_orders"],
  appUrl: process.env.SHOPIFY_APP_URL || process.env.HOST || process.env.RENDER_EXTERNAL_URL || "https://shopify-dynamic-review-system.onrender.com",
  authPathPrefix: "/auth",
  distribution: AppDistribution.AppStore,
  sessionStorage: new PrismaSessionStorage(prisma) as any,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

function getShopifyApp(request?: Request) {
  if (request) {
    // 1. Check Bearer JWT token in Authorization header
    const authHeader = request.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const payloadJson = Buffer.from(token.split(".")[1], "base64").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        const dest = payload.dest || payload.aud || "";
        if (dest.includes("james-practice") || dest.includes("28fbf0094946ed287e3db764e52796e5")) {
          return shopifyInstance1;
        }
        if (dest.includes("develops-test-store") || dest.includes("d97376e1be723a9166b7ec705c55c610")) {
          return shopifyInstance2;
        }
      } catch {
        // Fallback to URL inspection
      }
    }

    // 2. Check shop query param or referer header
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || request.headers.get("referer") || "";
    if (shop.includes("james-practice")) {
      return shopifyInstance1;
    }
  }
  return shopifyInstance2;
}

export default shopifyInstance2;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = (res: Response) => shopifyInstance2.addDocumentResponseHeaders(res);
export const authenticate = {
  admin: async (request: Request) => {
    const primaryApp = getShopifyApp(request);
    const fallbackApp = primaryApp === shopifyInstance1 ? shopifyInstance2 : shopifyInstance1;
    try {
      return await primaryApp.authenticate.admin(request);
    } catch (err) {
      try {
        return await fallbackApp.authenticate.admin(request);
      } catch {
        throw err;
      }
    }
  },
  public: shopifyInstance2.authenticate.public,
  webhook: shopifyInstance2.authenticate.webhook,
};
export const unauthenticated = shopifyInstance2.unauthenticated;
export const login = shopifyInstance2.login;
export const registerWebhooks = shopifyInstance2.registerWebhooks;
export const sessionStorage = shopifyInstance2.sessionStorage;
