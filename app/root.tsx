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
        <link rel="icon" type="image/png" href="/app-icon.png" />
        <link rel="shortcut icon" href="/app-icon.png" />
        <link rel="apple-touch-icon" href="/app-icon.png" />
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
  try {
    return boundary.error(error);
  } catch (err: any) {
    return (
      <html>
        <head>
          <title>Application Error</title>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
        </head>
        <body style={{ fontFamily: "sans-serif", padding: "40px 20px", background: "#f6f6f7" }}>
          <div style={{ maxWidth: "560px", margin: "40px auto", background: "#fff", padding: "28px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h2 style={{ color: "#d82c0d", marginTop: 0 }}>Application Refresh Required</h2>
            <p style={{ color: "#616161", fontSize: "14px", lineHeight: "1.5" }}>
              {err?.message || "An error occurred while communicating with the server. Please reload the app."}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: "16px", padding: "10px 18px", background: "#008060", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              Reload App
            </button>
          </div>
        </body>
      </html>
    );
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
