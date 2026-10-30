import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy – AI Dynamic Review System" },
  { name: "description", content: "Privacy Policy for AI Dynamic Review System Shopify App" },
];

export default function PrivacyPolicy() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <div style={styles.logoIcon}>⭐</div>
            <span style={styles.logoText}>AI Dynamic Review System</span>
          </div>
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.lastUpdated}>Last Updated: October 30, 2026</p>
        </div>

        {/* Content */}
        <div style={styles.content}>

          <Section number="1" title="Introduction">
            <p>Welcome to <strong>AI Dynamic Review System</strong> ("we", "our", or "us").</p>
            <p>
              AI Dynamic Review System is a Shopify application that helps merchants manage product reviews,
              generate AI-assisted review content, import reviews, moderate customer feedback, and display
              review widgets and social proof notifications on their online stores.
            </p>
            <p>
              We respect your privacy and are committed to protecting the personal information of merchants,
              their customers, and visitors who interact with our application.
            </p>
            <p>
              This Privacy Policy explains what information we collect, how we use it, how it is stored,
              and how it is protected.
            </p>
            <p>
              By installing or using our application, you acknowledge the practices described in this Privacy Policy.
            </p>
          </Section>

          <Section number="2" title="Information We Collect">
            <p>Depending on how you use our application, we may collect the following categories of information:</p>

            <SubSection title="A. Merchant Information">
              <p>When you install or use our application, we may collect:</p>
              <ul>
                <li>Store name and store URL</li>
                <li>Shopify store identifier</li>
                <li>Merchant account information</li>
                <li>Email address and contact information, where provided</li>
                <li>App settings and configuration preferences</li>
                <li>Subscription and application usage information, where applicable</li>
              </ul>
            </SubSection>

            <SubSection title="B. Product Information">
              <p>To provide review management functionality, we may process:</p>
              <ul>
                <li>Product names and descriptions</li>
                <li>Product identifiers and SKUs</li>
                <li>Product images and URLs</li>
                <li>Product ratings and review information</li>
                <li>Product-related metadata</li>
              </ul>
            </SubSection>

            <SubSection title="C. Customer Review Information">
              <p>When merchants import, manage, or display reviews, we may process:</p>
              <ul>
                <li>Reviewer names or display names</li>
                <li>Customer-submitted review content</li>
                <li>Star ratings and feedback</li>
                <li>Review images or other uploaded media</li>
                <li>Verified purchase status, where available and verified</li>
                <li>Review dates and relevant product information</li>
              </ul>
            </SubSection>

            <SubSection title="D. CSV Import Information">
              <p>When merchants upload CSV files, we may process:</p>
              <ul>
                <li>Uploaded CSV files</li>
                <li>Product and review information contained in those files</li>
                <li>Reviewer names and ratings</li>
                <li>Import mapping configurations</li>
                <li>Import history and processing results</li>
              </ul>
              <p>
                Merchants are responsible for ensuring that they have the necessary rights and permissions
                to import and use review data.
              </p>
            </SubSection>

            <SubSection title="E. Technical and Usage Information">
              <p>We may collect technical information necessary to operate and improve our application, such as:</p>
              <ul>
                <li>Application activity and usage logs</li>
                <li>Error reports and diagnostic information</li>
                <li>Device and browser information, where collected</li>
                <li>Technical information relating to storefront widget performance</li>
              </ul>
            </SubSection>
          </Section>

          <Section number="3" title="How We Use Your Information">
            <p>We use collected information for the following purposes:</p>
            <ul>
              <li>To provide and operate our review management application</li>
              <li>To generate AI-assisted review drafts when requested by merchants</li>
              <li>To import and manage product reviews</li>
              <li>To allow merchants to approve, edit, moderate, and publish reviews</li>
              <li>To display review widgets, ratings, badges, and social proof notifications</li>
              <li>To maintain application settings and configurations</li>
              <li>To troubleshoot technical issues and improve application performance</li>
              <li>To protect the application against unauthorized access, misuse, and security threats</li>
              <li>To comply with applicable legal requirements</li>
            </ul>
            <p style={styles.highlight}>We do not sell personal information to third parties.</p>
          </Section>

          <Section number="4" title="AI-Powered Review Generation">
            <p>
              Our application may provide AI-assisted content generation using third-party AI service providers,
              including OpenAI, Anthropic Claude, and Google Gemini.
            </p>
            <p>
              When a merchant requests AI-generated content, relevant prompts and information supplied for
              that request may be transmitted to the selected AI provider for processing.
            </p>
            <p>Please note:</p>
            <ul>
              <li>AI-generated content is provided as a drafting tool</li>
              <li>Merchants should review and approve generated content before publication</li>
              <li>
                AI-generated content must not be presented as genuine customer feedback or a real customer
                testimonial unless it is based on authentic customer-provided information and accurately represented
              </li>
              <li>
                The handling of information by third-party AI providers is subject to their respective
                privacy policies and terms
              </li>
            </ul>
            <p>
              We recommend that merchants avoid submitting unnecessary personal or sensitive customer
              information in AI prompts.
            </p>
          </Section>

          <Section number="5" title="Review Management and Storefront Widgets">
            <p>
              Our application allows merchants to manage and display product reviews through storefront
              widgets and social proof notifications.
            </p>
            <p>Depending on merchant configuration, publicly displayed information may include:</p>
            <ul>
              <li>Reviewer display name</li>
              <li>Review content</li>
              <li>Star ratings</li>
              <li>Product information</li>
              <li>Review images</li>
              <li>Verified purchase indicators, where supported and verified</li>
            </ul>
            <p>Merchants control which reviews are approved and published through the application.</p>
            <p>
              Information displayed publicly on a merchant's storefront may be visible to visitors of that store.
            </p>
          </Section>

          <Section number="6" title="Data Sharing and Third-Party Services">
            <p>
              We may share relevant information with service providers when necessary to operate our application.
            </p>
            <p>These providers may include:</p>
            <ul>
              <li>Shopify, for app installation, authentication, and platform integration</li>
              <li>OpenAI, Anthropic Claude, and Google Gemini, when merchants use the corresponding AI generation integrations</li>
              <li>Hosting and infrastructure providers used to operate our application</li>
              <li>Technical service providers used for application monitoring, maintenance, and security</li>
            </ul>
            <p>We share only the information reasonably necessary for the relevant service.</p>
            <p>
              Third-party providers process information according to their own privacy policies, terms,
              and applicable contractual obligations.
            </p>
            <p style={styles.highlight}>We do not sell merchant or customer personal information.</p>
          </Section>

          <Section number="7" title="Data Storage and Security">
            <p>
              We take reasonable technical and organizational measures to protect information against
              unauthorized access, alteration, disclosure, or destruction.
            </p>
            <p>These measures may include:</p>
            <ul>
              <li>Access controls and authentication</li>
              <li>Secure communication using HTTPS where supported</li>
              <li>Restricted access to application data</li>
              <li>Appropriate security monitoring</li>
              <li>Data backup and recovery procedures</li>
            </ul>
            <p>However, no online system or electronic storage method can guarantee absolute security.</p>
          </Section>

          <Section number="8" title="Data Retention">
            <p>
              We retain information only for as long as reasonably necessary to provide our services,
              fulfill legitimate business purposes, comply with legal obligations, and resolve disputes.
            </p>
            <p>Retention periods may depend on:</p>
            <ul>
              <li>The type of information collected</li>
              <li>Whether the merchant continues using the application</li>
              <li>Applicable legal and regulatory requirements</li>
              <li>Requests for data deletion</li>
            </ul>
            <p>
              When information is no longer required, we take reasonable steps to delete or anonymize it,
              subject to applicable legal obligations and legitimate retention requirements.
            </p>
          </Section>

          <Section number="9" title="Data Deletion Requests">
            <p>Merchants may request deletion of their information by contacting us.</p>
            <p>
              When a merchant uninstalls our application, we handle applicable Shopify privacy and data
              deletion requests in accordance with Shopify's requirements and applicable privacy laws.
            </p>
            <p>Certain information may need to be retained where legally required.</p>
            <p>
              Merchants may also contact us regarding the deletion of review information or other data
              processed through the application.
            </p>
          </Section>

          <Section number="10" title="Shopify Privacy Requirements">
            <p>Our application operates on the Shopify platform.</p>
            <p>
              We handle Shopify-related data in accordance with applicable Shopify requirements, including
              relevant protected customer data requirements and mandatory privacy webhook obligations.
            </p>
            <p>Where applicable, we process requests relating to:</p>
            <ul>
              <li>Customer data requests</li>
              <li>Customer data erasure</li>
              <li>Shop data erasure</li>
            </ul>
            <p>
              Shopify merchants are also responsible for maintaining their own privacy policies and informing
              their customers about their use of third-party applications.
            </p>
          </Section>

          <Section number="11" title="International Data Transfers">
            <p>
              Depending on the services and infrastructure used, information may be processed or stored in
              countries other than the country where the merchant or customer is located.
            </p>
            <p>
              Where required, we take appropriate measures to ensure that international data transfers
              comply with applicable data protection requirements.
            </p>
          </Section>

          <Section number="12" title="Your Privacy Rights">
            <p>
              Depending on your location and applicable privacy laws, you may have rights to:
            </p>
            <ul>
              <li>Request access to personal information</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of personal information</li>
              <li>Object to or restrict certain processing activities</li>
              <li>Withdraw consent where processing is based on consent</li>
              <li>Request information about how your data is used</li>
            </ul>
            <p>To exercise applicable privacy rights, please contact us using the details below.</p>
          </Section>

          <Section number="13" title="Cookies and Tracking Technologies">
            <p>
              Our application may use cookies or similar technologies where necessary for authentication,
              application functionality, security, and performance.
            </p>
            <p>
              Storefront widgets may also process limited technical information required for their operation.
            </p>
            <p>
              Where required by applicable law, we will obtain appropriate consent before using
              non-essential cookies or tracking technologies.
            </p>
          </Section>

          <Section number="14" title="Children's Privacy">
            <p>Our application is intended for business use by Shopify merchants.</p>
            <p>
              We do not knowingly collect personal information directly from children. If we become aware
              that personal information has been collected in violation of applicable children's privacy laws,
              we will take appropriate steps to address it.
            </p>
          </Section>

          <Section number="15" title="Changes to This Privacy Policy">
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our application,
              data processing practices, technology, or legal requirements.
            </p>
            <p>Any updates will be published on this page with a revised "Last Updated" date.</p>
            <p>We encourage merchants to review this page periodically.</p>
          </Section>

          <Section number="16" title="Contact Us">
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or our data
              practices, please contact us:
            </p>
            <div style={styles.contactBox}>
              <p><strong>Application:</strong> AI Dynamic Review System</p>
              <p>
                <strong>Privacy Policy URL:</strong>{" "}
                <a href="https://productreview.zooq.app/privacy-policy" style={styles.link}>
                  https://productreview.zooq.app/privacy-policy
                </a>
              </p>
              <p>
                <strong>Website:</strong>{" "}
                <a href="https://productreview.zooq.app" style={styles.link}>
                  https://productreview.zooq.app
                </a>
              </p>
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:developerr6620@gmail.com" style={styles.link}>
                  developerr6620@gmail.com
                </a>
              </p>
            </div>
            <p>
              We will make reasonable efforts to respond to privacy-related inquiries within the time
              required by applicable law.
            </p>
          </Section>

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p>© 2026 AI Dynamic Review System. All rights reserved.</p>
          <p>
            <a href="https://productreview.zooq.app" style={styles.link}>
              productreview.zooq.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>
        <span style={styles.sectionNumber}>{number}</span>
        {title}
      </h2>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.subSection}>
      <h3 style={styles.subSectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8f9fa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1a1a1a",
    lineHeight: 1.7,
  },
  container: {
    maxWidth: "860px",
    margin: "0 auto",
    padding: "0 24px 60px",
  },
  header: {
    textAlign: "center",
    padding: "60px 0 40px",
    borderBottom: "2px solid #e5e7eb",
    marginBottom: "40px",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "20px",
  },
  logoIcon: {
    fontSize: "28px",
  },
  logoText: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#111827",
  },
  title: {
    fontSize: "36px",
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 12px",
  },
  lastUpdated: {
    fontSize: "14px",
    color: "#6b7280",
    margin: 0,
  },
  content: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "40px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  section: {
    marginBottom: "40px",
    paddingBottom: "40px",
    borderBottom: "1px solid #f3f4f6",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#111827",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  sectionNumber: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
    flexShrink: 0,
  },
  sectionBody: {
    paddingLeft: "44px",
  },
  subSection: {
    marginTop: "20px",
  },
  subSectionTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#374151",
    marginBottom: "10px",
    borderLeft: "3px solid #111827",
    paddingLeft: "12px",
  },
  highlight: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "12px 16px",
    color: "#166534",
    fontWeight: 600,
    marginTop: "16px",
  },
  contactBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "20px 24px",
    marginTop: "16px",
    marginBottom: "16px",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
  },
  footer: {
    textAlign: "center",
    padding: "32px 0 0",
    color: "#9ca3af",
    fontSize: "14px",
  },
};

