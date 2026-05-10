import { useEffect, useState } from 'react';
import { Copy, Inbox as InboxIcon, RefreshCw } from 'lucide-react';
import { parseApiError } from '../api';
import {
  getOwnReferralCode,
  getAccountReferralStats,
  getProjectShareStats,
  getIncomingAttribution,
  getReferralPendingPayouts,
  retryReferralPendingPayouts,
  type AccountReferralStats,
  type ProjectShare,
} from '../components/escrow';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const fmtGbp = (s: string | null | undefined) => {
  const n = Number(s ?? 0);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number.isFinite(n) ? n : 0);
};

export default function ReferralsPage() {
  const [error, setError] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [stats, setStats] = useState<AccountReferralStats | null>(null);
  const [shares, setShares] = useState<ProjectShare | null>(null);
  const [incoming, setIncoming] = useState<{
    referrer: { account_id: string; display_name: string | null } | null;
    total_paid_gbp: string;
  } | null>(null);
  const [pending, setPending] = useState<
    Array<{
      id: string;
      milestone_id: string;
      contract_id: string | null;
      type: string;
      amount: string;
      status: string;
      created_at: string;
    }>
  >([]);
  const [copied, setCopied] = useState(false);

  async function loadAll() {
    setError('');
    try {
      const [c, s, p, i, pp] = await Promise.all([
        getOwnReferralCode(),
        getAccountReferralStats(),
        getProjectShareStats(),
        getIncomingAttribution(),
        getReferralPendingPayouts(),
      ]);
      setCode(c.code);
      setLink(c.link);
      setStats(s);
      setShares(p);
      setIncoming(i);
      setPending(pp);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Failed to load referrals');
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-fg-muted">
          Earn commission when people you refer sign up, apply, or get hired.
          Two referral types: <strong>Account</strong> (signup link, paid as
          % of platform fee on every contract) and <strong>Project</strong>{' '}
          (per-job or per-worker link, paid as % of agreed amount).
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {/* 1. Your code */}
      <Card>
        <CardHeader>
          <CardTitle>Your referral code</CardTitle>
          <CardDescription>
            Share this link anywhere — when someone signs up via it, you'll
            earn % of platform fees on their contracts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {code ? (
            <>
              <div className="font-mono text-lg font-semibold tracking-widest">
                {code}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border-default bg-subtle px-3 py-2 text-xs">
                  {link}
                </code>
                <Button type="button" variant="outline" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-muted">Loading…</p>
          )}
        </CardContent>
      </Card>

      {/* 2. Account referral stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Account referrals</CardTitle>
              <CardDescription>
                People who signed up via your code.
                {stats?.window_months
                  ? ` Earnings window: ${stats.window_months} months from signup.`
                  : ' Earnings window: lifetime.'}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadAll()}>
              <RefreshCw />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border-default bg-raised px-3 py-2">
                  <p className="text-xs text-fg-muted">Lifetime signups</p>
                  <p className="text-lg font-semibold">{stats.lifetime_signups}</p>
                </div>
                <div className="rounded-md border border-border-default bg-raised px-3 py-2">
                  <p className="text-xs text-fg-muted">Total earned</p>
                  <p className="text-lg font-semibold">
                    {fmtGbp(stats.total_earned_gbp)}
                  </p>
                </div>
              </div>
              {stats.items.length === 0 ? (
                <EmptyState
                  icon={InboxIcon}
                  title="No signups yet"
                  description="Share your link to start earning."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {stats.items.map((it) => (
                    <li
                      key={it.account_id}
                      className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
                    >
                      <span>
                        <strong>{it.display_name ?? it.email}</strong>{' '}
                        <span className="text-xs text-fg-muted">
                          ({it.email})
                        </span>
                      </span>
                      <span className="text-xs text-fg-muted">
                        {it.referred_at
                          ? new Date(it.referred_at).toLocaleDateString()
                          : '—'}
                        {it.window_ends_at
                          ? ` · window ends ${new Date(
                              it.window_ends_at,
                            ).toLocaleDateString()}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* 3. Job shares (W→W) — project shares from JobApplication */}
      <Card>
        <CardHeader>
          <CardTitle>Job shares (W→W)</CardTitle>
          <CardDescription>
            Workers you referred to specific jobs. To share, open any job and
            click "Share for commission".
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!shares?.applications.length ? (
            <p className="text-sm text-fg-muted">No job shares yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {shares.applications.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
                >
                  <span>
                    {a.job_post?.title ?? `Job #${a.id}`}
                  </span>
                  <Badge variant="info">{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4. Worker shares (E→E) — project shares from Contract attribution */}
      <Card>
        <CardHeader>
          <CardTitle>Worker shares (E→E)</CardTitle>
          <CardDescription>
            Workers you recommended to other employers. To share, open a
            worker profile (employer view) and click "Share with another
            employer".
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!shares?.contracts.length ? (
            <p className="text-sm text-fg-muted">No worker shares yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {shares.contracts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
                >
                  <span>
                    {c.collaboration.worker.client_profile.display_name} ·{' '}
                    {c.project_type ?? 'Untitled'}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="info">{c.status}</Badge>
                    {c.agreed_amount ? (
                      <span className="text-fg-muted">
                        {fmtGbp(c.agreed_amount)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 5. Incoming attribution */}
      <Card>
        <CardHeader>
          <CardTitle>Incoming attribution</CardTitle>
          <CardDescription>
            Who referred you, and what they've earned from your contracts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {incoming?.referrer ? (
            <>
              <p>
                Referred by:{' '}
                <strong>
                  {incoming.referrer.display_name ?? 'Unknown'}
                </strong>
              </p>
              <p className="text-fg-muted">
                Total earned from your activity to date:{' '}
                {fmtGbp(incoming.total_paid_gbp)}
              </p>
            </>
          ) : (
            <p className="text-fg-muted">
              You signed up directly — no referrer.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 6. Pending payouts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending payouts</CardTitle>
              <CardDescription>
                Commissions accumulated while your Stripe Connect was not yet
                ready. The webhook normally fires these automatically when
                you finish onboarding — use Retry if anything looks stuck.
              </CardDescription>
            </div>
            {pending.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await retryReferralPendingPayouts();
                    toast.success(
                      `Retry: ${r.paid} paid, ${r.failed} failed`,
                    );
                    void loadAll();
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : 'Try again in a moment.',
                    );
                  }
                }}
              >
                Retry payouts
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No pending payouts.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-border-default bg-raised px-3 py-2"
                >
                  <span>
                    {p.type} · milestone #{p.milestone_id}
                  </span>
                  <span>
                    <Badge variant="warning">{p.status}</Badge>{' '}
                    <strong>{fmtGbp(p.amount)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
