import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { USER_ROLES } from "@/lib/domain/roles";
import { Link, useLocation } from "@/lib/router";
import { Alert } from "@/ui/controls";

export function HomePage() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { search } = useLocation();

  return (
    <>
      {search.get("signedOut") && (
        <div className="container"><Alert tone="info">{t("account.signedOut")}</Alert></div>
      )}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">{t("home.eyebrow")}</p>
            <h1>{t("home.title")}</h1>
            <p className="lead">{t("home.lead")}</p>
            {status !== "signedIn" && (
              <div className="hero-actions">
                <Link to="/auth/sign-up" className="btn btn-primary btn-lg">{t("home.ctaJoin")}</Link>
                <Link to="/auth/sign-in" className="btn btn-secondary btn-lg">{t("home.ctaSignIn")}</Link>
              </div>
            )}
            <p className="hero-note">{t("home.comingSoon")}</p>
          </div>
          <img className="hero-logo" src="/brand/arunarya-logo.png" alt="ARUNARYA" width={340} height={340} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>{t("home.rolesTitle")}</h2>
          <ul className="role-grid" role="list">
            {USER_ROLES.map((r) => (
              <li key={r} className="role-card">
                <h3>{t(`roles.${r}` as MessageKey)}</h3>
                <p>{t(`roles.${r}Desc` as MessageKey)}</p>
                {status !== "signedIn" && (
                  <Link to={`/auth/sign-up?role=${r}`} className="text-link">{t("home.ctaJoin")} →</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section-sand">
        <div className="container narrow">
          <h2>{t("home.odopTitle")}</h2>
          <p>{t("home.odopBody")}</p>
          <p className="small-print">{t("footer.disclaimer")}</p>
        </div>
      </section>

      <section className="section">
        <div className="container founder">
          <img src="/brand/vrinda-tiwari.jpg" alt="Vrinda Tiwari" width={240} height={300} loading="lazy" />
          <div>
            <h2>{t("home.founderTitle")}</h2>
            <p>{t("home.founderBody")}</p>
          </div>
        </div>
      </section>
    </>
  );
}

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="container narrow page-pad">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link to="/" className="btn btn-primary">{t("notFound.home")}</Link>
    </section>
  );
}
