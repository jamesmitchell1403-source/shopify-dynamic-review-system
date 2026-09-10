import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import db from "../db.server";
import { autoTagReviewText } from "../services/ai/autoTagger";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product") || url.searchParams.get("productId") || "";
  const orderId = url.searchParams.get("order") || url.searchParams.get("orderId") || "";
  const shop = url.searchParams.get("shop") || "";

  // Increment scan count if QR code record exists
  if (productId || orderId) {
    try {
      await db.qrCodeRecord.updateMany({
        where: {
          OR: [
            { productId: productId || undefined },
            { orderId: orderId || undefined },
          ],
        },
        data: {
          scans: { increment: 1 },
        },
      });
    } catch {
      // Non-blocking scan metric increment
    }
  }

  return json({ productId, orderId, shop });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = (formData.get("shop") as string) || "default.myshopify.com";
  const productId = (formData.get("productId") as string) || "general";
  const orderId = (formData.get("orderId") as string) || null;
  const reviewerName = (formData.get("reviewerName") as string) || "Verified Buyer";
  const rating = parseInt((formData.get("rating") as string) || "5", 10);
  const bodyFull = (formData.get("bodyFull") as string) || "";
  const bodyShort = bodyFull.length > 130 ? bodyFull.substring(0, 130) + "..." : bodyFull;

  if (!bodyFull.trim()) {
    return json({ success: false, error: "Please provide a review description." }, { status: 400 });
  }

  // Auto extract USP tags from customer submission
  const tags = await autoTagReviewText(shop, bodyFull);

  await db.review.create({
    data: {
      shop,
      productId,
      orderId,
      reviewerName,
      rating,
      bodyShort,
      bodyFull,
      source: "QR_SUBMITTED",
      isVerifiedPurchase: Boolean(orderId),
      isAiGenerated: false,
      isPublished: false, // Moderation queue
      tags: JSON.stringify(tags),
    },
  });

  return json({ success: true, error: null });
}

export default function SubmitReviewPage() {
  const { productId, orderId, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      backgroundColor: "#f6f6f7",
      minHeight: "100vh",
      padding: "24px 16px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }}>
      <div style={{
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        padding: "32px 24px",
        maxWidth: "480px",
        width: "100%",
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)"
      }}>
        {actionData?.success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", marginBottom: "8px" }}>Thank You!</h2>
            <p style={{ color: "#616161", fontSize: "14px", lineHeight: "1.5" }}>
              Your review has been submitted successfully and is pending verification.
            </p>
          </div>
        ) : (
          <Form method="post">
            <input type="hidden" name="shop" value={shop} />
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="orderId" value={orderId} />

            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
              Share Your Feedback
            </h2>
            <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "20px" }}>
              {orderId ? "Verified Order Purchase Review" : "Product Review"}
            </p>

            {actionData?.error && (
              <div style={{
                backgroundColor: "#fef2f2",
                color: "#991b1b",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                marginBottom: "16px"
              }}>
                {actionData.error}
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Your Name
              </label>
              <input
                type="text"
                name="reviewerName"
                defaultValue="Verified Customer"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Rating
              </label>
              <select
                name="rating"
                defaultValue="5"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  backgroundColor: "#fff",
                  boxSizing: "border-box"
                }}
              >
                <option value="5">⭐⭐⭐⭐⭐ (5/5 Excellent)</option>
                <option value="4">⭐⭐⭐⭐ (4/5 Very Good)</option>
                <option value="3">⭐⭐⭐ (3/5 Average)</option>
                <option value="2">⭐⭐ (2/5 Below Average)</option>
                <option value="1">⭐ (1/5 Poor)</option>
              </select>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Your Review
              </label>
              <textarea
                name="bodyFull"
                rows={4}
                placeholder="What did you love about the product? Tell us about quality, usability, or features!"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "15px",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? "Submitting..." : "Submit Review"}
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
