import { useEffect, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { LANGUAGES, type LanguageCode } from "@/i18n/languages";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { validateLocation, type LocationErrors } from "@/lib/domain/location";
import { isSellerRole, USER_ROLES, type UserRole } from "@/lib/domain/roles";
import { navigate, safeNext, useLocation } from "@/lib/router";
import { nameError } from "@/features/auth/validation";
import { getCountries } from "@/features/location/api";
import { EMPTY_LOCATION, LocationPicker, type LocationValue } from "@/features/location/LocationPicker";
import { Alert, Button, PageSpinner, RadioCards, TextField } from "@/ui/controls";

export function CompleteProfilePage() {
  const { t, setLang } = useI18n();
  const { profile, updateProfile } = useAuth();
  const { search } = useLocation();

  const [role, setRole] = useState<UserRole>(profile?.role ?? "buyer");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [business, setBusiness] = useState(profile?.business_name ?? "");
  const [language, setLanguage] = useState<LanguageCode>(profile?.preferred_language ?? "en");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [errors, setErrors] = useState<LocationErrors & { name?: MessageKey }>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  // Rebuild the saved location (the profile stores ids; the picker also needs the country code).
  useEffect(() => {
    if (!profile || location) return;
    getCountries()
      .then((countries) => {
        const c = countries.find((x) => x.id === profile.country_id);
        setLocation({
          ...EMPTY_LOCATION,
          countryId: profile.country_id,
          countryIso2: c?.iso2 ?? null,
          stateId: profile.state_id,
          cityId: profile.city_id,
          cityName: profile.city_name ?? "",
          districtId: profile.district_id,
          abroad: isSellerRole(profile.role) && !!c && c.iso2 !== "IN",
        });
      })
      .catch(() => setLocation(EMPTY_LOCATION));
  }, [profile, location]);

  if (!profile || !location) return <PageSpinner />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!location) return;
    const errs: typeof errors = { ...validateLocation(role, location) };
    const n = nameError(name);
    if (n) errs.name = n;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("v.fixErrors");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await updateProfile({
        role,
        full_name: name.trim(),
        business_name: isSellerRole(role) ? business.trim() || null : null,
        country_id: location.countryId,
        state_id: location.stateId,
        city_id: location.cityId,
        city_name: location.cityId ? null : location.cityName.trim() || null,
        district_id: isSellerRole(role) && !location.abroad ? location.districtId : null,
        preferred_language: language,
        onboarding_complete: true,
      });
      setLang(language);
      navigate(safeNext(search.get("next"), "/account?saved=1"), { replace: true });
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container narrow page-pad">
      <h1>{t("profile.title")}</h1>
      <p className="lead">{t("profile.lead")}</p>
      <form onSubmit={onSubmit} noValidate className="stack">
        {formError && <Alert>{t(formError)}</Alert>}
        <RadioCards
          legend={t("profile.roleLabel")}
          value={role}
          onChange={(r) => {
            setRole(r);
            setLocation(EMPTY_LOCATION);
          }}
          options={USER_ROLES.map((r) => ({ value: r, title: t(`roles.${r}` as MessageKey), description: t(`roles.${r}Desc` as MessageKey) }))}
        />
        <TextField label={t("field.fullName")} autoComplete="name" maxLength={120} value={name} error={errors.name ? t(errors.name) : null} onChange={(e) => setName(e.target.value)} />
        {isSellerRole(role) && (
          <TextField label={t("field.businessName")} optional autoComplete="organization" maxLength={120} value={business} onChange={(e) => setBusiness(e.target.value)} />
        )}
        <LocationPicker role={role} value={location} onChange={setLocation} errors={errors} />
        <label className="field">
          <span>{t("profile.language")}</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>{l.native} · {l.english}</option>
            ))}
          </select>
        </label>
        <Button type="submit" busy={busy} className="btn-block">{t("profile.save")}</Button>
      </form>
    </section>
  );
}
