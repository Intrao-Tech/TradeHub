import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Hammer, Plus, Trash2 } from 'lucide-react';
import { api, parseApiError } from '../../api';
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
      setErr(parseApiError(e)?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setCreateErr(parseApiError(err)?.message ?? 'Create failed');
    }
  }

  async function remove(id: number) {
    setRowErr((m) => ({ ...m, [id]: '' }));
    if (!confirm('Delete this specialisation? Workers tagged with it will lose the tag.')) {
      return;
    }
    try {
      await api(`/specialisations/${id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setRowErr((m) => ({
        ...m,
        [id]: parseApiError(err)?.message ?? 'Delete failed',
      }));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hammer className="h-4 w-4 text-fg-muted" />
          <CardTitle>Specialisations</CardTitle>
        </div>
        <CardDescription>
          Trade categories used by workers and job posts. Deleting one removes
          it from every worker that selected it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err ? (
          <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {err}
          </div>
        ) : null}

        <form onSubmit={create} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="spec-name">New specialisation</Label>
            <Input
              id="spec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Roofing"
              required
              minLength={2}
            />
          </div>
          <Button type="submit">
            <Plus className="h-3.5 w-3.5" />
            Create
          </Button>
        </form>
        {createErr ? (
          <p className="text-xs text-danger">{createErr}</p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={Hammer}
            title={loading ? 'Loading…' : 'No specialisations yet'}
            description="Add the first trade category above."
          />
        ) : (
          <div className="rounded border border-border-subtle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-fg-muted">{s.id}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
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
                        Delete
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
