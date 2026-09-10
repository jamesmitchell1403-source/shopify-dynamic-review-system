import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Banner,
  Text,
  Badge,
  DropZone,
  Tabs,
  Checkbox,
  ProgressBar,
} from "@shopify/polaris";
import { MagicIcon, ClipboardIcon, PlusIcon, EditIcon, CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { admin, session } = await authenticate.admin(request);

  let products: Array<{ label: string; value: string; description: string; imageUrl: string | null }> = [];
  let isScopeForbidden = false;

  try {
    const res = await admin.graphql(`
      #graphql
      query getProductsForAI {
        products(first: 250) {
          nodes {
            id
            title
            description
            featuredImage {
              url
            }
          }
          edges {
            node {
              id
              title
              description
              featuredImage {
                url
              }
            }
          }
        }
      }
    `);

    if (res.status === 403) {
      isScopeForbidden = true;
    }

    const jsonRes = (await res.json()) as any;
    if (jsonRes.errors && JSON.stringify(jsonRes.errors).includes("403")) {
      isScopeForbidden = true;
    }

    let rawNodes = jsonRes.data?.products?.nodes;
    if (!rawNodes || rawNodes.length === 0) {
      rawNodes = jsonRes.data?.products?.edges?.map((e: any) => e.node) || [];
    }

    if (rawNodes.length > 0) {
      products = rawNodes.map((p: any) => ({
        label: p.title,
        value: p.id,
        description: p.description || p.title || "",
        imageUrl: p.featuredImage?.url || null,
      }));
    }
  } catch (err: any) {
    console.error("GraphQL product fetch error:", err);
    if (err?.status === 403 || String(err).includes("403")) {
      isScopeForbidden = true;
    }
  }

  // REST API Fallback if GraphQL returns 0 items
  if (products.length === 0) {
    try {
      const restRes = await fetch(`https://${session.shop}/admin/api/2025-01/products.json?limit=250`, {
        headers: {
          "X-Shopify-Access-Token": session.accessToken || "",
          "Content-Type": "application/json",
        },
      });

      if (restRes.status === 403) {
        isScopeForbidden = true;
      } else {
        const restJson = await restRes.json();
        if (restJson.products && restJson.products.length > 0) {
          products = restJson.products.map((p: any) => ({
            label: p.title,
            value: p.admin_graphql_api_id || `gid://shopify/Product/${p.id}`,
            description: p.body_html ? p.body_html.replace(/<[^>]*>?/gm, "") : p.title,
            imageUrl: p.image?.src || p.images?.[0]?.src || null,
          }));
        }
      }
    } catch (restErr: any) {
      console.error("REST product fetch error:", restErr);
    }
  }

  if (isScopeForbidden) {
    try {
      await db.session.deleteMany({ where: { shop: session.shop } });
    } catch (purgeErr) {
      console.warn("Session purge error:", purgeErr);
    }
  }

  return json({ products, isScopeForbidden, shop: session.shop });
}

export default function AiGeneratorPage() {
  const { products, isScopeForbidden, shop } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState<number>(0);

  // --- STATE FOR BULK GENERATION FOR ALL PRODUCTS ---
  const [bulkProvider, setBulkProvider] = useState<string>("claude");
  const [bulkLanguage, setBulkLanguage] = useState<string>("en");
  const [reviewsPerProduct, setReviewsPerProduct] = useState<string>("3");
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [bulkSuccessResult, setBulkSuccessResult] = useState<any>(null);
  const [bulkErrorMessage, setBulkErrorMessage] = useState<string | null>(null);

  // --- STATE FOR SINGLE PRODUCT AI GENERATOR ---
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.value || "");
  const [description, setDescription] = useState<string>(products[0]?.description || "");
  const [productImageUrl, setProductImageUrl] = useState<string | null>(products[0]?.imageUrl || null);
  const [notes, setNotes] = useState<string>("");
  const [language, setLanguage] = useState<string>("en");
  const [provider, setProvider] = useState<string>("claude");

  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>(undefined);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const [generatedReviews, setGeneratedReviews] = useState<Array<any>>([]);
  const [providerUsed, setProviderUsed] = useState<string>("");
  const [modelUsed, setModelUsed] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [savedStatus, setSavedStatus] = useState<Record<number, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- STATE FOR MANUAL CUSTOM REVIEW CREATION ---
  const [manualProdId, setManualProdId] = useState<string>(products[0]?.value || "");
  const [manualName, setManualName] = useState<string>("Rachel Vance");
  const [manualRating, setManualRating] = useState<string>("5");
  const [manualShort, setManualShort] = useState<string>("Absolute game changer! Highest quality.");
  const [manualFull, setManualFull] = useState<string>("Bought this item after reading great feedback and it exceeded all expectations. Fast delivery, pristine condition, and works flawlessly.");
  const [manualVerified, setManualVerified] = useState<boolean>(true);
  const [manualPublishImmediately, setManualPublishImmediately] = useState<boolean>(true);
  const [manualSubmitting, setManualSubmitting] = useState<boolean>(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);
  const [manualErrorMsg, setManualErrorMsg] = useState<string | null>(null);

  const tabs = [
    { id: "bulk-gen", content: "🤖 Auto-Generate for ALL Products" },
    { id: "single-gen", content: "🎯 Single Product AI Generator" },
    { id: "manual-create", content: "✍️ Add Custom Manual Review" },
  ];

  const handleProductSelect = (val: string) => {
    setSelectedProductId(val);
    const prod = products.find((p) => p.value === val);
    if (prod) {
      setDescription(prod.description);
      setProductImageUrl(prod.imageUrl || null);
      // Clear any manually uploaded image when switching products
      setImageBase64(undefined);
      setImageMimeType(undefined);
      setImagePreview(null);
    }
  };

  const handleImageDrop = (_files: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setImageMimeType(file.type);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        const base64 = result.split(",")[1];
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Run Bulk AI Generation for ALL Products
  const handleBulkGenerateAll = async () => {
    setBulkLoading(true);
    setBulkErrorMessage(null);
    setBulkSuccessResult(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "bulk_generate_all",
          provider: bulkProvider,
          language: bulkLanguage,
          reviewsPerProduct: Number(reviewsPerProduct),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setBulkErrorMessage(data.error || "Bulk generation failed");
      } else {
        setBulkSuccessResult(data);
      }
    } catch (e: any) {
      setBulkErrorMessage(e.message || "Network error during bulk generation.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Run Single Product AI Generation
  const handleGenerate = async (isMore = false) => {
    setLoading(true);
    setErrorMessage(null);

    const avoidPhrasing = isMore ? generatedReviews.map((r) => r.bodyShort) : [];

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          imageBase64,
          imageMimeType,
          // If no manual image uploaded, pass the Shopify product image URL
          productImageUrl: !imageBase64 ? productImageUrl : undefined,
          description,
          notes,
          language,
          provider,
          avoidPhrasing,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || "Generation failed");
      } else {
        if (isMore) {
          setGeneratedReviews((prev) => [...prev, ...data.reviews]);
        } else {
          setGeneratedReviews(data.reviews);
          setSavedStatus({});
        }
        setProviderUsed(data.providerUsed);
        setModelUsed(data.modelUsed);
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Network error during generation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveDraft = async (review: any, index: number) => {
    setSavingIndex(index);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "save",
          productId: selectedProductId,
          language,
          saveReview: review,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedStatus((prev) => ({ ...prev, [index]: true }));
      } else {
        alert(data.error || "Failed to save draft.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to save draft.");
    } finally {
      setSavingIndex(null);
    }
  };

  // Submit Manual Custom Review
  const handleManualSubmit = async () => {
    setManualSubmitting(true);
    setManualErrorMsg(null);
    setManualSuccessMsg(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "manual_create",
          manualReview: {
            productId: manualProdId,
            reviewerName: manualName,
            rating: manualRating,
            bodyShort: manualShort,
            bodyFull: manualFull,
            isVerifiedPurchase: manualVerified,
            isPublished: manualPublishImmediately,
            language: "en",
          },
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setManualErrorMsg(data.error || "Failed to add manual review.");
      } else {
        setManualSuccessMsg("Custom customer review created successfully!");
        setManualShort("");
        setManualFull("");
      }
    } catch (e: any) {
      setManualErrorMsg(e.message || "Failed to submit custom review.");
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <Page title="AI & Custom Review Generator (Module B)">
      <BlockStack gap="500">
        {isScopeForbidden && (
          <Banner
            title="Updated Product Access Permission Required"
            tone="warning"
            action={{
              content: "Click Here to Re-Authorize App Permissions (1-Click)",
              url: `/auth?shop=${shop}`,
              target: "_top",
            }}
          >
            <p>
              Shopify returned <strong>403 Forbidden</strong> because your app needs updated product access permissions. Click the button above to re-authorize product access scopes for your store in 1 click.
            </p>
          </Banner>
        )}

        <Banner title="Mandatory FTC & Legal Compliance Notice" tone="info">
          <p>
            Generated drafts are saved internally for merchant review. Always ensure customer reviews reflect genuine product features and verified customer experiences before publishing.
          </p>
        </Banner>

        <Card padding="050">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <div style={{ padding: "20px" }}>
              {/* ============================================================ */}
              {/* TAB 0: AUTOMATIC BULK GENERATION FOR ALL PRODUCTS */}
              {/* ============================================================ */}
              {selectedTab === 0 && (
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">🤖 Automatic Bulk Review Generator (All Store Products)</Text>
                  <Text as="p" tone="subdued">
                    Automatically scans your live Shopify catalog ({products.length} products found). To generate reviews for more items, add products in your Shopify Admin (Products → Add product) and they will automatically appear here.
                  </Text>

                  {bulkErrorMessage && (
                    <Banner tone="critical" title="Bulk Generation Error">
                      <p>{bulkErrorMessage}</p>
                    </Banner>
                  )}

                  {bulkSuccessResult && (
                    <Banner tone="success" title="Bulk Generation Completed Cleanly!">
                      <p style={{ fontWeight: 600 }}>
                        Generated {bulkSuccessResult.totalGenerated} unique authentic reviews across {bulkSuccessResult.productsProcessed} products!
                      </p>
                      <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                        {bulkSuccessResult.summary?.map((item: any, idx: number) => (
                          <li key={`bs-${idx}`}>
                            <strong>{item.title}</strong>: {item.count} authentic draft reviews created.
                          </li>
                        ))}
                      </ul>
                    </Banner>
                  )}

                  <InlineGrid columns={3} gap="400">
                    <Select
                      label="Reviews Per Product"
                      options={[
                        { label: "3 Reviews per product", value: "3" },
                        { label: "5 Reviews per product", value: "5" },
                        { label: "7 Reviews per product", value: "7" },
                      ]}
                      value={reviewsPerProduct}
                      onChange={setReviewsPerProduct}
                    />

                    <Select
                      label="Target Language"
                      options={[
                        { label: "English", value: "en" },
                        { label: "Gujarati", value: "gu" },
                        { label: "Hindi", value: "hi" },
                        { label: "Spanish", value: "es" },
                        { label: "French", value: "fr" },
                        { label: "German", value: "de" },
                      ]}
                      value={bulkLanguage}
                      onChange={setBulkLanguage}
                    />

                    <Select
                      label="AI Engine Provider"
                      options={[
                        { label: "Anthropic Claude (claude-3-5-sonnet)", value: "claude" },
                        { label: "Google Gemini (gemini-2.5-flash)", value: "gemini" },
                      ]}
                      value={bulkProvider}
                      onChange={setBulkProvider}
                    />
                  </InlineGrid>

                  {bulkLoading && (
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="bold">
                        Generating unique authentic reviews for all {products.length} store products... Please wait.
                      </Text>
                      <ProgressBar progress={75} animated />
                    </BlockStack>
                  )}

                  <InlineStack align="start">
                    <Button
                      variant="primary"
                      icon={MagicIcon}
                      loading={bulkLoading}
                      onClick={handleBulkGenerateAll}
                    >
                      {`Generate Unique Reviews for ALL ${products.length} Products`}
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}

              {/* ============================================================ */}
              {/* TAB 1: SINGLE PRODUCT INTERACTIVE AI GENERATOR */}
              {/* ============================================================ */}
              {selectedTab === 1 && (
                <Layout>
                  <Layout.Section variant="oneThird">
                    <Card padding="500">
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Product & AI Inputs</Text>

                        {products.length > 0 && (
                          <Select
                            label="Select Shopify Product"
                            options={products}
                            value={selectedProductId}
                            onChange={handleProductSelect}
                          />
                        )}

                        <TextField
                          label="Product Description"
                          value={description}
                          onChange={setDescription}
                          multiline={4}
                          autoComplete="off"
                          placeholder="Enter product description, ingredients, or key features..."
                        />

                        <TextField
                          label="Notes / USPs / Angles"
                          value={notes}
                          onChange={setNotes}
                          multiline={2}
                          autoComplete="off"
                          placeholder="e.g. 24-hr hydration, non-greasy, fast shipping..."
                        />

                        <InlineGrid columns={2} gap="300">
                          <Select
                            label="Target Language"
                            options={[
                              { label: "English", value: "en" },
                              { label: "Gujarati", value: "gu" },
                              { label: "Hindi", value: "hi" },
                              { label: "Spanish", value: "es" },
                              { label: "French", value: "fr" },
                              { label: "German", value: "de" },
                            ]}
                            value={language}
                            onChange={setLanguage}
                          />

                          <Select
                            label="AI Provider"
                            options={[
                              { label: "Anthropic Claude", value: "claude" },
                              { label: "Google Gemini", value: "gemini" },
                            ]}
                            value={provider}
                            onChange={setProvider}
                          />
                        </InlineGrid>

                        <BlockStack gap="200">
                          <Text as="span" variant="bodySm" fontWeight="bold">Product Image (AI Vision)</Text>

                          {/* Auto-show Shopify product image */}
                          {productImageUrl && !imagePreview && (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", background: "#f1f8ff", borderRadius: "8px", border: "1px solid #c9e6ff" }}>
                              <img
                                src={productImageUrl}
                                alt="Product"
                                style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "6px", border: "1px solid #ddd" }}
                              />
                              <BlockStack gap="100">
                                <Text as="span" variant="bodySm" fontWeight="semibold" tone="success">✓ Shopify product image auto-loaded</Text>
                                <Text as="span" variant="bodyXs" tone="subdued">AI will analyze this image to generate matching reviews</Text>
                              </BlockStack>
                            </div>
                          )}

                          <DropZone onDrop={handleImageDrop} allowMultiple={false} accept="image/*">
                            {imagePreview ? (
                              <div style={{ padding: "12px", textAlign: "center" }}>
                                <img src={imagePreview} alt="Preview" style={{ maxHeight: "100px", borderRadius: "8px" }} />
                                <Text as="p" variant="bodyXs" tone="subdued">Custom image uploaded (overrides Shopify image)</Text>
                              </div>
                            ) : (
                              <DropZone.FileUpload actionHint="Or upload a custom image to override" />
                            )}
                          </DropZone>
                        </BlockStack>

                        <Button
                          variant="primary"
                          icon={MagicIcon}
                          loading={loading}
                          onClick={() => handleGenerate(false)}
                        >
                          Generate 5 Authentic Reviews
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

                      {generatedReviews.length > 0 && (
                        <InlineStack align="space-between">
                          <InlineStack gap="200">
                            <Badge tone="info">{`Provider: ${providerUsed}`}</Badge>
                            <Badge tone="success">{`Model: ${modelUsed}`}</Badge>
                          </InlineStack>
                          <Button icon={PlusIcon} onClick={() => handleGenerate(true)} loading={loading}>
                            Generate 5 More
                          </Button>
                        </InlineStack>
                      )}

                      {generatedReviews.length === 0 && !loading && (
                        <Card padding="500">
                          <BlockStack gap="200" align="center">
                            <Text as="p" tone="subdued">
                              Select a product on the left and click "Generate 5 Authentic Reviews" to preview customer feedback.
                            </Text>
                          </BlockStack>
                        </Card>
                      )}

                      {generatedReviews.map((rev, idx) => (
                        <Card key={`rev-${idx}`} padding="500">
                          <BlockStack gap="300">
                            <InlineStack align="space-between">
                              <InlineStack gap="200">
                                <Text as="span" fontWeight="bold" variant="headingSm">{rev.reviewerName}</Text>
                                <Text as="span" tone="subdued">{`${rev.rating} ⭐`}</Text>
                                <Badge tone="success">Verified Purchase</Badge>
                              </InlineStack>

                              <InlineStack gap="200">
                                <Button
                                  icon={ClipboardIcon}
                                  size="micro"
                                  onClick={() => handleCopy(rev.bodyFull, idx)}
                                >
                                  {copiedIndex === idx ? "Copied!" : "Copy"}
                                </Button>

                                <Button
                                  size="micro"
                                  variant="primary"
                                  disabled={savedStatus[idx]}
                                  loading={savingIndex === idx}
                                  onClick={() => handleSaveDraft(rev, idx)}
                                >
                                  {savedStatus[idx] ? "Saved to Drafts ✓" : "Add as Draft Review"}
                                </Button>
                              </InlineStack>
                            </InlineStack>

                            <Text as="p" fontWeight="bold" tone="subdued">
                              Snippet (Widget): "{rev.bodyShort}"
                            </Text>

                            <Text as="p">{rev.bodyFull}</Text>

                            {rev.tags && rev.tags.length > 0 && (
                              <InlineStack gap="100">
                                {rev.tags.map((t: string, tidx: number) => (
                                  <Badge key={`t-${tidx}`} tone="info">{t}</Badge>
                                ))}
                              </InlineStack>
                            )}
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  </Layout.Section>
                </Layout>
              )}

              {/* ============================================================ */}
              {/* TAB 2: ADD MANUAL SPECIFIC CUSTOM REVIEW */}
              {/* ============================================================ */}
              {selectedTab === 2 && (
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">✍️ Add Custom Specific Customer Review</Text>
                  <Text as="p" tone="subdued">
                    Manually write and publish a custom customer review for any specific product in your store.
                  </Text>

                  {manualErrorMsg && (
                    <Banner tone="critical" title="Submission Error">
                      <p>{manualErrorMsg}</p>
                    </Banner>
                  )}

                  {manualSuccessMsg && (
                    <Banner tone="success" title="Success!">
                      <p>{manualSuccessMsg}</p>
                    </Banner>
                  )}

                  <Card padding="500">
                    <BlockStack gap="400">
                      <InlineGrid columns={2} gap="400">
                        <Select
                          label="Target Product"
                          options={products}
                          value={manualProdId}
                          onChange={setManualProdId}
                        />

                        <Select
                          label="Star Rating"
                          options={[
                            { label: "5 Stars (⭐⭐⭐⭐⭐)", value: "5" },
                            { label: "4 Stars (⭐⭐⭐⭐)", value: "4" },
                            { label: "3 Stars (⭐⭐⭐)", value: "3" },
                            { label: "2 Stars (⭐⭐)", value: "2" },
                            { label: "1 Star (⭐)", value: "1" },
                          ]}
                          value={manualRating}
                          onChange={setManualRating}
                        />
                      </InlineGrid>

                      <TextField
                        label="Reviewer Name / Alias"
                        value={manualName}
                        onChange={setManualName}
                        autoComplete="off"
                        placeholder="e.g. Rachel Vance, David K."
                      />

                      <TextField
                        label="Headline / Short Snippet (PDP Card)"
                        value={manualShort}
                        onChange={setManualShort}
                        autoComplete="off"
                        placeholder="e.g. Absolute game changer! Softest fabric I've ever owned."
                      />

                      <TextField
                        label="Full Review Text"
                        value={manualFull}
                        onChange={setManualFull}
                        multiline={4}
                        autoComplete="off"
                        placeholder="Write detailed customer feedback..."
                      />

                      <InlineStack gap="600">
                        <Checkbox
                          label="Mark as Verified Purchase Badge"
                          checked={manualVerified}
                          onChange={setManualVerified}
                        />

                        <Checkbox
                          label="Publish Immediately to Storefront Widget"
                          checked={manualPublishImmediately}
                          onChange={setManualPublishImmediately}
                        />
                      </InlineStack>

                      <InlineStack align="start">
                        <Button
                          variant="primary"
                          icon={CheckIcon}
                          loading={manualSubmitting}
                          onClick={handleManualSubmit}
                        >
                          Submit Custom Review
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}
            </div>
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}
