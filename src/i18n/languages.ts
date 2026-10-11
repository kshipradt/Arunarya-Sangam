/**
 * The 13 languages offered on the first screen: English plus 12 Indian
 * languages covering every major script. Urdu is written right to left.
 */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English", dir: "ltr", font: null },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr", font: "Noto Sans Devanagari" },
  { code: "bn", native: "বাংলা", english: "Bengali", dir: "ltr", font: "Noto Sans Bengali" },
  { code: "mr", native: "मराठी", english: "Marathi", dir: "ltr", font: "Noto Sans Devanagari" },
  { code: "te", native: "తెలుగు", english: "Telugu", dir: "ltr", font: "Noto Sans Telugu" },
  { code: "ta", native: "தமிழ்", english: "Tamil", dir: "ltr", font: "Noto Sans Tamil" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati", dir: "ltr", font: "Noto Sans Gujarati" },
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl", font: "Noto Nastaliq Urdu" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada", dir: "ltr", font: "Noto Sans Kannada" },
  { code: "or", native: "ଓଡ଼ିଆ", english: "Odia", dir: "ltr", font: "Noto Sans Oriya" },
  { code: "ml", native: "മലയാളം", english: "Malayalam", dir: "ltr", font: "Noto Sans Malayalam" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr", font: "Noto Sans Gurmukhi" },
  { code: "as", native: "অসমীয়া", english: "Assamese", dir: "ltr", font: "Noto Sans Bengali" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as LanguageCode[];

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && (LANGUAGE_CODES as string[]).includes(v);
}

export function languageOf(code: LanguageCode): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Picks the best offered language from the browser's preferences, for highlighting on the chooser. */
export function suggestLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguageCode(base)) return base;
  }
  return "en";
}
