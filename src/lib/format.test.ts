import { describe, expect, test } from "bun:test";
import { formatInr, GSTIN_RE, normaliseIndianMobile, percentOff, PINCODE_RE } from "./format";

describe("formatting", () => {
  test("rupees use Indian grouping in every language", () => {
    expect(formatInr(125000, "en")).toBe("₹1,25,000");
    expect(formatInr(1299.5, "hi")).toContain("1,299.50");
    expect(formatInr("600", "ta")).toContain("600");
  });

  test("percent off against MRP", () => {
    expect(percentOff(750, 1000)).toBe(25);
    expect(percentOff(1000, 1000)).toBeNull();
    expect(percentOff(1000, null)).toBeNull();
  });

  test("Indian mobile numbers", () => {
    expect(normaliseIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normaliseIndianMobile("09876543210")).toBe("9876543210");
    expect(normaliseIndianMobile("1234567890")).toBeNull();
    expect(normaliseIndianMobile("98765")).toBeNull();
  });

  test("pincode and GSTIN patterns", () => {
    expect(PINCODE_RE.test("247001")).toBe(true);
    expect(PINCODE_RE.test("047001")).toBe(false);
    expect(GSTIN_RE.test("09AAAPL1234C1ZV")).toBe(true);
    expect(GSTIN_RE.test("09aaapl1234c1zv")).toBe(false);
  });
});
