/**
 * Reads the public build-time configuration from environment variables.
 * Only values that are safe to expose to every visitor belong here.
 */
export type PublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  turnstileSiteKey: string;
  googleSignIn: boolean;
  /** Sign-in by SMS code; switch on once an SMS provider is connected in Supabase. */
  phoneSignIn: boolean;
  siteUrl: string;
};

// Defaults: ARUNARYA's own Supabase project (Mumbai) and Cloudflare's
// official always-pass Turnstile test key. Production sets real values.
const DEFAULTS: PublicConfig = {
  supabaseUrl: "https://etpeszyqkcduikpeqvzd.supabase.co",
  supabaseKey: "sb_publishable_CvItymr9wInlr1-GpNRz_Q_R-Jd-hFg",
  turnstileSiteKey: "1x00000000000000000000AA",
  googleSignIn: false,
  phoneSignIn: false,
  siteUrl: "https://arunarya-sangam.kshipradt.workers.dev",
};

export function readPublicConfig(env: Record<string, string | undefined> = process.env): PublicConfig {
  const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? DEFAULTS.supabaseKey;
  if (/service_role|sb_secret_/i.test(key)) {
    throw new Error("Refusing to build: a SECRET Supabase key was supplied as the public key.");
  }
  return {
    supabaseUrl: (env.PUBLIC_SUPABASE_URL ?? DEFAULTS.supabaseUrl).replace(/\/+$/, ""),
    supabaseKey: key,
    turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? DEFAULTS.turnstileSiteKey,
    googleSignIn: (env.PUBLIC_GOOGLE_SIGN_IN ?? String(DEFAULTS.googleSignIn)) === "true",
    phoneSignIn: (env.PUBLIC_PHONE_SIGN_IN ?? String(DEFAULTS.phoneSignIn)) === "true",
    siteUrl: (env.PUBLIC_SITE_URL ?? DEFAULTS.siteUrl).replace(/\/+$/, ""),
  };
}
