/**
 * Language state for the whole app.
 *
 * English is bundled as the fallback. Every other language is a separate
 * file fetched only when chosen, so a visitor on a slow connection downloads
 * one language, not thirteen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./locales/en.json";
import { interpolate, parseRich, type Vars } from "./format";
import { isLanguageCode, languageOf, type LanguageCode } from "./languages";

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const loaders: Record<Exclude<LanguageCode, "en">, () => Promise<{ default: Partial<Messages> }>> = {
  hi: () => import("./locales/hi.json"),
  bn: () => import("./locales/bn.json"),
  mr: () => import("./locales/mr.json"),
  te: () => import("./locales/te.json"),
  ta: () => import("./locales/ta.json"),
  gu: () => import("./locales/gu.json"),
  ur: () => import("./locales/ur.json"),
  kn: () => import("./locales/kn.json"),
  or: () => import("./locales/or.json"),
  ml: () => import("./locales/ml.json"),
  pa: () => import("./locales/pa.json"),
  as: () => import("./locales/as.json"),
};

export const LANG_STORAGE_KEY = "sangam.lang";

type I18nValue = {
  /** null until the visitor has chosen a language on the first screen */
  lang: LanguageCode | null;
  ready: boolean;
  setLang: (code: LanguageCode) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  rich: (key: MessageKey, tags: Record<string, (text: string) => ReactNode>, vars?: Vars) => ReactNode;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLang(): LanguageCode | null {
  try {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (isLanguageCode(fromUrl)) return fromUrl;
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return isLanguageCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

function applyDocumentLanguage(code: LanguageCode) {
  const meta = languageOf(code);
  document.documentElement.lang = code;
  document.documentElement.dir = meta.dir;
  document.documentElement.dataset.script = meta.font ? meta.font.replace(/\s+/g, "-").toLowerCase() : "latin";
  if (meta.font) document.documentElement.style.setProperty("--script-font", `"${meta.font}"`);
  else document.documentElement.style.removeProperty("--script-font");
  if (meta.font && !document.querySelector(`link[data-font="${meta.font}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.font = meta.font;
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(meta.font)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode | null>(readStoredLang);
  const [messages, setMessages] = useState<Partial<Messages>>(en);
  const [ready, setReady] = useState(lang === null || lang === "en");

  useEffect(() => {
    if (!lang) return;
    applyDocumentLanguage(lang);
    if (lang === "en") {
      setMessages(en);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    loaders[lang]()
      .then((m) => !cancelled && setMessages(m.default))
      .catch(() => !cancelled && setMessages(en))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((code: LanguageCode) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* storage unavailable: choice lasts for this visit */
    }
    setLangState(code);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => interpolate(messages[key] ?? en[key] ?? key, vars),
    [messages],
  );

  const rich = useCallback(
    (key: MessageKey, tags: Record<string, (text: string) => ReactNode>, vars?: Vars) =>
      parseRich(t(key, vars)).map((seg, i) => {
        const render = seg.tag ? tags[seg.tag] : undefined;
        return <span key={i}>{render ? render(seg.text) : seg.text}</span>;
      }),
    [t],
  );

  const value = useMemo(() => ({ lang, ready, setLang, t, rich }), [lang, ready, setLang, t, rich]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
