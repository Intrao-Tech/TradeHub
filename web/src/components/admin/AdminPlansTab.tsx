import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { formatMoney } from '@/lib/format';
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
  return formatMoney(Number(v));
}

export function AdminPlansTab() {
  const { t } = useTranslation('admin');
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
      setErr(parseApiError(e)?.message ?? t('plans.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setErr(parseApiError(e)?.message ?? t('plans.updateFailed'));
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
                <CardTitle>{t('plans.title')}</CardTitle>
              </div>
              <CardDescription>{t('plans.desc')}</CardDescription>
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
              {createOpen ? t('plans.cancel') : t('plans.newPlan')}
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
              title={loading ? t('plans.loading') : t('plans.noPlans')}
              description={t('plans.noPlansDesc')}
            />
          ) : (
            <div className="rounded border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t('plans.colId')}</TableHead>
                    <TableHead>{t('plans.colName')}</TableHead>
                    <TableHead>{t('plans.colMonthly')}</TableHead>
                    <TableHead>{t('plans.colYearly')}</TableHead>
                    <TableHead>{t('plans.colMaxRefs')}</TableHead>
                    <TableHead>{t('plans.colVisible')}</TableHead>
                    <TableHead className="w-40 text-right">{t('plans.colActions')}</TableHead>
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
                          {p.is_active ? t('plans.visibleToClients') : t('plans.hidden')}
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
                          {t('plans.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleActive(p)}
                        >
                          {p.is_active ? t('plans.hide') : t('plans.publish')}
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
  const { t } = useTranslation('admin');
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
      setErr(parseApiError(e2)?.message ?? t('plans.saveFailed'));
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
          {mode === 'create'
            ? t('plans.newPlan')
            : t('plans.editPlan', { id: plan?.id })}
        </div>
        <div className="text-xs text-fg-muted">
          {active === 'true'
            ? t('plans.willBeVisible')
            : t('plans.hiddenNote')}
        </div>
      </div>
      {err ? (
        <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('plans.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>{t('plans.monthlyPrice')}</Label>
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
          <Label>{t('plans.yearlyPrice')}</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={yearly}
            onChange={(e) => setYearly(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('plans.maxReferrals')}</Label>
          <Input
            type="number"
            min={0}
            value={maxRefs}
            onChange={(e) => setMaxRefs(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('plans.visibility')}</Label>
          <Select value={active} onValueChange={(v: 'true' | 'false') => setActive(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('plans.visibleToClients')}</SelectItem>
              <SelectItem value="false">{t('plans.hidden')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? t('plans.saving')
            : mode === 'create'
              ? t('plans.create')
              : t('plans.saveChanges')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('plans.cancel')}
        </Button>
      </div>
    </form>
  );
}
