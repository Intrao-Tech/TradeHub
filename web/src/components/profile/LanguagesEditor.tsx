import { useTranslation } from 'react-i18next';
import { CONSTRUCTION_LANGUAGES } from '../../lib/iso-639-1';
import { Label } from '@/components/ui/label';

type LanguagesEditorProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function LanguagesEditor({ value, onChange }: LanguagesEditorProps) {
  const { t } = useTranslation('profile');
  function toggle(code: string) {
    if (value.includes(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      onChange([...value, code]);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Label>{t('languages.spoken')}</Label>
      <div className="flex flex-wrap gap-2">
        {CONSTRUCTION_LANGUAGES.map((lang) => {
          const active = value.includes(lang.code);
          return (
            <button
              key={lang.code}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(lang.code)}
              className={`min-h-12 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-border-default bg-raised text-fg-muted hover:border-border-strong'
              }`}
            >
              {lang.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-fg-muted">{t('languages.hint')}</p>
    </div>
  );
}
