import { useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { resendConfirmation } from "@/lib/api/auth";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Link, navigate, safeNext, useLocation } from "@/lib/router";
import { Alert, Button, PasswordField, TextField } from "@/ui/controls";
import { AuthCard, GoogleButton, useCountdown } from "./AuthCard";
import { Turnstile } from "./Turnstile";
import { cooldownSeconds, emailError, normaliseEmail } from "./validation";

export function SignInPage() {
  const { t, rich } = useI18n();
  const { signIn } = useAuth();
  const { search } = useLocation();
  const next = safeNext(search.get("next"), "/account");

  const [email, setEmail] = useState(search.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"email" | "password" | "captcha", MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [resent, setResent] = useState(false);
  const wait = useCountdown(cooldownSeconds(failures));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof fieldErrors = {};
    const em = emailError(email);
    if (em) errs.email = em;
    if (!password) errs.password = "v.required";
    if (!captcha) errs.captcha = "v.captcha";
    setFieldErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length || wait > 0) return;

    setBusy(true);
    try {
      const profile = await signIn(normaliseEmail(email), password, captcha);
      setFailures(0);
      if (profile && !profile.onboarding_complete) {
        const back = search.get("next") ? `?next=${encodeURIComponent(next)}` : "";
        navigate(`/account/complete-profile${back}`, { replace: true });
      } else {
        navigate(next, { replace: true });
      }
    } catch (err) {
      setFailures((f) => f + 1);
      setFormError(errorMessageKey(err));
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("auth.signIn.title")}>
      <GoogleButton />
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <Alert>
            {t(formError)}
            {formError === "err.email_not_confirmed" && !resent && (
              <>
                {" "}
                <button
                  type="button"
                  className="link-button"
                  disabled={!captcha}
                  onClick={async () => {
                    await resendConfirmation(normaliseEmail(email), captcha).catch(() => {});
                    setResent(true);
                    setCaptchaReset((n) => n + 1);
                  }}
                >
                  {t("auth.checkEmail.resend")}
                </button>
              </>
            )}
            {resent && <> {t("auth.checkEmail.resent")}</>}
          </Alert>
        )}
        {wait > 0 && <Alert tone="info">{t("auth.signIn.slowDown", { seconds: wait })}</Alert>}
        <TextField
          label={t("field.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          error={fieldErrors.email ? t(fieldErrors.email) : null}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label={t("field.password")}
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password ? t(fieldErrors.password) : null}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="form-aside">
          <Link to={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}>{t("auth.signIn.forgot")}</Link>
        </p>
        <Turnstile onToken={setCaptcha} resetKey={captchaReset} error={fieldErrors.captcha ? t(fieldErrors.captcha) : null} />
        <Button type="submit" busy={busy} disabled={wait > 0} className="btn-block">
          {t("auth.signIn.submit")}
        </Button>
      </form>
      <p className="auth-switch">
        {rich("auth.signIn.noAccount", { link: (s) => <Link to={`/auth/sign-up${search.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>{s}</Link> })}
      </p>
    </AuthCard>
  );
}
