import { json, type HeadersFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import customStyles from "../app.css?url";

import { authenticate } from "../shopify.server";
import { ensureTablesExist } from "../db.server";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: customStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await ensureTablesExist();
  await authenticate.admin(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || request.headers.get("referer") || "";

  let apiKey = "d97376e1be723a9166b7ec705c55c610";
  if (shop.includes("james-practice")) {
    apiKey = "28fbf0094946ed287e3db764e52796e5";
  } else if (shop.includes("develops-test-store")) {
    apiKey = "d97376e1be723a9166b7ec705c55c610";
  } else if (process.env.SHOPIFY_API_KEY) {
    apiKey = process.env.SHOPIFY_API_KEY;
  }

  return json({ apiKey });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <style>{`
        :root {
          --pg-layout-width-primary-max: 100% !important;
          --pg-layout-width-secondary-max: 0px !important;
          --pg-layout-width-inner-spacing-base: 0px !important;
        }
        html,
        body,
        .Polaris-Page,
        .Polaris-Page--fullWidth,
        .Polaris-Page__Content,
        div.Polaris-Page {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          box-sizing: border-box !important;
        }
      `}</style>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/reviews">Reviews</Link>
        <Link to="/app/ai-generator">AI Review Generator</Link>
        <Link to="/app/import-reviews">Import Reviews</Link>
        <Link to="/app/widget-settings">Widget Settings</Link>
        <Link to="/app/ai-settings">AI Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  try {
    return boundary.error(error);
  } catch (err: any) {
    return (
      <div style={{ padding: "40px 20px", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div style={{ background: "#FFF4F4", border: "1px solid #E0B4B4", borderRadius: "8px", padding: "20px" }}>
          <h2 style={{ color: "#9F3A38", marginTop: 0 }}>Application Notice</h2>
          <p style={{ color: "#414141", lineHeight: 1.5 }}>
            {err?.message || "An issue occurred while loading this section. Please refresh or try again."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              backgroundColor: "#2C6ECB",
              color: "#FFF",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
