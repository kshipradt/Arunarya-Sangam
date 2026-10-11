import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { placeholdersOf, tagsOf, interpolate, parseRich } from "./format";
import { LANGUAGE_CODES } from "./languages";

const dir = join(import.meta.dir, "locales");
const load = (code: string) => JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8")) as Record<string, string>;
const en = load("en");
const enKeys = Object.keys(en).sort();

describe("translations", () => {
  test("there is one file per offered language", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")).sort();
    expect(files).toEqual([...LANGUAGE_CODES].sort());
  });

  for (const code of LANGUAGE_CODES.filter((c) => c !== "en")) {
    describe(code, () => {
      const messages = load(code);

      test("has exactly the English keys", () => {
        expect(Object.keys(messages).sort()).toEqual(enKeys);
      });

      test("keeps every {placeholder} and <tag>", () => {
        for (const key of enKeys) {
          const msg = messages[key] ?? "";
          expect({ key, p: placeholdersOf(msg) }).toEqual({ key, p: placeholdersOf(en[key]!) });
          expect({ key, t: tagsOf(msg) }).toEqual({ key, t: tagsOf(en[key]!) });
        }
      });

      test("has no empty or untranslated English sentences", () => {
        const untranslated = enKeys.filter((k) => {
          const v = messages[k]!.trim();
          // Brand names and short technical strings may stay the same.
          return !v || (v === en[k] && en[k]!.split(" ").length > 3 && !/ARUNARYA|©/.test(v));
        });
        expect(untranslated).toEqual([]);
      });
    });
  }
});

describe("formatting", () => {
  test("interpolates placeholders and leaves unknown ones", () => {
    expect(interpolate("Hi {name}, {x}", { name: "Vrinda" })).toBe("Hi Vrinda, {x}");
  });

  test("parses rich tags", () => {
    expect(parseRich("Agree to <terms>Terms</terms> and <privacy>Privacy</privacy>.")).toEqual([
      { tag: null, text: "Agree to " },
      { tag: "terms", text: "Terms" },
      { tag: null, text: " and " },
      { tag: "privacy", text: "Privacy" },
      { tag: null, text: "." },
    ]);
  });
});
