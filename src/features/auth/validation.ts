import { z } from "zod";
import type { MessageKey } from "@/i18n/I18nProvider";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailError(raw: string): MessageKey | null {
  if (!raw.trim()) return "v.required";
  return emailSchema.safeParse(raw).success ? null : "v.email";
}

export function nameError(raw: string): MessageKey | null {
  const letters = raw.replace(/[^\p{L}]/gu, "");
  if (!raw.trim()) return "v.required";
  return letters.length >= 2 && raw.trim().length <= 120 ? null : "v.name";
}

/**
 * Client-side pause after repeated failed log-ins: 3 free tries, then
 * 30 s, 60 s, 120 s … capped at 5 minutes. The server has its own limits.
 */
export function cooldownSeconds(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(300, 30 * 2 ** (failures - 3));
}
