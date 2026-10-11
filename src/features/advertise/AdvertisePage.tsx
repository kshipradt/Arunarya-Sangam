/**
 * "Advertise with us": how promotion on Sangam works, and an enquiry form the
 * ARUNARYA team follows up on. Paid campaigns open with online payments.
 */
import { useState, type FormEvent } from "react";
import { emailError, nameError, normaliseEmail } from "@/features/auth/validation";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { insertOnly } from "@/lib/api/rest";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normaliseIndianMobile } from "@/lib/format";
import { Alert, Button, TextField } from "@/ui/controls";

export const AD_BUDGETS = ["under5k", "5to25k", "25to100k", "over100k", "notSure"] as const;
const PLACEMENTS = ["home", "featured", "district"] as const;

type Form = { name: string; business: string; email: string; phone: string; budget: string; message: string };
type Errors = Partial<Record<keyof Form, MessageKey>>;

export function validateAdEnquiry(f: Form): Errors {
  const e: Errors = {};
  const n = nameError(f.name);
  if (n) e.name = n;
  const m = emailError(f.email);
  if (m) e.email = m;
  if (f.phone.trim() && !normaliseIndianMobile(f.phone) && !/^\+?[0-9 ()-]{6,20}$/.test(f.phone.trim())) e.phone = "checkout.phoneInvalid";
  if (f.message.length > 1000) e.message = "ad.messageLong";
  return e;
}

export function AdvertisePage() {
  const { t } = useI18n();
  const { profile, session } = useAuth();
  const [form, setForm] = useState<Form>({
    name: profile?.full_name ?? "",
    business: "",
    email: session?.user.email ?? "",
    phone: "",
    budget: "notSure",
    message: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateAdEnquiry(form);
    setErrors(errs);
    if (Object.keys(errs).length) return setFormError("v.fixErrors");
    setBusy(true);
    setFormError(null);
    try {
      await insertOnly("ad_inquiries", {
        name: form.name.trim(),
        business: form.business.trim() || null,
        email: normaliseEmail(form.email),
        phone: form.phone.trim() || null,
        budget_range: form.budget,
        message: form.message.trim() || null,
      });
      setSent(true);
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="ad-hero">
        <div className="container narrow">
          <p className="eyebrow">{t("ad.eyebrow")}</p>
          <h1>{t("ad.title")}</h1>
          <p className="lead">{t("ad.lead")}</p>
        </div>
      </section>
      <section className="container page-pad">
        <ul className="ad-places" role="list">
          {PLACEMENTS.map((p) => (
            <li key={p}>
              <h2>{t(`ad.place.${p}` as MessageKey)}</h2>
              <p>{t(`ad.place.${p}Desc` as MessageKey)}</p>
            </li>
          ))}
        </ul>
        <div className="ad-benefit">
          <h2>{t("ad.makersTitle")}</h2>
          <p>{t("ad.makersBody")}</p>
        </div>

        <div className="container narrow">
          <h2 id="enquire">{t("ad.formTitle")}</h2>
          {sent ? (
            <Alert tone="success">{t("ad.sent")}</Alert>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              {formError && <Alert>{t(formError)}</Alert>}
              <TextField label={t("field.fullName")} autoComplete="name" maxLength={100} value={form.name} error={errors.name ? t(errors.name) : null} onChange={set("name")} />
              <TextField label={t("field.businessName")} optional maxLength={120} value={form.business} onChange={set("business")} />
              <TextField label={t("field.email")} type="email" autoComplete="email" maxLength={200} value={form.email} error={errors.email ? t(errors.email) : null} onChange={set("email")} />
              <TextField label={t("ad.phone")} optional type="tel" autoComplete="tel" maxLength={20} value={form.phone} error={errors.phone ? t(errors.phone) : null} onChange={set("phone")} />
              <label className="field">
                <span>{t("ad.budget")}</span>
                <select value={form.budget} onChange={set("budget")}>
                  {AD_BUDGETS.map((b) => <option key={b} value={b}>{t(`ad.budget.${b}` as MessageKey)}</option>)}
                </select>
              </label>
              <label className={`field ${errors.message ? "field-invalid" : ""}`}>
                <span>{t("ad.message")} <span className="optional">({t("common.optional")})</span></span>
                <textarea rows={4} maxLength={1000} value={form.message} onChange={set("message")} />
                {errors.message && <span className="field-error" role="alert">{t(errors.message)}</span>}
              </label>
              <p className="small-print">{t("ad.privacy")}</p>
              <Button type="submit" busy={busy} className="btn-block">{t("ad.submit")}</Button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
