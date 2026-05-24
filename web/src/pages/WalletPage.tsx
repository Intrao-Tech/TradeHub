import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, ScaleIcon, Wallet } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
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

const fmt = (s: string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(s));

export default function WalletPage() {
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
        setError(parsed?.message ?? 'Could not load wallet status.');
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
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      </div>
      <p className="text-sm text-fg-muted">
        Stripe Connect setup and every payout to your account.
      </p>

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
          We're confirming your payout setup with Stripe. This can take a few
          seconds — refresh in a moment if the status doesn't update.
        </div>
      ) : null}

      <OnboardingBanner status={status} onRefresh={() => void refresh()} />

      <Card>
        <CardHeader>
          <CardTitle>Active escrow</CardTitle>
          <CardDescription>
            Milestones currently in escrow waiting for your work or for the employer's approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!wallet || wallet.active_escrow.length === 0 ? (
            <p className="text-fg-muted">Nothing in flight.</p>
          ) : (
            wallet.active_escrow.map((m) => (
              <Link
                key={m.milestone_id}
                to={`/escrow/${m.contract_id}`}
                className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2 hover:bg-subtle"
              >
                <span className="font-medium text-fg">{m.title}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={m.status === 'SUBMITTED' ? 'warning' : 'info'}>
                    {m.status === 'SUBMITTED' ? 'Awaiting review' : 'In escrow'}
                  </Badge>
                  <span className="text-fg-muted">{fmt(m.expected_payout)}</span>
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Released history</CardTitle>
          <CardDescription>Funds released to your account via Stripe Connect.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!wallet || wallet.released_history.length === 0 ? (
            <p className="text-fg-muted">No released funds yet.</p>
          ) : (
            wallet.released_history.map((m) => (
              <div
                key={m.milestone_id}
                className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
              >
                <div>
                  <div className="font-medium text-fg">{m.title}</div>
                  {m.released_at ? (
                    <div className="text-xs text-fg-muted">
                      Released {new Date(m.released_at).toLocaleDateString()}
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
            <CardTitle>Failed payouts</CardTitle>
            <CardDescription>
              These payouts couldn't go through. Fix your Stripe Connect setup
              above, then click "Retry payout" on each milestone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {wallet.failed_transfers.map((m) => (
              <Link
                key={m.milestone_id}
                to={`/escrow/${m.contract_id}`}
                className="flex items-center justify-between rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-danger"
              >
                <span className="font-medium">{m.title}</span>
                <span>{fmt(m.amount)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {wallet && wallet.pending_worker_payouts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Held until you set up Stripe</CardTitle>
            <CardDescription>
              The employer has released these milestones, but we couldn't pay
              you yet because your payout account isn't connected. Funds are
              safely held on the platform — complete onboarding above and they
              sweep to you automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {wallet.pending_worker_payouts.map((p) => (
              <Link
                key={p.id}
                to={`/escrow/${p.contract_id}`}
                className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-warning hover:bg-warning-subtle/80"
              >
                <div>
                  <div className="font-medium">{p.milestone_title}</div>
                  <div className="text-xs opacity-80">
                    Held since {new Date(p.created_at).toLocaleDateString()}
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
            <CardTitle>Pending referral payouts</CardTitle>
            <CardDescription>
              Referral commission accumulated while your payouts were not yet
              enabled. Once you complete onboarding, these are paid out
              automatically on the next webhook.
            </CardDescription>
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
          setError(parseApiError(err)?.message ?? 'Could not load payments.');
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
    };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-fg-muted" />
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      </div>
      <p className="text-sm text-fg-muted">
        Funds you've charged, refunds you've issued, and any open disputes on
        your milestones.
      </p>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Charged" {...totals.chargesPaid} />
        <SummaryCard label="Pending" {...totals.chargesPending} />
        <SummaryCard label="Failed" {...totals.chargesFailed} tone="danger" />
        <SummaryCard label="Refunded" {...totals.refundsPaid} />
      </div>

      {data && data.open_disputes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-4 w-4" />
              Open disputes
            </CardTitle>
            <CardDescription>
              Milestones currently under dispute. Click through to respond or
              follow the resolution proposal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.open_disputes.map((d) => (
              <Link
                key={d.id}
                to={`/escrow/${d.milestone.contract_id}`}
                className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-warning hover:bg-warning-subtle/80"
              >
                <div>
                  <div className="font-medium">{d.milestone.title}</div>
                  <div className="text-xs opacity-80">
                    Filed by {d.filed_by_role.toLowerCase()} on{' '}
                    {new Date(d.created_at).toLocaleDateString()} — {d.status}
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
          <CardTitle>Ledger</CardTitle>
          <CardDescription>
            Every charge and refund on your account, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : !data || data.payments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payments yet"
              description="Fund your first milestone and it will show up here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
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
}: {
  label: string;
  amount: number;
  count: number;
  tone?: 'danger';
}) {
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
          {count} {count === 1 ? 'item' : 'items'}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment: p }: { payment: EmployerPaymentRow }) {
  const statusVariant: 'success' | 'warning' | 'danger' | 'secondary' =
    p.status === 'PAID'
      ? 'success'
      : p.status === 'PENDING'
        ? 'warning'
        : p.status === 'FAILED'
          ? 'danger'
          : 'secondary';
  return (
    <TableRow>
      <TableCell>
        <Badge variant={p.type === 'REFUND' ? 'info' : 'default'}>
          {p.type}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant}>{p.status}</Badge>
        {p.failure_reason ? (
          <div className="mt-1 text-xs text-danger">{p.failure_reason}</div>
        ) : null}
      </TableCell>
      <TableCell>
        <Link
          to={`/escrow/${p.milestone.contract_id}`}
          className="font-medium hover:underline"
        >
          {p.milestone.title}
        </Link>
      </TableCell>
      <TableCell className="text-fg-muted">{p.worker.display_name}</TableCell>
      <TableCell className="text-fg-muted">
        {new Date(p.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell
        className={`text-right font-semibold ${p.type === 'REFUND' ? 'text-warning' : ''}`}
      >
        {p.type === 'REFUND' ? '−' : ''}
        {fmt(p.amount)}
      </TableCell>
    </TableRow>
  );
}
