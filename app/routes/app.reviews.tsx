import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Select,
  Banner,
  TextField,
  Pagination,
  InlineGrid,
  Checkbox,
  Modal,
  FormLayout,
} from "@shopify/polaris";
import { SearchIcon, CheckIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db, { ensureTablesExist } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureTablesExist();
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const sourceFilter = url.searchParams.get("source") || "ALL";
  const statusFilter = url.searchParams.get("status") || "ALL";
  const searchQuery = url.searchParams.get("search") || "";
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const pageSize = 10;

  const whereClause: any = { shop };
  if (sourceFilter !== "ALL") whereClause.source = sourceFilter;
  if (statusFilter === "PUBLISHED") whereClause.isPublished = true;
  if (statusFilter === "PENDING") whereClause.isPublished = false;

  if (searchQuery.trim() !== "") {
    whereClause.OR = [
      { reviewerName: { contains: searchQuery } },
      { bodyShort: { contains: searchQuery } },
      { bodyFull: { contains: searchQuery } },
    ];
  }

  let totalReviewsCount = 0;
  let totalPages = 1;
  let reviews: any[] = [];

  try {
    totalReviewsCount = await db.review.count({ where: whereClause });
    totalPages = Math.ceil(totalReviewsCount / pageSize) || 1;

    reviews = await db.review.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  } catch (err) {
    console.error("Reviews loader DB error:", err);
  }

  return json({
    reviews,
    sourceFilter,
    statusFilter,
    searchQuery,
    page,
    pageSize,
    totalReviewsCount,
    totalPages,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");
  const reviewId = formData.get("reviewId") as string;

  if (intent === "togglePublish") {
    const review = await db.review.findUnique({ where: { id: reviewId } });
    if (review && review.shop === shop) {
      await db.review.update({
        where: { id: reviewId },
        data: { isPublished: !review.isPublished },
      });
    }
  } else if (intent === "approveAllPending") {
    await db.review.updateMany({
      where: { shop, isPublished: false },
      data: { isPublished: true },
    });
  } else if (intent === "delete") {
    await db.review.deleteMany({
      where: { id: reviewId, shop },
    });
  } else if (intent === "deleteAllPending") {
    await db.review.deleteMany({
      where: { shop, isPublished: false },
    });
  } else if (intent === "deleteAll") {
    await db.review.deleteMany({ where: { shop } });
  } else if (intent === "deleteSelected") {
    const ids = formData.getAll("ids") as string[];
    if (ids.length > 0) {
      await db.review.deleteMany({
        where: { id: { in: ids }, shop },
      });
    }
  } else if (intent === "edit") {
    const reviewerName = formData.get("reviewerName") as string;
    const rating = parseInt((formData.get("rating") as string) || "5", 10);
    const bodyShort = formData.get("bodyShort") as string;
    const bodyFull = formData.get("bodyFull") as string;
    const source = formData.get("source") as string;
    const externalUrl = formData.get("externalUrl") as string;
    const isVerifiedPurchase = formData.get("isVerifiedPurchase") === "true";

    await db.review.updateMany({
      where: { id: reviewId, shop },
      data: {
        reviewerName,
        rating,
        bodyShort,
        bodyFull,
        source,
        externalUrl: externalUrl || null,
        isVerifiedPurchase,
      },
    });
  }

  return json({ success: true });
}

export default function ReviewsPage() {
  const {
    reviews,
    sourceFilter,
    statusFilter,
    searchQuery,
    page,
    pageSize,
    totalReviewsCount,
    totalPages,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [searchValue, setSearchValue] = useState<string>(searchQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // EDIT MODAL STATE
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editRating, setEditRating] = useState<string>("5");
  const [editShort, setEditShort] = useState<string>("");
  const [editFull, setEditFull] = useState<string>("");
  const [editSource, setEditSource] = useState<string>("MANUAL");
  const [editExternalUrl, setEditExternalUrl] = useState<string>("");
  const [editVerified, setEditVerified] = useState<boolean>(true);

  const handleOpenEdit = (r: any) => {
    setEditId(r.id);
    setEditName(r.reviewerName || "");
    setEditRating(String(r.rating || 5));
    setEditShort(r.bodyShort || "");
    setEditFull(r.bodyFull || "");
    setEditSource(r.source || "MANUAL");
    setEditExternalUrl(r.externalUrl || "");
    setEditVerified(r.isVerifiedPurchase ?? true);
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    const fd = new FormData();
    fd.append("intent", "edit");
    fd.append("reviewId", editId);
    fd.append("reviewerName", editName);
    fd.append("rating", editRating);
    fd.append("bodyShort", editShort);
    fd.append("bodyFull", editFull);
    fd.append("source", editSource);
    fd.append("externalUrl", editExternalUrl);
    fd.append("isVerifiedPurchase", editVerified ? "true" : "false");

    submit(fd, { method: "post" });
    setEditModalOpen(false);
  };

  const allCurrentIds = reviews.map((r) => r.id);
  const allSelected =
    allCurrentIds.length > 0 &&
    allCurrentIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCurrentIds));
    }
  }, [allSelected, allCurrentIds]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    window.location.search = params.toString();
  };

  const handleSourceChange = (val: string) => updateFilters({ source: val });
  const handleStatusChange = (val: string) => updateFilters({ status: val });
  const handleSearchSubmit = () => updateFilters({ search: searchValue });

  const handleTogglePublish = (id: string) => {
    const fd = new FormData();
    fd.append("intent", "togglePublish");
    fd.append("reviewId", id);
    submit(fd, { method: "post" });
  };

  const handleApproveAllPending = () => {
    if (confirm("Approve and publish ALL pending draft reviews for your store?")) {
      const fd = new FormData();
      fd.append("intent", "approveAllPending");
      submit(fd, { method: "post" });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this review?")) {
      const fd = new FormData();
      fd.append("intent", "delete");
      fd.append("reviewId", id);
      submit(fd, { method: "post" });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      confirm(
        `Are you sure you want to delete ${selectedIds.size} selected review${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`
      )
    ) {
      const fd = new FormData();
      fd.append("intent", "deleteSelected");
      selectedIds.forEach((id) => fd.append("ids", id));
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const handleDeleteAll = () => {
    if (
      confirm(
        `⚠️ WARNING: This will permanently delete ALL ${totalReviewsCount} reviews for your store. This cannot be undone!`
      ) &&
      confirm("Are you absolutely sure? ALL reviews will be deleted forever.")
    ) {
      const fd = new FormData();
      fd.append("intent", "deleteAll");
      submit(fd, { method: "post" });
      setSelectedIds(new Set());
    }
  };

  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalReviewsCount);

  // Select-all header checkbox cell
  const selectAllCell = (
    <div style={{ display: "flex", alignItems: "center", paddingLeft: "2px" }}>
      <Checkbox
        label=""
        labelHidden
        checked={allSelected}
        onChange={toggleSelectAll}
      />
    </div>
  );

  const rows = reviews.map((r) => [
    <div
      key={`cb-${r.id}`}
      style={{ display: "flex", alignItems: "center", paddingLeft: "2px" }}
    >
      <Checkbox
        label=""
        labelHidden
        checked={selectedIds.has(r.id)}
        onChange={() => toggleSelectOne(r.id)}
      />
    </div>,

    <BlockStack key={`r-${r.id}`} gap="100">
      <Text as="span" fontWeight="bold">
        {r.reviewerName || "Verified Buyer"}
      </Text>
      {r.isVerifiedPurchase && (
        <Badge tone="success">Verified Purchase</Badge>
      )}
    </BlockStack>,

    `${r.rating} ⭐`,

    <BlockStack key={`b-${r.id}`} gap="100">
      <Text as="span" variant="bodySm" fontWeight="bold">
        {r.bodyShort}
      </Text>
      <Text as="span" variant="bodyXs" tone="subdued">
        {(r.bodyFull || "").length > 120
          ? `${(r.bodyFull || "").substring(0, 120)}...`
          : r.bodyFull}
      </Text>
      {r.externalUrl && (
        <Text as="span" variant="bodyXs" tone="subdued">
          🔗 {r.externalUrl}
        </Text>
      )}
      {r.isAiGenerated && (
        <Badge tone="warning">AI-Generated Draft</Badge>
      )}
    </BlockStack>,

    <Badge key={`s-${r.id}`} tone={r.source.startsWith("IMPORTED") ? "attention" : "success"}>
      {r.source.replace("IMPORTED_", "")}
    </Badge>,

    <Badge key={`st-${r.id}`} tone={r.isPublished ? "success" : "warning"}>
      {r.isPublished ? "Published" : "Pending"}
    </Badge>,

    <InlineStack key={`a-${r.id}`} gap="200">
      <Button
        size="micro"
        icon={EditIcon}
        onClick={() => handleOpenEdit(r)}
      >
        Edit
      </Button>
      <Button
        size="micro"
        tone={r.isPublished ? "critical" : "success"}
        onClick={() => handleTogglePublish(r.id)}
      >
        {r.isPublished ? "Unpublish" : "Approve & Publish"}
      </Button>
      <Button
        size="micro"
        tone="critical"
        icon={DeleteIcon}
        onClick={() => handleDelete(r.id)}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page fullWidth title="Reviews Moderation & Management">
      <BlockStack gap="500">
        <Banner title="Review Moderation Queue" tone="info">
          <p>
            Manage, verify, edit, approve, and publish customer reviews. Use the full-width management table to filter reviews by marketplace source or moderation status.
          </p>
        </Banner>

        <Card padding="500">
          <BlockStack gap="400">
            {/* SEARCH AND BULK ACTIONS */}
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ width: "380px" }}>
                <TextField
                  label=""
                  labelHidden
                  placeholder="Search by reviewer name, keyword, or snippet..."
                  value={searchValue}
                  onChange={setSearchValue}
                  prefix={<SearchIcon />}
                  onBlur={handleSearchSubmit}
                  autoComplete="off"
                />
              </div>

              <InlineStack gap="200">
                {someSelected && (
                  <Button
                    variant="primary"
                    tone="critical"
                    icon={DeleteIcon}
                    loading={isSubmitting}
                    onClick={handleBulkDelete}
                  >
                    {`Delete Selected (${selectedIds.size})`}
                  </Button>
                )}
                <Button
                  tone="critical"
                  icon={DeleteIcon}
                  loading={isSubmitting}
                  onClick={handleDeleteAll}
                >
                  Delete All Reviews
                </Button>
                <Button
                  variant="primary"
                  icon={CheckIcon}
                  onClick={handleApproveAllPending}
                >
                  Approve All Pending Drafts
                </Button>
              </InlineStack>
            </InlineStack>

            {/* FILTERS */}
            <InlineGrid columns={2} gap="400">
              <Select
                label="Filter by Source"
                options={[
                  { label: "All Sources", value: "ALL" },
                  { label: "Manual Submissions", value: "MANUAL" },
                  { label: "AI Generated", value: "AI_GENERATED" },
                  { label: "Amazon Imported", value: "IMPORTED_AMAZON" },
                  { label: "Flipkart Imported", value: "IMPORTED_FLIPKART" },
                  { label: "Alibaba Imported", value: "IMPORTED_ALIBABA" },
                  { label: "QR Code Submissions", value: "QR_SUBMITTED" },
                ]}
                value={sourceFilter}
                onChange={handleSourceChange}
              />

              <Select
                label="Filter by Status"
                options={[
                  { label: "All Statuses", value: "ALL" },
                  { label: "Published Only", value: "PUBLISHED" },
                  { label: "Pending Moderation", value: "PENDING" },
                ]}
                value={statusFilter}
                onChange={handleStatusChange}
              />
            </InlineGrid>

            {/* COUNT HEADER & PAGINATION */}
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="span" tone="subdued">
                  {totalReviewsCount > 0
                    ? `Showing ${startRecord}–${endRecord} of ${totalReviewsCount} reviews`
                    : "0 reviews found"}
                </Text>
                {someSelected && (
                  <Text as="span" tone="caution" fontWeight="semibold">
                    {selectedIds.size} review{selectedIds.size > 1 ? "s" : ""} selected
                  </Text>
                )}
              </BlockStack>

              {totalPages > 1 && (
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => updateFilters({ page: String(page - 1) })}
                  hasNext={page < totalPages}
                  onNext={() => updateFilters({ page: String(page + 1) })}
                  label={`Page ${page} of ${totalPages}`}
                />
              )}
            </InlineStack>

            {/* TABLE */}
            {reviews.length === 0 ? (
              <Text as="p" tone="subdued">
                No reviews match your selected filters.
              </Text>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                headings={[
                  selectAllCell,
                  "Reviewer",
                  "Rating",
                  "Snippet & Review Text",
                  "Source",
                  "Status",
                  "Actions",
                ]}
                rows={rows}
              />
            )}

            {/* BOTTOM PAGINATION */}
            {totalPages > 1 && (
              <InlineStack align="center">
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => updateFilters({ page: String(page - 1) })}
                  hasNext={page < totalPages}
                  onNext={() => updateFilters({ page: String(page + 1) })}
                  label={`Page ${page} of ${totalPages}`}
                />
              </InlineStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* EDIT REVIEW MODAL */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer Review Details"
        primaryAction={{
          content: "Save Changes",
          onAction: handleSaveEdit,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEditModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <InlineGrid columns={2} gap="400">
              <TextField
                label="Reviewer Name"
                value={editName}
                onChange={setEditName}
                autoComplete="off"
              />

              <Select
                label="Rating"
                options={[
                  { label: "5 Stars (⭐⭐⭐⭐⭐)", value: "5" },
                  { label: "4 Stars (⭐⭐⭐⭐)", value: "4" },
                  { label: "3 Stars (⭐⭐⭐)", value: "3" },
                  { label: "2 Stars (⭐⭐)", value: "2" },
                  { label: "1 Star (⭐)", value: "1" },
                ]}
                value={editRating}
                onChange={setEditRating}
              />
            </InlineGrid>

            <TextField
              label="Short Snippet / Headline"
              value={editShort}
              onChange={setEditShort}
              autoComplete="off"
              helpText="Displayed in floating review cards and widget snippets."
            />

            <TextField
              label="Full Review Text"
              value={editFull}
              onChange={setEditFull}
              multiline={4}
              autoComplete="off"
            />

            <InlineGrid columns={2} gap="400">
              <Select
                label="Source Channel"
                options={[
                  { label: "Manual Submission", value: "MANUAL" },
                  { label: "AI Generated", value: "AI_GENERATED" },
                  { label: "Amazon Imported", value: "IMPORTED_AMAZON" },
                  { label: "Flipkart Imported", value: "IMPORTED_FLIPKART" },
                  { label: "Alibaba Imported", value: "IMPORTED_ALIBABA" },
                  { label: "QR Code Submitted", value: "QR_SUBMITTED" },
                ]}
                value={editSource}
                onChange={setEditSource}
              />

              <TextField
                label="Marketplace Link (URL)"
                value={editExternalUrl}
                onChange={setEditExternalUrl}
                autoComplete="off"
                placeholder="https://www.amazon.com/dp/..."
                helpText="Clicking the marketplace logo on the storefront popup opens this link."
              />
            </InlineGrid>

            <Checkbox
              label="Mark as Verified Purchase"
              checked={editVerified}
              onChange={setEditVerified}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
