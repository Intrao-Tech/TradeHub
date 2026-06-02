import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { api } from '../api';
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

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyEmailPage() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const queryEmail = searchParams.get('email') ?? '';
  const [email, setEmail] = useState(queryEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api('/auth/verify-email/send', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verify.errorBody'));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('verify.title')}</CardTitle>
          <CardDescription>
            {queryEmail ? (
              <Trans
                i18nKey="verify.descriptionWithEmail"
                ns="auth"
                values={{ email: queryEmail }}
                components={[<span className="font-medium text-fg" />]}
              />
            ) : (
              t('verify.descriptionPlain')
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthBanner variant="info" title={t('verify.whyTitle')}>
            {t('verify.whyBody')}
          </AuthBanner>

          {sent ? (
            <AuthBanner variant="success" title={t('verify.sentTitle')}>
              {t('verify.sentBody')}
            </AuthBanner>
          ) : null}

          {error ? (
            <AuthBanner variant="danger" title={t('verify.errorTitle')}>
              {error}
            </AuthBanner>
          ) : null}

          <form onSubmit={handleResend} className="space-y-3">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="resend-email">{t('verify.resendTo')}</Label>
              <Input
                id="resend-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <Button
              type="submit"
              size="lg"
              variant="outline"
              className="w-full"
              disabled={sending || cooldown > 0}
            >
              {sending
                ? t('verify.sending')
                : cooldown > 0
                  ? t('verify.tryAgainIn', { count: cooldown })
                  : t('verify.resendConfirmation')}
            </Button>
          </form>

          <p className="text-center text-sm text-fg-muted">
            {t('verify.alreadyConfirmed')}{' '}
            <Link
              to="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('shared.signIn')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
