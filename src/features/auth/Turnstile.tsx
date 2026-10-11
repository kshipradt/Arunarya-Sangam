/**
 * Cloudflare Turnstile: the "I'm not a robot" check. Most people see only a
 * small tick; suspected bots get a challenge. Tokens are single-use, so the
 * parent bumps `resetKey` after every failed submit to get a fresh one.
 */
import { useEffect, useRef, useState } from "react";
import { config } from "@/config";
import { useI18n } from "@/i18n/I18nProvider";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  onToken,
  resetKey,
  error,
}: {
  onToken: (token: string | null) => void;
  resetKey: number;
  error?: string | null;
}) {
  const { t, lang } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    setFailed(false);
    onToken(null);
    loadScript()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId = api.render(box.current, {
          sitekey: config.turnstileSiteKey,
          language: lang === "en" || !lang ? "en" : lang,
          theme: "light",
          size: "flexible",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // onToken is stable from the parent (state setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, attempt, lang]);

  return (
    <div className={`field captcha ${error ? "field-invalid" : ""}`}>
      <span className="captcha-label">{t("captcha.label")}</span>
      <p className="field-hint">{t("captcha.help")}</p>
      <div ref={box} className="captcha-box" data-testid="turnstile" />
      {failed && (
        <p className="field-error" role="alert">
          {t("captcha.error")}{" "}
          <button type="button" className="link-button" onClick={() => setAttempt((a) => a + 1)}>
            {t("common.retry")}
          </button>
        </p>
      )}
      {error && !failed && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
