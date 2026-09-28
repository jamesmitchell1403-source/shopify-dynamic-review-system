export function getShopWhereClause(shop: string) {
  if (!shop) return {};
  const clean = shop.toLowerCase().trim().replace(/^https?:\/\//, "").split("/")[0];
  const prefix = clean.split(".")[0].replace(/-tiwriyta$/, "");
  return {
    OR: [
      { shop: clean },
      { shop: `${prefix}.myshopify.com` },
      { shop: `${prefix}-tiwriyta.myshopify.com` },
      { shop: { contains: prefix } }
    ]
  };
}

export function canonicalizeShopDomain(shop: string): string {
  if (!shop) return "james-practice-tiwriyta.myshopify.com";
  const clean = shop.toLowerCase().trim().replace(/^https?:\/\//, "").split("/")[0];
  if (clean.includes("james-practice")) {
    return "james-practice-tiwriyta.myshopify.com";
  }
  if (!clean.includes(".")) {
    return `${clean}.myshopify.com`;
  }
  return clean;
}
