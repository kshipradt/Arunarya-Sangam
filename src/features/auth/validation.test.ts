import { describe, expect, test } from "bun:test";
import { cooldownSeconds, emailError, nameError, normaliseEmail } from "./validation";

describe("auth validation", () => {
  test("emails", () => {
    expect(emailError("")).toBe("v.required");
    expect(emailError("name@example")).toBe("v.email");
    expect(emailError("  Name@Example.in ")).toBeNull();
    expect(normaliseEmail("  Name@Example.in ")).toBe("name@example.in");
  });

  test("names in any script", () => {
    expect(nameError("")).toBe("v.required");
    expect(nameError("A")).toBe("v.name");
    expect(nameError("वृंदा तिवारी")).toBeNull();
    expect(nameError("Vrinda Tiwari")).toBeNull();
  });

  test("login cooldown grows after repeated failures", () => {
    expect(cooldownSeconds(2)).toBe(0);
    expect(cooldownSeconds(3)).toBe(30);
    expect(cooldownSeconds(4)).toBe(60);
    expect(cooldownSeconds(20)).toBe(300);
  });
});
