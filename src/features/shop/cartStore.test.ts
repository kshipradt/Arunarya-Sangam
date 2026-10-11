import { describe, expect, test } from "bun:test";
import { addLine, clampQty, mergeCarts, readGuestCart, writeGuestCart } from "./cartStore";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("cart", () => {
  test("quantities stay between 1 and 20 and within stock", () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(50)).toBe(20);
    expect(clampQty(5, 3)).toBe(3);
  });

  test("adding the same product increases its quantity", () => {
    expect(addLine([{ productId: A, qty: 1 }], A, 2)).toEqual([{ productId: A, qty: 3 }]);
    expect(addLine([{ productId: A, qty: 1 }], B, 1)).toHaveLength(2);
  });

  test("guest cart merges into the account cart", () => {
    expect(mergeCarts([{ productId: A, qty: 2 }], [{ productId: A, qty: 1 }, { productId: B, qty: 4 }])).toEqual([
      { productId: A, qty: 2 },
      { productId: B, qty: 4 },
    ]);
  });

  test("stored guest cart ignores tampered entries", () => {
    const s = new MemoryStorage() as unknown as Storage;
    s.setItem("sangam.cart", JSON.stringify([{ productId: A, qty: 99 }, { productId: "x", qty: 1 }, { productId: B }]));
    expect(readGuestCart(s)).toEqual([{ productId: A, qty: 20 }]);
    writeGuestCart([], s);
    expect(s.getItem("sangam.cart")).toBeNull();
  });
});
