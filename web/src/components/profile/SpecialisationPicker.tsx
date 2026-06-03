import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { specLabel } from '../../lib/specialisations';
import type { SpecialisationLink } from '../../hooks/useAccountMe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SpecialisationOption = {
  id: number;
  name?: string;
  slug?: string;
};

type SpecialisationPickerProps = {
  links: SpecialisationLink[] | undefined;
  onChanged: () => void | Promise<void>;
};

export function SpecialisationPicker({
  links,
  onChanged,
}: SpecialisationPickerProps) {
  const { t } = useTranslation('profile');
  const [options, setOptions] = useState<SpecialisationOption[] | null>(null);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SpecialisationOption[]>('/specialisations')
      .then(setOptions)
      .catch((err) => {
        const parsed = parseApiError(err);
        setError(parsed?.message ?? t('skills.loadError'));
      });
  }, []);

  const available = useMemo(() => {
    const linkedIds = new Set(
      (links ?? [])
        .map((l) => l.specialisation?.id ?? l.specialisation_id)
        .filter((v): v is number => typeof v === 'number'),
    );
    return (options ?? []).filter((o) => !linkedIds.has(o.id));
  }, [options, links]);

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      await api(`/worker-profiles/me/specialisations/${picked}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPicked('');
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('skills.linkError'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError('');
    try {
      await api(`/worker-profiles/me/specialisations/${id}`, {
        method: 'DELETE',
      });
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('skills.unlinkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {(links ?? []).length > 0 ? (
          (links ?? []).map((l) => {
            const id = l.specialisation?.id ?? l.specialisation_id;
            const label = specLabel(
              l.specialisation?.name ??
                l.specialisation?.slug ??
                `#${String(id ?? '?')}`,
              t,
            );
            return (
              <Badge
                key={String(id)}
                variant="secondary"
                className="gap-1 pr-1"
              >
                {label}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-overlay/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('skills.remove', { name: label })}
                  disabled={busy || typeof id !== 'number'}
                  onClick={() => typeof id === 'number' && remove(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })
        ) : (
          <p className="text-xs text-fg-muted">{t('skills.none')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={picked}
          onValueChange={setPicked}
          disabled={busy || available.length === 0}
        >
          <SelectTrigger className="sm:w-72">
            <SelectValue
              placeholder={
                options == null
                  ? t('skills.loading')
                  : available.length === 0
                    ? t('skills.allLinked')
                    : t('skills.pick')
              }
            />
          </SelectTrigger>
          <SelectContent>
            {available.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {specLabel(o.name ?? o.slug ?? `#${o.id}`, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={add} disabled={!picked || busy}>
          <Plus />
          {t('skills.add')}
        </Button>
      </div>
    </div>
  );
}
