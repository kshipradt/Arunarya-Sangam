/**
 * Cart lines kept in the browser for visitors who have not logged in yet.
 * After log-in they are merged into the account's cart in the database.
 */
export type CartLine = { productId: string; qty: number };

export const GUEST_CART_KEY = "sangam.cart";
export const MAX_QTY = 20;

export function clampQty(qty: number, stock = MAX_QTY): number {
  return Math.max(1, Math.min(MAX_QTY, stock, Math.floor(qty) || 1));
}

export function readGuestCart(storage: Storage = localStorage): CartLine[] {
  try {
    const raw = JSON.parse(storage.getItem(GUEST_CART_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is CartLine => typeof l?.productId === "string" && /^[0-9a-f-]{36}$/i.test(l.productId) && Number.isFinite(l?.qty))
      .map((l) => ({ productId: l.productId, qty: clampQty(l.qty) }));
  } catch {
    return [];
  }
}

export function writeGuestCart(lines: CartLine[], storage: Storage = localStorage) {
  try {
    if (lines.length) storage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
    else storage.removeItem(GUEST_CART_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Adds qty to an existing line or appends a new one. */
export function addLine(lines: CartLine[], productId: string, qty: number): CartLine[] {
  const existing = lines.find((l) => l.productId === productId);
  if (existing) return lines.map((l) => (l.productId === productId ? { ...l, qty: clampQty(l.qty + qty) } : l));
  return [...lines, { productId, qty: clampQty(qty) }];
}

/** Merges a guest cart into an account cart, keeping the larger quantity of duplicates. */
export function mergeCarts(account: CartLine[], guest: CartLine[]): CartLine[] {
  const map = new Map(account.map((l) => [l.productId, l.qty]));
  for (const g of guest) map.set(g.productId, clampQty(Math.max(map.get(g.productId) ?? 0, g.qty)));
  return [...map].map(([productId, qty]) => ({ productId, qty }));
}
