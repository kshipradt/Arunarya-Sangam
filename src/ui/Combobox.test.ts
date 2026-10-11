import { describe, expect, test } from "bun:test";
import { filterOptions, normalise } from "./Combobox";

const cities = [
  { value: 1, label: "Saharanpur" },
  { value: 2, label: "Sahibabad" },
  { value: 3, label: "Ghaziabad" },
  { value: 4, label: "São Paulo" },
];

describe("combobox filtering", () => {
  test("prefers names that start with the query", () => {
    expect(filterOptions(cities, "sah").map((o) => o.value)).toEqual([1, 2]);
    expect(filterOptions(cities, "abad").map((o) => o.value)).toEqual([2, 3]);
  });

  test("ignores accents and case", () => {
    expect(normalise("São")).toBe("sao");
    expect(filterOptions(cities, "sao").map((o) => o.value)).toEqual([4]);
  });

  test("an empty query shows the list from the top", () => {
    expect(filterOptions(cities, "").length).toBe(4);
  });
});
