/**
 * Sign in with a one-time code instead of a password: by email now, and by
 * SMS to an Indian mobile once an SMS provider is connected. Works for new
 * people too: they get an account and then complete their profile.
 */
import { useEffect, useState, type FormEvent } from "react";
import { config } from "@/config";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { sendSignInCode, verifySignInCode, type OtpTarget } from "@/lib/api/auth";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normaliseIndianMobile } from "@/lib/format";
import { Link, navigate, safeNext, useLocation } from "@/lib/router";
import { Alert, Button, TextField } from "@/ui/controls";
import { AuthCard } from "./AuthCard";
import { Turnstile } from "./Turnstile";
import { emailError, normaliseEmail } from "./validation";

type Channel = "email" | "phone";
const RESEND_AFTER = 60;
export const CODE_RE = /^\d{6}$/;

export function phoneError(raw: string): MessageKey | null {
  if (!raw.trim()) return "v.required";
  return normaliseIndianMobile(raw) ? null : "checkout.phoneInvalid";
}

export function CodeSignInPage() {
  const { t, lang } = useI18n();
  const { acceptSession } = useAuth();
  const { search } = useLocation();
  const next = safeNext(search.get("next"), "/account");

  const [channel, setChannel] = useState<Channel>(config.phoneSignIn && search.get("via") !== "email" ? "phone" : "email");
  const [email, setEmail] = useState(search.get("email") ?? "");
  const [phone, setPhone] = useState("");
  const [target, setTarget] = useState<OtpTarget | null>(null);
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [fieldError, setFieldError] = useState<MessageKey | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendLeft]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const err = channel === "email" ? emailError(email) : phoneError(phone);
    setFieldError(err);
    setCaptchaError(!captcha);
    setFormError(null);
    if (err || !captcha) return;
    const to: OtpTarget = channel === "email" ? { email: normaliseEmail(email) } : { phone: `+91${normaliseIndianMobile(phone)}` };
    setBusy(true);
    try {
      await sendSignInCode(to, lang ?? "en", captcha);
      setTarget(to);
      setCode("");
      setResendLeft(RESEND_AFTER);
    } catch (ex) {
      setFormError(errorMessageKey(ex));
    } finally {
      setBusy(false);
      setCaptcha(null);
      setCaptchaReset((n) => n + 1);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    const clean = code.replace(/\D/g, "");
    if (!CODE_RE.test(clean)) return setFieldError("auth.code.invalidFormat");
    setFieldError(null);
    setFormError(null);
    setBusy(true);
    try {
      const profile = await acceptSession(await verifySignInCode(target, clean));
      if (profile && !profile.onboarding_complete) {
        const back = search.get("next") ? `?next=${encodeURIComponent(next)}` : "";
        navigate(`/account/complete-profile${back}`, { replace: true });
      } else {
        navigate(next, { replace: true });
      }
    } catch (ex) {
      const key = errorMessageKey(ex);
      setFormError(key === "err.invalid_credentials" || key === "err.unknown" ? "auth.code.wrong" : key);
    } finally {
      setBusy(false);
    }
  }

  const shown = target ? ("email" in target ? target.email : `+91 ${target.phone.slice(3, 8)} ${target.phone.slice(8)}`) : "";

  if (target) {
    return (
      <AuthCard title={t("auth.code.enterTitle")} lead={t(target && "email" in target ? "auth.code.sentToEmail" : "auth.code.sentTo", { target: shown })}>
        <form onSubmit={verify} noValidate>
          {formError && <Alert>{t(formError)}</Alert>}
          <TextField
            label={t("auth.code.label")}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]*"
            className="code-input"
            value={code}
            error={fieldError ? t(fieldError) : null}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          <Button type="submit" busy={busy} className="btn-block">{t("auth.code.verify")}</Button>
        </form>
        <div className="code-actions">
          {resendLeft > 0 ? (
            <p className="small-print">{t("auth.code.resendIn", { seconds: resendLeft })}</p>
          ) : (
            <>
              <Turnstile onToken={setCaptcha} resetKey={captchaReset} error={captchaError ? t("v.captcha") : null} />
              <button type="button" className="link-button" disabled={busy} onClick={() => void send()}>{t("auth.code.resend")}</button>
            </>
          )}
          <button type="button" className="link-button" onClick={() => { setTarget(null); setFormError(null); }}>
            {channel === "email" ? t("auth.code.changeEmail") : t("auth.code.changePhone")}
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.code.title")} lead={t("auth.code.lead")}>
      <div className="segmented segmented-full" role="tablist" aria-label={t("auth.code.how")}>
        <button type="button" role="tab" aria-selected={channel === "phone"} onClick={() => { setChannel("phone"); setFieldError(null); }}>
          {t("auth.code.byPhone")}
        </button>
        <button type="button" role="tab" aria-selected={channel === "email"} onClick={() => { setChannel("email"); setFieldError(null); }}>
          {t("auth.code.byEmail")}
        </button>
      </div>
      {channel === "phone" && !config.phoneSignIn ? (
        <Alert tone="info">
          {t("auth.code.phoneSoon")}{" "}
          <button type="button" className="link-button" onClick={() => setChannel("email")}>{t("auth.code.useEmail")}</button>
        </Alert>
      ) : (
        <form onSubmit={send} noValidate>
          {formError && <Alert>{t(formError)}</Alert>}
          {channel === "email" ? (
            <TextField
              label={t("field.email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              error={fieldError ? t(fieldError) : null}
              onChange={(e) => setEmail(e.target.value)}
            />
          ) : (
            <TextField
              label={t("checkout.mobile")}
              hint={t("auth.code.phoneHint")}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              suffix={<span className="field-prefix" aria-hidden="true">+91</span>}
              value={phone}
              error={fieldError ? t(fieldError) : null}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
          <Turnstile onToken={setCaptcha} resetKey={captchaReset} error={captchaError ? t("v.captcha") : null} />
          <Button type="submit" busy={busy} className="btn-block">{t("auth.code.send")}</Button>
          <p className="small-print">{t("auth.code.newHere")}</p>
        </form>
      )}
      <p className="auth-switch">
        <Link to={`/auth/sign-in${search.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("auth.code.usePassword")}</Link>
      </p>
    </AuthCard>
  );
}
