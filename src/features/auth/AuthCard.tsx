import { useEffect, useState, type ReactNode } from "react";
import { config } from "@/config";
import { useI18n } from "@/i18n/I18nProvider";
import { googleSignInUrl } from "@/lib/api/auth";

export function AuthCard({ title, children, lead }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="auth-wrap">
      <div className="auth-card">
        <img src="/brand/arunarya-logo.png" alt="" width={64} height={64} className="auth-logo" />
        <h1>{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

/** Shown only after the Google provider is configured in Supabase. */
export function GoogleButton() {
  const { t } = useI18n();
  if (!config.googleSignIn) return null;
  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" onClick={async () => (location.href = await googleSignInUrl())}>
        <span aria-hidden="true" className="g-mark">G</span> {t("auth.google")}
      </button>
      <p className="divider"><span>{t("auth.or")}</span></p>
    </>
  );
}

/** Counts down from `seconds`; returns the remaining seconds. */
export function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return left;
}
