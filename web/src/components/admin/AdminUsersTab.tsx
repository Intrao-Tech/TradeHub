import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  HardHat,
  MessageCircle,
  ScrollText,
  Search,
  ShieldCheck,
  User,
  UserX,
} from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { publicFileUrl } from '../../lib/files';

function initials(name?: string | null): string {
  if (!name) return 'TH';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'TH'
  );
}

type UserRow = {
  id: string;
  email: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  is_worker: boolean;
  is_employer: boolean;
  is_staff: boolean;
  staff_role: string | null;
  client: {
    id: string;
    display_name: string;
    slug: string;
    avatar_url: string | null;
    verification_level: string | null;
    postcode_area: string | null;
    city: string | null;
    referral_code: string;
  } | null;
};

type UserList = { data: UserRow[]; total: number; page: number; limit: number };

type UserDetail = {
  id: string;
  email: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  is_worker: boolean;
  is_employer: boolean;
  is_staff: boolean;
  client: {
    id: string;
    display_name: string;
    slug: string;
    avatar_url: string | null;
    bio: string | null;
    city: string | null;
    postcode_area: string | null;
    verification_level: string;
    referral_code: string;
    referrer: { id: string; display_name: string; slug: string } | null;
    connect_payouts_enabled: boolean;
    connect_charges_enabled: boolean;
  } | null;
  worker: {
    years_experience: number | null;
    day_rate_min: string | null;
    day_rate_max: string | null;
    is_available: boolean;
    rating_avg: string;
    rating_count: number;
  } | null;
  employer: {
    company_name: string | null;
    company_number: string | null;
    team_size: number | null;
    rating_avg: string;
    rating_count: number;
  } | null;
  staff: {
    display_name: string;
    is_on_duty: boolean;
    roles: string[];
  } | null;
  counters: { contracts: number; open_disputes: number };
  payment_totals: { type: string; status: string; count: number; amount: string }[];
  reviewable_items: {
    id: string;
    kind: string;
    created_at: string;
    document: { doc_type: string } | null;
    latest_review: { id: string; status: string; reviewed_at: string | null } | null;
  }[];
  recent_audit: {
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
    metadata: unknown;
  }[];
};

const STATUS_VARIANTS: Record<
  string,
  'default' | 'success' | 'warning' | 'danger' | 'outline'
> = {
  ACTIVE: 'success',
  PENDING_EMAIL_VERIFICATION: 'warning',
  DEACTIVATED: 'danger',
};

export function AdminUsersTab() {
  const navigate = useNavigate();
  const { account, hasPermission } = useAccountMe();
  const canMessage = hasPermission('support.initiate');
  const myAccountId = account?.id != null ? String(account.id) : null;
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');
  const [status, setStatus] = useState<string>(
    searchParams.get('status') ?? '',
  );
  const [list, setList] = useState<UserList | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [pendingApprovals, setPendingApprovals] = useState<
    {
      id: string;
      action: string;
      requested_at: string;
      requested_by: { id: string; display_name: string };
      required_approver_role: string;
    }[]
  >([]);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [verificationLevel, setVerificationLevel] = useState('BASIC');
  const [verificationReason, setVerificationReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const usp = new URLSearchParams();
      if (q.trim()) usp.set('q', q.trim());
      if (kind && kind !== 'ANY') usp.set('kind', kind);
      if (status) usp.set('status', status);
      usp.set('page', String(page));
      usp.set('limit', '20');
      const d = await api<UserList>(`/admin/users?${usp.toString()}`);
      setList(d);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to search');
    } finally {
      setLoading(false);
    }
  }, [q, kind, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadDetail(id: string) {
    setDetailErr('');
    setDetail(null);
    setPendingApprovals([]);
    setActionMsg('');
    setActionErr('');
    try {
      const d = await api<UserDetail>(`/admin/users/${id}`);
      setDetail(d);
      // Load any approvals targeting this user that are still pending — so
      // staff doesn't accidentally submit the same request a second time.
      try {
        const list = await api<{
          data: Array<{
            id: string;
            action: string;
            requested_at: string;
            target_kind: string;
            target_id: string;
            required_approver_role: string;
            requested_by: { id: string; display_name: string };
          }>;
        }>('/admin/approvals?status=PENDING&limit=100');
        setPendingApprovals(
          list.data.filter(
            (a) => a.target_kind === 'CLIENT_PROFILE' && a.target_id === id,
          ),
        );
      } catch {
        // Best-effort; not fatal
      }
    } catch (e) {
      setDetailErr(parseApiError(e)?.message ?? 'Failed to load user');
    }
  }

  async function trigger(action: string, extra: Record<string, unknown> = {}) {
    if (!detail) return;
    if (!suspendReason.trim() && !extra.reason) {
      setActionErr('Reason is required');
      return;
    }
    setActionErr('');
    setActionMsg('');
    try {
      const body = {
        action,
        target_kind: 'CLIENT_PROFILE',
        target_id: detail.id,
        reason: (extra.reason as string) ?? suspendReason.trim(),
        extra,
      };
      const res = await api<{
        mode: string;
        approval_id?: string;
        audit_id?: string;
      }>('/admin/actions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.mode === 'PENDING_APPROVAL') {
        setActionMsg(`Queued for approval (#${res.approval_id})`);
      } else {
        setActionMsg(`Executed (audit #${res.audit_id})`);
      }
      void loadDetail(detail.id);
    } catch (e) {
      setActionErr(parseApiError(e)?.message ?? 'Action failed');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-fg-muted" />
            <CardTitle>Search users</CardTitle>
          </div>
          <CardDescription>
            Find any account by email, display name, slug, postcode, or
            referral code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label>Query</Label>
            <Input
              placeholder="email, name, slug, postcode, referral code"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select
                value={kind || 'ANY'}
                onValueChange={(v) => {
                  setPage(1);
                  setKind(v === 'ANY' ? '' : v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="WORKER">Worker</SelectItem>
                  <SelectItem value="EMPLOYER">Employer</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status || 'ANY'}
                onValueChange={(v) => {
                  setPage(1);
                  setStatus(v === 'ANY' ? '' : v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PENDING_EMAIL_VERIFICATION">
                    Pending email
                  </SelectItem>
                  <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}
          {list?.data.length === 0 ? (
            <EmptyState
              icon={UserX}
              title={loading ? 'Loading…' : 'No users match'}
              description="Adjust the query or filters and try again."
            />
          ) : (
            <div className="rounded-md border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list?.data.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => void loadDetail(r.id)}
                    >
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Avatar className="h-8 w-8 mt-0.5">
                            {r.client?.avatar_url ? (
                              <AvatarImage
                                src={publicFileUrl(r.client.avatar_url)}
                                alt={r.client.display_name ?? ''}
                              />
                            ) : null}
                            <AvatarFallback>
                              {initials(r.client?.display_name ?? r.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {r.client?.display_name ?? r.email}
                            </div>
                            <div className="text-xs text-fg-muted truncate">
                              {r.email}
                            </div>
                            {r.client?.city || r.client?.postcode_area ? (
                              <div className="text-[11px] text-fg-muted">
                                {[r.client.city, r.client.postcode_area]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.is_worker ? (
                            <Badge variant="outline">
                              <HardHat className="h-3 w-3" />
                              Worker
                            </Badge>
                          ) : null}
                          {r.is_employer ? (
                            <Badge variant="outline">
                              <Briefcase className="h-3 w-3" />
                              Employer
                            </Badge>
                          ) : null}
                          {r.is_staff ? (
                            <Badge variant="secondary">
                              <ShieldCheck className="h-3 w-3" />
                              {r.staff_role ?? 'Staff'}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANTS[r.status] ?? 'outline'}
                        >
                          {r.status === 'PENDING_EMAIL_VERIFICATION'
                            ? 'PENDING_EMAIL'
                            : r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {list && list.total > list.limit ? (
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>
                Page {list.page} · {list.total.toLocaleString()} total
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
                  disabled={page * list.limit >= list.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-fg-muted" />
            <CardTitle>User detail</CardTitle>
          </div>
          <CardDescription>
            Profile, recent activity, and admin actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detailErr ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {detailErr}
            </div>
          ) : null}
          {!detail ? (
            <EmptyState
              icon={User}
              title="No user selected"
              description="Pick a user from the list to see profile, payments, reviews, and admin actions."
            />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Avatar className="h-14 w-14">
                  {detail.client?.avatar_url ? (
                    <AvatarImage
                      src={publicFileUrl(detail.client.avatar_url)}
                      alt={detail.client.display_name ?? ''}
                    />
                  ) : null}
                  <AvatarFallback>
                    {initials(detail.client?.display_name ?? detail.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-lg font-semibold truncate">
                    {detail.client?.display_name ?? detail.email}
                  </div>
                  <div className="text-xs text-fg-muted truncate">
                    {detail.email} · joined{' '}
                    {new Date(detail.created_at).toLocaleDateString()}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge
                      variant={STATUS_VARIANTS[detail.status] ?? 'outline'}
                    >
                      {detail.status}
                    </Badge>
                    {detail.is_worker ? (
                      <Badge variant="outline">
                        <HardHat className="h-3 w-3" />
                        Worker
                      </Badge>
                    ) : null}
                    {detail.is_employer ? (
                      <Badge variant="outline">
                        <Briefcase className="h-3 w-3" />
                        Employer
                      </Badge>
                    ) : null}
                    {detail.is_staff ? (
                      <Badge variant="secondary">
                        <ShieldCheck className="h-3 w-3" />
                        {(detail.staff?.roles ?? []).join(', ') || 'staff'}
                      </Badge>
                    ) : null}
                    {detail.client ? (
                      <Badge variant="outline">
                        Verification: {detail.client.verification_level}
                      </Badge>
                    ) : null}
                  </div>
                  {canMessage && detail.client ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        navigate(
                          `/admin?tab=support&clientId=${detail.client!.id}`,
                        );
                      }}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Message this user
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-border-subtle p-3 text-sm">
                  <div className="text-xs text-fg-muted">Contracts</div>
                  <div className="text-xl font-semibold">
                    {detail.counters.contracts}
                  </div>
                </div>
                <div className="rounded border border-border-subtle p-3 text-sm">
                  <div className="text-xs text-fg-muted">Open disputes</div>
                  <div className="text-xl font-semibold">
                    {detail.counters.open_disputes}
                  </div>
                </div>
              </div>

              {detail.payment_totals.length > 0 ? (
                <div>
                  <div className="text-sm font-medium mb-2">Payment totals</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {detail.payment_totals.map((p, i) => (
                      <Badge key={i} variant="outline">
                        {p.type}/{p.status}: {p.count} · £
                        {Number(p.amount).toLocaleString()}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.reviewable_items.length > 0 ? (
                <div>
                  <div className="text-sm font-medium mb-2">
                    Reviewable items
                  </div>
                  <div className="space-y-1 text-xs">
                    {detail.reviewable_items.slice(0, 8).map((ri) => (
                      <div
                        key={ri.id}
                        className="flex items-center justify-between rounded border border-border-subtle px-2 py-1"
                      >
                        <span>
                          {ri.kind}
                          {ri.document
                            ? ` · ${ri.document.doc_type}`
                            : ''}
                        </span>
                        {ri.latest_review ? (
                          <Badge
                            variant={
                              ri.latest_review.status === 'APPROVED'
                                ? 'success'
                                : ri.latest_review.status === 'REJECTED'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {ri.latest_review.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No review</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded border border-border-subtle p-3 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium">Admin actions</div>
                  {myAccountId === detail.id ? (
                    <span className="text-[11px] text-fg-muted">
                      Self-targeting actions are disabled.
                    </span>
                  ) : null}
                </div>
                {pendingApprovals.length > 0 ? (
                  <div className="rounded border border-warning/40 bg-warning-subtle/30 px-3 py-2 space-y-1">
                    <div className="text-xs font-medium text-warning">
                      Pending approval{pendingApprovals.length === 1 ? '' : 's'}{' '}
                      against this user
                    </div>
                    <ul className="text-xs space-y-1">
                      {pendingApprovals.map((a) => {
                        const mine = a.requested_by.id === myAccountId;
                        return (
                          <li key={a.id} className="flex flex-wrap gap-1">
                            <span className="font-mono">{a.action}</span>
                            <span className="text-fg-muted">
                              · requested by{' '}
                              {mine ? 'you' : a.requested_by.display_name}{' '}
                              {new Date(a.requested_at).toLocaleString()}
                            </span>
                            <span className="text-fg-muted">
                              · needs {a.required_approver_role}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
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
                <div className="space-y-2">
                  <Label className="text-xs">Reason (audited)</Label>
                  <Textarea
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="e.g. fraud investigation case #4827"
                    className="min-h-[60px] text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={
                      detail.status === 'DEACTIVATED' ||
                      myAccountId === detail.id
                    }
                    onClick={() => void trigger('USER_SUSPEND')}
                  >
                    Suspend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      detail.status !== 'DEACTIVATED' ||
                      myAccountId === detail.id
                    }
                    onClick={() => void trigger('USER_UNSUSPEND')}
                  >
                    Unsuspend
                  </Button>
                </div>
                <div className="border-t pt-2 space-y-2">
                  <Label className="text-xs">
                    Override verification level
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={verificationLevel}
                      onValueChange={setVerificationLevel}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNVERIFIED">UNVERIFIED</SelectItem>
                        <SelectItem value="BASIC">BASIC</SelectItem>
                        <SelectItem value="CERTIFIED">CERTIFIED</SelectItem>
                        <SelectItem value="PREMIUM">PREMIUM</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Reason"
                      value={verificationReason}
                      onChange={(e) => setVerificationReason(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={myAccountId === detail.id}
                      onClick={() =>
                        void trigger('VERIFICATION_LEVEL_OVERRIDE', {
                          new_level: verificationLevel,
                          reason: verificationReason.trim() || suspendReason.trim(),
                        })
                      }
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>

              {detail.recent_audit.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ScrollText className="h-3.5 w-3.5 text-fg-muted" />
                    <div className="text-sm font-medium">Recent audit</div>
                  </div>
                  <div className="space-y-1 text-xs">
                    {detail.recent_audit.slice(0, 10).map((a) => (
                      <div
                        key={a.id}
                        className="rounded border border-border-subtle px-2 py-1"
                      >
                        <span className="font-mono">{a.action}</span>{' '}
                        <span className="text-fg-muted">
                          · {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
