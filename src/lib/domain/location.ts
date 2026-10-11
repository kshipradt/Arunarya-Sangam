/**
 * Location rules, mirrored from the database trigger profiles_location_guard
 * so people see problems instantly. The database remains the final authority.
 *
 *  - Buyers: country, plus state/region when that country has any, plus city.
 *  - Artisans, business owners and traders in India: state, city and the ODOP
 *    district their products come from.
 *  - Sellers with an office or ownership abroad: country and city.
 */
import type { MessageKey } from "@/i18n/I18nProvider";
import { isSellerRole, type UserRole } from "./roles";

export const INDIA_ISO2 = "IN";

export type LocationDraft = {
  countryId: number | null;
  countryIso2: string | null;
  countryHasStates: boolean;
  stateId: number | null;
  cityId: number | null;
  cityName: string;
  districtId: string | null;
};

export type LocationErrors = Partial<Record<"country" | "state" | "city" | "district", MessageKey>>;

export function validateLocation(role: UserRole, loc: LocationDraft): LocationErrors {
  const errors: LocationErrors = {};
  const inIndia = loc.countryIso2 === INDIA_ISO2;
  const hasCity = loc.cityId !== null || loc.cityName.trim().length >= 2;

  if (!loc.countryId) errors.country = "loc.needCountry";
  if (isSellerRole(role) && inIndia) {
    if (!loc.stateId) errors.state = "loc.needState";
    if (!hasCity) errors.city = "loc.needCity";
    if (!loc.districtId) errors.district = "loc.needDistrict";
  } else if (isSellerRole(role)) {
    if (!hasCity) errors.city = "loc.needCity";
  } else {
    if (loc.countryId && loc.countryHasStates && !loc.stateId) errors.state = "loc.needState";
    if (!hasCity) errors.city = "loc.needCity";
  }
  return errors;
}
