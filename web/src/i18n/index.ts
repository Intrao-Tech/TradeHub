import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * Languages we ship today. Adding a new one is meant to be a content-only
 * change: drop a `public/locales/<lng>/` folder and add the code here — no
 * other code changes (see I18N task acceptance criteria).
 */
export const SUPPORTED_LNGS = ['en', 'uk', 'ru'] as const;
export type SupportedLng = (typeof SUPPORTED_LNGS)[number];

/**
 * One namespace per page/feature so each chunk lazy-loads on demand instead of
 * one giant bundle. Keep `common` small (shared chrome: nav, buttons, etc.).
 */
export const NAMESPACES = [
  'common',
  'auth',
  'jobs',
  'workers',
  'collaborations',
  'wallet',
  'admin',
  'profile',
  'referrals',
  'validation',
  'chat',
  'support',
  'settings',
  'cis',
] as const;

void i18n
  .use(HttpBackend) // lazy-load JSON over HTTP (cacheable) instead of bundling
  .use(LanguageDetector) // pick the language from URL / storage / browser
  .use(initReactI18next)
  .init({
    supportedLngs: SUPPORTED_LNGS,
    fallbackLng: 'en', // unknown/missing keys fall back to English, never raw keys
    ns: NAMESPACES,
    defaultNS: 'common',
    detection: {
      // Querystring (?lng=uk) wins, then a saved choice, then the browser.
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'], // persist the choice across reloads
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false, // React already escapes against XSS
    },
    react: {
      useSuspense: true, // reuse the app's <Suspense> skeletons while loading
    },
  })
  .then(() => applyHtmlLang(i18n.resolvedLanguage ?? 'en'));

/** Keep <html lang> in sync so screen readers / browsers know the page language. */
function applyHtmlLang(lng: string) {
  document.documentElement.lang = lng;
}
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
