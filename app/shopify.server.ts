import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "28fbf0094946ed287e3db764e52796e5",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "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",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(",") || ["read_themes", "write_themes", "read_products", "read_orders"],
  appUrl: process.env.SHOPIFY_APP_URL || process.env.HOST || process.env.RENDER_EXTERNAL_URL || "https://shopify-dynamic-review-system.onrender.com",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
