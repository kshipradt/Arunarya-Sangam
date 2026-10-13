/**
 * Public runtime configuration, injected at build time by scripts/build.ts.
 * Tests run without the bundler, so a safe fallback is provided.
 */
export type AppConfig = typeof __APP_CONFIG__;

const fallback: AppConfig = {
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "sb_publishable_test",
  turnstileSiteKey: "1x00000000000000000000AA",
  googleSignIn: false,
  phoneSignIn: false,
  siteUrl: "http://localhost:5173",
};

export const config: AppConfig = typeof __APP_CONFIG__ === "undefined" ? fallback : __APP_CONFIG__;
