import db from "../db.server";
import fs from "fs";
import path from "path";

const LOCAL_BACKUP_PATH = path.join(process.cwd(), "reviews_backup_data.json");

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

export async function ensureReviewsAndSettingsRestored(admin: any, shop: string) {
  if (!shop) return;

  try {
    // 1. Check/restore shop settings
    let settings = await db.shopSettings.findUnique({ where: { shop } }).catch(() => null);
    if (!settings && admin) {
      try {
        const settingsRes = await admin.graphql(
          `#graphql
          query getShopWidgetSettings {
            shop {
              metafields(first: 25, namespace: "ai_review_system") {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }`
        );
        const settingsJson = await settingsRes.json();
        const edges = settingsJson.data?.shop?.metafields?.edges || [];
        const node = edges.find((e: any) => e.node?.key === "widget_settings");
        const metaVal = node?.node?.value;

        if (metaVal) {
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
        }
      } catch (e) {
        console.error("[Persistence] Error fetching settings metafield:", e);
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

      // If local file is empty, query Shopify Metafields
      if (backupList.length === 0 && admin) {
        try {
          const reviewsRes = await admin.graphql(
            `#graphql
            query getShopReviewsBackup {
              shop {
                metafields(first: 25, namespace: "ai_review_system") {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
              }
            }`
          );
          const reviewsJson = await reviewsRes.json();
          const edges = reviewsJson.data?.shop?.metafields?.edges || [];
          const node = edges.find((e: any) => e.node?.key === "reviews_backup");
          const backupVal = node?.node?.value;

          if (backupVal) {
            const parsed = JSON.parse(backupVal);
            if (Array.isArray(parsed)) {
              backupList = parsed;
            }
          }
        } catch (e) {
          console.error("[Persistence] Error querying reviews backup metafield:", e);
        }
      }

      if (backupList.length > 0) {
        console.log(`[Persistence] Restoring ${backupList.length} reviews for ${shop}...`);
        for (const item of backupList) {
          try {
            const itemId = item.id || `restored-${Math.random().toString(36).substring(7)}`;
            await db.review.upsert({
              where: { id: itemId },
              update: {},
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
                isPublished: item.isPublished || false,
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

    if (!admin) return;

    // Safety guard: If DB is empty and allowEmptySync is false, do not wipe backup!
    if (allReviews.length === 0 && !allowEmptySync) {
      await ensureReviewsAndSettingsRestored(admin, shop);
      return;
    }

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
    if (!shopId) return;

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
  } catch (err) {
    console.error("[Persistence] Error syncing reviews to Shopify Metafield:", err);
  }
}

export async function syncSettingsToShopify(admin: any, shop: string, settingsData: any) {
  if (!admin || !shop) return;
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
    if (!shopId) return;

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
  } catch (err) {
    console.error("[Persistence] Error syncing settings to Shopify Metafield:", err);
  }
}
