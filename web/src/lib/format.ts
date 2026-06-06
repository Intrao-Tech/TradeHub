import i18n from '@/i18n';

/**
 * Central money + date formatting, driven by the active i18n language.
 *
 * Why this exists: amounts stay in **GBP** regardless of language (TradeHub is
 * a UK platform — a Ukrainian user still pays in £). Only the *formatting*
 * (digit grouping, currency symbol placement, month names) follows the locale.
 * Keeping it in one place means a new language needs zero code changes here.
 */

// Map an i18n language code to the BCP-47 locale used for number/date
// formatting. TradeHub is a UK platform, so English formats as en-GB
// ("5 Jun 2026", "£1,500.00") rather than US English.
const FORMAT_LOCALE: Record<string, string> = {
  en: 'en-GB',
  uk: 'uk-UA',
  ru: 'ru-RU',
};

/**
 * The BCP-47 locale for the active language. Exported so other surfaces that
 * format dates/times directly (e.g. the chat helpers) follow the same locale
 * instead of falling back to the browser default — passing `undefined` to
 * `toLocaleDateString` renders in whatever locale the OS/browser is set to
 * (often Russian for ru/uk machines), not the language the user picked.
 */
export function activeLocale(): string {
  const lng = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return FORMAT_LOCALE[lng] ?? lng;
}

/**
 * Format a GBP amount for display.
 *
 * @param amount  value in pounds (not pence)
 * @param opts.decimals  fixed fraction digits. Defaults to 2 ("£1,500.00").
 *   Pass 0 for whole-pound displays like day rates ("£150").
 */
export function formatMoney(
  amount: number,
  opts: { decimals?: number } = {},
): string {
  const { decimals = 2 } = opts;
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export type DateStyle = 'short' | 'medium' | 'long' | 'monthYear';

const DATE_OPTS: Record<'medium' | 'long' | 'monthYear', Intl.DateTimeFormatOptions> = {
  // "5 Jun 2026" — the default across detail pages, reviews, contracts.
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  // "5 June 2026" — job start dates, public job detail.
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  // "Jun 2026" — "member since" / availability style.
  monthYear: { month: 'short', year: 'numeric' },
};

/**
 * Format a date, locale-aware. Returns '' for null/invalid input so call sites
 * can fall back with `|| '—'` as they already do.
 *
 * @param style  'medium' (default) · 'monthYear' · 'short' (locale numeric)
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  style: DateStyle = 'medium',
): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // 'short' = the locale's own numeric default (no explicit options).
  const opts = style === 'short' ? undefined : DATE_OPTS[style];
  return d.toLocaleDateString(activeLocale(), opts);
}

/**
 * Date + time, locale-aware. Replaces bare `new Date(x).toLocaleString()`.
 * Pass `options` to control the parts shown (e.g. short month + time).
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(activeLocale(), options);
}
