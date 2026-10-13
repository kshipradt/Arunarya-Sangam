/** Build-time constant injected by scripts/build.ts. */
declare const __APP_CONFIG__: {
  supabaseUrl: string;
  supabaseKey: string;
  turnstileSiteKey: string;
  googleSignIn: boolean;
  phoneSignIn: boolean;
  siteUrl: string;
};

declare module "*.css";
