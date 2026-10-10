import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useEffect } from "react";
import { useNavigate } from "@remix-run/react";
import { Page, BlockStack, Spinner, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({});
}

export default function QrCodesRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/app", { replace: true });
  }, [navigate]);

  return (
    <Page>
      <BlockStack gap="400" inlineAlign="center">
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <Spinner size="large" />
          <div style={{ marginTop: "16px" }}>
            <Text as="p" variant="bodyMd" tone="subdued">
              Loading dashboard...
            </Text>
          </div>
        </div>
      </BlockStack>
    </Page>
  );
}
