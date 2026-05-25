import { useState } from 'react';
import type { FormEvent } from 'react';
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
          title: 'Sign in failed',
          message: 'Email or password is incorrect.',
        });
      } else if (parsed?.code === 'ACCOUNT_DEACTIVATED') {
        setError({
          title: 'Account deactivated',
          message: 'This staff account has been deactivated.',
        });
      } else if (parsed?.code === 'INVITE_EXPIRED') {
        setError({
          title: 'Invite expired',
          message:
            'This invite link is older than 24 hours. Ask an admin to send you a fresh invite.',
        });
      } else if (parsed?.status === 404) {
        setError({
          title: 'Wrong host',
          message:
            'Staff sign-in is only available on the internal subdomain. Open this page on internal.tradehub.co.uk (or internal.localhost in dev).',
        });
      } else {
        setError({
          title: 'Sign in failed',
          message: parsed?.message ?? 'Something went wrong. Try again.',
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
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>
            Restricted area — TradeHub staff and moderators only. This entry
            point does not support Google sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <AuthBanner variant="danger" title={error.title}>
              {error.message}
            </AuthBanner>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
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
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <p className="text-xs text-fg-muted">
                Forgot your password? Ask an admin to reset it for you — staff
                accounts cannot self-reset.
              </p>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Staff sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
