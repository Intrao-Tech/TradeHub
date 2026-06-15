import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, ScaleIcon, Wallet } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatDate } from '@/lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  OnboardingBanner,
  type OnboardingStatus,
} from '../components/wallet/OnboardingBanner';
import {
  getEmployerPayments,
  getWallet,
  type EmployerPaymentRow,
  type EmployerPaymentsView as EmployerPaymentsData,
  type WalletData,
} from '../components/escrow';
import { EmptyState } from '../components/EmptyState';

const fmt = (s: string) => formatMoney(Number(s));

export default function WalletPage() {
  const { t } = useTranslation('wallet');
  const { isWorker } = useAccountMe();
  const [searchParams] = useSearchParams();
  const justCompleted = searchParams.get('onboarding') === 'complete';
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const res = await api<OnboardingStatus>('/escrow/onboarding/status');
      setStatus(res);
    } catch (err) {
      const parsed = parseApiError(err);
      // 403 NOT_WORKER → render disabled state, not an error
      if (parsed?.status === 403) {
        setStatus(null);
      } else {
        setError(parsed?.message ?? t('page.statusError'));
      }
    }
    try {
      const w = await getWallet();
      setWallet(w);
    } catch {
      // non-fatal — onboarding can show without ledger
    }
  }, []);

  useEffect(() => {
    if (isWorker) void refresh();
  }, [isWorker, refresh]);

  // Poll briefly after onboarding redirect — Stripe webhook may take a beat
  useEffect(() => {
    if (!justCompleted || !isWorker) return;
    if (status?.payouts_enabled) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [justCompleted, isWorker, status?.payouts_enabled, refresh]);

  if (!isWorker) {
    return <EmployerPaymentsView />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-fg-muted" />
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('page.title')}</h1>
      </div>
      <p className="text-sm text-fg-muted">{t('page.workerSubtitle')}</p>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {justCompleted && status && !status.payouts_enabled ? (
        <div
          role="status"
          className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
        >
          {t('page.confirmingSetup')}
        </div>
      ) : null}

      <OnboardingBanner status={status} onRefresh={() => void refresh()} />

      <Card>
        <CardHeader>
          <CardTitle>{t('page.activeEscrow')}</CardTitle>
          <CardDescription>{t('page.activeEscrowDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!wallet || wallet.active_escrow.length === 0 ? (
            <p className="text-fg-muted">{t('page.nothingInFlight')}</p>
          ) : (
            wallet.active_escrow.map((m) => (
              <Link
                key={m.milestone_id}
                to={`/contracts/${m.contract_id}/escrow`}
                className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 hover:bg-subtle sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 truncate font-medium text-fg">{m.title}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={m.status === 'SUBMITTED' ? 'warning' : 'info'}>
                    {m.status === 'SUBMITTED' ? t('page.awaitingReview') : t('page.inEscrow')}
                  </Badge>
                  <span className="text-fg-muted">{fmt(m.expected_payout)}</span>
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {wallet && Number(wallet.cis_total_deducted ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('page.cisSummaryTitle')}</CardTitle>
            <CardDescription>{t('page.cisSummaryDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-fg">
              {fmt(wallet.cis_total_deducted ?? '0')}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('page.releasedHistory')}</CardTitle>
          <CardDescription>{t('page.releasedHistoryDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!wallet || wallet.released_history.length === 0 ? (
            <p className="text-fg-muted">{t('page.noReleased')}</p>
          ) : (
            wallet.released_history.map((m) => (
              <div
                key={m.milestone_id}
                className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{m.title}</div>
                  {m.released_at ? (
                    <div className="text-xs text-fg-muted">
                      {t('page.released', { date: formatDate(m.released_at, 'short') })}
                    </div>
                  ) : null}
                  {m.cis_withheld ? (
                    <div className="text-xs text-fg-muted">
                      {t('page.cisWithheld', { amount: fmt(m.cis_withheld) })}
                    </div>
                  ) : null}
                </div>
                <span className="text-success font-semibold">{fmt(m.amount)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {wallet && wallet.failed_transfers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('page.failedPayouts')}</CardTitle>
            <CardDescription>{t('page.failedPayoutsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {wallet.failed_transfers.map((m) => (
              <Link
                key={m.milestone_id}
                to={`/contracts/${m.contract_id}/escrow`}
                className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-danger sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 truncate font-medium">{m.title}</span>
                <span>{fmt(m.amount)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {wallet && wallet.pending_worker_payouts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('page.heldTitle')}</CardTitle>
            <CardDescription>{t('page.heldDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {wallet.pending_worker_payouts.map((p) => (
              <Link
                key={p.id}
                to={`/contracts/${p.contract_id}/escrow`}
                className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-warning hover:bg-warning-subtle/80 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.milestone_title}</div>
                  <div className="text-xs opacity-80">
                    {t('page.heldSince', { date: formatDate(p.created_at, 'short') })}
                    {p.failure_reason ? ` — ${p.failure_reason}` : ''}
                  </div>
                </div>
                <span className="font-semibold">{fmt(p.amount)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {wallet && wallet.pending_referral_payouts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('page.pendingReferralTitle')}</CardTitle>
            <CardDescription>{t('page.pendingReferralDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {wallet.pending_referral_payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
              >
                <span>{p.milestone_title}</span>
                <span className="text-warning font-semibold">{fmt(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EmployerPaymentsView() {
  const { t } = useTranslation('wallet');
  const [data, setData] = useState<EmployerPaymentsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getEmployerPayments();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(parseApiError(err)?.message ?? t('page.paymentsError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = (() => {
    const byKey = new Map<string, { count: number; amount: number }>();
    for (const t of data?.totals ?? []) {
      byKey.set(`${t.type}:${t.status}`, {
        count: t.count,
        amount: Number(t.amount),
      });
    }
    const get = (k: string) => byKey.get(k) ?? { count: 0, amount: 0 };
    return {
      chargesPaid: get('CHARGE:PAID'),
      chargesPending: get('CHARGE:PENDING'),
      chargesFailed: get('CHARGE:FAILED'),
      refundsPaid: get('REFUND:PAID'),
      cisRefund: get('CIS_EMPLOYER_REMIT:PAID'),
    };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-fg-muted" />
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('page.title')}</h1>
      </div>
      <p className="text-sm text-fg-muted">{t('page.employerSubtitle')}</p>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label={t('page.summaryCharged')} {...totals.chargesPaid} />
        <SummaryCard label={t('page.summaryPending')} {...totals.chargesPending} />
        <SummaryCard label={t('page.summaryFailed')} {...totals.chargesFailed} tone="danger" />
        <SummaryCard label={t('page.summaryRefunded')} {...totals.refundsPaid} />
        <SummaryCard
          label={t('page.summaryCisRefund')}
          {...totals.cisRefund}
          hint={t('page.summaryCisRefundHint')}
        />
      </div>

      {data && data.open_disputes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-4 w-4" />
              {t('page.openDisputes')}
            </CardTitle>
            <CardDescription>{t('page.openDisputesDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.open_disputes.map((d) => (
              <Link
                key={d.id}
                to={`/contracts/${d.milestone.contract_id}/escrow`}
                className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-warning hover:bg-warning-subtle/80"
              >
                <div>
                  <div className="font-medium">{d.milestone.title}</div>
                  <div className="text-xs opacity-80">
                    {t('page.disputeFiledBy', {
                      role: d.filed_by_role.toLowerCase(),
                      date: formatDate(d.created_at, 'short'),
                      status: d.status,
                    })}
                  </div>
                </div>
                <span className="font-semibold">{fmt(d.milestone.amount)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('page.ledger')}</CardTitle>
          <CardDescription>{t('page.ledgerDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-fg-muted">{t('page.loading')}</p>
          ) : !data || data.payments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={t('page.noPaymentsTitle')}
              description={t('page.noPaymentsDesc')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('page.thType')}</TableHead>
                  <TableHead>{t('page.thStatus')}</TableHead>
                  <TableHead>{t('page.thMilestone')}</TableHead>
                  <TableHead>{t('page.thWorker')}</TableHead>
                  <TableHead>{t('page.thDate')}</TableHead>
                  <TableHead className="text-right">{t('page.thAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  count,
  tone,
  hint,
}: {
  label: string;
  amount: number;
  count: number;
  tone?: 'danger';
  hint?: string;
}) {
  const { t } = useTranslation('wallet');
  const toneCls = tone === 'danger' ? 'text-danger' : 'text-fg';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${toneCls}`}>
          {fmt(String(amount))}
        </div>
        <div className="text-xs text-fg-muted">
          {hint ?? t('page.items', { count })}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment: p }: { payment: EmployerPaymentRow }) {
  const { t } = useTranslation('wallet');
  const statusVariant: 'success' | 'warning' | 'danger' | 'secondary' =
    p.status === 'PAID'
      ? 'success'
      : p.status === 'PENDING'
        ? 'warning'
        : p.status === 'FAILED'
          ? 'danger'
          : 'secondary';
  const isCisRefund = p.type === 'CIS_EMPLOYER_REMIT';
  const isMoneyBack = p.type === 'REFUND' || isCisRefund;
  return (
    <TableRow>
      <TableCell>
        <Badge variant={isMoneyBack ? 'info' : 'default'}>
          {isCisRefund ? t('page.cisRefundLabel') : p.type}
        </Badge>
        {isCisRefund ? (
          <div className="mt-1 text-[11px] text-fg-muted">
            {t('page.cisRefundHint')}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant}>{p.status}</Badge>
        {p.failure_reason ? (
          <div className="mt-1 text-xs text-danger">{p.failure_reason}</div>
        ) : null}
      </TableCell>
      <TableCell>
        <Link
          to={`/contracts/${p.milestone.contract_id}/escrow`}
          className="font-medium hover:underline"
        >
          {p.milestone.title}
        </Link>
      </TableCell>
      <TableCell className="text-fg-muted">{p.worker.display_name}</TableCell>
      <TableCell className="text-fg-muted">
        {formatDate(p.created_at, 'short')}
      </TableCell>
      <TableCell
        className={`text-right font-semibold ${isMoneyBack ? 'text-success' : 'text-danger'}`}
      >
        {isMoneyBack ? '+' : '−'}
        {fmt(p.amount)}
      </TableCell>
    </TableRow>
  );
}
