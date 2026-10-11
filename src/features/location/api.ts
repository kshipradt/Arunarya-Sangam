/**
 * Location look-ups: 250 countries, 5,328 states and regions, 152,571
 * cities and India's 784 districts. Results are cached for the visit.
 */
import { select } from "@/lib/api/rest";

export type Country = { id: number; iso2: string; name: string; native_name: string | null; emoji: string | null };
export type Region = { id: number; name: string };
export type City = { id: number; name: string };
export type District = { id: string; name: string };

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(key, load().catch((e) => {
      cache.delete(key);
      throw e;
    }));
  }
  return cache.get(key) as Promise<T>;
}

export const getCountries = () =>
  cached("countries", () => select<Country>("geo_countries", "select=id,iso2,name,native_name,emoji&order=name"));

export const getStates = (countryId: number) =>
  cached(`states:${countryId}`, () => select<Region>("geo_states", `country_id=eq.${countryId}&select=id,name&order=name`));

export const getCities = (stateId: number) =>
  cached(`cities:${stateId}`, () => select<City>("geo_cities", `state_id=eq.${stateId}&select=id,name&order=name&limit=5000`));

export const getDistricts = (stateId: number) =>
  cached(`districts:${stateId}`, () => select<District>("districts", `state_id=eq.${stateId}&select=id,name&order=name`));
