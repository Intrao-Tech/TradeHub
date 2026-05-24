import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
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
      setErr(parseApiError(e)?.message ?? 'Failed to load');
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveOrReject(kind: 'approve' | 'reject') {
    if (!active) return;
    if (kind === 'reject' && reason.trim().length < 3) {
      setActionErr('Reason is required to reject (>= 3 chars).');
      return;
    }
    setActionErr('');
    setActionMsg('');
    try {
      await api(`/admin/approvals/${active.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setActionMsg(`Request ${kind === 'approve' ? 'approved' : 'rejected'}.`);
      setReason('');
      setActive(null);
      void load();
    } catch (e) {
      setActionErr(parseApiError(e)?.message ?? `${kind} failed`);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <CardTitle>Action approvals</CardTitle>
          </div>
          <CardDescription>
            Staff actions that hit a matching approval rule wait here. Approve
            to execute, reject to drop.
          </CardDescription>
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
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXECUTED">Executed</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
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
              title="No approvals match"
              description={
                status === 'PENDING'
                  ? 'Inbox is clear — no pending actions waiting on review.'
                  : 'Try a different status filter.'
              }
            />
          ) : (
            <div className="rounded-md border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Status</TableHead>
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
                          rule: {r.rule.name}
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
                          {new Date(r.requested_at).toLocaleString()}
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
              Page {page} · {total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-fg-muted" />
            <CardTitle>Detail</CardTitle>
          </div>
          <CardDescription>
            Inspect the request, then approve or reject.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!active ? (
            <EmptyState
              icon={Inbox}
              title="No approval selected"
              description="Click a row on the left to inspect and resolve."
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
                    Requires {active.required_approver_role}
                  </Badge>
                  <Badge variant="outline">
                    Target: {active.target_kind}#{active.target_id}
                  </Badge>
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div>
                  <span className="text-fg-muted">Rule:</span> {active.rule.name}
                </div>
                <div>
                  <span className="text-fg-muted">Requested by:</span>{' '}
                  {active.requested_by.display_name}
                </div>
                <div>
                  <span className="text-fg-muted">Requested:</span>{' '}
                  {new Date(active.requested_at).toLocaleString()}
                </div>
                {active.expires_at ? (
                  <div>
                    <span className="text-fg-muted">Expires:</span>{' '}
                    {new Date(active.expires_at).toLocaleString()}
                  </div>
                ) : null}
                {active.requested_reason ? (
                  <div>
                    <span className="text-fg-muted">Requestor reason:</span>{' '}
                    {active.requested_reason}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-xs text-fg-muted mb-1">Context</div>
                <ContextTable context={active.context} />
              </div>
              {active.status === 'PENDING' ? (
                myAccountId === active.requested_by.id ? (
                  <div className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning">
                    You can't approve or reject your own request. Wait for
                    another {active.required_approver_role} to resolve it.
                  </div>
                ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Approver reason (optional for approve, required for reject)"
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
                      Approve & execute
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void approveOrReject('reject')}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
                )
              ) : (
                <div className="text-xs text-fg-muted">
                  Resolved {active.resolved_at
                    ? new Date(active.resolved_at).toLocaleString()
                    : '—'}
                  {active.approved_by
                    ? ` by ${active.approved_by.display_name}`
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
function ContextTable({ context }: { context: unknown }) {
  if (context == null || typeof context !== 'object') {
    return <p className="text-xs text-fg-muted">No context.</p>;
  }
  const entries = Object.entries(context as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-fg-muted">No context.</p>;
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
      return `${v.toLocaleString()} pence (£${(v / 100).toFixed(2)})`;
    }
    return v.toLocaleString();
  }
  return (
    <pre className="whitespace-pre-wrap font-mono">
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}
