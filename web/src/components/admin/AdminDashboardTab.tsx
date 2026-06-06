import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatMoney, activeLocale } from '@/lib/format';
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
  const { t } = useTranslation('admin');
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
      setErr(parseApiError(e)?.message ?? t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{t('dashboard.title')}</h2>
          <p className="text-sm text-fg-muted">
            {t('dashboard.subtitle')}
            {loading ? t('dashboard.refreshing') : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('dashboard.refresh')}
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
              title={t('dashboard.activeUsers')}
              icon={Users}
              value={data.users.active.toLocaleString()}
              subtitle={t('dashboard.usersSubtitle', {
                total: data.users.total.toLocaleString(),
                deactivated: data.users.deactivated.toLocaleString(),
              })}
              onClick={() => goto('users', { status: 'ACTIVE' })}
              navigateLabel={t('dashboard.browseUsers')}
            />
            <StatCard
              title={t('dashboard.newUsers')}
              icon={TrendingUp}
              accent="success"
              value={`${data.users.new_7d} / ${data.users.new_30d}`}
              subtitle={t('dashboard.newUsersSubtitle', {
                workers: data.users.workers,
                employers: data.users.employers,
                staff: data.staff.total,
              })}
              onClick={() => goto('users', { sort: 'newest' })}
              navigateLabel={t('dashboard.recentSignups')}
            />
            <StatCard
              title={t('dashboard.staff')}
              icon={ShieldCheckIcon}
              value={data.staff.active.toLocaleString()}
              subtitle={t('dashboard.staffSubtitle', {
                onDuty: data.staff.on_duty,
                total: data.staff.total,
              })}
              onClick={() => goto('staff')}
              navigateLabel={t('dashboard.manageStaff')}
            />
            <StatCard
              title={t('dashboard.activeContracts')}
              icon={FileCheck2}
              value={data.contracts.active.toLocaleString()}
              subtitle={t('dashboard.contractsSubtitle', {
                total: data.contracts.total.toLocaleString(),
              })}
              onClick={() => goto('escrow-disputes')}
              navigateLabel={t('dashboard.openEscrow')}
            />
            <StatCard
              title={t('dashboard.funded24h')}
              icon={Wallet}
              accent="success"
              value={formatMoney(Number(data.milestones.funded_last_24h.total), { decimals: 0 })}
              subtitle={t('dashboard.funded24hSubtitle', {
                count: data.milestones.funded_last_24h.count,
              })}
              onClick={() => goto('audit', { action: 'escrow.milestone.funded' })}
              navigateLabel={t('dashboard.seeAudit')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('dashboard.pendingReviews')}
              icon={ClipboardCheck}
              accent={data.queues.pending_review_items > 0 ? 'warning' : 'default'}
              value={data.queues.pending_review_items.toLocaleString()}
              onClick={() => goto('documents')}
              navigateLabel={t('dashboard.openQueue')}
            />
            <StatCard
              title={t('dashboard.pendingApprovals')}
              icon={ShieldAlert}
              accent={data.queues.pending_approvals > 0 ? 'warning' : 'default'}
              value={data.queues.pending_approvals.toLocaleString()}
              onClick={() => goto('approvals', { status: 'PENDING' })}
              navigateLabel={t('dashboard.reviewApprovals')}
            />
            <StatCard
              title={t('dashboard.slaBreaches')}
              icon={ShieldAlert}
              accent={data.queues.sla_breaches_active > 0 ? 'danger' : 'default'}
              value={data.queues.sla_breaches_active.toLocaleString()}
              onClick={() => goto('sla')}
              navigateLabel={t('dashboard.seeBreaches')}
            />
            <StatCard
              title={t('dashboard.openDisputes')}
              icon={ScaleIcon}
              accent={data.disputes.open > 0 ? 'warning' : 'default'}
              value={data.disputes.open.toLocaleString()}
              subtitle={t('dashboard.openDisputesSubtitle', {
                count: data.queues.support_threads_active_7d,
              })}
              onClick={() => goto('escrow-disputes')}
              navigateLabel={t('dashboard.openDisputesTab')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              title={t('dashboard.supportThreads')}
              icon={LifeBuoy}
              value={data.queues.support_threads_active_7d.toLocaleString()}
              subtitle={t('dashboard.supportThreadsSubtitle')}
              onClick={() => goto('support')}
              navigateLabel={t('dashboard.openSupport')}
            />
            <StatCard
              title={t('dashboard.findUser')}
              icon={Users}
              value={t('dashboard.search')}
              subtitle={t('dashboard.findUserSubtitle')}
              onClick={() => goto('users')}
              navigateLabel={t('dashboard.openUserSearch')}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-fg-muted" />
                  <CardTitle>{t('dashboard.milestonesByStatus')}</CardTitle>
                </div>
                <CardDescription>{t('dashboard.milestonesByStatusDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.milestones.by_status.length === 0 ? (
                    <span className="text-xs text-fg-muted">
                      {t('dashboard.noMilestones')}
                    </span>
                  ) : (
                    data.milestones.by_status.map((m) => (
                      <Badge key={m.status} variant="outline" className="text-xs">
                        {m.status}: {m.count} · {formatMoney(Number(m.total), { decimals: 0 })}
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
                  <CardTitle>{t('dashboard.payments30d')}</CardTitle>
                </div>
                <CardDescription>{t('dashboard.payments30dDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {data.payments_30d.length === 0 ? (
                  <p className="text-xs text-fg-muted">{t('dashboard.noPayments')}</p>
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
                          {t('dashboard.paymentsLine', {
                            count: p.count,
                            amount: formatMoney(Number(p.amount), { decimals: 0 }),
                          })}
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
                <CardTitle>{t('dashboard.newAccounts')}</CardTitle>
              </div>
              <CardDescription>{t('dashboard.newAccountsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {data.timeseries.accounts_per_day_7d.map((r) => {
                  const max = Math.max(
                    1,
                    ...data.timeseries.accounts_per_day_7d.map((x) => x.count),
                  );
                  const pct = Math.round((r.count / max) * 100);
                  const date = new Date(r.day).toLocaleDateString(activeLocale(), {
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
