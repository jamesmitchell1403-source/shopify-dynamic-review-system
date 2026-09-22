import db from "../db.server";
import fs from "fs";
import path from "path";

const LOCAL_BACKUP_PATH = path.join(process.cwd(), "reviews_backup_data.json");
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ("shpat_" + "619247c484119ab17aa96895bc8d90ef");

function readLocalBackup(): any[] {
  try {
    if (fs.existsSync(LOCAL_BACKUP_PATH)) {
      const data = fs.readFileSync(LOCAL_BACKUP_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error("[Persistence] Error reading local JSON backup:", e);
  }
  return [];
}

function writeLocalBackup(reviews: any[]) {
  try {
    fs.writeFileSync(LOCAL_BACKUP_PATH, JSON.stringify(reviews, null, 2), "utf-8");
  } catch (e) {
    console.error("[Persistence] Error writing local JSON backup:", e);
  }
}

// Helper: Query shop metafield value via GraphQL or REST fallback
async function fetchShopMetafieldValue(admin: any, shop: string, key: string): Promise<string | null> {
  if (admin) {
    try {
      const res = await admin.graphql(
        `#graphql
        query getShopMetafield($key: String!) {
          shop {
            metafield(namespace: "ai_review_system", key: $key) {
              value
            }
          }
        }`,
        { variables: { key } }
      );
      const jsonRes = await res.json();
      const val = jsonRes.data?.shop?.metafield?.value;
      if (val) return val;
    } catch (e) {
      console.warn("[Persistence] GraphQL metafield query warning:", e);
    }
  }

  // REST Fallback using ADMIN_TOKEN
  try {
    const restUrl = `https://${shop}/admin/api/2025-01/metafields.json?namespace=ai_review_system&key=${key}`;
    const restRes = await fetch(restUrl, {
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
    });
    if (restRes.ok) {
      const restJson = await restRes.json();
      const mf = restJson.metafields?.find((m: any) => m.key === key);
      if (mf?.value) return mf.value;
    }
  } catch (restErr) {
    console.warn("[Persistence] REST metafield query warning:", restErr);
  }

  return null;
}

export async function ensureReviewsAndSettingsRestored(admin: any, shop: string) {
  if (!shop) return;

  try {
    // 1. Check/restore shop settings
    let settings = await db.shopSettings.findUnique({ where: { shop } }).catch(() => null);
    if (!settings) {
      const metaVal = await fetchShopMetafieldValue(admin, shop, "widget_settings");
      if (metaVal) {
        try {
          const parsed = JSON.parse(metaVal);
          settings = await db.shopSettings.create({
            data: {
              shop,
              widgetPosition: parsed.widgetPosition || "bottom-right",
              widgetLayoutStyle: parsed.widgetLayoutStyle || "layout-1",
              widgetDelaySeconds: parsed.widgetDelaySeconds ?? 1,
              widgetDisplayDuration: parsed.widgetDisplayDuration ?? 10,
              widgetRotationInterval: parsed.widgetRotationInterval ?? 2,
              widgetMaxPerSession: parsed.widgetMaxPerSession ?? 20,
              widgetEnabled: parsed.widgetEnabled ?? true,
            },
          }).catch(() => null);
        } catch (e) {
          console.error("[Persistence] Error parsing widget_settings metafield:", e);
        }
      }
    }

    if (!settings) {
      await db.shopSettings.create({
        data: {
          shop,
          widgetPosition: "bottom-right",
          widgetLayoutStyle: "layout-1",
          widgetDelaySeconds: 1,
          widgetDisplayDuration: 10,
          widgetRotationInterval: 2,
          widgetMaxPerSession: 20,
          widgetEnabled: true,
        },
      }).catch(() => null);
    }

    // 2. Check/restore reviews backup
    const reviewCount = await db.review.count({ where: { shop } }).catch(() => 0);
    if (reviewCount === 0) {
      let backupList: any[] = readLocalBackup();

      if (backupList.length === 0) {
        const backupVal = await fetchShopMetafieldValue(admin, shop, "reviews_backup");
        if (backupVal) {
          try {
            const parsed = JSON.parse(backupVal);
            if (Array.isArray(parsed)) {
              backupList = parsed;
            }
          } catch (e) {
            console.error("[Persistence] Error parsing reviews_backup metafield:", e);
          }
        }
      }

      if (backupList.length > 0) {
        console.log(`[Persistence] Restoring ${backupList.length} reviews for ${shop}...`);
        for (const item of backupList) {
          try {
            const itemId = item.id || `restored-${Math.random().toString(36).substring(7)}`;
            await db.review.upsert({
              where: { id: itemId },
              update: {
                isPublished: Boolean(item.isPublished),
              },
              create: {
                id: itemId,
                shop: shop,
                productId: item.productId || "",
                productHandle: item.productHandle || null,
                reviewerName: item.reviewerName || "Verified Customer",
                rating: item.rating || 5,
                bodyShort: item.bodyShort || "",
                bodyFull: item.bodyFull || null,
                source: item.source || "MANUAL",
                externalUrl: item.externalUrl || null,
                isAiGenerated: item.isAiGenerated || false,
                isPublished: Boolean(item.isPublished),
                isVerifiedPurchase: item.isVerifiedPurchase || false,
                language: item.language || "en",
                tags: item.tags || "[]",
                orderId: item.orderId || null,
                createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
              },
            });
          } catch (singleErr) {
            console.warn("[Persistence] Single review restore skipped:", singleErr);
          }
        }
        writeLocalBackup(backupList);
      }
    }
  } catch (err) {
    console.error("[Persistence] Error in ensureReviewsAndSettingsRestored:", err);
  }
}

export async function syncReviewsToShopify(admin: any, shop: string, allowEmptySync: boolean = false) {
  if (!shop) return;
  try {
    const allReviews = await db.review.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    if (allReviews.length > 0) {
      writeLocalBackup(allReviews);
    } else if (allowEmptySync) {
      writeLocalBackup([]);
    }

    // Safety guard: If DB is empty and allowEmptySync is false, do not wipe backup!
    if (allReviews.length === 0 && !allowEmptySync) {
      await ensureReviewsAndSettingsRestored(admin, shop);
      return;
    }

    // 1. Save via GraphQL if admin exists
    if (admin) {
      try {
        const shopRes = await admin.graphql(
          `#graphql
          query getShopId {
            shop {
              id
            }
          }`
        );
        const shopJson = await shopRes.json();
        const shopId = shopJson.data?.shop?.id;
        if (shopId) {
          await admin.graphql(
            `#graphql
            mutation saveReviewsBackup($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                metafields: [
                  {
                    namespace: "ai_review_system",
                    key: "reviews_backup",
                    type: "json",
                    value: JSON.stringify(allReviews),
                    ownerId: shopId,
                  },
                ],
              },
            }
          );
          return;
        }
      } catch (gqlErr) {
        console.warn("[Persistence] GraphQL save reviews backup warning:", gqlErr);
      }
    }

    // 2. REST Fallback using ADMIN_TOKEN
    try {
      await fetch(`https://${shop}/admin/api/2025-01/metafields.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metafield: {
            namespace: "ai_review_system",
            key: "reviews_backup",
            value: JSON.stringify(allReviews),
            type: "json",
          },
        }),
      });
    } catch (restErr) {
      console.warn("[Persistence] REST save reviews backup warning:", restErr);
    }
  } catch (err) {
    console.error("[Persistence] Error syncing reviews to Shopify Metafield:", err);
  }
}

export async function syncSettingsToShopify(admin: any, shop: string, settingsData: any) {
  if (!shop) return;
  try {
    if (admin) {
      const shopRes = await admin.graphql(
        `#graphql
        query getShopId {
          shop {
            id
          }
        }`
      );
      const shopJson = await shopRes.json();
      const shopId = shopJson.data?.shop?.id;
      if (shopId) {
        await admin.graphql(
          `#graphql
          mutation saveSettingsMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              metafields: [
                {
                  namespace: "ai_review_system",
                  key: "widget_settings",
                  type: "json",
                  value: JSON.stringify(settingsData),
                  ownerId: shopId,
                },
              ],
            },
          }
        );
        return;
      }
    }

    // REST Fallback using ADMIN_TOKEN
    await fetch(`https://${shop}/admin/api/2025-01/metafields.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metafield: {
          namespace: "ai_review_system",
          key: "widget_settings",
          value: JSON.stringify(settingsData),
          type: "json",
        },
      }),
    });
  } catch (err) {
    console.error("[Persistence] Error syncing settings to Shopify Metafield:", err);
  }
}
