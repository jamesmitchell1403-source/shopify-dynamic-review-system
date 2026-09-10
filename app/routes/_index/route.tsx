import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {};
};

export default function App() {
  const [shopUrl, setShopUrl] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    let cleanShop = shopUrl.trim().toLowerCase();
    if (!cleanShop) return;

    // Auto append .myshopify.com if only store handle is entered
    if (!cleanShop.includes(".")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    } else {
      cleanShop = cleanShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }

    // Redirect directly to Shopify Auth for this store
    window.location.href = `/auth/login?shop=${encodeURIComponent(cleanShop)}`;
    e.preventDefault();
  };

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.badge}>🛒 Shopify App Install Portal</div>
        <h1 className={styles.heading}>Free Shipping Progress Bar</h1>
        <p className={styles.text}>
          Increase your average order value with customizable dynamic shipping bars.
        </p>

        <form className={styles.cardForm} onSubmit={handleSubmit}>
          <label className={styles.label}>
            <span>Enter your Shopify Store URL</span>
            <div className={styles.inputGroup}>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="e.g. your-store.myshopify.com"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                required
              />
              <button className={styles.button} type="submit">
                Install App 🚀
              </button>
            </div>
            <span className={styles.helpText}>
              Enter your store handle or full <code>.myshopify.com</code> address.
            </span>
          </label>
        </form>

        <div className={styles.features}>
          <div className={styles.featureCard}>
            <h3>⚡ Easy 1-Click Setup</h3>
            <p>Install on any Shopify store in seconds with automatic OAuth authorization.</p>
          </div>
          <div className={styles.featureCard}>
            <h3>🎨 Full Customization</h3>
            <p>Customize bar background, text, colors, and progress thresholds directly from the dashboard.</p>
          </div>
          <div className={styles.featureCard}>
            <h3>🛒 Cart Drawer & Page Support</h3>
            <p>Works seamlessly on both Cart Drawer flyouts and dedicated Cart pages.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
