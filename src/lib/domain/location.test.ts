import { describe, expect, test } from "bun:test";
import { validateLocation, type LocationDraft } from "./location";

const india: LocationDraft = {
  countryId: 101, countryIso2: "IN", countryHasStates: true,
  stateId: null, cityId: null, cityName: "", districtId: null,
};

describe("location rules", () => {
  test("an artisan in India needs state, city and ODOP district", () => {
    expect(validateLocation("artisan", india)).toEqual({
      state: "loc.needState", city: "loc.needCity", district: "loc.needDistrict",
    });
  });

  test("an artisan in India with everything chosen passes", () => {
    expect(validateLocation("artisan", { ...india, stateId: 4022, cityId: 1, districtId: "d" })).toEqual({});
  });

  test("a trader abroad needs only country and city", () => {
    const abroad = { ...india, countryId: 233, countryIso2: "US" };
    expect(validateLocation("trader", abroad)).toEqual({ city: "loc.needCity" });
    expect(validateLocation("trader", { ...abroad, cityName: "New York" })).toEqual({});
  });

  test("a buyer needs country, state and city", () => {
    expect(validateLocation("buyer", { ...india, countryId: null, countryIso2: null })).toMatchObject({
      country: "loc.needCountry",
    });
    expect(validateLocation("buyer", india)).toEqual({ state: "loc.needState", city: "loc.needCity" });
  });

  test("a buyer in a country without regions needs no state", () => {
    const tiny = { ...india, countryId: 1, countryIso2: "VA", countryHasStates: false, cityName: "Vatican City" };
    expect(validateLocation("buyer", tiny)).toEqual({});
  });

  test("a typed city needs at least two letters", () => {
    expect(validateLocation("buyer", { ...india, stateId: 1, cityName: " a " })).toEqual({ city: "loc.needCity" });
  });
});
