import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, parseApiError } from '../../api';
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
  const [options, setOptions] = useState<SpecialisationOption[] | null>(null);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SpecialisationOption[]>('/specialisations')
      .then(setOptions)
      .catch((err) => {
        const parsed = parseApiError(err);
        setError(parsed?.message ?? 'Could not load specialisations.');
      });
  }, []);

  const linkedIds = new Set(
    (links ?? [])
      .map((l) => l.specialisation?.id ?? l.specialisation_id)
      .filter((v): v is number => typeof v === 'number'),
  );
  const available = useMemo(
    () => (options ?? []).filter((o) => !linkedIds.has(o.id)),
    [options, linkedIds],
  );

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
      setError(parsed?.message ?? 'Could not link specialisation.');
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
      setError(parsed?.message ?? 'Could not unlink.');
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
            const label =
              l.specialisation?.name ??
              l.specialisation?.slug ??
              `#${String(id ?? '?')}`;
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
                  aria-label={`Remove ${label}`}
                  disabled={busy || typeof id !== 'number'}
                  onClick={() => typeof id === 'number' && remove(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })
        ) : (
          <p className="text-xs text-fg-muted">No specialisations yet.</p>
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
                  ? 'Loading…'
                  : available.length === 0
                    ? 'All specialisations linked'
                    : 'Pick a specialisation'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {available.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name ?? o.slug ?? `#${o.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={add} disabled={!picked || busy}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}
