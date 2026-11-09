const destinations = new Set(["catalog", "orders", "pickup", "account"]);
export function readTradeEntry(search) {
  const params = new URLSearchParams(search), raw = params.get("product") || "";
  const productId = /^[a-zA-Z0-9_-]{1,120}$/.test(raw) ? raw : "";
  const requested = params.get("next");
  return { productId, next: destinations.has(requested) ? requested : productId ? "catalog" : "orders" };
}
export function entryProduct(productId, products) {
  return productId ? products.find(p => p.id === productId) || null : null;
}
