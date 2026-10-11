import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { LANGUAGES } from "@/i18n/languages";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Link, navigate } from "@/lib/router";
import { useCart } from "@/features/shop/CartProvider";

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

function CartLink() {
  const { t } = useI18n();
  const { count } = useCart();
  return (
    <Link to="/cart" className="cart-link" aria-label={t("cart.linkLabel", { count })}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="20" r="1.4" fill="currentColor" /><circle cx="17" cy="20" r="1.4" fill="currentColor" /></svg>
      {count > 0 && <span className="cart-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

function AccountMenu() {
  const { t } = useI18n();
  const { status, profile, staffRole, signOut } = useAuth();
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
            <Link role="menuitem" to="/orders" onClick={() => setOpen(false)}>{t("orders.title")}</Link>
          </li>
          {profile && profile.role !== "buyer" && (
            <li role="none">
              <Link role="menuitem" to="/sell" onClick={() => setOpen(false)}>{t("sell.title")}</Link>
            </li>
          )}
          <li role="none">
            <Link role="menuitem" to="/help" onClick={() => setOpen(false)}>{t("help.title")}</Link>
          </li>
          {staffRole && (
            <li role="none">
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} lang="en">ARUNARYA console</Link>
            </li>
          )}
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
          <nav className="main-nav" aria-label={t("nav.menu")}>
            <Link to="/shop">{t("nav.shop")}</Link>
            <Link to="/advertise" className="nav-highlight">{t("nav.advertise")}</Link>
          </nav>
          <div className="header-tools">
            <LanguageMenu />
            <CartLink />
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
          <nav className="footer-links" aria-label={t("nav.footer")}>
            <Link to="/shop">{t("nav.shop")}</Link>
            <Link to="/advertise">{t("nav.advertise")}</Link>
            <Link to="/help">{t("help.title")}</Link>
            <Link to="/legal/terms">{t("legal.terms")}</Link>
            <Link to="/legal/privacy">{t("legal.privacy")}</Link>
          </nav>
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
