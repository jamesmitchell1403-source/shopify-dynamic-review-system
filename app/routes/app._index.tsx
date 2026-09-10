import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  DataTable,
  Button,
  InlineStack,
  Banner,
  Icon,
} from "@shopify/polaris";
import {
  MagicIcon,
  ImportIcon,
  ProductIcon,
  SettingsIcon,
  StarFilledIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let totalReviews = 0;
  let publishedReviews = 0;
  let pendingReviews = 0;
  let aiGeneratedCount = 0;
  let importedCount = 0;
  let totalQrScans = 0;
  let recentReviews: any[] = [];

  try {
    totalReviews = await db.review.count({ where: { shop } });
    publishedReviews = await db.review.count({ where: { shop, isPublished: true } });
    pendingReviews = await db.review.count({ where: { shop, isPublished: false } });
    aiGeneratedCount = await db.review.count({ where: { shop, isAiGenerated: true } });
    importedCount = await db.review.count({
      where: {
        shop,
        source: { in: ["IMPORTED_AMAZON", "IMPORTED_FLIPKART", "IMPORTED_ALIBABA"] },
      },
    });

    const qrScansResult = await db.qrCodeRecord.aggregate({
      where: { shop },
      _sum: { scans: true },
    });
    totalQrScans = qrScansResult._sum.scans || 0;

    recentReviews = await db.review.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  } catch (err) {
    console.error("Dashboard DB fetch error:", err);
  }

  return json({
    totalReviews,
    publishedReviews,
    pendingReviews,
    aiGeneratedCount,
    importedCount,
    totalQrScans,
    recentReviews,
  });
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = data.recentReviews.map((r) => [
    r.reviewerName || "Verified Buyer",
    `${r.rating} / 5 ⭐`,
    r.bodyShort,
    r.source,
    r.isPublished ? "Published" : "Pending",
  ]);

  return (
    <Page title="Dynamic Review Ecosystem Dashboard">
      <BlockStack gap="500">
        <Banner title="AI-Powered Dynamic Review System is active!" tone="success">
          <p>Surfacing high-converting PDP floating reviews, multi-provider AI draft generation (Claude + Gemini), marketplace imports, and QR post-purchase collection.</p>
        </Banner>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">Total Reviews</Text>
              <Text as="p" variant="headingLg">{data.totalReviews}</Text>
              <InlineStack gap="100">
                <Badge tone="success">{`${data.publishedReviews} Published`}</Badge>
                {data.pendingReviews > 0 && <Badge tone="warning">{`${data.pendingReviews} Pending`}</Badge>}
              </InlineStack>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">AI Draft Reviews</Text>
              <Text as="p" variant="headingLg">{data.aiGeneratedCount}</Text>
              <Badge tone="info">Claude & Gemini AI</Badge>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">Marketplace Imports</Text>
              <Text as="p" variant="headingLg">{data.importedCount}</Text>
              <Badge tone="attention">Amazon / Flipkart / Alibaba</Badge>
            </BlockStack>
          </Card>

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">QR Code Scans</Text>
              <Text as="p" variant="headingLg">{data.totalQrScans}</Text>
              <Badge tone="success">Physical Touchpoints</Badge>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card padding="500">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Quick Actions</Text>
            <InlineStack gap="300" wrap>
              <Button icon={MagicIcon} variant="primary" onClick={() => navigate("/app/ai-generator")}>
                Generate AI Reviews
              </Button>
              <Button icon={ImportIcon} onClick={() => navigate("/app/import-reviews")}>
                Import Marketplace CSV
              </Button>
              <Button icon={ProductIcon} onClick={() => navigate("/app/qr-codes")}>
                Generate QR Codes
              </Button>
              <Button icon={SettingsIcon} onClick={() => navigate("/app/widget-settings")}>
                Configure PDP Widget
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Recent Reviews</Text>
              <Button variant="plain" onClick={() => navigate("/app/reviews")}>View All</Button>
            </InlineStack>

            {data.recentReviews.length === 0 ? (
              <Text as="p" tone="subdued">No reviews found yet. Start by generating AI draft reviews or importing a CSV.</Text>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Reviewer", "Rating", "Snippet", "Source", "Status"]}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
