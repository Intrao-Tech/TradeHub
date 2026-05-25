/**
 * Curated ISO 639-1 subset for the UK construction workforce (PROF-055).
 * Ordered by approximate frequency in UK trades — English first, then the
 * largest non-English speaker groups per ONS labour-force data.
 */

export type LanguageOption = {
  code: string;
  name: string;
};

export const CONSTRUCTION_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English' },
  { code: 'pl', name: 'Polish' },
  { code: 'ro', name: 'Romanian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'ar', name: 'Arabic' },
];

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  CONSTRUCTION_LANGUAGES.map((l) => [l.code, l.name]),
);

export function languageName(code: string): string {
  return NAME_BY_CODE[code] ?? code.toUpperCase();
}
