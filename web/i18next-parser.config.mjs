// i18next-parser config — used by `npm run i18n:scan` to extract every static
// t('ns:key') call from the source and reconcile it against the locale JSON.
//
// CI usage: run the scan, then `git diff --exit-code public/locales/en` — a
// non-empty diff means a component references a key that doesn't exist yet
// (the scan adds it as an empty string), so the build should fail until the
// translation is filled in.
//
// NOTE: keys built dynamically (e.g. `t(section.label)`, `t(FILTER_LABEL_KEY[f])`)
// can't be extracted statically — those map tables live next to their data and
// are covered by the runtime en/uk key-parity check instead.
export default {
  locales: ['en', 'uk'],
  defaultNamespace: 'common',
  // Match the runtime i18next config (src/i18n/index.ts).
  namespaceSeparator: ':',
  keySeparator: '.',
  // Where the catalogs live and how t() resolves them.
  output: 'public/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  // Never delete hand-authored keys (dynamic-key maps, plural variants the
  // parser doesn't know about). The scan only ever *adds* missing keys.
  keepRemoved: true,
  // Don't spit out *_old.json backup catalogs.
  createOldCatalogs: false,
  // Keep existing values; only blank entries are added for brand-new keys.
  defaultValue: '',
  // UK uses 4 plural forms, EN uses 2 — let the parser emit the right suffixes.
  pluralSeparator: '_',
};
