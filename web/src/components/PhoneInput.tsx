import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';

type PhoneInputProps = {
  /** ISO alpha-2 of the selected country (e.g. "GB"). Defaults to "GB". */
  countryIso: string;
  onCountryIsoChange: (iso: string) => void;
  /** Local part of the phone number (digits + optional spaces). */
  localNumber: string;
  onLocalNumberChange: (value: string) => void;
  /** id used for the local number input (label association) */
  inputId?: string;
  required?: boolean;
};

/**
 * Country-code selector + local number input. Owner combines them into a
 * full E.164 phone string by concatenating `+${dialCode}${localNumber}`.
 *
 * Flags are loaded as raster images from flagcdn.com (a public, free CDN).
 * Bundle stays empty; one ~300-byte PNG per visible row, browser-cached.
 * If the network blocks the CDN, the `<img>` falls back to the ISO letters.
 */
export function PhoneInput({
  countryIso,
  onCountryIsoChange,
  localNumber,
  onLocalNumberChange,
  inputId,
  required,
}: PhoneInputProps) {
  const { t } = useTranslation('common');
  const country =
    COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_COUNTRY;

  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <Select value={country.iso} onValueChange={onCountryIsoChange}>
        <SelectTrigger aria-label={t('phone.dialCodeAria')}>
          <SelectValue>
            <span className="inline-flex items-center gap-1.5">
              <Flag iso={country.iso} />
              <span className="font-mono text-sm">+{country.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.iso}>
              <span className="inline-flex items-center gap-2">
                <Flag iso={c.iso} />
                <span className="font-mono text-xs text-fg-muted w-12 inline-block">
                  +{c.dial}
                </span>
                <span>{c.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={localNumber}
        onChange={(e) => onLocalNumberChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function Flag({ iso }: { iso: string }) {
  const code = iso.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w20/${code}.png`}
      srcSet={`https://flagcdn.com/w40/${code}.png 2x`}
      width={20}
      height={15}
      alt=""
      loading="lazy"
      className="inline-block h-3.5 w-5 rounded-sm object-cover"
      onError={(e) => {
        // Network or CDN failure → render the ISO code as a textual fallback
        const target = e.currentTarget;
        const replacement = document.createElement('span');
        replacement.textContent = iso.toUpperCase();
        replacement.className = 'inline-block w-5 text-center text-xs font-mono text-fg-muted';
        target.replaceWith(replacement);
      }}
    />
  );
}

/** Combine country + local number into a normalised E.164-ish string. */
export function combinePhone(countryIso: string, local: string): string {
  const trimmed = local.replace(/\D+/g, '');
  if (!trimmed) return '';
  const country =
    COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_COUNTRY;
  return `+${country.dial}${trimmed}`;
}
