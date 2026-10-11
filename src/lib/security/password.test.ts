import { describe, expect, test } from "bun:test";
import { checkPassword, isCommonPassword } from "./password";

describe("password policy", () => {
  test("accepts a strong password", () => {
    const r = checkPassword("Banarasi-Silk-2026!", "weaver@example.com");
    expect(r.valid).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  test("rejects passwords that are too short", () => {
    expect(checkPassword("Ab1!").rules.length).toBe(false);
  });

  test("rejects passwords over 72 characters", () => {
    expect(checkPassword("Aa1!" + "x".repeat(70)).rules.length).toBe(false);
  });

  test("requires each character type", () => {
    const r = checkPassword("alllowercase");
    expect(r.rules.upper).toBe(false);
    expect(r.rules.digit).toBe(false);
    expect(r.rules.symbol).toBe(false);
    expect(r.valid).toBe(false);
  });

  test("rejects common passwords even when complex", () => {
    expect(isCommonPassword("India@123")).toBe(true);
    expect(isCommonPassword("P@ssw0rd")).toBe(true);
    const r = checkPassword("Welcome@123");
    expect(r.rules.notCommon).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.score).toBe(0);
  });

  test("rejects a password containing the email name", () => {
    expect(checkPassword("Vrinda@Craft99", "vrinda@arunarya.in").rules.notEmail).toBe(false);
  });

  test("counts Indian-script letters as letters, not symbols", () => {
    const r = checkPassword("कारीगरA1!");
    expect(r.rules.upper).toBe(true);
    expect(r.rules.symbol).toBe(true);
  });

  test("scores predictable sequences lower", () => {
    expect(checkPassword("Abcd1234!xyz").score).toBeLessThan(checkPassword("Ka7#mQ2v!Lp9").score);
  });
});
