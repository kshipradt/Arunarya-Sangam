/**
 * Money and date formatting in the visitor's language. Digits stay in the
 * familiar 0–9 form across languages, as on Indian price tags and invoices.
 */
import type { LanguageCode } from "@/i18n/languages";

const locale = (lang: LanguageCode | null) => `${lang ?? "en"}-IN-u-nu-latn`;

export function formatInr(amount: number | string | null | undefined, lang: LanguageCode | null): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

export function formatDate(iso: string, lang: LanguageCode | null): string {
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string, lang: LanguageCode | null): string {
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Percentage saved against the maximum retail price, rounded down. */
export function percentOff(price: number, mrp: number | null | undefined): number | null {
  if (!mrp || mrp <= price) return null;
  return Math.floor(((mrp - price) / mrp) * 100);
}

/** Indian mobile numbers: 10 digits starting 6–9, optional +91 or 0. */
export function normaliseIndianMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const PINCODE_RE = /^[1-9][0-9]{5}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
