import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  account: { id: number; email: string };
};

type Props = { onLogin: () => void };

export default function InternalLoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.access_token, data.refresh_token);
      onLogin();
      navigate('/internal/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="border-t-4 border-t-danger">
        <CardHeader>
          <CardTitle>Staff login</CardTitle>
          <CardDescription>Staff &amp; admin access only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
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
