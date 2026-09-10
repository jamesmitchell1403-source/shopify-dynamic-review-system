import "@shopify/shopify-app-remix/adapters/node";
import {
    ApiVersion,
    AppDistribution,
    shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const basePrismaStorage = new PrismaSessionStorage(prisma);

// Memory fallback cache so sessions persist across requests
const memorySessionMap = new Map<string, Session>();

const autoSessionStorage = {
    async storeSession(session: Session): Promise<boolean> {
        memorySessionMap.set(session.id, session);
        try {
            await basePrismaStorage.storeSession(session);
        } catch (e) {
            console.error("Prisma storeSession warning:", e);
        }
        return true;
    },

    async loadSession(id: string): Promise<Session | undefined> {
        if (memorySessionMap.has(id)) {
            return memorySessionMap.get(id);
        }
        try {
            const session = await basePrismaStorage.loadSession(id);
            if (session && session.accessToken) {
                memorySessionMap.set(id, session);
                return session;
            }
        } catch (e) {
            console.error("Prisma loadSession warning:", e);
        }
        return undefined;
    },

    async deleteSession(id: string): Promise<boolean> {
        memorySessionMap.delete(id);
        try {
            await basePrismaStorage.deleteSession(id);
        } catch (e) { }
        return true;
    },

    async deleteSessions(ids: string[]): Promise<boolean> {
        for (const id of ids) {
            memorySessionMap.delete(id);
        }
        try {
            await basePrismaStorage.deleteSessions(ids);
        } catch (e) { }
        return true;
    },

    async findSessionsByShop(shop: string): Promise<Session[]> {
        try {
            const sessions = await basePrismaStorage.findSessionsByShop(shop);
            if (sessions && sessions.length > 0) return sessions;
        } catch (e) { }

        const memorySessions = Array.from(memorySessionMap.values()).filter(
            (s) => s.shop === shop
        );
        return memorySessions;
    },
};

const shopify = shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY || "28fbf0094946ed287e3db764e52796e5",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "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",
    apiVersion: ApiVersion.January25,
    scopes: process.env.SCOPES?.split(",") || ["read_themes", "write_themes", "read_products", "read_orders"],
    appUrl: process.env.SHOPIFY_APP_URL || process.env.HOST || process.env.RENDER_EXTERNAL_URL || "https://shopify-dynamic-review-system.onrender.com",
    authPathPrefix: "/auth",
    sessionStorage: autoSessionStorage as any,
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
