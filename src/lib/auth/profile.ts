import { select, update } from "@/lib/api/rest";
import type { LanguageCode } from "@/i18n/languages";
import type { UserRole } from "@/lib/domain/roles";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  business_name: string | null;
  country_id: number | null;
  state_id: number | null;
  city_id: number | null;
  city_name: string | null;
  district_id: string | null;
  preferred_language: LanguageCode;
  onboarding_complete: boolean;
  verified: boolean;
};

const COLUMNS =
  "id,role,full_name,business_name,country_id,state_id,city_id,city_name,district_id,preferred_language,onboarding_complete,verified";

export async function fetchProfile(userId: string, accessToken: string): Promise<Profile | null> {
  const rows = await select<Profile>("profiles", `id=eq.${userId}&select=${COLUMNS}`, accessToken);
  return rows[0] ?? null;
}

/** Only columns the database lets a person change about themselves. */
export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | "role" | "full_name" | "business_name" | "country_id" | "state_id" | "city_id"
    | "city_name" | "district_id" | "preferred_language" | "onboarding_complete"
  >
>;

export function saveProfile(userId: string, values: ProfileUpdate, accessToken: string) {
  return update<Profile>("profiles", `id=eq.${userId}&select=${COLUMNS}`, values, accessToken);
}
