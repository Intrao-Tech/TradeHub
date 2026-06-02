import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '../EmptyState';

type ApprovalRow = {
  id: string;
  status: string;
  action: string;
  action_description: string;
  rule: { id: string; name: string };
  required_approver_role: string;
  target_kind: string;
  target_id: string;
  context: unknown;
  requested_by: { id: string; display_name: string };
  requested_reason: string | null;
  approved_by: { id: string; display_name: string } | null;
  approver_reason: string | null;
  requested_at: string;
  resolved_at: string | null;
  expires_at: string | null;
};

const STATUS_VARIANTS: Record<
  string,
  'success' | 'warning' | 'danger' | 'secondary' | 'outline'
> = {
  PENDING: 'warning',
  APPROVED: 'success',
  EXECUTED: 'success',
  REJECTED: 'danger',
  CANCELED: 'secondary',
  EXPIRED: 'secondary',
};

export function AdminApprovalsTab() {
  const { t } = useTranslation('admin');
  const { account } = useAccountMe();
  const myAccountId = account?.id != null ? String(account.id) : null;
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(
    searchParams.get('status') ?? 'PENDING',
  );
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [active, setActive] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const usp = new URLSearchParams();
      usp.set('status', status);
      usp.set('page', String(page));
      usp.set('limit', '20');
      const data = await api<{
        data: ApprovalRow[];
        total: number;
      }>(`/admin/approvals?${usp.toString()}`);
      setRows(data.data);
      setTotal(data.total);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('approvals.loadError'));
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveOrReject(kind: 'approve' | 'reject') {
    if (!active) return;
    if (kind === 'reject' && reason.trim().length < 3) {
      setActionErr(t('approvals.rejectReasonRequired'));
      return;
    }
    setActionErr('');
    setActionMsg('');
    try {
      await api(`/admin/approvals/${active.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setActionMsg(
        kind === 'approve'
          ? t('approvals.approvedMsg')
          : t('approvals.rejectedMsg'),
      );
      setReason('');
      setActive(null);
      void load();
    } catch (e) {
      setActionErr(
        parseApiError(e)?.message ??
          (kind === 'approve'
            ? t('approvals.approveFailed')
            : t('approvals.rejectFailed')),
      );
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <CardTitle>{t('approvals.title')}</CardTitle>
          </div>
          <CardDescription>{t('approvals.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Select
              value={status}
              onValueChange={(v) => {
                setPage(1);
                setStatus(v);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">{t('approvals.statusPending')}</SelectItem>
                <SelectItem value="APPROVED">{t('approvals.statusApproved')}</SelectItem>
                <SelectItem value="REJECTED">{t('approvals.statusRejected')}</SelectItem>
                <SelectItem value="EXECUTED">{t('approvals.statusExecuted')}</SelectItem>
                <SelectItem value="EXPIRED">{t('approvals.statusExpired')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('approvals.refresh')}
            </Button>
          </div>
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('approvals.noMatch')}
              description={
                status === 'PENDING'
                  ? t('approvals.inboxClear')
                  : t('approvals.tryDifferent')
              }
            />
          ) : (
            <div className="rounded-md border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('approvals.colAction')}</TableHead>
                    <TableHead>{t('approvals.colTarget')}</TableHead>
                    <TableHead>{t('approvals.colRequestedBy')}</TableHead>
                    <TableHead>{t('approvals.colStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={`cursor-pointer ${
                        active?.id === r.id
                          ? 'bg-primary/5'
                          : ''
                      }`}
                      onClick={() => {
                        setActive(r);
                        setReason('');
                        setActionMsg('');
                        setActionErr('');
                      }}
                    >
                      <TableCell>
                        <div className="font-mono text-xs">{r.action}</div>
                        <div className="text-xs text-fg-muted">
                          {t('approvals.ruleLine', { name: r.rule.name })}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.target_kind}
                        <br />
                        <span className="font-mono">#{r.target_id}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.requested_by.display_name}
                        <br />
                        <span className="text-fg-muted">
                          {formatDateTime(r.requested_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANTS[r.status] ?? 'outline'}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>
              {t('users.pageLine', { page, total })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('users.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('users.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-fg-muted" />
            <CardTitle>{t('approvals.detailTitle')}</CardTitle>
          </div>
          <CardDescription>{t('approvals.detailDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!active ? (
            <EmptyState
              icon={Inbox}
              title={t('approvals.noSelection')}
              description={t('approvals.noSelectionDesc')}
            />
          ) : (
            <>
              <div>
                <div className="font-mono text-sm">{active.action}</div>
                <div className="text-xs text-fg-muted mt-1">
                  {active.action_description}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge
                    variant={STATUS_VARIANTS[active.status] ?? 'outline'}
                  >
                    {active.status}
                  </Badge>
                  <Badge variant="outline">
                    {t('approvals.requires', {
                      role: active.required_approver_role,
                    })}
                  </Badge>
                  <Badge variant="outline">
                    {t('approvals.targetBadge', {
                      kind: active.target_kind,
                      id: active.target_id,
                    })}
                  </Badge>
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div>
                  <span className="text-fg-muted">{t('approvals.rule')}</span> {active.rule.name}
                </div>
                <div>
                  <span className="text-fg-muted">{t('approvals.requestedBy')}</span>{' '}
                  {active.requested_by.display_name}
                </div>
                <div>
                  <span className="text-fg-muted">{t('approvals.requested')}</span>{' '}
                  {formatDateTime(active.requested_at)}
                </div>
                {active.expires_at ? (
                  <div>
                    <span className="text-fg-muted">{t('approvals.expires')}</span>{' '}
                    {formatDateTime(active.expires_at)}
                  </div>
                ) : null}
                {active.requested_reason ? (
                  <div>
                    <span className="text-fg-muted">{t('approvals.requestorReason')}</span>{' '}
                    {active.requested_reason}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-fg-muted mb-1">{t('approvals.context')}</div>
                <ContextTable context={active.context} t={t} />
              </div>
              {active.status === 'PENDING' ? (
                myAccountId === active.requested_by.id ? (
                  <div className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning">
                    {t('approvals.ownRequest', {
                      role: active.required_approver_role,
                    })}
                  </div>
                ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder={t('approvals.approverReasonPlaceholder')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[80px] text-sm"
                  />
                  {actionMsg ? (
                    <div className="text-xs rounded bg-success-subtle text-success px-2 py-1">
                      {actionMsg}
                    </div>
                  ) : null}
                  {actionErr ? (
                    <div className="text-xs rounded bg-danger-subtle text-danger px-2 py-1">
                      {actionErr}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void approveOrReject('approve')}
                    >
                      {t('approvals.approveExecute')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void approveOrReject('reject')}
                    >
                      {t('approvals.reject')}
                    </Button>
                  </div>
                </div>
                )
              ) : (
                <div className="text-xs text-fg-muted">
                  {t('approvals.resolved', {
                    date: active.resolved_at
                      ? formatDateTime(active.resolved_at)
                      : '—',
                  })}
                  {active.approved_by
                    ? t('approvals.resolvedBy', {
                        name: active.approved_by.display_name,
                      })
                    : ''}
                  {active.approver_reason
                    ? `: ${active.approver_reason}`
                    : ''}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Render the approval context (free-form JSON) as a tidy key/value table.
 * Falls back to JSON for nested arrays/objects so we don't lose data.
 */
function ContextTable({
  context,
  t,
}: {
  context: unknown;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (context == null || typeof context !== 'object') {
    return <p className="text-xs text-fg-muted">{t('approvals.noContext')}</p>;
  }
  const entries = Object.entries(context as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-fg-muted">{t('approvals.noContext')}</p>;
  }
  return (
    <dl className="rounded border border-border-subtle divide-y divide-border-subtle text-xs">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[140px_1fr] gap-2 px-2 py-1.5"
        >
          <dt className="font-mono text-fg-muted">{k}</dt>
          <dd className="break-words">
            {renderContextValue(k, v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function renderContextValue(key: string, v: unknown): React.ReactNode {
  if (v == null) return <span className="text-fg-muted">—</span>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    // Pretty-print money fields
    if (key === 'amount_pence' || key.endsWith('_pence')) {
      return `${v.toLocaleString()} pence (${formatMoney(v / 100)})`;
    }
    return v.toLocaleString();
  }
  return (
    <pre className="whitespace-pre-wrap font-mono">
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}
