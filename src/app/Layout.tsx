import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { LANGUAGES } from "@/i18n/languages";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Link, navigate } from "@/lib/router";

function LanguageMenu() {
  const { t, lang, setLang } = useI18n();
  const { status, profile, updateProfile } = useAuth();
  return (
    <label className="lang-menu">
      <span className="sr-only">{t("lang.menuLabel")}</span>
      <select
        value={lang ?? "en"}
        onChange={(e) => {
          const code = e.target.value as (typeof LANGUAGES)[number]["code"];
          setLang(code);
          if (status === "signedIn" && profile) void updateProfile({ preferred_language: code }).catch(() => {});
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountMenu() {
  const { t } = useI18n();
  const { status, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (status !== "signedIn") {
    return (
      <nav className="header-actions" aria-label={t("nav.menu")}>
        <Link to="/auth/sign-in" className="btn btn-ghost">{t("nav.signIn")}</Link>
        <Link to="/auth/sign-up" className="btn btn-primary">{t("nav.join")}</Link>
      </nav>
    );
  }
  const initial = (profile?.full_name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={t("nav.account")}>
        {initial}
      </button>
      {open && (
        <ul role="menu" className="menu">
          <li role="none">
            <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>{t("nav.account")}</Link>
          </li>
          <li role="none">
            <button
              role="menuitem"
              type="button"
              onClick={async () => {
                setOpen(false);
                await signOut();
                navigate("/?signedOut=1");
              }}
            >
              {t("nav.signOut")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <a href="#main" className="skip-link">{t("nav.skip")}</a>
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" className="brand" aria-label={t("common.appName")}>
            <img src="/brand/arunarya-logo.png" alt="" width={44} height={44} />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-name">Sangam</span>
          </Link>
          <div className="header-tools">
            <LanguageMenu />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main id="main" className="site-main">{children}</main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <img src="/brand/arunarya-logo.png" alt="ARUNARYA" width={56} height={56} />
            <div>
              <p className="footer-title">{t("common.appName")}</p>
              <p>{t("common.tagline")}</p>
            </div>
          </div>
          <p className="footer-disclaimer">{t("footer.disclaimer")}</p>
          <p className="footer-rights">{t("footer.rights")}</p>
          <p className="footer-credit" lang="en" dir="ltr">
            Location data: countries-states-cities-database (ODbL) and igod.gov.in district directory.
          </p>
        </div>
      </footer>
    </>
  );
}
