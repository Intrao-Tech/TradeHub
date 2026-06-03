import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Hammer, Plus, Trash2 } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { specLabel } from '../../lib/specialisations';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '../EmptyState';

type SpecRow = { id: number; name: string; slug: string };

export function AdminSpecialisationsTab() {
  const { t } = useTranslation('admin');
  const [rows, setRows] = useState<SpecRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await api<SpecRow[]>('/specialisations');
      setRows(data);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('catalog.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreateErr('');
    if (!name.trim()) return;
    try {
      await api('/specialisations', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setName('');
      void load();
    } catch (err) {
      setCreateErr(parseApiError(err)?.message ?? t('catalog.createFailed'));
    }
  }

  async function remove(id: number) {
    setRowErr((m) => ({ ...m, [id]: '' }));
    if (!confirm(t('catalog.specConfirmDelete'))) {
      return;
    }
    try {
      await api(`/specialisations/${id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setRowErr((m) => ({
        ...m,
        [id]: parseApiError(err)?.message ?? t('catalog.deleteFailed'),
      }));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hammer className="h-4 w-4 text-fg-muted" />
          <CardTitle>{t('catalog.specTitle')}</CardTitle>
        </div>
        <CardDescription>{t('catalog.specDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err ? (
          <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {err}
          </div>
        ) : null}

        <form onSubmit={create} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="spec-name">{t('catalog.specNew')}</Label>
            <Input
              id="spec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('catalog.specPlaceholder')}
              required
              minLength={2}
            />
          </div>
          <Button type="submit">
            <Plus className="h-3.5 w-3.5" />
            {t('catalog.create')}
          </Button>
        </form>
        {createErr ? (
          <p className="text-xs text-danger">{createErr}</p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={Hammer}
            title={loading ? t('catalog.loading') : t('catalog.specNoRows')}
            description={t('catalog.specNoRowsDesc')}
          />
        ) : (
          <div className="rounded border border-border-subtle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t('catalog.colId')}</TableHead>
                  <TableHead>{t('catalog.colName')}</TableHead>
                  <TableHead>{t('catalog.colSlug')}</TableHead>
                  <TableHead className="w-32 text-right">{t('catalog.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-fg-muted">{s.id}</TableCell>
                    <TableCell className="font-medium">{specLabel(s.name, t)}</TableCell>
                    <TableCell className="text-xs text-fg-muted font-mono">
                      {s.slug}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(s.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('catalog.delete')}
                      </Button>
                      {rowErr[s.id] ? (
                        <p className="text-[11px] text-danger mt-1">
                          {rowErr[s.id]}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
