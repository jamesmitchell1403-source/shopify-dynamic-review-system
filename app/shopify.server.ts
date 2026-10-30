import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

process.env.SCOPES = "read_themes,write_themes,read_products,read_orders";

const appUrl =
  process.env.SHOPIFY_APP_URL ||
  process.env.HOST ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://productreview.zooq.app";

const sharedConfig = {
  apiVersion: ApiVersion.January25,
  scopes: ["read_themes", "write_themes", "read_products", "read_orders"],
  appUrl,
  authPathPrefix: "/auth",
  distribution: AppDistribution.AppStore,
  sessionStorage: new PrismaSessionStorage(prisma) as any,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
};

const apiKey1 = process.env.SHOPIFY_API_KEY || "";
const apiSecret1 = process.env.SHOPIFY_API_SECRET || "";
const apiKey2 = process.env.SHOPIFY_API_KEY_2 || "";
const apiSecret2 = process.env.SHOPIFY_API_SECRET_2 || "";

if (!apiKey1 || !apiSecret1) {
  throw new Error(
    "Missing SHOPIFY_API_KEY / SHOPIFY_API_SECRET. Set them in .env before starting the app.",
  );
}

const shopifyInstance1 = shopifyApp({
  ...sharedConfig,
  apiKey: apiKey1,
  apiSecretKey: apiSecret1,
});

// Only create a second Shopify app when both credentials are present.
// Empty keys crash boot: "Missing values for: apiSecretKey, apiKey"
const shopifyInstance2 =
  apiKey2 && apiSecret2
    ? shopifyApp({
        ...sharedConfig,
        apiKey: apiKey2,
        apiSecretKey: apiSecret2,
      })
    : shopifyInstance1;

const hasSecondApp = shopifyInstance2 !== shopifyInstance1;

function getShopifyApp(request?: Request) {
  if (!hasSecondApp || !request) {
    return shopifyInstance1;
  }

  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const payloadJson = Buffer.from(token.split(".")[1], "base64").toString(
        "utf-8",
      );
      const payload = JSON.parse(payloadJson);
      const dest = payload.dest || payload.aud || "";
      if (
        dest.includes("james-practice") ||
        dest.includes("28fbf0094946ed287e3db764e52796e5")
      ) {
        return shopifyInstance1;
      }
      if (
        dest.includes("develops-test-store") ||
        dest.includes("d97376e1be723a9166b7ec705c55c610")
      ) {
        return shopifyInstance2;
      }
    } catch {
      // Fallback to URL inspection
    }
  }

  const url = new URL(request.url);
  const shop =
    url.searchParams.get("shop") || request.headers.get("referer") || "";
  if (shop.includes("james-practice")) {
    return shopifyInstance1;
  }

  return shopifyInstance2;
}

export default shopifyInstance1;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = (
  request: Request,
  headers: Headers,
) => getShopifyApp(request).addDocumentResponseHeaders(request, headers);
export const authenticate = {
  admin: async (request: Request) => {
    const primaryApp = getShopifyApp(request);
    if (!hasSecondApp) {
      return primaryApp.authenticate.admin(request);
    }
    const fallbackApp =
      primaryApp === shopifyInstance1 ? shopifyInstance2 : shopifyInstance1;
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
  public: shopifyInstance1.authenticate.public,
  webhook: async (request: Request) => {
    if (!hasSecondApp) {
      return shopifyInstance1.authenticate.webhook(request);
    }
    const clone = request.clone();
    try {
      return await shopifyInstance1.authenticate.webhook(request);
    } catch {
      return await shopifyInstance2.authenticate.webhook(clone);
    }
  },
};
export const unauthenticated = shopifyInstance1.unauthenticated;
export const login = shopifyInstance1.login;
export const registerWebhooks = shopifyInstance1.registerWebhooks;
export const sessionStorage = shopifyInstance1.sessionStorage;
