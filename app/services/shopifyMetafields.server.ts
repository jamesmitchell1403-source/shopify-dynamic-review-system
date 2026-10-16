export interface SavedAIKeys {
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
  defaultAiProvider?: string | null;
  fallbackAiProvider?: string | null;
}

// In-memory cache for AI keys with 5-minute TTL to eliminate GraphQL overhead on page navigation & revalidation
interface CachedAIKeys {
  keys: SavedAIKeys | null;
  expiresAt: number;
}
const aiKeysMemoryCache = new Map<string, CachedAIKeys>();
const AI_KEYS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedShopGid: string | null = null;

export async function getShopAIKeysFromShopify(admin: any, cacheKey: string = "default"): Promise<SavedAIKeys | null> {
  const now = Date.now();
  const cached = aiKeysMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }

  try {
    const res = await admin.graphql(`
      #graphql
      query getShopAIKeys {
        shop {
          id
          metafield(namespace: "ai_dynamic_reviews", key: "api_keys") {
            value
          }
        }
      }
    `);
    const jsonRes = (await res.json()) as any;
    if (jsonRes.data?.shop?.id) {
      cachedShopGid = jsonRes.data.shop.id;
    }
    const rawValue = jsonRes.data?.shop?.metafield?.value;
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      const keys: SavedAIKeys = {
        anthropicApiKey: parsed.anthropicApiKey || null,
        geminiApiKey: parsed.geminiApiKey || null,
        openaiApiKey: parsed.openaiApiKey || null,
        defaultAiProvider: parsed.defaultAiProvider || null,
        fallbackAiProvider: parsed.fallbackAiProvider || null,
      };
      aiKeysMemoryCache.set(cacheKey, { keys, expiresAt: now + AI_KEYS_CACHE_TTL });
      return keys;
    }
    aiKeysMemoryCache.set(cacheKey, { keys: null, expiresAt: now + AI_KEYS_CACHE_TTL });
  } catch (err) {
    console.warn("Failed to read Shopify Shop Metafields:", err);
  }
  return null;
}

export async function saveShopAIKeysToShopify(
  admin: any,
  keys: SavedAIKeys,
  cacheKey: string = "default"
): Promise<boolean> {
  try {
    // 1. Get Shop GID (reuse cached if available)
    let shopGid = cachedShopGid;
    if (!shopGid) {
      const shopRes = await admin.graphql(`
        #graphql
        query getShopId {
          shop {
            id
          }
        }
      `);
      const shopJson = (await shopRes.json()) as any;
      shopGid = shopJson.data?.shop?.id;
      if (shopGid) cachedShopGid = shopGid;
    }
    if (!shopGid) return false;

    // 2. Fetch existing keys to merge if omitted
    const existing = await getShopAIKeysFromShopify(admin, cacheKey);

    const mergedKeys = {
      anthropicApiKey: keys.anthropicApiKey !== undefined ? keys.anthropicApiKey : (existing?.anthropicApiKey || ""),
      geminiApiKey: keys.geminiApiKey !== undefined ? keys.geminiApiKey : (existing?.geminiApiKey || ""),
      openaiApiKey: keys.openaiApiKey !== undefined ? keys.openaiApiKey : (existing?.openaiApiKey || ""),
      defaultAiProvider: keys.defaultAiProvider !== undefined ? keys.defaultAiProvider : (existing?.defaultAiProvider || "gemini"),
      fallbackAiProvider: keys.fallbackAiProvider !== undefined ? keys.fallbackAiProvider : (existing?.fallbackAiProvider || "auto"),
    };

    const valueStr = JSON.stringify(mergedKeys);

    // 3. Save as Shop Metafield
    const setRes = await admin.graphql(`
      #graphql
      mutation setShopAIKeys($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "ai_dynamic_reviews",
            key: "api_keys",
            type: "json",
            value: valueStr,
          },
        ],
      },
    });

    const setJson = (await setRes.json()) as any;
    const errors = setJson.data?.metafieldsSet?.userErrors;
    if (errors && errors.length > 0) {
      console.error("Shopify Metafields set userErrors:", errors);
      return false;
    }
    aiKeysMemoryCache.set(cacheKey, { keys: mergedKeys, expiresAt: Date.now() + AI_KEYS_CACHE_TTL });
    return true;
  } catch (err) {
    console.error("Failed to save Shopify Shop Metafields:", err);
    return false;
  }
}
