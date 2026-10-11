/**
 * Password policy for ARUNARYA Sangam.
 *
 * Rules (all must pass):
 *  - 8 to 72 characters (72 is the hashing limit used by Supabase Auth)
 *  - at least one lowercase letter, one uppercase letter, one digit, one symbol
 *  - not a commonly used password
 *  - does not contain the user's email name
 *
 * The same minimum rules are configured in Supabase Auth so they are enforced
 * on the server too; this module gives instant, translated feedback.
 */
import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export type PasswordRule = "length" | "lower" | "upper" | "digit" | "symbol" | "notCommon" | "notEmail";

export type PasswordCheck = {
  rules: Record<PasswordRule, boolean>;
  valid: boolean;
  /** 0 (very weak) to 4 (very strong) */
  score: 0 | 1 | 2 | 3 | 4;
};

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.replace(/\s+/g, "").toLowerCase());
}

function containsEmailName(password: string, email?: string): boolean {
  const name = (email ?? "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return name.length >= 4 && password.toLowerCase().replace(/[^a-z0-9]/g, "").includes(name);
}

export function checkPassword(password: string, email?: string): PasswordCheck {
  const rules: Record<PasswordRule, boolean> = {
    length: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    lower: /\p{Ll}/u.test(password),
    upper: /\p{Lu}/u.test(password),
    digit: /\p{Nd}/u.test(password),
    symbol: /[^\p{L}\p{Nd}\s]/u.test(password),
    notCommon: password.length > 0 && !isCommonPassword(password),
    notEmail: !containsEmailName(password, email),
  };
  const valid = Object.values(rules).every(Boolean);
  return { rules, valid, score: scorePassword(password, rules) };
}

function scorePassword(password: string, rules: Record<PasswordRule, boolean>): PasswordCheck["score"] {
  if (!password || !rules.notCommon || !rules.notEmail) return 0;
  const variety = [rules.lower, rules.upper, rules.digit, rules.symbol].filter(Boolean).length;
  const unique = new Set(password).size;
  let points = 0;
  if (password.length >= PASSWORD_MIN) points++;
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (variety >= 3) points++;
  if (variety === 4 && unique >= 8) points++;
  if (unique < 5) points -= 2;
  if (/(.)\1{2,}/.test(password)) points--;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(password)) points--;
  return Math.max(0, Math.min(4, points - 1)) as PasswordCheck["score"];
}
