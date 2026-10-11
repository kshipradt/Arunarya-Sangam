/**
 * Screens reached through email: check your inbox, forgot password,
 * choose a new password, and the landing page for every emailed link.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { exchangeCode, requestPasswordReset, resendConfirmation, updatePassword } from "@/lib/api/auth";
import { errorMessageKey } from "@/lib/api/errors";
import { decodeJwtClaims, sessionFromTokenResponse } from "@/lib/api/session";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Link, navigate, useLocation } from "@/lib/router";
import { checkPassword } from "@/lib/security/password";
import { Alert, Button, PageSpinner, PasswordField, TextField } from "@/ui/controls";
import { AuthCard, useCountdown } from "./AuthCard";
import { PasswordStrength } from "./PasswordStrength";
import { Turnstile } from "./Turnstile";
import { emailError, normaliseEmail } from "./validation";

export function CheckEmailPage() {
  const { t } = useI18n();
  const { search } = useLocation();
  const email = search.get("email") ?? "";
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [cooldown, setCooldown] = useState(60);
  const wait = useCountdown(cooldown);
  const [message, setMessage] = useState<{ tone: "success" | "error"; key: MessageKey } | null>(null);

  return (
    <AuthCard title={t("auth.checkEmail.title")} lead={t("auth.checkEmail.body", { email })}>
      {message && <Alert tone={message.tone}>{t(message.key)}</Alert>}
      <Turnstile onToken={setCaptcha} resetKey={reset} />
      <Button
        variant="secondary"
        className="btn-block"
        disabled={!captcha || wait > 0 || !email}
        onClick={async () => {
          try {
            await resendConfirmation(email, captcha);
            setMessage({ tone: "success", key: "auth.checkEmail.resent" });
            setCooldown((c) => (c === 60 ? 61 : 60));
          } catch (e) {
            setMessage({ tone: "error", key: errorMessageKey(e) });
          }
          setReset((r) => r + 1);
        }}
      >
        {t("auth.checkEmail.resend")}
        {wait > 0 ? ` (${wait})` : ""}
      </Button>
      <p className="auth-switch">
        <Link to="/auth/sign-up">{t("auth.checkEmail.restart")}</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const { search } = useLocation();
  const [email, setEmail] = useState(search.get("email") ?? "");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [errors, setErrors] = useState<{ email?: MessageKey; captcha?: MessageKey }>({});
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const em = emailError(email);
    const errs = { email: em ?? undefined, captcha: captcha ? undefined : ("v.captcha" as MessageKey) };
    setErrors(errs);
    if (errs.email || errs.captcha) return;
    setBusy(true);
    setFormError(null);
    try {
      await requestPasswordReset(normaliseEmail(email), captcha);
      setSent(normaliseEmail(email));
    } catch (err) {
      const key = errorMessageKey(err);
      // Never reveal whether an account exists: only show rate-limit, captcha and network problems.
      if (["err.rate_limit", "err.email_rate_limit", "err.captcha_failed", "err.network", "err.timeout"].includes(key)) setFormError(key);
      else setSent(normaliseEmail(email));
      setReset((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("auth.forgot.title")} lead={sent ? undefined : t("auth.forgot.lead")}>
      {sent ? (
        <Alert tone="success">{t("auth.forgot.sent", { email: sent })}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {formError && <Alert>{t(formError)}</Alert>}
          <TextField
            label={t("field.email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            error={errors.email ? t(errors.email) : null}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Turnstile onToken={setCaptcha} resetKey={reset} error={errors.captcha ? t(errors.captcha) : null} />
          <Button type="submit" busy={busy} className="btn-block">{t("auth.forgot.submit")}</Button>
        </form>
      )}
      <p className="auth-switch"><Link to="/auth/sign-in">{t("auth.forgot.back")}</Link></p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { t } = useI18n();
  const { status, session, getAccessToken } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: MessageKey; confirm?: MessageKey }>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const check = useMemo(() => checkPassword(password, session?.user.email ?? undefined), [password, session]);

  if (status === "loading") return <PageSpinner />;
  if (status !== "signedIn") {
    return (
      <AuthCard title={t("auth.reset.title")}>
        <Alert>{t("auth.reset.expired")}</Alert>
        <Link to="/auth/forgot-password" className="btn btn-primary btn-block">{t("auth.forgot.submit")}</Link>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!check.valid) errs.password = "v.passwordWeak";
    if (confirm !== password) errs.confirm = "v.passwordMismatch";
    setErrors(errs);
    if (errs.password || errs.confirm) return;
    setBusy(true);
    setFormError(null);
    try {
      await updatePassword(await getAccessToken(), password);
      setDone(true);
      setTimeout(() => navigate("/account", { replace: true }), 1500);
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("auth.reset.title")}>
      {done ? (
        <Alert tone="success">{t("auth.reset.done")}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {formError && <Alert>{t(formError)}</Alert>}
          <PasswordField label={t("field.newPassword")} autoComplete="new-password" maxLength={72} value={password} error={errors.password ? t(errors.password) : null} onChange={(e) => setPassword(e.target.value)} />
          <PasswordStrength check={check} touched={password.length > 0} />
          <PasswordField label={t("field.confirmPassword")} autoComplete="new-password" maxLength={72} value={confirm} error={errors.confirm ? t(errors.confirm) : null} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" busy={busy} className="btn-block">{t("auth.reset.submit")}</Button>
        </form>
      )}
    </AuthCard>
  );
}

/** Landing page for links in emails and for Google sign-in. */
export function AuthCallbackPage() {
  const { t } = useI18n();
  const { acceptSession } = useAuth();
  const { search, hash } = useLocation();
  const [state, setState] = useState<"working" | "otherDevice" | "failed">("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = search.get("next");
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const failed = search.get("error_description") || hashParams.get("error_description");
    const code = search.get("code");

    (async () => {
      if (failed) return setState("failed");
      let session = null;
      if (code) {
        try {
          session = await exchangeCode(code);
        } catch (e) {
          // The email is already confirmed by the server; only the sign-in step is missing.
          return setState((e as { code?: string }).code === "pkce_missing" ? "otherDevice" : "failed");
        }
      } else if (hashParams.get("access_token") && hashParams.get("refresh_token")) {
        try {
          const accessToken = hashParams.get("access_token")!;
          const claims = decodeJwtClaims(accessToken);
          session = sessionFromTokenResponse({
            access_token: accessToken,
            refresh_token: hashParams.get("refresh_token")!,
            expires_in: Number(hashParams.get("expires_in") ?? 3600),
            user: { id: claims.sub, email: claims.email ?? null, user_metadata: {} },
          });
        } catch {
          return setState("failed");
        }
      } else {
        return setState("failed");
      }
      history.replaceState(null, "", "/auth/callback");
      const recovering = next === "reset" || hashParams.get("type") === "recovery";
      const profile = await acceptSession(session).catch(() => null);
      if (recovering) navigate("/auth/reset-password", { replace: true });
      else if (profile && !profile.onboarding_complete) navigate("/account/complete-profile?welcome=1", { replace: true });
      else navigate("/account?welcome=1", { replace: true });
    })();
  }, [acceptSession, search, hash]);

  if (state === "working") {
    return (
      <AuthCard title={t("auth.callback.working")}>
        <PageSpinner />
      </AuthCard>
    );
  }
  return (
    <AuthCard title={state === "otherDevice" ? t("auth.callback.confirmed") : t("auth.callback.failed")}>
      {state === "otherDevice" ? <Alert tone="success">{t("auth.callback.otherDevice")}</Alert> : <Alert>{t("auth.callback.failed")}</Alert>}
      <Link to="/auth/sign-in" className="btn btn-primary btn-block">{t("nav.signIn")}</Link>
    </AuthCard>
  );
}
