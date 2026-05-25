import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Clock, Plus, ShieldAlert } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
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

const QUEUES = [
  { value: 'DOCUMENT_PENDING', label: 'Document review (PENDING)' },
  { value: 'APPROVAL_REQUIRED', label: 'Action approval (PENDING)' },
  { value: 'SUPPORT_THREAD_UNANSWERED', label: 'Support thread unanswered' },
  { value: 'DISPUTE_OPEN', label: 'Dispute OPEN (no staff reply yet)' },
  { value: 'DISPUTE_RESPONDED', label: 'Dispute RESPONDED / MEDIATION' },
  { value: 'PAYMENT_FAILED', label: 'Payment FAILED' },
  { value: 'PAYMENT_TRANSFER_PENDING', label: 'Worker payout / referral PENDING' },
] as const;

function queueLabel(value: string): string {
  return QUEUES.find((q) => q.value === value)?.label ?? value;
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
      setErr(parseApiError(e)?.message ?? 'Failed to load');
    }
  }, []);

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
        setCreateMsg('Rule updated.');
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
        setCreateMsg('Rule created.');
      }
      resetForm();
      void load();
    } catch (e) {
      setCreateErr(parseApiError(e)?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await api(`/admin/sla-rules/${id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Deactivate failed');
    }
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <CardTitle>Active SLA breaches</CardTitle>
          </div>
          <CardDescription>
            Items overdue for at least one active rule. Resolved breaches drop
            off automatically when the underlying row leaves its queue.
          </CardDescription>
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
              title="No active breaches"
              description="Every queue is within its SLA window."
            />
          ) : (
            <div className="rounded border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Detected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breaches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm font-medium">{b.rule.name}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">{queueLabel(b.rule.queue)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {b.target_kind}#{b.target_id}
                      </TableCell>
                      <TableCell className="text-xs text-fg-muted">
                        {new Date(b.detected_at).toLocaleString()}
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
              <CardTitle>SLA rules</CardTitle>
            </div>
            <CardDescription>
              Notifications are in-platform only (notification bell) and go
              to <strong>staff</strong> — never to clients. Each breach pings
              all active <strong>admins</strong> plus the per-item assignee
              if there is one (review_item, dispute or support thread). SLA
              rules themselves don't have an assignee — that's a per-row
              concept.
              {!isAdmin ? ' Only admins can create or deactivate rules.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No SLA rules yet"
                description="Create one on the right to start watching a queue."
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
                          {r.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant={editingId === r.id ? 'primary' : 'ghost'}
                            onClick={() =>
                              editingId === r.id ? resetForm() : startEdit(r)
                            }
                          >
                            {editingId === r.id ? 'Cancel edit' : 'Edit'}
                          </Button>
                        ) : null}
                        {isAdmin && r.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void deactivate(r.id)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-xs flex flex-wrap gap-1">
                      <Badge variant="outline">{queueLabel(r.target_queue)}</Badge>
                      <Badge variant="outline">
                        threshold: {r.threshold_minutes}m
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
                {editingId ? 'Edit SLA rule' : 'New SLA rule'}
              </CardTitle>
            </div>
            <CardDescription>
              {editingId
                ? 'Tweak the threshold, name, description or notification copy. Queue is immutable.'
                : "Pick a queue and how long an item is allowed to wait before it's flagged."}
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
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Queue{editingId ? ' (immutable)' : ''}</Label>
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
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Threshold (min)</Label>
                <Input
                  type="number"
                  value={thresholdMin}
                  onChange={(e) => setThresholdMin(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notification title (optional)</Label>
              <Input
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notification body (optional)</Label>
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
                Active
              </label>
            ) : null}
            <Button onClick={() => void submit()} disabled={busy}>
              {busy
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Create rule'}
            </Button>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </div>
  );
}
