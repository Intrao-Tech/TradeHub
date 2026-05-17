import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
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
  OnboardingBanner,
  type OnboardingStatus,
} from '../components/wallet/OnboardingBanner';
import { getWallet, type WalletData } from '../components/escrow';

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
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="text-sm text-fg-muted">
          Wallet is for tradespeople receiving payouts via Stripe Connect.
          As an employer, you don't need to set up anything here — when you
          fund a milestone, Stripe Checkout collects your card directly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-fg-muted" />
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
      </div>

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
