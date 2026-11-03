import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy – AI Dynamic Review System" },
  { name: "description", content: "Official Privacy Policy for AI Dynamic Review System Shopify Application" },
];

export default function PrivacyPolicy() {
  return (
    <div style={styles.pageWrapper}>
      <div style={styles.documentCard}>
        {/* 1. TOP HEADER ROW */}
        <header style={styles.headerRow}>
          <div>
            <h1 style={styles.appTitle}>AI Dynamic Review System</h1>
            <p style={styles.appSubtitle}>AI-Powered Customer Reviews, Video Proof & Social Popups for Shopify</p>
          </div>
          <div style={styles.badgePill}>
            <span style={styles.badgeCheck}>✓</span> Official Privacy Policy
          </div>
        </header>

        {/* 2. TITLE & DATES */}
        <div style={styles.titleSection}>
          <h2 style={styles.pageHeading}>Privacy Policy</h2>
          <p style={styles.effectiveDates}>Effective Date: October 13, 2026 | Last Updated: November 2, 2026</p>
          <p style={styles.introParagraph}>
            AI Dynamic Review System (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) provides this Privacy Policy to explain how merchant and store information is collected, used, and protected when you install and use the AI Dynamic Review System application (the &ldquo;App&rdquo;) on Shopify.
          </p>
        </div>

        {/* 3. SECTION 1: INFORMATION WE COLLECT */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>1. Information We Collect</h3>
          <p style={styles.sectionLead}>
            We only collect and access data that is strictly required to manage product reviews, generate AI-assisted review content, display storefront social proof popups, and synchronize ratings directly with your Shopify store:
          </p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              <strong>Store Identification:</strong> Your store&rsquo;s <code style={styles.codeTag}>.myshopify.com</code> domain, store name, primary language, and country code to configure app settings and storefront widget displays.
            </li>
            <li style={styles.bulletItem}>
              <strong>Catalog &amp; Product Data:</strong> Product titles, descriptions, handles, product IDs, collection titles, and product images needed to accurately map customer reviews to their corresponding products.
            </li>
            <li style={styles.bulletItem}>
              <strong>Media &amp; Review Assets:</strong> Customer display names, review ratings (1&ndash;5 stars), written review feedback, photo URLs, and optional video URLs provided voluntarily by reviewers or imported by the merchant.
            </li>
            <li style={styles.bulletItem}>
              <strong>Shopify OAuth Access Tokens:</strong> Granted strictly through official Shopify Admin APIs with scoped permissions (<code style={styles.codeTag}>read_products</code>, <code style={styles.codeTag}>write_products</code>, <code style={styles.codeTag}>read_orders</code>, <code style={styles.codeTag}>write_orders</code>) to synchronize ratings and verify customer purchases.
            </li>
          </ul>

          {/* Green Callout Box: End-Consumer Personal Data Protection */}
          <div style={styles.calloutBox}>
            <div style={styles.calloutHeader}>
              <span style={styles.calloutIcon}>🛡️</span>
              <strong style={styles.calloutTitle}>End-Consumer Personal Data Protection:</strong>
            </div>
            <p style={styles.calloutText}>
              AI Dynamic Review System <strong>DOES NOT</strong> collect, process, store, or sell any sensitive personal identifiable information (PII) belonging to your store&rsquo;s customers. We do not collect customer passwords, credit cards, or financial records. Review submissions only store the reviewer display name, rating, and review text provided voluntarily.
            </p>
          </div>
        </section>

        {/* 4. SECTION 2: HOW WE USE INFORMATION */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>2. How We Use Information</h3>
          <p style={styles.sectionLead}>We use the collected catalog and store information exclusively to:</p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              Display storefront review widgets, star rating badges, and social proof notification popups across your product pages.
            </li>
            <li style={styles.bulletItem}>
              Generate AI-assisted review drafts (under 150 words) and click-worthy customer testimonials when requested by the merchant.
            </li>
            <li style={styles.bulletItem}>
              Process merchant-initiated review imports from Amazon, AliExpress, Flipkart, and CSV files.
            </li>
            <li style={styles.bulletItem}>
              Auto-generate accessible, WCAG-compliant image/ALT text and rich media popup layouts.
            </li>
            <li style={styles.bulletItem}>
              Save approved review metadata and aggregate star rating scores directly to Shopify native metafields.
            </li>
            <li style={styles.bulletItem}>
              Authenticate your merchant session securely inside the Shopify Admin panel.
            </li>
          </ul>
        </section>

        {/* 5. SECTION 3: DATA SHARING & THIRD PARTIES */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>3. Data Sharing &amp; Third Parties</h3>
          <p style={styles.sectionLead}>
            We treat your store data with absolute confidentiality. We do not sell, rent, or trade your catalog or store information to any third parties.
          </p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              <strong>AI Generation:</strong> When using AI generation features, catalog and review text is processed strictly in real-time through secure, enterprise-grade AI APIs (Anthropic Claude, OpenAI, and Google Gemini). Your content is <strong>never</strong> used to train public machine learning models.
            </li>
            <li style={styles.bulletItem}>
              <strong>Infrastructure:</strong> Data is hosted on secure, isolated servers with encrypted communication over HTTPS/TLS 1.3.
            </li>
            <li style={styles.bulletItem}>
              <strong>No Advertising Trackers:</strong> We do not inject tracking pixels, advertising scripts, or analytics beacons into your merchant admin or online storefront.
            </li>
          </ul>
        </section>

        {/* 6. SECTION 4: DATA RETENTION & AUTOMATIC DELETION */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>4. Data Retention &amp; Automatic Deletion</h3>
          <p style={styles.sectionLead}>
            We retain your store settings and review cache only for the duration that the application remains installed on your Shopify store.
          </p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              <strong>Instant Deletion Upon Uninstall:</strong> When you uninstall the App from your Shopify store, Shopify triggers the mandatory <code style={styles.codeTag}>app/uninstalled</code> webhook. Upon receipt, your store access tokens, session keys, and cached review data are automatically purged from our database.
            </li>
            <li style={styles.bulletItem}>
              <strong>Permanent Merchant Control:</strong> All review titles, star ratings, and media published to your products remain permanently saved in your Shopify store.
            </li>
          </ul>
        </section>

        {/* 7. SECTION 5: MANDATORY SHOPIFY & GDPR COMPLIANCE */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>5. Mandatory Shopify &amp; GDPR Compliance</h3>
          <p style={styles.sectionLead}>
            AI Dynamic Review System strictly adheres to Shopify&rsquo;s API Terms and European GDPR / California CCPA regulations. We implement all required Shopify privacy compliance webhooks:
          </p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              <code style={styles.codeTag}>customers/data_request</code>: Automatically processed to verify that no end-customer data is stored by the App beyond public reviews.
            </li>
            <li style={styles.bulletItem}>
              <code style={styles.codeTag}>customers/redact</code>: Processed immediately to confirm zero customer personal data exists or redact associated review records.
            </li>
            <li style={styles.bulletItem}>
              <code style={styles.codeTag}>shop/redact</code>: Automatically deletes all remaining store settings within 48 hours of an official store deletion.
            </li>
          </ul>
        </section>

        {/* 8. SECTION 6: SECURITY MEASURES */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>6. Security Measures</h3>
          <p style={styles.sectionLead}>
            We employ industry-standard administrative, technical, and physical safeguards to protect your store data:
          </p>
          <ul style={styles.bulletList}>
            <li style={styles.bulletItem}>
              All communications between Shopify, our application, and your browser are encrypted using TLS 1.3.
            </li>
            <li style={styles.bulletItem}>
              Shopify access tokens are stored securely in restricted database storage with zero public exposure.
            </li>
            <li style={styles.bulletItem}>
              Regular automated dependency audits and security monitoring.
            </li>
          </ul>
        </section>

        {/* 9. SECTION 7: MERCHANT SUPPORT & CONTACT INFORMATION */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>7. Merchant Support &amp; Contact Information</h3>
          <p style={styles.sectionLead}>
            If you have any questions about this Privacy Policy, your store data, or our data handling practices, please contact our merchant support team:
          </p>
          <p style={styles.contactLine}>
            <strong>Merchant Support:</strong>{" "}
            <a href="mailto:developer6620@gmail.com" style={styles.link}>
              developer6620@gmail.com
            </a>
          </p>
        </section>

        {/* 10. CARD FOOTER */}
        <footer style={styles.footerRow}>
          <span style={styles.footerCopyright}>
            &copy; 2026 AI Dynamic Review System. Built natively for Shopify.
          </span>
          <a href="/" style={styles.backHomeLink}>
            &larr; Back to Home
          </a>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    minHeight: "100vh",
    backgroundColor: "#F1F5F9",
    padding: "40px 16px 60px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#334155",
    boxSizing: "border-box",
  },
  documentCard: {
    maxWidth: "820px",
    margin: "0 auto",
    backgroundColor: "#FFFFFF",
    borderRadius: "18px",
    padding: "48px 56px",
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.02)",
    boxSizing: "border-box",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    borderBottom: "1px solid #F1F5F9",
    paddingBottom: "22px",
    flexWrap: "wrap",
  },
  appTitle: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#0F172A",
    margin: "0 0 4px 0",
    letterSpacing: "-0.3px",
  },
  appSubtitle: {
    fontSize: "12.5px",
    color: "#64748B",
    margin: 0,
    fontWeight: 500,
  },
  badgePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#EFF6FF",
    color: "#2563EB",
    border: "1px solid #DBEAFE",
    borderRadius: "999px",
    padding: "5px 12px",
    fontSize: "11.5px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  badgeCheck: {
    fontWeight: 700,
  },
  titleSection: {
    marginTop: "28px",
    marginBottom: "28px",
  },
  pageHeading: {
    fontSize: "26px",
    fontWeight: 800,
    color: "#0F172A",
    margin: "0 0 6px 0",
    letterSpacing: "-0.4px",
  },
  effectiveDates: {
    fontSize: "12px",
    color: "#64748B",
    margin: "0 0 16px 0",
    fontWeight: 500,
  },
  introParagraph: {
    fontSize: "13.5px",
    lineHeight: "1.65",
    color: "#475569",
    margin: 0,
  },
  section: {
    marginTop: "26px",
    marginBottom: "26px",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: 750,
    color: "#0F172A",
    margin: "0 0 10px 0",
    letterSpacing: "-0.2px",
  },
  sectionLead: {
    fontSize: "13.5px",
    lineHeight: "1.65",
    color: "#475569",
    margin: "0 0 12px 0",
  },
  bulletList: {
    margin: "0 0 16px 0",
    paddingLeft: "20px",
    listStyleType: "disc",
  },
  bulletItem: {
    fontSize: "13px",
    lineHeight: "1.65",
    color: "#475569",
    marginBottom: "8px",
  },
  codeTag: {
    backgroundColor: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: "4px",
    padding: "1px 5px",
    fontSize: "11.5px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "#0F172A",
  },
  calloutBox: {
    backgroundColor: "#F0FDF4",
    border: "1px solid #BBF7D0",
    borderRadius: "10px",
    padding: "14px 18px",
    marginTop: "16px",
    marginBottom: "8px",
  },
  calloutHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
  },
  calloutIcon: {
    fontSize: "14px",
  },
  calloutTitle: {
    fontSize: "13px",
    color: "#15803D",
    fontWeight: 700,
  },
  calloutText: {
    fontSize: "12.5px",
    lineHeight: "1.55",
    color: "#166534",
    margin: 0,
  },
  contactLine: {
    fontSize: "13.5px",
    color: "#475569",
    margin: "6px 0 0 0",
  },
  link: {
    color: "#2563EB",
    textDecoration: "none",
    fontWeight: 600,
  },
  footerRow: {
    borderTop: "1px solid #E2E8F0",
    paddingTop: "20px",
    marginTop: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  footerCopyright: {
    fontSize: "12px",
    color: "#94A3B8",
  },
  backHomeLink: {
    fontSize: "12.5px",
    color: "#2563EB",
    textDecoration: "none",
    fontWeight: 600,
  },
};
