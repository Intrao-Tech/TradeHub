import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Clock, Plus, ShieldAlert } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '../EmptyState';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const QUEUES = [
  { value: 'DOCUMENT_PENDING', labelKey: 'sla.queueDocPending' },
  { value: 'APPROVAL_REQUIRED', labelKey: 'sla.queueApprovalRequired' },
  { value: 'SUPPORT_THREAD_UNANSWERED', labelKey: 'sla.queueSupportUnanswered' },
  { value: 'DISPUTE_OPEN', labelKey: 'sla.queueDisputeOpen' },
  { value: 'DISPUTE_RESPONDED', labelKey: 'sla.queueDisputeResponded' },
  { value: 'PAYMENT_FAILED', labelKey: 'sla.queuePaymentFailed' },
  { value: 'PAYMENT_TRANSFER_PENDING', labelKey: 'sla.queuePaymentTransferPending' },
] as const;

function queueLabel(value: string, t: TFn): string {
  const q = QUEUES.find((q) => q.value === value);
  return q ? t(q.labelKey) : value;
}

type Rule = {
  id: string;
  name: string;
  description: string | null;
  target_queue: string;
  threshold_minutes: number;
  notification_title: string | null;
  notification_body: string | null;
  is_active: boolean;
};

type Breach = {
  id: string;
  rule: { id: string; name: string; queue: string; threshold_minutes: number };
  target_kind: string;
  target_id: string;
  detected_at: string;
  resolved_at: string | null;
};

export function AdminSlaTab() {
  const { t } = useTranslation('admin');
  const { isAdmin } = useAccountMe();
  const [rules, setRules] = useState<Rule[]>([]);
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [err, setErr] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [createMsg, setCreateMsg] = useState('');
  // Shared form state — `editingId` distinguishes CREATE vs EDIT.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [queue, setQueue] = useState<string>(QUEUES[0].value);
  const [thresholdMin, setThresholdMin] = useState('60');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName('');
    setDescription('');
    setQueue(QUEUES[0].value);
    setThresholdMin('60');
    setNotifTitle('');
    setNotifBody('');
    setIsActive(true);
    setCreateErr('');
    setCreateMsg('');
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description ?? '');
    setQueue(r.target_queue);
    setThresholdMin(String(r.threshold_minutes));
    setNotifTitle(r.notification_title ?? '');
    setNotifBody(r.notification_body ?? '');
    setIsActive(r.is_active);
    setCreateErr('');
    setCreateMsg('');
  }

  const load = useCallback(async () => {
    setErr('');
    try {
      const [r, b] = await Promise.all([
        api<Rule[]>('/admin/sla-rules'),
        api<Breach[]>('/admin/sla-rules/breaches'),
      ]);
      setRules(r);
      setBreaches(b);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('sla.loadError'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setCreateErr('');
    setCreateMsg('');
    setBusy(true);
    try {
      if (editingId) {
        // Edit: backend only mutates name / description / threshold /
        // notification text / is_active. target_queue stays immutable.
        await api(`/admin/sla-rules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            threshold_minutes: parseInt(thresholdMin, 10),
            notification_title: notifTitle.trim() || undefined,
            notification_body: notifBody.trim() || undefined,
            is_active: isActive,
          }),
        });
        setCreateMsg(t('sla.updated'));
      } else {
        const body: Record<string, unknown> = {
          name: name.trim(),
          target_queue: queue,
          threshold_minutes: parseInt(thresholdMin, 10),
        };
        if (description.trim()) body.description = description.trim();
        if (notifTitle.trim()) body.notification_title = notifTitle.trim();
        if (notifBody.trim()) body.notification_body = notifBody.trim();
        await api('/admin/sla-rules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setCreateMsg(t('sla.created'));
      }
      resetForm();
      void load();
    } catch (e) {
      setCreateErr(parseApiError(e)?.message ?? t('sla.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await api(`/admin/sla-rules/${id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('sla.deactivateFailed'));
    }
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <CardTitle>{t('sla.breachesTitle')}</CardTitle>
          </div>
          <CardDescription>{t('sla.breachesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger mb-3">
              {err}
            </div>
          ) : null}
          {breaches.length === 0 ? (
            <EmptyState
              icon={AlarmClock}
              title={t('sla.noBreaches')}
              description={t('sla.noBreachesDesc')}
            />
          ) : (
            <div className="rounded border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sla.colRule')}</TableHead>
                    <TableHead>{t('sla.colQueue')}</TableHead>
                    <TableHead>{t('sla.colTarget')}</TableHead>
                    <TableHead>{t('sla.colDetected')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breaches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm font-medium">{b.rule.name}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">{queueLabel(b.rule.queue, t)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {b.target_kind}#{b.target_id}
                      </TableCell>
                      <TableCell className="text-xs text-fg-muted">
                        {formatDateTime(b.detected_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div
        className={
          isAdmin
            ? 'grid gap-4 lg:grid-cols-[1.4fr_1fr]'
            : 'grid gap-4'
        }
      >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-fg-muted" />
              <CardTitle>{t('sla.rulesTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('sla.rulesDesc')}
              {!isAdmin ? t('sla.adminOnlyNote') : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={t('sla.noRules')}
                description={t('sla.noRulesDesc')}
              />
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className={
                      'rounded border p-3 space-y-1 transition-colors ' +
                      (editingId === r.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border-subtle hover:border-border-strong')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-fg">{r.name}</div>
                        <div className="text-xs text-fg-muted">
                          {r.description ?? '—'}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant={r.is_active ? 'success' : 'secondary'}>
                          {r.is_active ? t('rules.active') : t('rules.inactive')}
                        </Badge>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant={editingId === r.id ? 'primary' : 'ghost'}
                            onClick={() =>
                              editingId === r.id ? resetForm() : startEdit(r)
                            }
                          >
                            {editingId === r.id ? t('rules.cancelEdit') : t('rules.edit')}
                          </Button>
                        ) : null}
                        {isAdmin && r.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void deactivate(r.id)}
                          >
                            {t('rules.deactivate')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-xs flex flex-wrap gap-1">
                      <Badge variant="outline">{queueLabel(r.target_queue, t)}</Badge>
                      <Badge variant="outline">
                        {t('sla.thresholdBadge', { min: r.threshold_minutes })}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isAdmin ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-fg-muted" />
              <CardTitle>
                {editingId ? t('sla.editTitle') : t('sla.newTitle')}
              </CardTitle>
            </div>
            <CardDescription>
              {editingId ? t('sla.editDesc') : t('sla.newDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {createErr ? (
              <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
                {createErr}
              </div>
            ) : null}
            {createMsg ? (
              <div className="text-sm rounded bg-success-subtle text-success px-2 py-1">
                {createMsg}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>{t('rules.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('rules.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('sla.queue')}{editingId ? t('rules.immutable') : ''}</Label>
                <Select
                  value={queue}
                  disabled={!!editingId}
                  onValueChange={setQueue}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUEUES.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {t(q.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('sla.threshold')}</Label>
                <Input
                  type="number"
                  value={thresholdMin}
                  onChange={(e) => setThresholdMin(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('sla.notifTitle')}</Label>
              <Input
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('sla.notifBody')}</Label>
              <Textarea
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>
            {editingId ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                {t('rules.activeCheckbox')}
              </label>
            ) : null}
            <Button onClick={() => void submit()} disabled={busy}>
              {busy
                ? t('rules.saving')
                : editingId
                  ? t('rules.saveChanges')
                  : t('rules.createRule')}
            </Button>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </div>
  );
}
