import { useMemo, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { signUp } from "@/lib/api/auth";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isUserRole, USER_ROLES, type UserRole } from "@/lib/domain/roles";
import { Link, navigate, useLocation } from "@/lib/router";
import { checkPassword } from "@/lib/security/password";
import { Alert, Button, Checkbox, PasswordField, RadioCards, TextField } from "@/ui/controls";
import { AuthCard, GoogleButton } from "./AuthCard";
import { PasswordStrength } from "./PasswordStrength";
import { Turnstile } from "./Turnstile";
import { emailError, nameError, normaliseEmail } from "./validation";

type Field = "name" | "email" | "password" | "confirm" | "consent" | "captcha";

export function SignUpPage() {
  const { t, rich, lang } = useI18n();
  const { acceptSession } = useAuth();
  const { search } = useLocation();
  const initialRole = search.get("role");

  const [role, setRole] = useState<UserRole>(isUserRole(initialRole) ? initialRole : "buyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => checkPassword(password, email), [password, email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    const n = nameError(name);
    const em = emailError(email);
    if (n) errs.name = n;
    if (em) errs.email = em;
    if (!check.valid) errs.password = "v.passwordWeak";
    if (!confirm) errs.confirm = "v.required";
    else if (confirm !== password) errs.confirm = "v.passwordMismatch";
    if (!consent) errs.consent = "v.consent";
    if (!captcha) errs.captcha = "v.captcha";
    setErrors(errs);
    setFormError(Object.keys(errs).length ? "v.fixErrors" : null);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }

    setBusy(true);
    try {
      const cleanEmail = normaliseEmail(email);
      const session = await signUp({
        email: cleanEmail,
        password,
        fullName: name.trim(),
        role,
        language: lang ?? "en",
        captchaToken: captcha,
      });
      if (session) {
        await acceptSession(session);
        navigate("/account/complete-profile", { replace: true });
      } else {
        navigate(`/auth/check-email?email=${encodeURIComponent(cleanEmail)}`, { replace: true });
      }
    } catch (err) {
      setFormError(errorMessageKey(err));
      setCaptchaReset((c) => c + 1);
    } finally {
      setBusy(false);
    }
  }

  const err = (f: Field) => (errors[f] ? t(errors[f]!) : null);

  return (
    <AuthCard title={t("auth.signUp.title")}>
      <GoogleButton />
      <Alert tone="info">
        {t("auth.code.noPasswordNeeded")} <Link to="/auth/code">{t("auth.code.cta")}</Link>
      </Alert>
      <form onSubmit={onSubmit} noValidate>
        {formError && <Alert>{t(formError)}</Alert>}
        <RadioCards
          legend={t("auth.signUp.roleLabel")}
          value={role}
          onChange={setRole}
          options={USER_ROLES.map((r) => ({
            value: r,
            title: t(`roles.${r}` as MessageKey),
            description: t(`roles.${r}Desc` as MessageKey),
          }))}
        />
        <TextField label={t("field.fullName")} autoComplete="name" required maxLength={120} value={name} error={err("name")} onChange={(e) => setName(e.target.value)} />
        <TextField
          label={t("field.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          error={err("email")}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label={t("field.password")}
          autoComplete="new-password"
          required
          maxLength={72}
          value={password}
          error={err("password")}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength check={check} touched={password.length > 0} />
        <PasswordField
          label={t("field.confirmPassword")}
          autoComplete="new-password"
          required
          maxLength={72}
          value={confirm}
          error={err("confirm")}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Checkbox checked={consent} onChange={setConsent} error={err("consent")}>
          {rich("auth.signUp.consent", {
            terms: (s) => <a href="/legal/terms" target="_blank" rel="noopener">{s}</a>,
            privacy: (s) => <a href="/legal/privacy" target="_blank" rel="noopener">{s}</a>,
          })}
        </Checkbox>
        <Turnstile onToken={setCaptcha} resetKey={captchaReset} error={err("captcha")} />
        <Button type="submit" busy={busy} className="btn-block">{t("auth.signUp.submit")}</Button>
      </form>
      <p className="auth-switch">
        {rich("auth.signUp.haveAccount", { link: (s) => <Link to="/auth/sign-in">{s}</Link> })}
      </p>
    </AuthCard>
  );
}
