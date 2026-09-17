import db from "../db.server";

export async function ensureReviewsAndSettingsRestored(admin: any, shop: string) {
  try {
    // 1. Check/restore shop settings
    let settings = await db.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      try {
        const settingsRes = await admin.graphql(
          `#graphql
          query getShopWidgetSettings {
            shop {
              metafield(namespace: "ai_review_system", key: "widget_settings") {
                value
              }
            }
          }`
        );
        const settingsJson = await settingsRes.json();
        const metaVal = settingsJson.data?.shop?.metafield?.value;
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
          });
        }
      } catch (e) {
        console.error("[Persistence] Error fetching settings metafield:", e);
      }

      if (!settings) {
        settings = await db.shopSettings.create({
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
        });
      }
    }

    // 2. Check/restore reviews backup
    const reviewCount = await db.review.count({ where: { shop } });
    if (reviewCount === 0) {
      const reviewsRes = await admin.graphql(
        `#graphql
        query getShopReviewsBackup {
          shop {
            metafield(namespace: "ai_review_system", key: "reviews_backup") {
              value
            }
          }
        }`
      );
      const reviewsJson = await reviewsRes.json();
      const backupVal = reviewsJson.data?.shop?.metafield?.value;
      if (backupVal) {
        const backupList = JSON.parse(backupVal);
        if (Array.isArray(backupList) && backupList.length > 0) {
          console.log(`[Persistence] Restoring ${backupList.length} reviews from Shopify Metafield for ${shop}...`);
          for (const item of backupList) {
            await db.review.create({
              data: {
                id: item.id,
                shop: shop,
                productId: item.productId || "",
                productHandle: item.productHandle || null,
                reviewerName: item.reviewerName || "Verified Customer",
                rating: item.rating || 5,
                bodyShort: item.bodyShort || "",
                bodyFull: item.bodyFull || null,
                source: item.source || "MANUAL",
                isAiGenerated: item.isAiGenerated || false,
                isPublished: item.isPublished || false,
                isVerifiedPurchase: item.isVerifiedPurchase || false,
                language: item.language || "en",
                tags: item.tags || "[]",
                orderId: item.orderId || null,
                createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
              },
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Persistence] Error in ensureReviewsAndSettingsRestored:", err);
  }
}

export async function syncReviewsToShopify(admin: any, shop: string) {
  try {
    const allReviews = await db.review.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

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
