import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
      setError({ title: 'Reset failed', message: 'No reset token in this link.' });
      return;
    }
    if (!policy.ok) {
      setError({
        title: 'Password rejected',
        message: policy.reasons.map(describeReason).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setError({ title: 'Password mismatch', message: 'The two passwords do not match.' });
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
          title: 'Link expired',
          message:
            'This reset link is invalid or has already been used. Request a new one.',
        });
      } else if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setError({
          title: 'Password rejected',
          message:
            reasons.map((r) => describeReason(r as never)).join(' ') ||
            (parsed.message ?? 'Pick a stronger password.'),
        });
      } else {
        setError({
          title: 'Reset failed',
          message: parsed?.message ?? 'Something went wrong. Try again.',
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
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Pick a password you don't use anywhere else. After saving, all of
            your active TradeHub sessions will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <>
              <AuthBanner variant="danger" title="Missing token">
                This URL doesn't have a reset token. Request a new reset email.
              </AuthBanner>
              <Button asChild variant="outline" className="w-full">
                <Link to="/forgot-password">Request new link</Link>
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
                <div className="flex flex-col gap-2.5">
                  <Label htmlFor="reset-password">New password</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`At least ${MIN_LENGTH} characters`}
                    autoComplete="new-password"
                    required
                    minLength={MIN_LENGTH}
                  />
                  <PasswordRules password={password} dirty={password.length > 0} />
                </div>
                <div className="flex flex-col gap-2.5">
                  <Label htmlFor="reset-confirm">Confirm password</Label>
                  <Input
                    id="reset-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  {confirm.length > 0 && !passwordsMatch ? (
                    <p className="text-xs text-warning">Passwords don't match.</p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!canSubmit}
                >
                  {submitting ? 'Saving…' : 'Save new password'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
