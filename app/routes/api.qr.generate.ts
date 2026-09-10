import { json, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import QRCode from "qrcode";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  let session: any;
  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
  } catch {
    return json({ success: false, error: "Session expired. Please refresh the page." }, { status: 401 });
  }
  const shop = session.shop;

  const body = await request.json();
  const { type, productId, orderId } = body; // type: "product" | "order" | "generic"

  // Construct submission URL
  const appProxyBase = `https://${shop}/apps/reviews/submit`;
  const params = new URLSearchParams({ shop });

  if (productId) params.set("product", productId);
  if (orderId) params.set("order", orderId);

  const targetUrl = `${appProxyBase}?${params.toString()}`;

  try {
    // Generate QR code PNG Data URL
    const qrImageDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    // Save QR record in database
    const record = await db.qrCodeRecord.create({
      data: {
        shop,
        type: type || "product",
        productId: productId || null,
        orderId: orderId || null,
        targetUrl,
        imageUrl: qrImageDataUrl,
        scans: 0,
      },
    });

    return json({
      success: true,
      qrRecord: record,
      imageUrl: qrImageDataUrl,
      targetUrl,
    });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
