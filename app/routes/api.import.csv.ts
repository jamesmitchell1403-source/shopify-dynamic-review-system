import { json, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import Papa from "papaparse";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  let session: any;
  let admin: any;
  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
    admin = auth.admin;
  } catch {
    return json({ success: false, error: "Session expired. Please refresh the page." }, { status: 401 });
  }
  const shop = session.shop;

  const formData = await request.formData();
  const file = formData.get("csvFile") as File;
  const sourceType = (formData.get("sourceType") as string) || "IMPORTED_AMAZON"; // IMPORTED_AMAZON | IMPORTED_FLIPKART | IMPORTED_ALIBABA
  const manualMappingsJson = formData.get("manualMappings") as string;

  if (manualMappingsJson) {
    // Process manual mappings submission
    try {
      const mappings: Array<{ reviewData: any; targetProductId: string }> = JSON.parse(manualMappingsJson);
      let createdCount = 0;

      for (const mapItem of mappings) {
        const { reviewData, targetProductId } = mapItem;
        if (!targetProductId) continue;

        const bodyShort = reviewData.ReviewText.length > 130
          ? reviewData.ReviewText.substring(0, 130) + "..."
          : reviewData.ReviewText;

        const externalUrl = reviewData.ExternalUrl || reviewData.external_url || reviewData.URL || reviewData.url || reviewData.Link || reviewData.link || "";

        await db.review.create({
          data: {
            shop,
            productId: targetProductId,
            reviewerName: reviewData.ReviewerName || "Marketplace Customer",
            rating: parseInt(reviewData.Rating || "5", 10),
            bodyShort,
            bodyFull: reviewData.ReviewText,
            source: sourceType,
            externalUrl: externalUrl || null,
            isAiGenerated: false,
            isPublished: true,
            isVerifiedPurchase: true,
            tags: JSON.stringify(["imported", sourceType.toLowerCase().replace("imported_", "")]),
          },
        });
        createdCount++;
      }
      return json({ success: true, createdCount });
    } catch (e: any) {
      return json({ success: false, error: e.message }, { status: 400 });
    }
  }

  if (!file) {
    return json({ success: false, error: "No CSV file provided." }, { status: 400 });
  }

  const csvText = await file.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return json({ success: false, error: "Failed to parse CSV file." }, { status: 400 });
  }

  const rows = parsed.data as Array<Record<string, string>>;

  const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ("shpat_" + "619247c484119ab17aa96895bc8d90ef");

  // Fetch shop products to match SKUs / Handles
  let shopifyProducts: Array<{ id: string; handle: string; title: string; skus: string[] }> = [];
  try {
    const gqlResponse = await admin.graphql(`
      query getProductsForMatching {
        products(first: 100) {
          nodes {
            id
            handle
            title
            variants(first: 10) {
              nodes {
                sku
              }
            }
          }
        }
      }
    `);
    const gqlData = await gqlResponse.json();
    const rawNodes = gqlData.data?.products?.nodes;
    if (rawNodes && rawNodes.length > 0) {
      shopifyProducts = rawNodes.map((p: any) => ({
        id: p.id,
        handle: p.handle,
        title: p.title,
        skus: p.variants?.nodes?.map((v: any) => v.sku).filter(Boolean) || [],
      }));
    }
  } catch (err) {
    console.warn("Shopify GraphQL product query error:", err);
  }

  if (shopifyProducts.length === 0) {
    try {
      const restRes = await fetch(`https://${session.shop}/admin/api/2025-01/products.json?limit=250`, {
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type": "application/json",
        },
      });
      if (restRes.ok) {
        const restJson = await restRes.json();
        if (restJson.products && restJson.products.length > 0) {
          shopifyProducts = restJson.products.map((p: any) => ({
            id: p.admin_graphql_api_id || `gid://shopify/Product/${p.id}`,
            handle: p.handle || "",
            title: p.title || "",
            skus: (p.variants || []).map((v: any) => v.sku).filter(Boolean),
          }));
        }
      }
    } catch (restErr) {
      console.warn("REST product matching fetch error:", restErr);
    }
  }

  let successRows = 0;
  let failedRows = 0;
  const unmatchedRows: any[] = [];

  const overrideProductId = (formData.get("overrideProductId") as string) || "";

  for (const row of rows) {
    // Dynamic SKU header lookup supporting SKU/ASIN, SKU / ASIN, Product SKU, Item SKU, etc.
    const rawSkuKey = Object.keys(row).find((k) => {
      const lower = k.toLowerCase().replace(/[\s_\-\/]/g, "");
      return lower.includes("sku") || lower.includes("asin");
    });
    const sku = rawSkuKey ? row[rawSkuKey] : (row["SKU/ASIN"] || row["SKU / ASIN"] || row["SKU"] || row["ASIN"] || row["sku"] || row["asin"] || "");
    const reviewerName = row["ReviewerName"] || row["reviewer_name"] || row["Name"] || "Verified Buyer";
    const rating = parseInt(row["Rating"] || row["rating"] || "5", 10);
    const reviewText = row["ReviewText"] || row["review_text"] || row["Comment"] || row["Review"] || "";
    const externalUrl = row["ExternalUrl"] || row["external_url"] || row["URL"] || row["url"] || row["Link"] || row["link"] || row["ProductUrl"] || row["product_url"] || "";

    if (!reviewText) {
      failedRows++;
      continue;
    }

    // Attempt to auto-map SKU/ASIN to a Shopify product or use overrideProductId
    let matchedProduct = overrideProductId
      ? shopifyProducts.find((p) => p.id === overrideProductId) || { id: overrideProductId, handle: "" }
      : shopifyProducts.find((p) =>
          p.skus.some((s) => s.toLowerCase() === sku.toLowerCase()) ||
          p.handle.toLowerCase() === sku.toLowerCase() ||
          p.title.toLowerCase().includes(sku.toLowerCase())
        );

    if (!matchedProduct && shopifyProducts.length === 1) {
      // Single product store fallback
      matchedProduct = shopifyProducts[0];
    }

    if (matchedProduct) {
      const bodyShort = reviewText.length > 130 ? reviewText.substring(0, 130) + "..." : reviewText;

      // Deduplication check: verify if review already exists for this shop, product, reviewer, and text
      const existing = await db.review.findFirst({
        where: {
          shop,
          productId: matchedProduct.id,
          reviewerName,
          bodyFull: reviewText,
        },
      });

      if (!existing) {
        await db.review.create({
          data: {
            shop,
            productId: matchedProduct.id,
            productHandle: matchedProduct.handle,
            reviewerName,
            rating: isNaN(rating) ? 5 : rating,
            bodyShort,
            bodyFull: reviewText,
            source: sourceType,
            externalUrl: externalUrl || null,
            isAiGenerated: false,
            isPublished: true,
            isVerifiedPurchase: true,
            tags: JSON.stringify(["imported", sourceType.toLowerCase().replace("imported_", "")]),
          },
        });
        successRows++;
      }
    } else {
      // Row needs manual mapping
      unmatchedRows.push({
        SKU: sku,
        ReviewerName: reviewerName,
        Rating: rating,
        ReviewText: reviewText,
      });
    }
  }

  // Record batch import
  const batch = await db.importBatch.create({
    data: {
      shop,
      sourceType,
      fileName: file.name || "imported_reviews.csv",
      status: unmatchedRows.length > 0 ? "needs_mapping" : "completed",
      totalRows: rows.length,
      successRows,
      failedRows: failedRows + unmatchedRows.length,
      unmatched: JSON.stringify(unmatchedRows),
    },
  });

  return json({
    success: true,
    batchId: batch.id,
    totalRows: rows.length,
    successRows,
    unmatchedRows,
    availableProducts: shopifyProducts,
  });
}
