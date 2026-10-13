/**
 * Maps server error codes to translated messages. Raw server text is never
 * shown to people: it can be technical, in English only, or leak details.
 */
import type { MessageKey } from "@/i18n/I18nProvider";
import { ApiError } from "./http";

const BY_CODE: Record<string, MessageKey> = {
  invalid_credentials: "err.invalid_credentials",
  invalid_grant: "err.invalid_credentials",
  email_not_confirmed: "err.email_not_confirmed",
  user_already_exists: "err.user_already_exists",
  email_exists: "err.user_already_exists",
  weak_password: "err.weak_password",
  over_request_rate_limit: "err.rate_limit",
  over_email_send_rate_limit: "err.email_rate_limit",
  captcha_failed: "err.captcha_failed",
  same_password: "err.same_password",
  signup_disabled: "err.signup_disabled",
  email_provider_disabled: "err.signup_disabled",
  session_not_found: "err.session_expired",
  refresh_token_not_found: "err.session_expired",
  bad_jwt: "err.session_expired",
  otp_expired: "auth.code.wrong",
  otp_disabled: "auth.code.unavailable",
  phone_provider_disabled: "auth.code.unavailable",
  sms_send_failed: "auth.code.smsFailed",
  over_sms_send_rate_limit: "err.rate_limit",
  validation_failed: "auth.code.unavailable",
  network_error: "err.network",
  timeout: "err.timeout",
};

/** Rules enforced inside the database raise these sentences (PostgreSQL code P0001). */
const DB_MESSAGES: [RegExp, MessageKey][] = [
  [/unavailable, out of stock/i, "cart.fixItems"],
  [/coupon is not valid/i, "cart.couponInvalid"],
  [/cart is empty/i, "cart.empty"],
  [/complete the delivery address/i, "v.fixErrors"],
  [/can no longer be cancelled/i, "orders.cannotCancel"],
  [/only review items you bought|after it is delivered|no longer listed/i, "review.notAllowed"],
  [/one step forward|already delivered|already cancelled|shipped item cannot/i, "sell.statusNotAllowed"],
  [/at least one photo/i, "sell.needPhoto"],
  [/order is not yours/i, "help.orderNotYours"],
  [/complaint is closed/i, "help.closed"],
  [/sign in|log in/i, "err.session_expired"],
];

export function errorMessageKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    if (error.code === "P0001") {
      for (const [re, key] of DB_MESSAGES) if (re.test(error.message)) return key;
    }
    if (error.code === "23505" && /product_reviews/.test(error.message)) return "review.already";
    if (error.code === "file_too_large") return "sell.photoTooLarge";
    const byCode = BY_CODE[error.code];
    if (byCode) return byCode;
    if (error.status === 429) return "err.rate_limit";
    if (/captcha/i.test(error.message)) return "err.captcha_failed";
    if (/already (registered|exists)/i.test(error.message)) return "err.user_already_exists";
    if (/invalid login credentials/i.test(error.message)) return "err.invalid_credentials";
    if (/email not confirmed/i.test(error.message)) return "err.email_not_confirmed";
    if (error.status === 401) return "err.session_expired";
  }
  return "err.unknown";
}

/** Errors that mean the security-check token was consumed and must be renewed. */
export function needsFreshCaptcha(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400;
}
