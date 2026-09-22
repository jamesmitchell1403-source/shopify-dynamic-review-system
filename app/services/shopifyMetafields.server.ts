export interface SavedAIKeys {
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
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
