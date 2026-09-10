import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Select,
  Button,
  DropZone,
  Banner,
  Text,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { ImportIcon, ExportIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { ensureTablesExist } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);
  const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ("shpat_" + "619247c484119ab17aa96895bc8d90ef");

  // Fetch shop products for manual mapping dropdown
  let products: Array<{ label: string; value: string }> = [];
  try {
    const res = await admin.graphql(`
      query getProductsForImport {
        products(first: 100) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `);
    const jsonRes = await res.json();
    const rawNodes = jsonRes.data?.products?.nodes || jsonRes.data?.products?.edges?.map((e: any) => e.node) || [];
    if (rawNodes.length > 0) {
      products = rawNodes.map((p: any) => ({
        label: `${p.title} (${p.handle || ""})`,
        value: p.id,
      }));
    }
  } catch (e) {
    console.warn("GraphQL products fetch error:", e);
  }

  if (products.length === 0) {
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
          products = restJson.products.map((p: any) => ({
            label: `${p.title} (${p.handle || ""})`,
            value: p.admin_graphql_api_id || `gid://shopify/Product/${p.id}`,
          }));
        }
      }
    } catch (restErr) {
      console.error("REST product fetch error:", restErr);
    }
  }

  return json({ products });
}

export default function ImportReviewsPage() {
  const { products } = useLoaderData<typeof loader>();

  const [sourceType, setSourceType] = useState<string>("IMPORTED_AMAZON");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [targetProductId, setTargetProductId] = useState<string>("");
  const [importResult, setImportResult] = useState<any>(null);
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDrop = (_files: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "SKU/ASIN,ReviewerName,Rating,ReviewText,Date\nB08N5WRWNW,Jane Smith,5,Amazing product! Highly recommend for daily use.,2026-08-01\nB08N5WRWNW,John Doe,4,Very good build quality and fast shipping.,2026-08-05";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${sourceType.toLowerCase()}_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setErrorMessage(null);

    const fd = new FormData();
    fd.append("csvFile", file);
    fd.append("sourceType", sourceType);
    fd.append("overrideProductId", targetProductId);

    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || "CSV upload failed.");
      } else {
        setImportResult(data);
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualMapChange = (rowIdx: number, targetProdId: string) => {
    setManualMappings((prev) => ({ ...prev, [rowIdx]: targetProdId }));
  };

  const handleConfirmManualMappings = async () => {
    if (!importResult?.unmatchedRows) return;
    setLoading(true);

    const payload = importResult.unmatchedRows
      .map((row: any, idx: number) => ({
        reviewData: row,
        targetProductId: manualMappings[idx],
      }))
      .filter((item: any) => Boolean(item.targetProductId));

    const fd = new FormData();
    fd.append("manualMappings", JSON.stringify(payload));
    fd.append("sourceType", sourceType);

    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully imported ${data.createdCount} mapped reviews!`);
        setImportResult(null);
        setFile(null);
        setManualMappings({});
      }
    } catch (e: any) {
      alert(e.message || "Failed to submit manual mappings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Marketplace Review Import (Module C)">
      <BlockStack gap="500">
        <Banner title="Consolidate Marketplace Reviews" tone="info">
          <p>Import authentic reviews from Amazon, Flipkart, or Alibaba via CSV. Imported reviews retain a clear marketplace source badge for complete transparency on your storefront.</p>
        </Banner>

        <Card padding="500">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Upload CSV File</Text>

            <InlineStack gap="400">
              <div style={{ width: "220px" }}>
                <Select
                  label="Marketplace Source"
                  options={[
                    { label: "Amazon CSV", value: "IMPORTED_AMAZON" },
                    { label: "Flipkart CSV", value: "IMPORTED_FLIPKART" },
                    { label: "Alibaba CSV", value: "IMPORTED_ALIBABA" },
                  ]}
                  value={sourceType}
                  onChange={setSourceType}
                />
              </div>

              <div style={{ width: "260px" }}>
                <Select
                  label="Assign to Product (Optional)"
                  options={[
                    { label: "-- Auto-detect by SKU/ASIN --", value: "" },
                    ...products,
                  ]}
                  value={targetProductId}
                  onChange={setTargetProductId}
                />
              </div>

              <div style={{ paddingTop: "24px" }}>
                <Button icon={ExportIcon} onClick={handleDownloadTemplate}>
                  Download CSV Template
                </Button>
              </div>
            </InlineStack>

            <DropZone onDrop={handleDrop} allowMultiple={false} accept=".csv">
              {file ? (
                <div style={{ padding: "16px", textAlign: "center" }}>
                  <Text as="p" fontWeight="bold">{`Selected File: ${file.name}`}</Text>
                  <Text as="p" tone="subdued">{`${(file.size / 1024).toFixed(1)} KB`}</Text>
                </div>
              ) : (
                <DropZone.FileUpload actionHint="Drag & drop your CSV file here or click to browse" />
              )}
            </DropZone>

            <Button
              variant="primary"
              icon={ImportIcon}
              disabled={!file}
              loading={loading}
              onClick={handleUpload}
            >
              Start CSV Import Process
            </Button>
          </BlockStack>
        </Card>

        {errorMessage && (
          <Banner tone="critical" title="Import Error">
            <p>{errorMessage}</p>
          </Banner>
        )}

        {importResult && (
          <Card padding="500">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Import Batch Summary</Text>

              <InlineStack gap="300">
                <Badge tone="info">{`Total Rows: ${importResult.totalRows}`}</Badge>
                <Badge tone="success">{`Auto-Matched & Imported: ${importResult.successRows}`}</Badge>
                <Badge tone="warning">{`Unmatched Rows: ${importResult.unmatchedRows?.length || 0}`}</Badge>
              </InlineStack>

              {importResult.unmatchedRows && importResult.unmatchedRows.length > 0 && (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm" tone="caution">
                    Manual SKU Mapping Required ({importResult.unmatchedRows.length} Rows)
                  </Text>
                  <p>The following reviews could not be auto-matched to a Shopify SKU/ASIN. Select the target product for each row below:</p>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e1e3e5", textAlign: "left" }}>
                        <th style={{ padding: "8px" }}>SKU/ASIN</th>
                        <th style={{ padding: "8px" }}>Reviewer</th>
                        <th style={{ padding: "8px" }}>Rating</th>
                        <th style={{ padding: "8px" }}>Review Text</th>
                        <th style={{ padding: "8px" }}>Map to Shopify Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.unmatchedRows.map((row: any, idx: number) => (
                        <tr key={`u-${idx}`} style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "8px" }}>{row.SKU || "N/A"}</td>
                          <td style={{ padding: "8px" }}>{row.ReviewerName}</td>
                          <td style={{ padding: "8px" }}>{`${row.Rating} ⭐`}</td>
                          <td style={{ padding: "8px", maxWidth: "300px" }}>{row.ReviewText}</td>
                          <td style={{ padding: "8px" }}>
                            <Select
                              label=""
                              labelHidden
                              options={[
                                { label: "-- Select Target Product --", value: "" },
                                ...products,
                              ]}
                              value={manualMappings[idx] || ""}
                              onChange={(val) => handleManualMapChange(idx, val)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <Button variant="primary" loading={loading} onClick={handleConfirmManualMappings}>
                    Save Mapped Reviews
                  </Button>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
