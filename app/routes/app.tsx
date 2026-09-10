import { json, type HeadersFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "28fbf0094946ed287e3db764e52796e5" });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/reviews">Reviews</Link>
        <Link to="/app/ai-generator">AI Review Generator</Link>
        <Link to="/app/import-reviews">Import Reviews</Link>
        <Link to="/app/qr-codes">QR Codes</Link>
        <Link to="/app/widget-settings">Widget Settings</Link>
        <Link to="/app/ai-settings">AI Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Custom ErrorBoundary to display exact error details if server error occurs
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("APP_LOAD_ERROR:", error);

  let errorMessage = "Unknown error occurred";
  let errorStack = "";

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "";
  } else if (typeof error === "object" && error !== null) {
    errorMessage = JSON.stringify(error, null, 2);
  } else {
    errorMessage = String(error);
  }

  return (
    <div style={{ padding: "30px", fontFamily: "monospace", color: "#b91c1c", background: "#fef2f2", margin: "20px", borderRadius: "8px", border: "1px solid #fca5a5" }}>
      <h3 style={{ margin: "0 0 10px 0", fontSize: "18px" }}>⚠️ App Loader Error</h3>
      <p style={{ fontWeight: "bold", fontSize: "14px", color: "#991b1b" }}>{errorMessage}</p>
      {errorStack && (
        <pre style={{ background: "#ffffff", padding: "12px", borderRadius: "4px", fontSize: "12px", overflowX: "auto", border: "1px solid #fee2e2" }}>
          {errorStack}
        </pre>
      )}
    </div>
  );
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
