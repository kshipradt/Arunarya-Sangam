import { describe, expect, test } from "bun:test";
import { matchPath, safeNext } from "./router";

describe("router", () => {
  test("matches static and parameter paths", () => {
    expect(matchPath("/", "/")).toEqual({});
    expect(matchPath("/auth/sign-in", "/auth/sign-in/")).toEqual({});
    expect(matchPath("/district/:slug", "/district/uttar-pradesh-saharanpur")).toEqual({ slug: "uttar-pradesh-saharanpur" });
    expect(matchPath("/auth/sign-in", "/auth/sign-up")).toBeNull();
  });

  test("only allows same-site redirect targets", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null, "/x")).toBe("/x");
  });
});
