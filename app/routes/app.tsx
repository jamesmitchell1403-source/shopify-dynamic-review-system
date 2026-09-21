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
        <Link to="/app/qr-codes">QR Codes</Link>
        <Link to="/app/widget-settings">Widget Settings</Link>
        <Link to="/app/ai-settings">AI Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
