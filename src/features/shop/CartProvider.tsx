/**
 * The shopping cart. Signed-out visitors keep it in the browser; signed-in
 * people keep it in the database, so it follows them across devices. On
 * log-in the browser cart is merged into the account cart.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { remove, select, upsert } from "@/lib/api/rest";
import { addLine, clampQty, mergeCarts, readGuestCart, writeGuestCart, type CartLine } from "./cartStore";

type CartValue = {
  lines: CartLine[];
  count: number;
  ready: boolean;
  /** Increases each time the account cart in the database has caught up, so totals can be re-quoted. */
  revision: number;
  add: (productId: string, qty?: number) => Promise<void>;
  setQty: (productId: string, qty: number) => Promise<void>;
  removeLine: (productId: string) => Promise<void>;
  reload: () => Promise<void>;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { status, session, getAccessToken } = useAuth();
  const [lines, setLines] = useState<CartLine[]>(() => readGuestCart());
  const [ready, setReady] = useState(status !== "loading");
  const [revision, setRevision] = useState(0);
  const mergedFor = useRef<string | null>(null);
  const bump = useCallback(() => setRevision((r) => r + 1), []);
  const userId = session?.user.id ?? null;

  const loadAccountCart = useCallback(async () => {
    if (!userId) return [];
    const rows = await select<{ product_id: string; qty: number }>("cart_items", `user_id=eq.${userId}&select=product_id,qty&order=added_at`, await getAccessToken());
    return rows.map((r) => ({ productId: r.product_id, qty: r.qty }));
  }, [userId, getAccessToken]);

  const reload = useCallback(async () => {
    if (status === "signedIn") setLines(await loadAccountCart());
  }, [status, loadAccountCart]);

  // On log-in: merge the browser cart into the account cart once.
  useEffect(() => {
    if (status === "loading") return;
    if (status === "signedOut") {
      mergedFor.current = null;
      setLines(readGuestCart());
      setReady(true);
      return;
    }
    if (!userId || mergedFor.current === userId) return;
    mergedFor.current = userId;
    // Hold totals and checkout until the browser cart has reached the database.
    setReady(false);
    (async () => {
      const guest = readGuestCart();
      let account = await loadAccountCart();
      if (guest.length) {
        const merged = mergeCarts(account, guest);
        await upsert("cart_items", merged.map((l) => ({ user_id: userId, product_id: l.productId, qty: l.qty })), await getAccessToken());
        writeGuestCart([]);
        account = merged;
      }
      setLines(account);
    })()
      .catch(() => {})
      .finally(() => {
        setReady(true);
        bump();
      });
  }, [status, userId, loadAccountCart, getAccessToken, bump]);

  const persist = useCallback(
    async (next: CartLine[], changed: CartLine | null, removedId?: string) => {
      setLines(next);
      if (status !== "signedIn" || !userId) {
        writeGuestCart(next);
        return;
      }
      try {
        const token = await getAccessToken();
        if (removedId) await remove("cart_items", `user_id=eq.${userId}&product_id=eq.${removedId}`, token);
        else if (changed) await upsert("cart_items", { user_id: userId, product_id: changed.productId, qty: changed.qty }, token);
      } catch (e) {
        // Show what the database really holds rather than an unsaved change.
        setLines(await loadAccountCart().catch(() => next));
        throw e;
      } finally {
        bump();
      }
    },
    [status, userId, getAccessToken, loadAccountCart, bump],
  );

  const add = useCallback(
    async (productId: string, qty = 1) => {
      const next = addLine(lines, productId, qty);
      await persist(next, next.find((l) => l.productId === productId)!);
    },
    [lines, persist],
  );

  const setQty = useCallback(
    async (productId: string, qty: number) => {
      const line = { productId, qty: clampQty(qty) };
      await persist(lines.map((l) => (l.productId === productId ? line : l)), line);
    },
    [lines, persist],
  );

  const removeLine = useCallback(
    (productId: string) => persist(lines.filter((l) => l.productId !== productId), null, productId),
    [lines, persist],
  );

  const value = useMemo<CartValue>(
    () => ({ lines, count: lines.reduce((n, l) => n + l.qty, 0), ready, revision, add, setQty, removeLine, reload }),
    [lines, ready, revision, add, setQty, removeLine, reload],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
