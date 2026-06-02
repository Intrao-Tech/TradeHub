import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '../api';
import { AuthShell } from '@/components/AppShell';
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

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const policy = useMemo(() => checkPassword(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit = policy.ok && passwordsMatch && token && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError({ title: t('reset.error.resetFailed'), message: t('reset.error.noToken') });
      return;
    }
    if (!policy.ok) {
      setError({
        title: t('reset.error.passwordRejected'),
        message: policy.reasons.map(describeReason).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setError({ title: t('reset.error.mismatchTitle'), message: t('reset.error.mismatchBody') });
      return;
    }

    setSubmitting(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      navigate('/login?reason=password_changed', { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'TOKEN_INVALID') {
        setError({
          title: t('reset.error.linkExpiredTitle'),
          message: t('reset.error.linkExpiredBody'),
        });
      } else if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setError({
          title: t('reset.error.passwordRejected'),
          message:
            reasons.map((r) => describeReason(r as never)).join(' ') ||
            (parsed.message ?? t('reset.error.pickStronger')),
        });
      } else {
        setError({
          title: t('reset.error.resetFailed'),
          message: parsed?.message ?? t('reset.error.generic'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('reset.title')}</CardTitle>
          <CardDescription>{t('reset.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <>
              <AuthBanner variant="danger" title={t('reset.missingTokenTitle')}>
                {t('reset.missingTokenBody')}
              </AuthBanner>
              <Button asChild variant="outline" className="w-full">
                <Link to="/forgot-password">{t('reset.requestNewLink')}</Link>
              </Button>
            </>
          ) : (
            <>
              {error ? (
                <AuthBanner variant="danger" title={error.title}>
                  {error.message}
                </AuthBanner>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-password">{t('reset.newPasswordLabel')}</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('shared.atLeastChars', { count: MIN_LENGTH })}
                    autoComplete="new-password"
                    required
                    minLength={MIN_LENGTH}
                  />
                  <PasswordRules password={password} dirty={password.length > 0} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">{t('reset.confirmLabel')}</Label>
                  <Input
                    id="reset-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  {confirm.length > 0 && !passwordsMatch ? (
                    <p className="text-xs text-warning">{t('reset.passwordsDontMatch')}</p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!canSubmit}
                >
                  {submitting ? t('reset.saving') : t('reset.save')}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
