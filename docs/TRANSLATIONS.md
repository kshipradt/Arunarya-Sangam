# Translations

Every word on screen lives in `src/i18n/locales/<language>.json`. English (`en.json`) is the master; every other file must have exactly the same keys. Automated tests fail if a language is missing a line, drops a `{placeholder}` or `<tag>`, or leaves an English sentence untranslated.

## Rules for translators

- Keep `{email}`, `{seconds}`, `{level}` exactly as written: the app fills them in.
- Keep `<link>…</link>`, `<terms>…</terms>` and `<privacy>…</privacy>` around the words that should become links. You may move them within the sentence.
- Keep "ARUNARYA" and "ARUNARYA Sangam" in Latin letters (brand name). "Sangam/संगम" in running text may be written in the language's script.
- Use the polite, warm register a respected shopkeeper would use with a customer.

## Review status

All 12 Indian-language files are first drafts written by Claude. Each needs a 30-minute review by a native speaker before public launch, with special care on money, password and legal wording.

| Language | File | Reviewer | Status |
| --- | --- | --- | --- |
| Hindi | hi.json | | Draft |
| Bengali | bn.json | | Draft |
| Marathi | mr.json | | Draft |
| Telugu | te.json | | Draft |
| Tamil | ta.json | | Draft |
| Gujarati | gu.json | | Draft |
| Urdu | ur.json | | Draft |
| Kannada | kn.json | | Draft |
| Odia | or.json | | Draft |
| Malayalam | ml.json | | Draft |
| Punjabi | pa.json | | Draft |
| Assamese | as.json | | Draft |

## Adding a language

1. Add it to `src/i18n/languages.ts` (code, native name, script font, direction).
2. Copy `en.json` to `<code>.json` and translate.
3. Add the loader line in `src/i18n/I18nProvider.tsx` and the code to the database check in a new migration.
4. Run `bun run test`.
