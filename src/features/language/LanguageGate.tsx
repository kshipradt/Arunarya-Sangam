/**
 * The very first screen: "Choose your language", shown in every language at
 * once so nobody needs to read English to find their own.
 */
import { useEffect, useMemo } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { LANGUAGES, suggestLanguage, type LanguageCode } from "@/i18n/languages";

// The heading in each language, so the screen is understandable before any choice.
const CHOOSE: Record<LanguageCode, string> = {
  en: "Choose your language",
  hi: "अपनी भाषा चुनें",
  bn: "আপনার ভাষা বেছে নিন",
  mr: "तुमची भाषा निवडा",
  te: "మీ భాషను ఎంచుకోండి",
  ta: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்",
  gu: "તમારી ભાષા પસંદ કરો",
  ur: "اپنی زبان منتخب کریں",
  kn: "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
  or: "ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ",
  ml: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക",
  pa: "ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ",
  as: "আপোনাৰ ভাষা বাছনি কৰক",
};

/**
 * Loads only the glyphs needed to draw each language's own name and heading
 * (Google Fonts `text=` subsetting): a few kilobytes instead of ten font files.
 */
function useScriptSamplerFonts() {
  useEffect(() => {
    if (document.querySelector("link[data-font='sampler']")) return;
    const families = [...new Set(LANGUAGES.map((l) => l.font).filter(Boolean))] as string[];
    const text = [...new Set(LANGUAGES.map((l) => l.native + CHOOSE[l.code]).join(""))].join("");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.font = "sampler";
    link.href =
      "https://fonts.googleapis.com/css2?" +
      families.map((f) => `family=${encodeURIComponent(f)}:wght@500;600`).join("&") +
      `&text=${encodeURIComponent(text)}&display=swap`;
    document.head.appendChild(link);
  }, []);
}

export function LanguageGate({ onChosen }: { onChosen?: () => void }) {
  const { setLang, lang } = useI18n();
  useScriptSamplerFonts();
  const suggested = useMemo(() => suggestLanguage(navigator.languages ?? [navigator.language]), []);
  const heading = CHOOSE[lang ?? suggested];

  return (
    <main className="lang-gate" id="main">
      <img src="/brand/arunarya-logo.png" alt="ARUNARYA" width={112} height={112} className="lang-gate-logo" />
      <h1>{heading}</h1>
      {heading !== CHOOSE.en && <p className="lang-gate-en">Choose your language</p>}
      <ul className="lang-grid" role="list">
        {LANGUAGES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              lang={l.code}
              dir={l.dir}
              className={`lang-tile ${l.code === (lang ?? suggested) ? "is-suggested" : ""}`}
              aria-pressed={lang === l.code}
              onClick={() => {
                setLang(l.code);
                onChosen?.();
              }}
            >
              <span className="lang-native">{l.native}</span>
              <span className="lang-english" lang="en" dir="ltr">{l.english}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
