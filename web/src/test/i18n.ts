// Test-only i18n instance. The production config (src/i18n/index.ts) loads
// JSON over HTTP with `useSuspense: true` — neither works under jsdom (no
// server, no <Suspense> boundary in unit tests). Here we init the same
// i18next singleton synchronously with the real English bundles imported
// directly, and `useSuspense: false`, so `useTranslation()` resolves the
// actual copy without suspending. setup.ts swaps this in for `@/i18n`.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import common from '../../public/locales/en/common.json';
import auth from '../../public/locales/en/auth.json';
import jobs from '../../public/locales/en/jobs.json';
import workers from '../../public/locales/en/workers.json';
import collaborations from '../../public/locales/en/collaborations.json';
import wallet from '../../public/locales/en/wallet.json';
import admin from '../../public/locales/en/admin.json';
import profile from '../../public/locales/en/profile.json';
import referrals from '../../public/locales/en/referrals.json';
import validation from '../../public/locales/en/validation.json';
import chat from '../../public/locales/en/chat.json';
import support from '../../public/locales/en/support.json';
import settings from '../../public/locales/en/settings.json';

export const SUPPORTED_LNGS = ['en', 'uk'] as const;
export type SupportedLng = (typeof SUPPORTED_LNGS)[number];

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
] as const;

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: NAMESPACES as unknown as string[],
  defaultNS: 'common',
  resources: {
    en: { common, auth, jobs, workers, collaborations, wallet, admin, profile, referrals, validation, chat, support, settings },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
