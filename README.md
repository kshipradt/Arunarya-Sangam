# ARUNARYA Sangam

A multilingual marketplace and network for India's **One District One Product (ODOP)** crafts, by ARUNARYA (Saharanpur Heritage). Buyers, artisans, business owners and traders meet directly, in their own language.

> ARUNARYA Sangam is an independent platform and is not affiliated with any government body.

## What works today (Phase 1)

| Area | What it does |
| --- | --- |
| Language first | The first screen asks "Choose your language" in 13 languages: English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu (right to left), Kannada, Odia, Malayalam, Punjabi, Assamese. Each language downloads only when chosen. |
| Sign-up and log-in | Separate, precise screens for sign-up, email confirmation, log-in, forgot password and reset password. Role chosen at sign-up. |
| Robot check | Cloudflare Turnstile on sign-up, log-in, password reset and resend-email. |
| Password protection | 8–72 characters with small and capital letters, a number and a symbol; refuses ~200 commonly attacked passwords (free alternative to paid leak checks); live strength meter; growing pauses after repeated failed log-ins. |
| Secure links | Email and Google sign-in use PKCE: a leaked link cannot be used on another device. |
| Worldwide locations | 250 countries, 5,328 states/regions, 152,571 cities, all 784 Indian districts. Buyers choose country, state and city; sellers in India choose state, city and ODOP district; sellers abroad choose country and city. |
| Database | 18 tables, row-level security on every one, server-side pricing, discounts, stock and orders (from earlier phases). |

## Project layout

```
src/
  app/            App shell, routes, header and footer
  features/       Screens: language, auth, account, location, home, legal
  i18n/           Language list, translation files (locales/*.json), formatting
  lib/api/        Supabase Auth and REST clients, session, PKCE, error mapping
  lib/domain/     Business rules (roles, location) shared with the database
  lib/security/   Password policy and common-password list
  ui/             Shared accessible form controls
supabase/
  migrations/     The full database, in order (the source of truth)
  seed/           Reference data loader and starting content
  tests/          Database behaviour tests
e2e/              Browser tests (Playwright)
docs/             Setup and operating guides
```

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Local site on http://localhost:5173 |
| `bun run check` | Type check + unit tests + production build |
| `bun run e2e` | Browser tests of the main journeys (after `bun run build`) |
| `scripts/test-db.sh` | Applies every migration to a fresh PostgreSQL and runs the database tests |

## Configuration

Copy `.env.example` to `.env` and fill in the public values. Secret keys never go in this repository or the browser.

## Guides

- [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md): move the database to ARUNARYA's own Supabase account
- [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md): how translations work and their review status
- [docs/ODOP_DATA.md](docs/ODOP_DATA.md): importing the official national ODOP product list

## Data credits

Location data: [countries-states-cities-database](https://github.com/dr5hn/countries-states-cities-database) (ODbL-1.0) and the igod.gov.in district directory via [Indian-state-district-json](https://github.com/KTBsomen/Indian-state-district-json) (MIT).
