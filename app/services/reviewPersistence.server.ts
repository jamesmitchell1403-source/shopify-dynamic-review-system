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
 */
function writeLocalBackup(
  reviews: any[],
  shop: string,
): void {
  try {
    const shopCanonical = canonicalizeShopDomain(shop);
    const existing = readLocalBackup();

    const otherShopReviews = existing.filter((item: any) => {
      const itemCanonical = canonicalizeShopDomain(item.shop || "");
      return itemCanonical !== shopCanonical;
    });

    const merged = [...otherShopReviews, ...reviews];
    console.log(
      `[Persistence] Saved ${reviews.length} reviews for ${shop} to backup (${otherShopReviews.length} other-store reviews preserved).`,
    );

    fs.writeFileSync(
      LOCAL_BACKUP_PATH,
      JSON.stringify(merged, null, 2),
      "utf-8",
    );
  } catch (e) {
    console.error("[Persistence] Error writing local JSON backup:", e);
  }
}

async function fetchAllBackupMetafields(
  admin: any,
  shop: string,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  if (admin) {
    try {
      const res = await admin.graphql(
        `#graphql
        query getAllBackupMetafields {
          shop {
            metafields(namespace: "ai_review_system", first: 250) {
              nodes {
                key
                value
              }
            }
          }
        }`,
      );
      const jsonRes = await res.json();
      const nodes = jsonRes.data?.shop?.metafields?.nodes || [];
      for (const node of nodes) {
        if (node.key && node.value) {
          map[node.key] = node.value;
        }
      }
      if (Object.keys(map).length > 0) return map;
    } catch (e) {
      console.warn("[Persistence] GraphQL fetchAllBackupMetafields warning:", e);
    }
  }

  try {
    const session = await db.session
      .findFirst({ where: { shop } })
      .catch(() => null);
    const token = session?.accessToken || ADMIN_TOKEN;
    if (token) {
      const restUrl = `https://${shop}/admin/api/2025-01/metafields.json?namespace=ai_review_system`;
      const restRes = await fetch(restUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      });
      if (restRes.ok) {
        const restJson = await restRes.json();
        const mfs = restJson.metafields || [];
        for (const mf of mfs) {
          if (mf.key && mf.value) {
            map[mf.key] = mf.value;
          }
        }
      }
    }
  } catch (restErr) {
    console.warn("[Persistence] REST fetchAllBackupMetafields warning:", restErr);
  }

  return map;
}

async function fetchShopMetafieldValue(
  admin: any,
  shop: string,
  key: string,
): Promise<string | null> {
  const allMap = await fetchAllBackupMetafields(admin, shop);
  if (allMap[key]) return allMap[key];
  return null;
}

const DELETED_IDS_PATH = path.join(process.cwd(), "deleted_review_ids.json");

function readLocalDeletedIds(): Record<string, string[]> {
  try {
    if (fs.existsSync(DELETED_IDS_PATH)) {
      const data = fs.readFileSync(DELETED_IDS_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {
    console.error("[Persistence] Error reading local deleted IDs file:", e);
  }
  return {};
}

function writeLocalDeletedIds(shop: string, deletedIds: string[]): void {
  try {
    const shopCanonical = canonicalizeShopDomain(shop);
    const existing = readLocalDeletedIds();
    existing[shopCanonical] = Array.from(new Set([...(existing[shopCanonical] || []), ...deletedIds]));
    fs.writeFileSync(DELETED_IDS_PATH, JSON.stringify(existing, null, 2), "utf-8");
  } catch (e) {
    console.error("[Persistence] Error writing local deleted IDs file:", e);
  }
}

export async function fetchDeletedReviewIds(
  admin: any,
  shop: string,
): Promise<Set<string>> {
  const shopCanonical = canonicalizeShopDomain(shop);
  const deletedSet = new Set<string>();

  // 1. Check local file
  const localMap = readLocalDeletedIds();
  const localList = localMap[shopCanonical] || [];
  for (const id of localList) deletedSet.add(id);

  // 2. Check Shopify Cloud Metafield
  const backupMetafieldsMap = await fetchAllBackupMetafields(admin, shop);
  const metaVal = backupMetafieldsMap["deleted_review_ids"];
  if (metaVal) {
    try {
      const parsed = JSON.parse(metaVal);
      if (Array.isArray(parsed)) {
        for (const id of parsed) deletedSet.add(id);
      }
    } catch (e) {
      console.warn("[Persistence] Error parsing deleted_review_ids metafield:", e);
    }
  }

  return deletedSet;
}

export async function recordDeletedReviewIds(
  admin: any,
  shop: string,
  deletedIds: string[],
): Promise<void> {
  if (!shop || !deletedIds || deletedIds.length === 0) return;
  try {
    const shopCanonical = canonicalizeShopDomain(shop);
    const currentSet = await fetchDeletedReviewIds(admin, shop);
    for (const id of deletedIds) {
      if (id) currentSet.add(id);
    }
    const updatedList = Array.from(currentSet);

    // Save locally
    writeLocalDeletedIds(shop, updatedList);

    // Sync to Shopify Cloud Metafield
    if (admin) {
      try {
        const shopRes = await admin.graphql(
          `#graphql
          query getShopId { shop { id } }`,
        );
        const shopJson = await shopRes.json();
        const shopId = shopJson.data?.shop?.id;
        if (shopId) {
          await admin.graphql(
            `#graphql
            mutation saveDeletedIdsMetafield($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                userErrors { field message }
              }
            }`,
            {
              variables: {
                metafields: [
                  {
                    namespace: "ai_review_system",
                    key: "deleted_review_ids",
                    type: "json",
                    value: JSON.stringify(updatedList),
                    ownerId: shopId,
                  },
                ],
              },
            },
          );
        }
      } catch (gqlErr) {
        console.warn("[Persistence] GraphQL save deleted_review_ids error:", gqlErr);
      }
    }
  } catch (err) {
    console.error("[Persistence] Error recording deleted review IDs:", err);
  }
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

    // If local database container was rebuilt (e.g. on Render redeployment), restore merchant reviews from Shopify Cloud Metafield & local backup
    const shopWhere = getShopWhereClause(shop);
    const shopCanonical = canonicalizeShopDomain(shop);
    const reviewCount = await db.review
      .count({ where: shopWhere })
      .catch(() => 0);

    const backupMetafieldsMap = await fetchAllBackupMetafields(admin, shop);
    const deletedReviewIds = await fetchDeletedReviewIds(admin, shop);

    const mergedItemsMap = new Map<string, any>();

    // 1. Fetch Cloud Metafield chunks
    const manifestVal = backupMetafieldsMap["reviews_backup_manifest"];
    if (manifestVal) {
      try {
        const manifest = JSON.parse(manifestVal);
        const chunkCount = Number(manifest.chunkCount) || 0;
        for (let i = 0; i < chunkCount; i++) {
          const chunkVal = backupMetafieldsMap[`reviews_backup_chunk_${i}`];
          if (chunkVal) {
            const parsedChunk = JSON.parse(chunkVal);
            if (Array.isArray(parsedChunk)) {
              for (const item of parsedChunk) {
                if (item && item.id && !deletedReviewIds.has(item.id)) {
                  mergedItemsMap.set(item.id, item);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[Persistence] Error parsing reviews_backup_manifest:", e);
      }
    }

    // Fallback/Supplement with legacy single metafield
    if (backupMetafieldsMap["reviews_backup"]) {
      try {
        const parsed = JSON.parse(backupMetafieldsMap["reviews_backup"]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id && !deletedReviewIds.has(item.id) && !mergedItemsMap.has(item.id)) {
              mergedItemsMap.set(item.id, item);
            }
          }
        }
      } catch (e) {
        console.warn("[Persistence] Error parsing legacy reviews_backup:", e);
      }
    }

    // 2. Supplement with local backup file (seed dataset & persistent store)
    const localBackup = readLocalBackup();
    for (const item of localBackup) {
      const itemCanonical = canonicalizeShopDomain(item.shop || "");
      if (itemCanonical === shopCanonical && item && item.id) {
        if (!deletedReviewIds.has(item.id) && !mergedItemsMap.has(item.id)) {
          mergedItemsMap.set(item.id, item);
        }
      }
    }

    const itemsToRestore = Array.from(mergedItemsMap.values());

    if (itemsToRestore.length > 0 && reviewCount < itemsToRestore.length) {
      console.log(
        `[Persistence] Restoring/Upserting ${itemsToRestore.length} saved merchant reviews for ${shop} (DB count: ${reviewCount})...`,
      );
      for (const item of itemsToRestore) {
        try {
          const itemId = item.id || `rev-${Math.random().toString(36).substring(7)}`;
          await db.review.upsert({
            where: { id: itemId },
            update: {
              shop: item.shop || shop,
              productId: item.productId || "",
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
              updatedAt: item.updatedAt
                ? new Date(item.updatedAt)
                : new Date(),
            },
            create: {
              id: itemId,
              shop: item.shop || shop,
              productId: item.productId || "",
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
        } catch (singleErr) {
          console.warn("[Persistence] Single review restore error:", singleErr);
        }
      }
      console.log(`[Persistence] Restore complete for ${shop}. Synced ${itemsToRestore.length} reviews.`);

      // Sync restored dataset back to Shopify Cloud Metafield to keep cloud backup up to date
      await syncReviewsToShopify(admin, shop);
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

    if (allReviews.length === 0 && !explicitWipe) {
      console.warn(`[Persistence] Blocked empty sync to Shopify Cloud Metafield for ${shop} (explicitWipe is false).`);
      return;
    }

    // Always update local backup with exact current DB state
    writeLocalBackup(allReviews, shop);

    // Sync to Shopify metafield in CHUNKS of 50 reviews (~15KB-20KB each, well under Shopify's 64KB limit)
    const CHUNK_SIZE = 50;
    const chunks: any[][] = [];
    for (let i = 0; i < allReviews.length; i += CHUNK_SIZE) {
      chunks.push(allReviews.slice(i, i + CHUNK_SIZE));
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
          const metafieldsInputs: any[] = [
            {
              namespace: "ai_review_system",
              key: "reviews_backup_manifest",
              type: "json",
              value: JSON.stringify({
                chunkCount: chunks.length,
                totalReviews: allReviews.length,
                updatedAt: new Date().toISOString(),
              }),
              ownerId: shopId,
            },
          ];

          for (let i = 0; i < chunks.length; i++) {
            metafieldsInputs.push({
              namespace: "ai_review_system",
              key: `reviews_backup_chunk_${i}`,
              type: "json",
              value: JSON.stringify(chunks[i]),
              ownerId: shopId,
            });
          }

          if (allReviews.length <= 50) {
            metafieldsInputs.push({
              namespace: "ai_review_system",
              key: "reviews_backup",
              type: "json",
              value: JSON.stringify(allReviews),
              ownerId: shopId,
            });
          }

          // GraphQL metafieldsSet accepts multiple inputs (max 25 per call)
          const BATCH_SIZE = 20;
          for (let i = 0; i < metafieldsInputs.length; i += BATCH_SIZE) {
            const batch = metafieldsInputs.slice(i, i + BATCH_SIZE);
            const setRes = await admin.graphql(
              `#graphql
              mutation saveReviewsBackupChunks($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  userErrors { field message }
                }
              }`,
              { variables: { metafields: batch } },
            );
            const setJson = await setRes.json();
            const errs = setJson.data?.metafieldsSet?.userErrors;
            if (errs && errs.length > 0) {
              console.warn("[Persistence] metafieldsSet batch errors:", errs);
            }
          }

          console.log(
            `[Persistence] Successfully synced ${allReviews.length} reviews (${chunks.length} chunks) to Shopify Cloud Metafield for ${shop}.`,
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

    // REST fallback for chunked save if GraphQL admin is unavailable
    try {
      const session = await db.session
        .findFirst({ where: { shop } })
        .catch(() => null);
      const token = session?.accessToken || ADMIN_TOKEN;
      if (token) {
        await fetch(`https://${shop}/admin/api/2025-01/metafields.json`, {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metafield: {
              namespace: "ai_review_system",
              key: "reviews_backup_manifest",
              value: JSON.stringify({
                chunkCount: chunks.length,
                totalReviews: allReviews.length,
                updatedAt: new Date().toISOString(),
              }),
              type: "json",
            },
          }),
        });

        for (let i = 0; i < chunks.length; i++) {
          await fetch(`https://${shop}/admin/api/2025-01/metafields.json`, {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              metafield: {
                namespace: "ai_review_system",
                key: `reviews_backup_chunk_${i}`,
                value: JSON.stringify(chunks[i]),
                type: "json",
              },
            }),
          });
        }
      }
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

export async function uploadReviewMediaToShopify(
  admin: any,
  dataUrl: string,
  filename: string,
): Promise<string | null> {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith("data:")) return dataUrl; // Already an HTTP/HTTPS URL

  let mimeType = "video/mp4";
  let encodedData = "";

  const parts = dataUrl.split(";base64,");
  if (parts.length === 2) {
    mimeType = parts[0].replace(/^data:/i, "").trim();
    encodedData = parts[1].trim();
  } else {
    console.warn("[UploadMedia] Invalid Base64 data URL format.");
    return dataUrl;
  }

  const isVideo = mimeType.toLowerCase().startsWith("video/");
  const resource = isVideo ? "VIDEO" : "IMAGE";
  const contentType = isVideo ? "VIDEO" : "IMAGE";
  const fileBuffer = Buffer.from(encodedData, "base64");
  const fileSize = String(fileBuffer.length);

  // Ensure correct file extension on filename
  let safeFilename = filename;
  if (isVideo && !safeFilename.match(/\.(mp4|mov|webm|avi|mkv)$/i)) {
    safeFilename += ".mp4";
  } else if (!isVideo && !safeFilename.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
    safeFilename += ".png";
  }

  if (!admin) {
    console.warn("[UploadMedia] Admin GraphQL client not provided.");
    return dataUrl;
  }

  try {
    console.log(`[UploadMedia] Staging ${resource} upload (${fileSize} bytes) for filename: ${safeFilename}`);

    const stagedResponse = await admin.graphql(
      `
      #graphql
      mutation stageReviewMedia($input: [StagedUploadInput!]!) {
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
          input: [{ filename: safeFilename, mimeType, httpMethod: "POST", resource, fileSize }],
        },
      },
    );
    const stagedJson = await stagedResponse.json();
    const staged = stagedJson.data?.stagedUploadsCreate;
    if (staged?.userErrors?.length || !staged?.stagedTargets?.[0]) {
      console.warn("[UploadMedia] stagedUploadsCreate errors:", staged?.userErrors);
      return dataUrl;
    }

    const target = staged.stagedTargets[0];
    const form = new FormData();
    for (const parameter of target.parameters) {
      form.append(parameter.name, parameter.value);
    }
    form.append(
      "file",
      new Blob([fileBuffer], { type: mimeType }),
      safeFilename,
    );

    const uploadResponse = await fetch(target.url, {
      method: "POST",
      body: form,
    });
    if (!uploadResponse.ok) {
      console.warn("[UploadResponse] S3 upload failed with status:", uploadResponse.status);
      return dataUrl;
    }

    // Build fileInput object for fileCreate mutation
    const fileInput: any = {
      originalSource: target.resourceUrl,
      filename: safeFilename,
      contentType: contentType,
    };

    console.log(`[UploadMedia] Calling fileCreate for ${safeFilename} with contentType ${contentType}, originalSource: ${target.resourceUrl}`);

    let fileResponse = await admin.graphql(
      `
      #graphql
      mutation createReviewMediaFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
          }
          userErrors { field message }
        }
      }
    `,
      {
        variables: {
          files: [fileInput],
        },
      },
    );
    let fileJson = await fileResponse.json();
    let createdFile = fileJson.data?.fileCreate;

    // Fallback attempt with FILE contentType if VIDEO contentType was rejected by shopify schema
    if (createdFile?.userErrors?.length && isVideo) {
      console.warn("[UploadMedia] fileCreate with VIDEO contentType failed, retrying with FILE contentType:", createdFile.userErrors);
      fileInput.contentType = "FILE";
      fileResponse = await admin.graphql(
        `
        #graphql
        mutation createReviewMediaFile($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              fileStatus
              alt
              createdAt
            }
            userErrors { field message }
          }
        }
      `,
        {
          variables: {
            files: [fileInput],
          },
        },
      );
      fileJson = await fileResponse.json();
      createdFile = fileJson.data?.fileCreate;
    }

    if (createdFile?.userErrors?.length || !createdFile?.files?.[0]?.id) {
      console.warn("[UploadMedia] fileCreate userErrors:", createdFile?.userErrors);
      return target.resourceUrl || dataUrl;
    }

    const fileId = createdFile.files[0].id;
    console.log(`[UploadMedia] fileCreate succeeded! Created Shopify File ID: ${fileId}. Polling fileStatus...`);

    let fallbackUrl: string | null = target.resourceUrl || null;

    for (let attempt = 0; attempt < 30; attempt++) {
      const statusResponse = await admin.graphql(
        `
        #graphql
        query reviewMediaStatus($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image { url }
            }
            ... on Video {
              fileStatus
              originalSource { url }
              sources { url }
            }
            ... on GenericFile {
              fileStatus
              url
            }
          }
        }
      `,
        { variables: { id: fileId } },
      );
      const statusJson = await statusResponse.json();
      const node = statusJson.data?.node;

      if (node?.image?.url) {
        console.log(`[UploadMedia] MediaImage ready! URL: ${node.image.url}`);
        return node.image.url;
      }
      if (node?.sources?.[0]?.url) {
        console.log(`[UploadMedia] Video source ready! URL: ${node.sources[0].url}`);
        return node.sources[0].url;
      }
      if (node?.originalSource?.url) {
        fallbackUrl = node.originalSource.url;
      }
      if (node?.url) {
        console.log(`[UploadMedia] GenericFile ready! URL: ${node.url}`);
        return node.url;
      }
      if (node?.fileStatus === "FAILED") {
        console.warn(`[UploadMedia] File processing FAILED for ID: ${fileId}`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (fallbackUrl) {
      console.log(`[UploadMedia] Returning video originalSource URL: ${fallbackUrl}`);
      return fallbackUrl;
    }
  } catch (e) {
    console.warn("Media upload to Shopify failed, using fallback:", e);
  }

  return dataUrl;
}

export async function uploadReviewImageToShopify(
  admin: any,
  dataUrl: string,
  filename: string,
): Promise<string | null> {
  return uploadReviewMediaToShopify(admin, dataUrl, filename);
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
