# TRADEHUB-XXX — Add multi-language (i18n) support to the web app

## Summary
Add internationalization to the React/Vite SPA. Ship **English + Ukrainian** now; architecture must allow **Russian and other languages later** by dropping in a folder — no code changes per new language.

## Stack decision
`react-i18next` + `i18next` + `i18next-http-backend` + `i18next-browser-languagedetector`.
(Chosen over Lingui/Paraglide/next-intl: it's the 2026 default for non-Next Vite SPAs, biggest ecosystem, and natively handles Slavic plural rules.)

## Scope (frontend only)
- Translate all ~850 hardcoded UI strings across the 14 pages + components.
- **Out of scope:** backend-generated text (Resend emails, NestJS API error messages, notifications, Swagger). Flag as a separate follow-up.

## Architecture
- Translation JSON in `public/locales/{en,uk}/` — **lazy-loaded per language+namespace** via http-backend (HTTP-cacheable).
- **Namespaces per page/feature** (not one big file): `common`, `auth`, `jobs`, `workers`, `collaborations`, `wallet`, `admin`, `validation`. Keep `common` small.
- i18n init in `src/i18n/index.ts`; imported in `main.tsx`.
- Detection order `['querystring','localStorage','navigator']`, cache to `localStorage`, `fallbackLng: 'en'`, `supportedLngs: ['en','uk']`.
- `react: { useSuspense: true }` — reuse existing page `<Suspense>` skeletons.
- Update `<html lang>` on language change.
- Nested semantic keys (`jobs.detail.applyButton`), not `apply_btn`.
- Turn on **type-safe keys** (generate `.d.ts` from `en` JSON).

## Must-do gotchas
1. **Ukrainian/Russian plurals = 4 forms** (`_one/_few/_many/_other`). Use i18next plural keys for any count string (reviews, jobs, applications) — do NOT hand-roll `count === 1 ? …`.
2. **Currency**: keep amounts in **GBP** (a UA user still pays in £); localize only the *format*. Replace scattered `` `£${x}` `` literals (`JobCard.tsx`, `WorkerCard.tsx`) with a central `formatMoney()` in `src/lib/format.ts` wrapping `Intl.NumberFormat`.
3. **Dates**: drop hardcoded `toLocaleDateString('en-GB', …)` / `'en-GB'`; drive off `i18n.language` via a central `formatDate()`.
4. **Validation messages** (Zod + react-hook-form) must be translated too → `validation` namespace.
5. No RTL needed (uk/ru are LTR).
6. Language switcher must use shadcn `Select`/`DropdownMenu` + semantic tokens (`lint:tokens` must pass).

## Subtasks
1. Install packages, create `src/i18n/index.ts`, wire into `main.tsx`.
2. Add `LanguageSwitcher` to `AppShell` + `AuthShell` headers (en ⇄ uk).
3. Add `src/lib/format.ts` (money + date) and migrate all `£`/date/`Intl` call sites **first** (avoid touching files twice).
4. Extract strings namespace-by-namespace: `common` + `auth` first, then one feature at a time.
5. Provide `uk` translations (mind the plural forms).
6. Tests: Vitest mock for i18n; one Playwright check that switching to `uk` changes visible copy; add CI lint for missing keys (`i18next-parser`).

## Acceptance criteria
- [ ] User can switch EN ⇄ UK from the header; choice persists across reloads.
- [ ] No hardcoded user-facing English strings remain in scoped pages (CI key-lint passes).
- [ ] Untranslated keys fall back to English (never show raw keys).
- [ ] Counts render correct Ukrainian plural forms.
- [ ] Money shows GBP; dates + numbers follow the active locale.
- [ ] `npm run lint` (incl. `lint:tokens`), `npm test`, and Playwright pass.
- [ ] Adding `ru` later requires only a new `public/locales/ru/` folder — no code change.
