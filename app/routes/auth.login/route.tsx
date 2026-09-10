import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

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
    return redirect(`/auth?shop=${shop}`);
  }

  const loginResult = await login(request);
  if (loginResult instanceof Response) {
    return loginResult;
  }

  // If login helper returned errors, force redirect to OAuth with target shop
  return redirect(`/auth?shop=${shop}`);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "james-practice-tiwriyta.myshopify.com";
  return redirect(`/auth?shop=${shop}`);
};

export default function Auth() {
  // If component somehow renders, client-side redirect immediately to OAuth
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get("shop") || "james-practice-tiwriyta.myshopify.com";
    window.location.href = `/auth?shop=${shop}`;
  }

  return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
      <p>Authenticating with Shopify... Please wait.</p>
    </div>
  );
}
