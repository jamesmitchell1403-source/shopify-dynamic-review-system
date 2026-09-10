import type { HeadersFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("ROOT_LOAD_ERROR:", error);

  let errorMessage = "Unknown root error occurred";
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
    <html>
      <head>
        <title>App Error</title>
      </head>
      <body style={{ padding: "30px", fontFamily: "monospace", color: "#b91c1c", background: "#fef2f2" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "18px" }}>⚠️ Root Loader Error</h3>
        <p style={{ fontWeight: "bold", fontSize: "14px", color: "#991b1b" }}>{errorMessage}</p>
        {errorStack && (
          <pre style={{ background: "#ffffff", padding: "12px", borderRadius: "4px", fontSize: "12px", overflowX: "auto", border: "1px solid #fee2e2" }}>
            {errorStack}
          </pre>
        )}
      </body>
    </html>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
