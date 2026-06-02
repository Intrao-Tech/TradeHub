import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      // Always show the same success copy regardless of whether the email exists.
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('forgot.genericError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('forgot.title')}</CardTitle>
          <CardDescription>{t('forgot.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <>
              <AuthBanner variant="success" title={t('forgot.successTitle')}>
                {t('forgot.successBody')}
              </AuthBanner>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">{t('shared.backToSignIn')}</Link>
              </Button>
            </>
          ) : (
            <>
              {error ? (
                <AuthBanner variant="danger" title={t('forgot.errorTitle')}>
                  {error}
                </AuthBanner>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{t('shared.email')}</Label>
                  <Input
                    id="forgot-email"
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
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? t('forgot.sending') : t('forgot.sendResetLink')}
                </Button>
              </form>
              <p className="text-center text-sm text-fg-muted">
                {t('forgot.rememberedIt')}{' '}
                <Link
                  to="/login"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t('shared.signIn')}
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
