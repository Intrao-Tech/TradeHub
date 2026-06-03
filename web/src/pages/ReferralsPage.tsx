import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('referrals');
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
      const parsed = parseApiError(err);
      // 429 rate-limit errors come back as a raw English "ThrottlerException"
      // message — show a localized one instead. Otherwise prefer the API
      // message, then the generic translated fallback.
      const msg =
        parsed?.status === 429
          ? t('tooManyRequests')
          : (parsed?.message ?? t('loadError'));
      setError(msg);
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
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
        <p className="text-sm text-fg-muted">{t('desc')}</p>
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
          <CardTitle>{t('codeTitle')}</CardTitle>
          <CardDescription>{t('codeDesc')}</CardDescription>
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
                  {copied ? t('copied') : t('copy')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-muted">{t('loading')}</p>
          )}
        </CardContent>
      </Card>

      {/* 2. Account referral stats */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>{t('accountTitle')}</CardTitle>
              <CardDescription>{t('accountDesc')}</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadAll()} className="self-start sm:self-auto">
              <RefreshCw />
              {t('refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border-default bg-raised px-3 py-2">
                  <p className="text-xs text-fg-muted">{t('lifetimeSignups')}</p>
                  <p className="text-lg font-semibold">{stats.lifetime_signups}</p>
                </div>
                <div className="rounded-md border border-border-default bg-raised px-3 py-2">
                  <p className="text-xs text-fg-muted">{t('totalEarned')}</p>
                  <p className="text-lg font-semibold">
                    {fmtGbp(stats.total_earned_gbp)}
                  </p>
                </div>
              </div>
              {stats.items.length === 0 ? (
                <EmptyState
                  icon={InboxIcon}
                  title={t('noSignups')}
                  description={t('noSignupsDesc')}
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
          <CardTitle>{t('jobSharesTitle')}</CardTitle>
          <CardDescription>{t('jobSharesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!shares?.applications.length ? (
            <p className="text-sm text-fg-muted">{t('noJobShares')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {shares.applications.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 truncate">
                    {a.job_post?.title ?? t('jobFallback', { id: a.id })}
                  </span>
                  <Badge variant="info" className="self-start sm:self-auto">
                    {t(`common:appStatus.${a.status.toLowerCase()}`, { defaultValue: a.status })}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4. Worker shares (E→E) — project shares from Contract attribution */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workerSharesTitle')}</CardTitle>
          <CardDescription>{t('workerSharesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!shares?.contracts.length ? (
            <p className="text-sm text-fg-muted">{t('noWorkerShares')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {shares.contracts.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-words">
                    {c.collaboration.worker.client_profile.display_name} ·{' '}
                    {c.project_type ?? t('untitled')}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">
                      {t(`collaborations:contractStatus.${c.status.toLowerCase()}`, { defaultValue: c.status })}
                    </Badge>
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
          <CardTitle>{t('incomingTitle')}</CardTitle>
          <CardDescription>{t('incomingDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {incoming?.referrer ? (
            <>
              <p>
                {t('referredBy')}{' '}
                <strong>
                  {incoming.referrer.display_name ?? t('unknown')}
                </strong>
              </p>
              <p className="text-fg-muted">
                {t('totalFromActivity')} {fmtGbp(incoming.total_paid_gbp)}
              </p>
            </>
          ) : (
            <p className="text-fg-muted">{t('directSignup')}</p>
          )}
        </CardContent>
      </Card>

      {/* 6. Referral commission payments */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('commissionTitle')}</CardTitle>
            <CardDescription>{t('commissionDesc')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('noCommission')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 break-words">
                    {t('milestoneLine', { type: p.type, id: p.milestone_id })}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={p.status === 'PAID' ? 'success' : 'warning'}
                    >
                      {p.status === 'PAID'
                        ? t('statusPaid')
                        : p.status === 'PENDING'
                          ? t('statusPending')
                          : p.status}
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
