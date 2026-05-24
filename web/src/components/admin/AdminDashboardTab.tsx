import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardCheck,
  FileCheck2,
  LifeBuoy,
  RefreshCw,
  ScaleIcon,
  ShieldAlert,
  ShieldCheck as ShieldCheckIcon,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api, parseApiError } from '../../api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DashboardStats = {
  users: {
    total: number;
    active: number;
    deactivated: number;
    new_7d: number;
    new_30d: number;
    workers: number;
    employers: number;
  };
  staff: { total: number; active: number; on_duty: number };
  contracts: { total: number; active: number };
  milestones: {
    by_status: { status: string; count: number; total: string }[];
    funded_last_24h: { count: number; total: string };
  };
  disputes: { open: number };
  queues: {
    pending_review_items: number;
    pending_approvals: number;
    sla_breaches_active: number;
    support_threads_active_7d: number;
  };
  payments_30d: { type: string; status: string; count: number; amount: string }[];
  timeseries: { accounts_per_day_7d: { day: string; count: number }[] };
};

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: 'default' | 'warning' | 'danger' | 'success';
  onClick?: () => void;
  navigateLabel?: string;
};

const ACCENT_TONES: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: 'text-fg-muted',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'default',
  onClick,
  navigateLabel,
}: StatCardProps) {
  const interactive = Boolean(onClick);
  return (
    <Card
      onClick={onClick}
      className={cn(
        interactive
          ? 'cursor-pointer transition-colors hover:border-border-strong'
          : '',
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="flex items-center gap-1.5">
            {Icon ? <Icon className={cn('h-3.5 w-3.5', ACCENT_TONES[accent])} /> : null}
            {title}
          </CardDescription>
          {interactive ? (
            <ArrowRight className="h-3 w-3 text-fg-muted" />
          ) : null}
        </div>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {subtitle || navigateLabel ? (
        <CardContent className="text-xs text-fg-muted space-y-0.5">
          {subtitle ? <div>{subtitle}</div> : null}
          {navigateLabel ? (
            <div className="text-primary">{navigateLabel} →</div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function AdminDashboardTab() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function goto(tab: string, params: Record<string, string> = {}) {
    const usp = new URLSearchParams({ tab, ...params });
    navigate(`/admin?${usp.toString()}`);
  }

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const d = await api<DashboardStats>('/admin/dashboard');
      setData(d);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Overview</h2>
          <p className="text-sm text-fg-muted">
            Live snapshot of the platform. Click any tile to drill in.
            {loading ? ' Refreshing…' : null}
          </p>
        </div>
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

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="Active users"
              icon={Users}
              value={data.users.active.toLocaleString()}
              subtitle={`${data.users.total.toLocaleString()} total · ${data.users.deactivated.toLocaleString()} deactivated`}
              onClick={() => goto('users', { status: 'ACTIVE' })}
              navigateLabel="Browse users"
            />
            <StatCard
              title="New (7d / 30d)"
              icon={TrendingUp}
              accent="success"
              value={`${data.users.new_7d} / ${data.users.new_30d}`}
              subtitle={`${data.users.workers} workers · ${data.users.employers} employers · ${data.staff.total} staff`}
              onClick={() => goto('users', { sort: 'newest' })}
              navigateLabel="See recent signups"
            />
            <StatCard
              title="Staff"
              icon={ShieldCheckIcon}
              value={data.staff.active.toLocaleString()}
              subtitle={`${data.staff.on_duty} on duty · ${data.staff.total} total`}
              onClick={() => goto('staff')}
              navigateLabel="Manage staff"
            />
            <StatCard
              title="Active contracts"
              icon={FileCheck2}
              value={data.contracts.active.toLocaleString()}
              subtitle={`${data.contracts.total.toLocaleString()} total`}
              onClick={() => goto('escrow-disputes')}
              navigateLabel="Open escrow tab"
            />
            <StatCard
              title="Funded (last 24h)"
              icon={Wallet}
              accent="success"
              value={`£${Number(data.milestones.funded_last_24h.total).toLocaleString()}`}
              subtitle={`${data.milestones.funded_last_24h.count} milestones`}
              onClick={() => goto('audit', { action: 'escrow.milestone.funded' })}
              navigateLabel="See audit log"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Pending document reviews"
              icon={ClipboardCheck}
              accent={data.queues.pending_review_items > 0 ? 'warning' : 'default'}
              value={data.queues.pending_review_items.toLocaleString()}
              onClick={() => goto('documents')}
              navigateLabel="Open queue"
            />
            <StatCard
              title="Pending approvals"
              icon={ShieldAlert}
              accent={data.queues.pending_approvals > 0 ? 'warning' : 'default'}
              value={data.queues.pending_approvals.toLocaleString()}
              onClick={() => goto('approvals', { status: 'PENDING' })}
              navigateLabel="Review approvals"
            />
            <StatCard
              title="Active SLA breaches"
              icon={ShieldAlert}
              accent={data.queues.sla_breaches_active > 0 ? 'danger' : 'default'}
              value={data.queues.sla_breaches_active.toLocaleString()}
              onClick={() => goto('sla')}
              navigateLabel="See breaches"
            />
            <StatCard
              title="Open disputes"
              icon={ScaleIcon}
              accent={data.disputes.open > 0 ? 'warning' : 'default'}
              value={data.disputes.open.toLocaleString()}
              subtitle={`${data.queues.support_threads_active_7d} active support threads (7d)`}
              onClick={() => goto('escrow-disputes')}
              navigateLabel="Open disputes tab"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              title="Active support threads (7d)"
              icon={LifeBuoy}
              value={data.queues.support_threads_active_7d.toLocaleString()}
              subtitle="Threads with a message in the last 7 days."
              onClick={() => goto('support')}
              navigateLabel="Open support"
            />
            <StatCard
              title="Find a user"
              icon={Users}
              value="Search"
              subtitle="Email, name, slug, postcode, referral code."
              onClick={() => goto('users')}
              navigateLabel="Open user search"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-fg-muted" />
                  <CardTitle>Milestones by status</CardTitle>
                </div>
                <CardDescription>
                  Live counts across every escrow state.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.milestones.by_status.length === 0 ? (
                    <span className="text-xs text-fg-muted">
                      No milestones yet.
                    </span>
                  ) : (
                    data.milestones.by_status.map((m) => (
                      <Badge key={m.status} variant="outline" className="text-xs">
                        {m.status}: {m.count} · £
                        {Number(m.total).toLocaleString()}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-fg-muted" />
                  <CardTitle>Payments (last 30 days)</CardTitle>
                </div>
                <CardDescription>
                  Grouped by type and current status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.payments_30d.length === 0 ? (
                  <p className="text-xs text-fg-muted">No payment activity.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.payments_30d.map((p, idx) => (
                      <div
                        key={`${p.type}-${p.status}-${idx}`}
                        className="rounded border border-border-subtle bg-subtle px-3 py-2 text-sm"
                      >
                        <div className="font-medium">
                          {p.type}{' '}
                          <span className="text-fg-muted">{p.status}</span>
                        </div>
                        <div className="text-xs text-fg-muted">
                          {p.count} payments · £
                          {Number(p.amount).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-fg-muted" />
                <CardTitle>New accounts per day (7d)</CardTitle>
              </div>
              <CardDescription>
                Signups across all account types.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {data.timeseries.accounts_per_day_7d.map((r) => {
                  const max = Math.max(
                    1,
                    ...data.timeseries.accounts_per_day_7d.map((x) => x.count),
                  );
                  const pct = Math.round((r.count / max) * 100);
                  const date = new Date(r.day).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                  });
                  return (
                    <div
                      key={r.day}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div
                        className="w-full rounded-t bg-primary/70 transition-all hover:bg-primary"
                        style={{ height: `${Math.max(4, pct)}%` }}
                        title={`${date}: ${r.count}`}
                      />
                      <div className="text-[10px] text-fg-muted">{date}</div>
                      <div className="text-xs tabular-nums">{r.count}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
