/**
 * Supabase Auth (GoTrue) REST client.
 *
 * Every public form passes a Turnstile token as `captcha_token`. While bot
 * protection is switched off in the Supabase project the server ignores it;
 * once it is switched on, requests without a valid token are refused.
 */
import { config } from "@/config";
import { request } from "./http";
import { startPkce, takeVerifier } from "./pkce";
import { sessionFromTokenResponse, type Session } from "./session";
import type { LanguageCode } from "@/i18n/languages";
import type { UserRole } from "@/lib/domain/roles";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: unknown;
};

// Links in emails return to the address the person is actually using.
const callbackUrl = () => `${typeof location !== "undefined" && location.origin.startsWith("http") ? location.origin : config.siteUrl}/auth/callback`;
const security = (captchaToken?: string | null) =>
  captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {};

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  language: LanguageCode;
  captchaToken?: string | null;
};

/** Returns a session when the project auto-confirms emails, otherwise null (check your inbox). */
export async function signUp(input: SignUpInput): Promise<Session | null> {
  const challenge = await startPkce();
  const res = await request<TokenResponse | { id: string }>(
    `/auth/v1/signup?redirect_to=${encodeURIComponent(callbackUrl())}`,
    {
      method: "POST",
      body: {
        email: input.email,
        password: input.password,
        data: { full_name: input.fullName, role: input.role, preferred_language: input.language },
        code_challenge: challenge,
        code_challenge_method: "s256",
        ...security(input.captchaToken),
      },
    },
  );
  return "access_token" in res ? sessionFromTokenResponse(res) : null;
}

export async function signInWithPassword(email: string, password: string, captchaToken?: string | null) {
  const res = await request<TokenResponse>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password, ...security(captchaToken) },
  });
  return sessionFromTokenResponse(res);
}

export type OtpTarget = { email: string } | { phone: string };

/**
 * Sends a one-time sign-in code by email or SMS. New people get an account
 * (role buyer until they complete their profile) in their chosen language.
 */
export async function sendSignInCode(target: OtpTarget, language: LanguageCode, captchaToken?: string | null) {
  await request("/auth/v1/otp", {
    method: "POST",
    body: {
      ...target,
      ...("phone" in target ? { channel: "sms" } : {}),
      create_user: true,
      data: { preferred_language: language },
      ...security(captchaToken),
    },
  });
}

/** Checks the 6-digit code and returns a session. */
export async function verifySignInCode(target: OtpTarget, token: string) {
  const res = await request<TokenResponse>("/auth/v1/verify", {
    method: "POST",
    body: { ...target, token, type: "phone" in target ? "sms" : "email" },
  });
  return sessionFromTokenResponse(res);
}

export async function refreshSession(refreshToken: string) {
  const res = await request<TokenResponse>("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  return sessionFromTokenResponse(res);
}

export async function requestPasswordReset(email: string, captchaToken?: string | null) {
  const challenge = await startPkce();
  await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(callbackUrl() + "?next=reset")}`, {
    method: "POST",
    body: { email, code_challenge: challenge, code_challenge_method: "s256", ...security(captchaToken) },
  });
}

export async function resendConfirmation(email: string, captchaToken?: string | null) {
  await request(`/auth/v1/resend?redirect_to=${encodeURIComponent(callbackUrl())}`, {
    method: "POST",
    body: { type: "signup", email, ...security(captchaToken) },
  });
}

export async function updatePassword(accessToken: string, password: string) {
  await request("/auth/v1/user", { method: "PUT", accessToken, body: { password } });
}

/** Completes an email-link or Google sign-in that returned ?code=… */
export async function exchangeCode(code: string) {
  const verifier = takeVerifier();
  if (!verifier) throw Object.assign(new Error("No sign-in in progress on this device"), { code: "pkce_missing" });
  const res = await request<TokenResponse>("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    body: { auth_code: code, code_verifier: verifier },
  });
  return sessionFromTokenResponse(res);
}

export async function googleSignInUrl(): Promise<string> {
  const challenge = await startPkce();
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: "s256",
  });
  return `${config.supabaseUrl}/auth/v1/authorize?${params}`;
}

export async function signOut(accessToken: string) {
  try {
    await request("/auth/v1/logout", { method: "POST", accessToken });
  } catch {
    /* The local session is cleared regardless. */
  }
}
