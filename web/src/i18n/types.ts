import type { TFunction } from 'i18next';

/**
 * Parameter type for helpers that receive a `t` from any namespace and build
 * keys dynamically (map tables, cross-ns lookups like `common:rel.*`).
 *
 * The typed `t` returned by useTranslation() is assignable to this, while the
 * helper itself can pass arbitrary computed keys. Dynamic-key tables escape
 * the compile-time key check by design — they are guarded by the runtime
 * en/uk key-parity check (`npm run i18n:check`) instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslateFn = TFunction<any, any>;
