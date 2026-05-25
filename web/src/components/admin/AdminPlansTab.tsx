import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '../EmptyState';

type Plan = {
  id: number;
  name: string;
  price_monthly: number | string;
  price_yearly: number | string | null;
  max_referrals: number | null;
  is_active: boolean;
  created_at: string;
};

type PlanList = Plan[] | { data: Plan[] };

function formatPrice(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  return `£${Number(v).toFixed(2)}`;
}

export function AdminPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<Plan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await api<PlanList>('/subscriptions/plans');
      const items = Array.isArray(data) ? data : (data.data ?? []);
      setPlans(items);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(p: Plan) {
    try {
      await api(`/subscriptions/plans/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      void load();
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Update failed');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-fg-muted" />
                <CardTitle>Subscription plans</CardTitle>
              </div>
              <CardDescription>
                Activating a plan makes it visible to clients on the
                /subscriptions endpoint immediately. They will see it as an
                option to subscribe to.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setCreateOpen((v) => !v);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {createOpen ? 'Cancel' : 'New plan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}

          {createOpen ? (
            <PlanForm
              mode="create"
              onSaved={() => {
                setCreateOpen(false);
                void load();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          ) : null}

          {editing ? (
            <PlanForm
              mode="edit"
              plan={editing}
              onSaved={() => {
                setEditing(null);
                void load();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          {plans.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={loading ? 'Loading…' : 'No subscription plans'}
              description="Create the first plan above. Inactive plans are hidden from clients."
            />
          ) : (
            <div className="rounded border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Monthly</TableHead>
                    <TableHead>Yearly</TableHead>
                    <TableHead>Max refs</TableHead>
                    <TableHead>Visible</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-fg-muted">{p.id}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{formatPrice(p.price_monthly)}</TableCell>
                      <TableCell>{formatPrice(p.price_yearly)}</TableCell>
                      <TableCell>{p.max_referrals ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? 'success' : 'secondary'}>
                          {p.is_active ? 'Visible to clients' : 'Hidden'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(p);
                            setCreateOpen(false);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleActive(p)}
                        >
                          {p.is_active ? 'Hide' : 'Publish'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanForm({
  mode,
  plan,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit';
  plan?: Plan;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? '');
  const [monthly, setMonthly] = useState(
    plan?.price_monthly != null ? String(plan.price_monthly) : '',
  );
  const [yearly, setYearly] = useState(
    plan?.price_yearly != null ? String(plan.price_yearly) : '',
  );
  const [maxRefs, setMaxRefs] = useState(
    plan?.max_referrals != null ? String(plan.max_referrals) : '',
  );
  const [active, setActive] = useState<'true' | 'false'>(
    plan?.is_active === false ? 'false' : 'true',
  );
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        is_active: active === 'true',
      };
      if (monthly !== '') body.price_monthly = Number(monthly);
      if (yearly !== '') body.price_yearly = Number(yearly);
      if (maxRefs !== '') body.max_referrals = Number(maxRefs);

      if (mode === 'create') {
        await api('/subscriptions/plans', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else if (plan) {
        await api(`/subscriptions/plans/${plan.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e2) {
      setErr(parseApiError(e2)?.message ?? 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-border-subtle bg-subtle/40 p-3 space-y-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium">
          {mode === 'create' ? 'New plan' : `Edit plan #${plan?.id}`}
        </div>
        <div className="text-xs text-fg-muted">
          {active === 'true'
            ? '⚠️ Will be visible to clients immediately'
            : 'Hidden — no client will see it'}
        </div>
      </div>
      {err ? (
        <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Monthly price (£)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            required={mode === 'create'}
          />
        </div>
        <div className="space-y-2">
          <Label>Yearly price (£)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={yearly}
            onChange={(e) => setYearly(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Max referrals</Label>
          <Input
            type="number"
            min={0}
            value={maxRefs}
            onChange={(e) => setMaxRefs(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Visibility</Label>
          <Select value={active} onValueChange={(v: 'true' | 'false') => setActive(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Visible to clients</SelectItem>
              <SelectItem value="false">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
