/** The four kinds of people on the network. Mirrors the database enum user_role. */
export const USER_ROLES = ["buyer", "artisan", "business_owner", "trader"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const isSellerRole = (role: UserRole) => role !== "buyer";

export function isUserRole(v: unknown): v is UserRole {
  return typeof v === "string" && (USER_ROLES as readonly string[]).includes(v);
}
