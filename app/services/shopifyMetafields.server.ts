export interface ExpiredKeyItem {
  key: string;
  provider: "claude" | "gemini" | "openai";
  planType: "free" | "paid";
  addedAt: string;
  expiredAt: string;
}

export interface SavedAIKeys {
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
  anthropicKeyAddedAt?: string | null;
  geminiKeyAddedAt?: string | null;
  openaiKeyAddedAt?: string | null;
  anthropicPlanType?: "free" | "paid";
  geminiPlanType?: "free" | "paid";
  openaiPlanType?: "free" | "paid";
  aiRotationDays?: number | null;
  expiredKeys?: ExpiredKeyItem[];
  expiredNotices?: {
    claude?: string | null;
    gemini?: string | null;
    openai?: string | null;
  };
}

export async function getShopAIKeysFromShopify(admin: any): Promise<SavedAIKeys | null> {
  try {
    const res = await admin.graphql(`
      #graphql
      query getShopAIKeys {
        shop {
          metafield(namespace: "ai_dynamic_reviews", key: "api_keys") {
            value
          }
        }
      }
    `);
    const jsonRes = (await res.json()) as any;
    const rawValue = jsonRes.data?.shop?.metafield?.value;
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      return {
        anthropicApiKey: parsed.anthropicApiKey || null,
        geminiApiKey: parsed.geminiApiKey || null,
        openaiApiKey: parsed.openaiApiKey || null,
        anthropicKeyAddedAt: parsed.anthropicKeyAddedAt || null,
        geminiKeyAddedAt: parsed.geminiKeyAddedAt || null,
        openaiKeyAddedAt: parsed.openaiKeyAddedAt || null,
        anthropicPlanType: parsed.anthropicPlanType || "free",
        geminiPlanType: parsed.geminiPlanType || "free",
        openaiPlanType: parsed.openaiPlanType || "free",
        aiRotationDays: typeof parsed.aiRotationDays === "number" ? parsed.aiRotationDays : (parsed.aiRotationDays ? parseInt(parsed.aiRotationDays, 10) : 90),
        expiredKeys: Array.isArray(parsed.expiredKeys) ? parsed.expiredKeys : [],
        expiredNotices: parsed.expiredNotices || {},
      };
    }
  } catch (err) {
    console.warn("Failed to read Shopify Shop Metafields:", err);
  }
  return null;
}

export async function saveShopAIKeysToShopify(
  admin: any,
  keys: SavedAIKeys
): Promise<boolean> {
  try {
    // 1. Get Shop GID
    const shopRes = await admin.graphql(`
      #graphql
      query getShopId {
        shop {
          id
        }
      }
    `);
    const shopJson = (await shopRes.json()) as any;
    const shopGid = shopJson.data?.shop?.id;
    if (!shopGid) return false;

    // 2. Fetch existing keys to merge if omitted
    const existing = await getShopAIKeysFromShopify(admin);

    const mergedKeys = {
      anthropicApiKey: keys.anthropicApiKey !== undefined ? keys.anthropicApiKey : (existing?.anthropicApiKey || ""),
      geminiApiKey: keys.geminiApiKey !== undefined ? keys.geminiApiKey : (existing?.geminiApiKey || ""),
      openaiApiKey: keys.openaiApiKey !== undefined ? keys.openaiApiKey : (existing?.openaiApiKey || ""),
      anthropicKeyAddedAt: keys.anthropicKeyAddedAt !== undefined ? keys.anthropicKeyAddedAt : (existing?.anthropicKeyAddedAt || null),
      geminiKeyAddedAt: keys.geminiKeyAddedAt !== undefined ? keys.geminiKeyAddedAt : (existing?.geminiKeyAddedAt || null),
      openaiKeyAddedAt: keys.openaiKeyAddedAt !== undefined ? keys.openaiKeyAddedAt : (existing?.openaiKeyAddedAt || null),
      anthropicPlanType: keys.anthropicPlanType !== undefined ? keys.anthropicPlanType : (existing?.anthropicPlanType || "free"),
      geminiPlanType: keys.geminiPlanType !== undefined ? keys.geminiPlanType : (existing?.geminiPlanType || "free"),
      openaiPlanType: keys.openaiPlanType !== undefined ? keys.openaiPlanType : (existing?.openaiPlanType || "free"),
      aiRotationDays: keys.aiRotationDays !== undefined ? keys.aiRotationDays : (existing?.aiRotationDays || 90),
      expiredKeys: keys.expiredKeys !== undefined ? keys.expiredKeys : (existing?.expiredKeys || []),
      expiredNotices: keys.expiredNotices !== undefined ? keys.expiredNotices : (existing?.expiredNotices || {}),
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
    return true;
  } catch (err) {
    console.error("Failed to save Shopify Shop Metafields:", err);
    return false;
  }
}
