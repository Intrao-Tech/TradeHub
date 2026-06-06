import type { TranslateFn } from '@/i18n/types';
// Localised relative time ("3 days ago", "in 2 hours"). Pass the i18next `t`
// from any namespace — keys live in `common` (`rel.*`) with plural forms, so
// Ukrainian's 4 plural categories are handled by i18next.

type TFn = TranslateFn;

export function formatRelative(
  input: string | Date | null | undefined,
  t: TFn,
): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatFuture(-seconds, t);
  if (seconds < 45) return t('common:rel.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('common:rel.minsAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('common:rel.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('common:rel.daysAgo', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('common:rel.monthsAgo', { count: months });
  const years = Math.floor(days / 365);
  return t('common:rel.yearsAgo', { count: years });
}

function formatFuture(seconds: number, t: TFn): string {
  if (seconds < 60) return t('common:rel.inMoments');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('common:rel.inMins', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('common:rel.inHours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('common:rel.inDays', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('common:rel.inMonths', { count: months });
  const years = Math.floor(days / 365);
  return t('common:rel.inYears', { count: years });
}
