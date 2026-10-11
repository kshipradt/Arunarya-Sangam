/**
 * The signed-in session: validated on read, persisted in localStorage,
 * shared across browser tabs.
 */
import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional().nullable(),
  email_confirmed_at: z.string().optional().nullable(),
  user_metadata: z.record(z.unknown()).optional().default({}),
});

export const sessionSchema = z.object({
  access_token: z.string().min(10),
  refresh_token: z.string().min(4),
  expires_at: z.number().int().positive(),
  user: userSchema,
});

export type AuthUser = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;

export const SESSION_KEY = "sangam.session";

/** Builds a Session from a GoTrue token response (which has expires_in). */
export function sessionFromTokenResponse(
  raw: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user: unknown },
  nowSeconds = Math.floor(Date.now() / 1000),
): Session {
  return sessionSchema.parse({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at ?? nowSeconds + (raw.expires_in ?? 3600),
    user: raw.user,
  });
}

export function loadSession(storage: Storage = localStorage): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null, storage: Storage = localStorage): void {
  try {
    if (session) storage.setItem(SESSION_KEY, JSON.stringify(session));
    else storage.removeItem(SESSION_KEY);
  } catch {
    /* Private mode or full storage: the session lives in memory only. */
  }
}

/**
 * Reads (does not verify) the claims of a JWT. Used only to learn the user id
 * of a token the server just issued; the server verifies every request.
 */
export function decodeJwtClaims(token: string): { sub: string; email?: string } {
  const part = token.split(".")[1];
  if (!part) throw new Error("Malformed token");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const claims = JSON.parse(json) as { sub?: unknown; email?: unknown };
  if (typeof claims.sub !== "string") throw new Error("Token has no subject");
  return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}

/** Seconds until the access token should be refreshed (60 s before expiry). */
export function secondsUntilRefresh(session: Session, nowSeconds = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, session.expires_at - 60 - nowSeconds);
}
