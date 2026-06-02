import { useEffect, useState } from 'react';
import { Copy, Inbox as InboxIcon, RefreshCw } from 'lucide-react';
import { parseApiError } from '../api';
import { formatMoney, formatDate } from '@/lib/format';
import {
  getOwnReferralCode,
  getAccountReferralStats,
  getProjectShareStats,
  getIncomingAttribution,
  getReferralPayments,
  type AccountReferralStats,
  type ProjectShare,
  type ReferralPayment,
} from '../components/escrow';
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
  return formatMoney(Number.isFinite(n) ? n : 0);
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
  const [pending, setPending] = useState<ReferralPayment[]>([]);
  const [copied, setCopied] = useState(false);

  async function loadAll() {
    setError('');
    try {
      const [c, s, p, i, pp] = await Promise.all([
        getOwnReferralCode(),
        getAccountReferralStats(),
        getProjectShareStats(),
        getIncomingAttribution(),
        getReferralPayments(),
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
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Referrals</h1>
        <p className="text-sm text-fg-muted">
          Earn commission when people you refer sign up, apply, or get hired.
          Two referral types: <strong>Account</strong> (signup link, paid as
          % of platform fee on every milestone of their first contract) and{' '}
          <strong>Project</strong> (per-job or per-worker link, paid as % of
          agreed amount).
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
            earn % of the platform fee on their first contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {code ? (
            <>
              <div className="font-mono text-lg font-semibold tracking-widest">
                {code}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border-default bg-subtle px-3 py-2 text-xs">
                  {link}
                </code>
                <Button type="button" variant="outline" onClick={copyLink} className="sm:w-auto">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Account referrals</CardTitle>
              <CardDescription>
                People who signed up via your code. You earn a share of the
                platform fee on every milestone of their first contract.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadAll()} className="self-start sm:self-auto">
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
                      className="flex flex-col gap-1 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 break-words">
                        <strong>{it.display_name ?? it.email}</strong>{' '}
                        <span className="text-xs text-fg-muted">
                          ({it.email})
                        </span>
                      </span>
                      <span className="text-xs text-fg-muted">
                        {it.referred_at
                          ? formatDate(it.referred_at, 'short')
                          : '—'}
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
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 truncate">
                    {a.job_post?.title ?? `Job #${a.id}`}
                  </span>
                  <Badge variant="info" className="self-start sm:self-auto">{a.status}</Badge>
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
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-words">
                    {c.collaboration.worker.client_profile.display_name} ·{' '}
                    {c.project_type ?? 'Untitled'}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
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

      {/* 6. Referral commission payments */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Commission payments</CardTitle>
            <CardDescription>
              Referral commissions earned on milestone releases. Held
              commissions (PENDING) are paid out automatically once you
              finish Stripe Connect onboarding.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-fg-muted">No commission payments yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-words">
                    {p.type} · milestone #{p.milestone_id}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={p.status === 'PAID' ? 'success' : 'warning'}
                    >
                      {p.status}
                    </Badge>{' '}
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
