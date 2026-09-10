import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop");

  if (!shop) {
    const referer = request.headers.get("referer") || "";
    const match = referer.match(/store\/([^\/]+)/);
    if (match && match[1]) {
      shop = `${match[1]}.myshopify.com`;
    } else {
      shop = "james-practice-tiwriyta.myshopify.com";
    }
  }

  const apiKey = process.env.SHOPIFY_API_KEY || "28fbf0094946ed287e3db764e52796e5";
  const scopes = process.env.SCOPES || "read_themes,write_themes,read_products,read_orders";
  const appUrl = process.env.SHOPIFY_APP_URL || "https://shopify-dynamic-review-system.onrender.com";
  const redirectUri = encodeURIComponent(`${appUrl}/auth/callback`);

  const oauthUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}`;

  return redirect(oauthUrl);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "james-practice-tiwriyta.myshopify.com";

  const apiKey = process.env.SHOPIFY_API_KEY || "28fbf0094946ed287e3db764e52796e5";
  const scopes = process.env.SCOPES || "read_themes,write_themes,read_products,read_orders";
  const appUrl = process.env.SHOPIFY_APP_URL || "https://shopify-dynamic-review-system.onrender.com";
  const redirectUri = encodeURIComponent(`${appUrl}/auth/callback`);

  const oauthUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}`;

  return redirect(oauthUrl);
};

export default function Auth() {
  return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
      <p>Redirecting to Shopify App Authorization...</p>
    </div>
  );
}
