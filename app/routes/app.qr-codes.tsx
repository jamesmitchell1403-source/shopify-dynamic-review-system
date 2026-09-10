import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Button,
  Banner,
  Text,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { ProductIcon, ExportIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch shop products for selection
  let products: Array<{ label: string; value: string }> = [];
  try {
    const res = await admin.graphql(`
      query getProductsForQR {
        products(first: 50) {
          nodes {
            id
            title
          }
        }
      }
    `);
    const jsonRes = await res.json();
    products = jsonRes.data?.products?.nodes?.map((p: any) => ({
      label: p.title,
      value: p.id,
    })) || [];
  } catch (e) {
    console.warn("GraphQL products fetch error:", e);
  }

  let qrRecords: any[] = [];
  try {
    qrRecords = await db.qrCodeRecord.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("QR codes loader DB error:", err);
  }

  return json({ products, qrRecords, shop });
}

export default function QrCodesPage() {
  const { products, qrRecords, shop } = useLoaderData<typeof loader>();

  const [type, setType] = useState<string>("product");
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.value || "");
  const [orderId, setOrderId] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [generatedQr, setGeneratedQr] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerateQr = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          productId: type === "product" ? selectedProductId : undefined,
          orderId: type === "order" ? orderId : undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || "Failed to generate QR code.");
      } else {
        setGeneratedQr(data);
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (imageUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const rows = qrRecords.map((r) => [
    r.type.toUpperCase(),
    r.productId || r.orderId || "Generic",
    <a key={`u-${r.id}`} href={r.targetUrl} target="_blank" rel="noreferrer" style={{ fontSize: "12px" }}>
      {r.targetUrl}
    </a>,
    <Badge key={`sc-${r.id}`} tone="success">{`${r.scans} Scans`}</Badge>,
    <Button
      key={`d-${r.id}`}
      size="micro"
      icon={ExportIcon}
      onClick={() => handleDownload(r.imageUrl, `qr_${r.id}.png`)}
    >
      Download
    </Button>,
  ]);

  return (
    <Page title="QR Code Review Generator (Module E)">
      <BlockStack gap="500">
        <Banner title="Offline & Post-Purchase Review Touchpoints" tone="info">
          <p>Generate downloadable QR codes for physical product packaging, receipt inserts, or in-store displays. Customers scan the QR code to open a frictionless review submission form.</p>
        </Banner>

        <Layout>
          <Layout.Section variant="oneThird">
            <Card padding="500">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Generate QR Code</Text>

                <Select
                  label="QR Type"
                  options={[
                    { label: "Product-Specific Static QR", value: "product" },
                    { label: "Order-Linked Verified QR", value: "order" },
                  ]}
                  value={type}
                  onChange={setType}
                />

                {type === "product" ? (
                  <Select
                    label="Target Product"
                    options={products}
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                  />
                ) : (
                  <TextField
                    label="Order ID / Number"
                    value={orderId}
                    onChange={setOrderId}
                    autoComplete="off"
                    placeholder="e.g. #1001 or gid://shopify/Order/12345"
                  />
                )}

                <Button
                  variant="primary"
                  icon={ProductIcon}
                  loading={loading}
                  onClick={handleGenerateQr}
                >
                  Generate QR Code
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              {errorMessage && (
                <Banner tone="critical" title="Generation Error">
                  <p>{errorMessage}</p>
                </Banner>
              )}

              {generatedQr && (
                <Card padding="500">
                  <BlockStack gap="400" align="center">
                    <Text as="h2" variant="headingMd">Generated QR Code Preview</Text>

                    <img
                      src={generatedQr.imageUrl}
                      alt="Generated QR Code"
                      style={{ width: "220px", height: "220px", borderRadius: "12px", border: "1px solid #e1e3e5" }}
                    />

                    <Text as="p" variant="bodySm" tone="subdued">
                      Target URL: {generatedQr.targetUrl}
                    </Text>

                    <Button
                      icon={ExportIcon}
                      variant="primary"
                      onClick={() => handleDownload(generatedQr.imageUrl, "review_qr.png")}
                    >
                      Download PNG (Print Ready)
                    </Button>
                  </BlockStack>
                </Card>
              )}

              <Card padding="500">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">QR Code Analytics & History</Text>

                  {qrRecords.length === 0 ? (
                    <Text as="p" tone="subdued">No QR codes generated yet.</Text>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text", "text"]}
                      headings={["Type", "Target", "Target URL", "Scans", "Action"]}
                      rows={rows}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
