import { useEffect, useState, type ReactNode } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { languageOf } from "@/i18n/languages";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Link, navigate, Redirect, useLocation } from "@/lib/router";
import { getCities, getCountries, getDistricts, getStates } from "@/features/location/api";
import { Alert, Button, PageSpinner } from "@/ui/controls";

/** Sends signed-out visitors to log in, and new accounts to finish their profile. */
export function RequireAuth({ children, allowIncomplete = false }: { children: ReactNode; allowIncomplete?: boolean }) {
  const { status, profile } = useAuth();
  const { path, search } = useLocation();
  if (status === "loading") return <PageSpinner />;
  if (status === "signedOut") {
    const here = path + (search.toString() ? `?${search}` : "");
    return <Redirect to={`/auth/sign-in?next=${encodeURIComponent(here)}`} />;
  }
  if (!allowIncomplete && profile && !profile.onboarding_complete) {
    return <Redirect to={`/account/complete-profile?next=${encodeURIComponent(path)}`} />;
  }
  return <>{children}</>;
}

function useLocationLabel(): string {
  const { profile } = useAuth();
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!profile?.country_id) return;
    (async () => {
      const parts: string[] = [];
      const country = (await getCountries()).find((c) => c.id === profile.country_id);
      if (profile.state_id) {
        const states = await getStates(profile.country_id!);
        const state = states.find((s) => s.id === profile.state_id);
        if (profile.city_id) parts.push((await getCities(profile.state_id)).find((c) => c.id === profile.city_id)?.name ?? "");
        else if (profile.city_name) parts.push(profile.city_name);
        if (profile.district_id) {
          const d = (await getDistricts(profile.state_id)).find((x) => x.id === profile.district_id);
          if (d) parts.push(`ODOP: ${d.name}`);
        }
        if (state) parts.push(state.name);
      } else if (profile.city_name) parts.push(profile.city_name);
      if (country) parts.push(country.name);
      setLabel(parts.filter(Boolean).join(", "));
    })().catch(() => {});
  }, [profile]);
  return label;
}

export function AccountPage() {
  const { t } = useI18n();
  const { profile, session, signOut } = useAuth();
  const { search } = useLocation();
  const where = useLocationLabel();
  if (!profile) return <PageSpinner />;

  return (
    <section className="container narrow page-pad">
      {search.get("saved") && <Alert tone="success">{t("profile.saved")}</Alert>}
      {search.get("welcome") && <Alert tone="success">{t("auth.callback.confirmed")}</Alert>}
      <h1>{t("account.title")}</h1>
      <dl className="summary">
        <div><dt>{t("field.fullName")}</dt><dd>{profile.full_name || "—"}</dd></div>
        <div><dt>{t("account.email")}</dt><dd>{session?.user.email ?? "—"}</dd></div>
        <div><dt>{t("account.role")}</dt><dd>{t(`roles.${profile.role}` as MessageKey)}</dd></div>
        {profile.business_name && <div><dt>{t("field.businessName")}</dt><dd>{profile.business_name}</dd></div>}
        <div><dt>{t("account.location")}</dt><dd>{where || "—"}</dd></div>
        <div><dt>{t("profile.language")}</dt><dd>{languageOf(profile.preferred_language).native}</dd></div>
      </dl>
      <div className="row-actions">
        <Link to="/account/complete-profile" className="btn btn-secondary">{t("account.edit")}</Link>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut();
            navigate("/?signedOut=1");
          }}
        >
          {t("nav.signOut")}
        </Button>
      </div>
    </section>
  );
}
