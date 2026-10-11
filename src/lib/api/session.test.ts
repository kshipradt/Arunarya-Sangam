import { describe, expect, test } from "bun:test";
import { decodeJwtClaims, loadSession, saveSession, secondsUntilRefresh, sessionFromTokenResponse } from "./session";

test("decodes JWT claims including unpadded base64url", () => {
  const payload = btoa(JSON.stringify({ sub: "6f1c1b2a-1111-4c4c-8a8a-123456789abc", email: "a@ex.in" }))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  expect(decodeJwtClaims(`h.${payload}.s`)).toEqual({ sub: "6f1c1b2a-1111-4c4c-8a8a-123456789abc", email: "a@ex.in" });
  expect(() => decodeJwtClaims("nodots")).toThrow();
});

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const user = { id: "6f1c1b2a-1111-4c4c-8a8a-123456789abc", email: "a@b.in", user_metadata: {} };

describe("session", () => {
  test("builds expiry from expires_in", () => {
    const s = sessionFromTokenResponse({ access_token: "x".repeat(20), refresh_token: "rrrr", expires_in: 3600, user }, 1000);
    expect(s.expires_at).toBe(4600);
  });

  test("refreshes one minute before expiry", () => {
    const s = sessionFromTokenResponse({ access_token: "x".repeat(20), refresh_token: "rrrr", expires_at: 2000, user });
    expect(secondsUntilRefresh(s, 1000)).toBe(940);
    expect(secondsUntilRefresh(s, 1990)).toBe(0);
  });

  test("round-trips through storage and rejects tampered data", () => {
    const store = new MemoryStorage() as unknown as Storage;
    const s = sessionFromTokenResponse({ access_token: "x".repeat(20), refresh_token: "rrrr", expires_at: 2000, user });
    saveSession(s, store);
    expect(loadSession(store)).toEqual(s);
    store.setItem("sangam.session", JSON.stringify({ access_token: 1 }));
    expect(loadSession(store)).toBeNull();
    store.setItem("sangam.session", "{not json");
    expect(loadSession(store)).toBeNull();
  });
});
