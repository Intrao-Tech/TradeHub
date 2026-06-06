import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, parseApiError, setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { AuthBanner } from '@/components/AuthBanner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  postAuthRedirect,
  type AccountSummary,
} from '@/lib/auth-routing';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  account: AccountSummary;
};

type Props = { onLogin: () => void };

export default function InternalLoginPage({ onLogin }: Props) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.access_token, data.refresh_token);
      onLogin();
      navigate(postAuthRedirect(data.account, null), { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'INVALID_CREDENTIALS') {
        setError({
          title: t('staffLogin.error.invalidTitle'),
          message: t('staffLogin.error.invalidBody'),
        });
      } else if (parsed?.code === 'ACCOUNT_DEACTIVATED') {
        setError({
          title: t('staffLogin.error.deactivatedTitle'),
          message: t('staffLogin.error.deactivatedBody'),
        });
      } else if (parsed?.code === 'INVITE_EXPIRED') {
        setError({
          title: t('staffLogin.error.inviteExpiredTitle'),
          message: t('staffLogin.error.inviteExpiredBody'),
        });
      } else if (parsed?.status === 404) {
        setError({
          title: t('staffLogin.error.wrongHostTitle'),
          message: t('staffLogin.error.wrongHostBody'),
        });
      } else {
        setError({
          title: t('staffLogin.error.invalidTitle'),
          message: parsed?.message ?? t('staffLogin.error.genericBody'),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="border-t-4 border-t-danger">
        <CardHeader>
          <CardTitle>{t('staffLogin.title')}</CardTitle>
          <CardDescription>{t('staffLogin.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <AuthBanner variant="danger" title={error.title}>
              {error.message}
            </AuthBanner>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-email">{t('shared.email')}</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tradehub.co.uk"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">{t('login.passwordLabel')}</Label>
              <Input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <p className="text-xs text-fg-muted">{t('staffLogin.forgotHint')}</p>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? t('staffLogin.signingIn') : t('staffLogin.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
