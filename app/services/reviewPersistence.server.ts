/**
 * reviewPersistence.server.ts
 *
 * CORE RULE (Permanent, applies to ALL stores):
 * Reviews MUST NEVER be automatically deleted or reset by:
 *   - Code changes / feature updates / deployments
 *   - Layout or JavaScript changes
 *   - AI review generation or CSV import
 *   - Server restarts / Render redeploys
 *
 * Reviews are ONLY removed when an Admin explicitly deletes them via the Admin panel.
 * Each store is fully isolated by shop domain. This applies to all current and future stores.
 */

import db from "../db.server";
import fs from "fs";
import path from "path";
import {
  getShopWhereClause,
  canonicalizeShopDomain,
} from "./shopDomain.server";

const LOCAL_BACKUP_PATH = path.join(process.cwd(), "reviews_backup_data.json");
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";

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

/**
 * Write reviews for one shop into backup JSON without overwriting other stores.
 * explicitWipe=true only when Admin deliberately deleted ALL reviews for this shop.
 */
function writeLocalBackup(
  reviews: any[],
  shop: string,
  explicitWipe: boolean = false,
): void {
  try {
    const shopCanonical = canonicalizeShopDomain(shop);
    const existing = readLocalBackup();

    const otherShopReviews = existing.filter((item: any) => {
      const itemCanonical = canonicalizeShopDomain(item.shop || "");
      return itemCanonical !== shopCanonical;
    });

    let merged: any[];
    if (reviews.length === 0 && !explicitWipe) {
      const existingShopReviews = existing.filter((item: any) => {
        const itemCanonical = canonicalizeShopDomain(item.shop || "");
        return itemCanonical === shopCanonical;
      });
      merged = [...otherShopReviews, ...existingShopReviews];
      console.log(
        `[Persistence] DB empty for ${shop} (no explicit wipe) — keeping ${existingShopReviews.length} backup records.`,
      );
    } else {
      merged = [...otherShopReviews, ...reviews];
      console.log(
        `[Persistence] Saved ${reviews.length} reviews for ${shop} to backup (${otherShopReviews.length} other-store reviews preserved).`,
      );
    }

    fs.writeFileSync(
      LOCAL_BACKUP_PATH,
      JSON.stringify(merged, null, 2),
      "utf-8",
    );
  } catch (e) {
    console.error("[Persistence] Error writing local JSON backup:", e);
  }
}

async function fetchShopMetafieldValue(
  admin: any,
  shop: string,
  key: string,
): Promise<string | null> {
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
        { variables: { key } },
      );
      const jsonRes = await res.json();
      const val = jsonRes.data?.shop?.metafield?.value;
      if (val) return val;
    } catch (e) {
      console.warn("[Persistence] GraphQL metafield query warning:", e);
    }
  }

  try {
    const session = await db.session
      .findFirst({ where: { shop } })
      .catch(() => null);
    const token = session?.accessToken || ADMIN_TOKEN;
    if (token) {
      const restUrl = `https://${shop}/admin/api/2025-01/metafields.json?namespace=ai_review_system&key=${key}`;
      const restRes = await fetch(restUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      });
      if (restRes.ok) {
        const restJson = await restRes.json();
        const mf = restJson.metafields?.find((m: any) => m.key === key);
        if (mf?.value) return mf.value;
      }
    }
  } catch (restErr) {
    console.warn("[Persistence] REST metafield query warning:", restErr);
  }

  return null;
}

/**
 * CORE RESTORE FUNCTION
 * Auto-restores reviews and settings if DB is empty for a shop.
 * NEVER deletes existing reviews.
 */
export async function ensureReviewsAndSettingsRestored(
  admin: any,
  shop: string,
) {
  if (!shop) return;

  try {
    // Restore shop settings if missing
    let settings = await db.shopSettings
      .findFirst({ where: getShopWhereClause(shop) })
      .catch(() => null);

    if (!settings) {
      const metaVal = await fetchShopMetafieldValue(
        admin,
        shop,
        "widget_settings",
      );
      if (metaVal) {
        try {
          const parsed = JSON.parse(metaVal);
          settings = await db.shopSettings
            .create({
              data: {
                shop,
                widgetPosition: parsed.widgetPosition || "bottom-left",
                widgetLayoutStyle: parsed.widgetLayoutStyle || "layout-1",
                widgetDelaySeconds: parsed.widgetDelaySeconds ?? 1,
                widgetDisplayDuration: parsed.widgetDisplayDuration ?? 10,
                widgetRotationInterval: parsed.widgetRotationInterval ?? 2,
                widgetMaxPerSession: parsed.widgetMaxPerSession ?? 20,
                widgetEnabled: parsed.widgetEnabled ?? true,
              },
            })
            .catch(() => null);
        } catch (e) {
          console.error(
            "[Persistence] Error parsing widget_settings metafield:",
            e,
          );
        }
      }
    }

    if (!settings) {
      await db.shopSettings
        .create({
          data: {
            shop,
            widgetPosition: "bottom-left",
            widgetLayoutStyle: "layout-1",
            widgetDelaySeconds: 1,
            widgetDisplayDuration: 10,
            widgetRotationInterval: 2,
            widgetMaxPerSession: 20,
            widgetEnabled: true,
          },
        })
        .catch(() => null);
    }

    // Restore reviews if DB is incomplete for this shop (< 250 reviews)
    const shopWhere = getShopWhereClause(shop);
    const reviewCount = await db.review
      .count({ where: shopWhere })
      .catch(() => 0);

    if (reviewCount < 250) {
      const shopCanonical = canonicalizeShopDomain(shop);

      // Try local backup first
      const localBackup = readLocalBackup();
      let matchingItems = localBackup.filter((item: any) => {
        const itemCanonical = canonicalizeShopDomain(item.shop || "");
        return itemCanonical === shopCanonical;
      });

      // Filter out any mock marketplace reviews from auto-restore (marketplace reviews must only be user-imported)
      matchingItems = matchingItems.filter(
        (item: any) =>
          ![
            "IMPORTED_AMAZON",
            "IMPORTED_FLIPKART",
            "IMPORTED_ALIBABA",
          ].includes(item.source),
      );

      let itemsToRestore = matchingItems;

      // Fall back to Shopify metafield
      if (itemsToRestore.length === 0) {
        const metaVal = await fetchShopMetafieldValue(
          admin,
          shop,
          "reviews_backup",
        );
        if (metaVal) {
          try {
            const parsed = JSON.parse(metaVal);
            if (Array.isArray(parsed) && parsed.length > 0) {
              itemsToRestore = parsed.filter(
                (item: any) =>
                  ![
                    "IMPORTED_AMAZON",
                    "IMPORTED_FLIPKART",
                    "IMPORTED_ALIBABA",
                  ].includes(item.source),
              );
              console.log(
                `[Persistence] No local backup for ${shop} — using Shopify metafield (${itemsToRestore.length} reviews).`,
              );
            }
          } catch (e) {
            console.warn(
              "[Persistence] Error parsing metafield reviews_backup:",
              e,
            );
          }
        }
      }

      if (itemsToRestore.length > 0) {
        console.log(
          `[Persistence] Restoring ${itemsToRestore.length} reviews from backup for ${shop}...`,
        );
        for (const item of itemsToRestore) {
          try {
            await db.review.upsert({
              where: { id: item.id },
              update: {}, // Never overwrite existing reviews
              create: {
                id: item.id,
                shop: item.shop || shop,
                productId: item.productId || null,
                productHandle: item.productHandle || null,
                reviewerName: item.reviewerName || "Verified Customer",
                rating: item.rating || 5,
                bodyShort: item.bodyShort || "",
                bodyFull: item.bodyFull || "",
                source: item.source || "AI_GENERATED",
                externalUrl: item.externalUrl || null,
                imageUrl: item.imageUrl || null,
                videoUrl: item.videoUrl || null,
                isAiGenerated: item.isAiGenerated ?? true,
                isPublished: item.isPublished ?? true,
                isVerifiedPurchase: item.isVerifiedPurchase ?? true,
                language: item.language || "en",
                tags:
                  typeof item.tags === "string"
                    ? item.tags
                    : JSON.stringify(item.tags || []),
                orderId: item.orderId || null,
                createdAt: item.createdAt
                  ? new Date(item.createdAt)
                  : new Date(),
                updatedAt: item.updatedAt
                  ? new Date(item.updatedAt)
                  : new Date(),
              },
            });
          } catch (e) {
            console.warn("[Persistence] Review single item restore error:", e);
          }
        }
        console.log(`[Persistence] Restore complete for ${shop}.`);
      } else {
        console.log(`[Persistence] No backup for ${shop} — fresh install.`);
      }
    }
  } catch (err) {
    console.error(
      "[Persistence] Error in ensureReviewsAndSettingsRestored:",
      err,
    );
  }
}

/**
 * CORE SYNC FUNCTION
 * Call after every review write operation (create / update / delete).
 *
 * @param explicitWipe Set to TRUE only when Admin explicitly clicked "Delete All Reviews".
 *                     For individual/bulk/pending deletes leave as FALSE.
 */
export async function syncReviewsToShopify(
  admin: any,
  shop: string,
  explicitWipe: boolean = false,
) {
  if (!shop) return;
  try {
    const shopWhere = getShopWhereClause(shop);
    const allReviews = await db.review.findMany({
      where: shopWhere,
      orderBy: { createdAt: "desc" },
    });

    // Always update local backup with correct multi-store logic
    writeLocalBackup(allReviews, shop, explicitWipe);

    // Safety: if DB is empty but not an explicit wipe, auto-restore
    if (allReviews.length === 0 && !explicitWipe) {
      console.log(
        `[Persistence] DB empty for ${shop} (no explicit wipe) — triggering restore...`,
      );
      await ensureReviewsAndSettingsRestored(admin, shop);
      return;
    }

    // Sync to Shopify metafield as secondary backup
    if (admin) {
      try {
        const shopRes = await admin.graphql(
          `#graphql
          query getShopId {
            shop { id }
          }`,
        );
        const shopJson = await shopRes.json();
        const shopId = shopJson.data?.shop?.id;
        if (shopId) {
          await admin.graphql(
            `#graphql
            mutation saveReviewsBackup($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                userErrors { field message }
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
            },
          );
          return;
        }
      } catch (gqlErr) {
        console.warn(
          "[Persistence] GraphQL save reviews backup warning:",
          gqlErr,
        );
      }
    }

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
    console.error(
      "[Persistence] Error syncing reviews to Shopify Metafield:",
      err,
    );
  }
}

export async function uploadReviewImageToShopify(
  admin: any,
  dataUrl: string,
  filename: string,
): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const [, mimeType, encodedImage] = match;
  const stagedResponse = await admin.graphql(
    `
    #graphql
    mutation stageReviewImage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `,
    {
      variables: {
        input: [{ filename, mimeType, httpMethod: "POST", resource: "IMAGE" }],
      },
    },
  );
  const stagedJson = await stagedResponse.json();
  const staged = stagedJson.data?.stagedUploadsCreate;
  if (staged?.userErrors?.length || !staged?.stagedTargets?.[0]) {
    throw new Error(
      staged?.userErrors?.[0]?.message ||
        "Shopify image upload could not be staged.",
    );
  }

  const target = staged.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters)
    form.append(parameter.name, parameter.value);
  form.append(
    "file",
    new Blob([Buffer.from(encodedImage, "base64")], { type: mimeType }),
    filename,
  );

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `Shopify staged image upload failed with status ${uploadResponse.status}.`,
    );
  }

  const fileResponse = await admin.graphql(
    `
    #graphql
    mutation createReviewImage($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus }
        userErrors { field message }
      }
    }
  `,
    {
      variables: {
        files: [
          {
            contentType: "IMAGE",
            originalSource: target.resourceUrl,
            filename,
          },
        ],
      },
    },
  );
  const fileJson = await fileResponse.json();
  const createdFile = fileJson.data?.fileCreate;
  if (createdFile?.userErrors?.length || !createdFile?.files?.[0]?.id) {
    throw new Error(
      createdFile?.userErrors?.[0]?.message ||
        "Shopify could not create the review image.",
    );
  }

  const fileId = createdFile.files[0].id;
  for (let attempt = 0; attempt < 10; attempt++) {
    const statusResponse = await admin.graphql(
      `
      #graphql
      query reviewImageStatus($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            fileStatus
            image { url }
          }
        }
      }
    `,
      { variables: { id: fileId } },
    );
    const statusJson = await statusResponse.json();
    const image = statusJson.data?.node;
    if (image?.image?.url) return image.image.url;
    if (image?.fileStatus === "FAILED") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}

export async function syncSettingsToShopify(
  admin: any,
  shop: string,
  settingsData: any,
) {
  if (!shop) return;
  try {
    if (admin) {
      const shopRes = await admin.graphql(
        `#graphql
        query getShopId {
          shop { id }
        }`,
      );
      const shopJson = await shopRes.json();
      const shopId = shopJson.data?.shop?.id;
      if (shopId) {
        await admin.graphql(
          `#graphql
          mutation saveSettingsMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
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
          },
        );
        return;
      }
    }

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
    console.error(
      "[Persistence] Error syncing settings to Shopify Metafield:",
      err,
    );
  }
}

export async function ensureAiJobsRestored(admin: any, shop: string) {
  if (!shop) return;
  try {
    const count = await db.aiGenerationJob
      .count({ where: { shop } })
      .catch(() => 0);
    if (count === 0) {
      const metaVal = await fetchShopMetafieldValue(
        admin,
        shop,
        "ai_jobs_backup",
      );
      if (metaVal) {
        const parsed = JSON.parse(metaVal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(
            `[Persistence] Restoring ${parsed.length} AI generation jobs for ${shop}...`,
          );
          for (const item of parsed) {
            try {
              const itemId =
                item.id || `job-${Math.random().toString(36).substring(7)}`;
              await db.aiGenerationJob.upsert({
                where: { id: itemId },
                update: {},
                create: {
                  id: itemId,
                  shop,
                  productId: item.productId || null,
                  inputImageUrl: item.inputImageUrl || null,
                  inputDescription: item.inputDescription || null,
                  inputNotes: item.inputNotes || null,
                  language: item.language || "en",
                  provider: item.provider || "claude",
                  modelUsed: item.modelUsed || "Default Model",
                  status: item.status || "completed",
                  resultCount: item.resultCount ?? 0,
                  createdAt: item.createdAt
                    ? new Date(item.createdAt)
                    : new Date(),
                },
              });
            } catch (singleErr) {
              console.warn(
                "[Persistence] Single AI job restore skipped:",
                singleErr,
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Persistence] Error in ensureAiJobsRestored:", err);
  }
}

export async function syncAiJobsToShopify(
  admin: any,
  shop: string,
  allowEmptySync: boolean = false,
) {
  if (!shop) return;
  try {
    const allJobs = await db.aiGenerationJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    if (allJobs.length === 0 && !allowEmptySync) {
      await ensureAiJobsRestored(admin, shop);
      return;
    }

    if (admin) {
      try {
        const shopRes = await admin.graphql(
          `#graphql
          query getShopId {
            shop { id }
          }`,
        );
        const shopJson = await shopRes.json();
        const shopId = shopJson.data?.shop?.id;
        if (shopId) {
          await admin.graphql(
            `#graphql
            mutation saveAiJobsBackup($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                userErrors { field message }
              }
            }`,
            {
              variables: {
                metafields: [
                  {
                    namespace: "ai_review_system",
                    key: "ai_jobs_backup",
                    type: "json",
                    value: JSON.stringify(allJobs),
                    ownerId: shopId,
                  },
                ],
              },
            },
          );
          return;
        }
      } catch (gqlErr) {
        console.warn(
          "[Persistence] GraphQL save AI jobs backup warning:",
          gqlErr,
        );
      }
    }

    await fetch(`https://${shop}/admin/api/2025-01/metafields.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metafield: {
          namespace: "ai_review_system",
          key: "ai_jobs_backup",
          value: JSON.stringify(allJobs),
          type: "json",
        },
      }),
    });
  } catch (err) {
    console.error(
      "[Persistence] Error syncing AI jobs to Shopify Metafield:",
      err,
    );
  }
}
