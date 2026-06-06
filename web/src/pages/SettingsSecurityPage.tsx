import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, clearTokens, parseApiError } from '../api';
import { AuthBanner } from '@/components/AuthBanner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordRules } from '@/components/PasswordRules';
import {
  checkPassword,
  describeReason,
  MIN_LENGTH,
} from '@/lib/password-policy';

export default function SettingsSecurityPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
        <p className="text-sm text-fg-muted">{t('subtitle')}</p>
      </div>

      <ChangePasswordCard />
      <LogoutAllCard navigate={navigate} />
    </div>
  );
}

// ── Change password ─────────────────────────────────────────────────

function ChangePasswordCard() {
  const { t } = useTranslation(['settings', 'auth']);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    { ok: true } | { ok: false; title: string; message: string } | null
  >(null);

  const policy = useMemo(() => checkPassword(next), [next]);
  const passwordsMatch = next.length > 0 && next === confirm;
  const canSubmit =
    current.length > 0 && policy.ok && passwordsMatch && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!policy.ok) {
      setResult({
        ok: false,
        title: t('settings:changePassword.rejectedTitle'),
        message: policy.reasons.map((r) => describeReason(r, t)).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setResult({
        ok: false,
        title: t('settings:changePassword.mismatchTitle'),
        message: t('settings:changePassword.mismatchMsg'),
      });
      return;
    }
    setSubmitting(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: current,
          new_password: next,
          refresh_token: localStorage.getItem('refresh_token') ?? '',
        }),
      });
      setResult({ ok: true });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'INVALID_CURRENT_PASSWORD') {
        setResult({
          ok: false,
          title: t('settings:changePassword.wrongCurrentTitle'),
          message: t('settings:changePassword.wrongCurrentMsg'),
        });
      } else if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setResult({
          ok: false,
          title: t('settings:changePassword.rejectedTitle'),
          message:
            reasons.map((r) => describeReason(r as never, t)).join(' ') ||
            (parsed.message ?? t('settings:changePassword.pickStronger')),
        });
      } else if (parsed?.code === 'SAME_PASSWORD') {
        setResult({
          ok: false,
          title: t('settings:changePassword.sameTitle'),
          message: t('settings:changePassword.sameMsg'),
        });
      } else if (parsed?.code === 'NO_PASSWORD_SET') {
        setResult({
          ok: false,
          title: t('settings:changePassword.googleTitle'),
          message: parsed.message ?? t('settings:changePassword.googleMsg'),
        });
      } else {
        setResult({
          ok: false,
          title: t('settings:changePassword.failTitle'),
          message: parsed?.message ?? t('settings:changePassword.failMsg'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings:changePassword.title')}</CardTitle>
        <CardDescription>{t('settings:changePassword.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && 'ok' in result && result.ok ? (
          <AuthBanner
            variant="success"
            title={t('settings:changePassword.successTitle')}
          >
            {t('settings:changePassword.successBody')}
          </AuthBanner>
        ) : null}
        {result && !result.ok ? (
          <AuthBanner variant="danger" title={result.title}>
            {result.message}
          </AuthBanner>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="cp-current">{t('settings:changePassword.currentLabel')}</Label>
            <Input
              id="cp-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="cp-new">{t('settings:changePassword.newLabel')}</Label>
            <Input
              id="cp-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              placeholder={t('auth:shared.atLeastChars', { count: MIN_LENGTH })}
            />
            <PasswordRules password={next} dirty={next.length > 0} />
          </div>
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="cp-confirm">{t('settings:changePassword.confirmLabel')}</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm.length > 0 && !passwordsMatch ? (
              <p className="text-xs text-warning">
                {t('settings:changePassword.mismatchInline')}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={!canSubmit}>
            {submitting
              ? t('settings:changePassword.saving')
              : t('settings:changePassword.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Logout all ──────────────────────────────────────────────────────

function LogoutAllCard({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { t } = useTranslation('settings');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; revoked: number }
    | { ok: false; message: string }
    | null
  >(null);

  async function handleLogoutAll() {
    setBusy(true);
    setResult(null);
    try {
      const data = await api<{ revoked: number }>('/auth/logout-all', {
        method: 'POST',
      });
      setResult({ ok: true, revoked: data.revoked });
      clearTokens();
      window.dispatchEvent(new Event('auth-changed'));
      setTimeout(
        () => navigate('/login?reason=logged_out', { replace: true }),
        1200,
      );
    } catch (err) {
      const parsed = parseApiError(err);
      setResult({
        ok: false,
        message: parsed?.message ?? t('logoutAll.failMsg'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('logoutAll.title')}</CardTitle>
        <CardDescription>{t('logoutAll.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result?.ok ? (
          <AuthBanner variant="success" title={t('logoutAll.revokedTitle')}>
            {t('logoutAll.revokedBody', { count: result.revoked })}
          </AuthBanner>
        ) : null}
        {result && !result.ok ? (
          <AuthBanner variant="danger" title={t('logoutAll.failTitle')}>
            {result.message}
          </AuthBanner>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={handleLogoutAll}
          disabled={busy}
        >
          {busy ? t('logoutAll.busy') : t('logoutAll.button')}
        </Button>
      </CardContent>
    </Card>
  );
}
