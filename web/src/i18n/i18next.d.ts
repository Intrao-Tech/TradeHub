// Type-safe i18n keys (I18N task, spec: "generate .d.ts from en JSON").
//
// The English catalogs are the source of truth: importing them here gives
// `t()` a union of every real key per namespace, so a typo'd or deleted key
// is a compile error instead of a silent English fallback at runtime.
//
// Adding a language does NOT touch this file — only `en` shapes the types.
// Adding a namespace = add one import + one line in `resources` below
// (mirrors NAMESPACES in ./index.ts).
import 'i18next';

import admin from '../../public/locales/en/admin.json';
import auth from '../../public/locales/en/auth.json';
import chat from '../../public/locales/en/chat.json';
import cis from '../../public/locales/en/cis.json';
import collaborations from '../../public/locales/en/collaborations.json';
import common from '../../public/locales/en/common.json';
import jobs from '../../public/locales/en/jobs.json';
import profile from '../../public/locales/en/profile.json';
import referrals from '../../public/locales/en/referrals.json';
import settings from '../../public/locales/en/settings.json';
import support from '../../public/locales/en/support.json';
import validation from '../../public/locales/en/validation.json';
import wallet from '../../public/locales/en/wallet.json';
import workers from '../../public/locales/en/workers.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      admin: typeof admin;
      auth: typeof auth;
      chat: typeof chat;
      cis: typeof cis;
      collaborations: typeof collaborations;
      common: typeof common;
      jobs: typeof jobs;
      profile: typeof profile;
      referrals: typeof referrals;
      settings: typeof settings;
      support: typeof support;
      validation: typeof validation;
      wallet: typeof wallet;
      workers: typeof workers;
    };
  }
}
