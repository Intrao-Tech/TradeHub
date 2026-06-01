import { useMemo, useState } from 'react';
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
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Security</h1>
        <p className="text-sm text-fg-muted">
          Manage your password and active sessions.
        </p>
      </div>

      <ChangePasswordCard />
      <LogoutAllCard navigate={navigate} />
    </div>
  );
}

// ── Change password ─────────────────────────────────────────────────

function ChangePasswordCard() {
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
        title: 'Password rejected',
        message: policy.reasons.map(describeReason).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setResult({
        ok: false,
        title: 'Password mismatch',
        message: 'The new password and confirmation do not match.',
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
          title: 'Wrong current password',
          message: 'The current password you entered is incorrect.',
        });
      } else if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setResult({
          ok: false,
          title: 'Password rejected',
          message:
            reasons.map((r) => describeReason(r as never)).join(' ') ||
            (parsed.message ?? 'Pick a stronger password.'),
        });
      } else if (parsed?.code === 'SAME_PASSWORD') {
        setResult({
          ok: false,
          title: 'Same as before',
          message: 'New password must be different from the current one.',
        });
      } else if (parsed?.code === 'NO_PASSWORD_SET') {
        setResult({
          ok: false,
          title: 'Google-only account',
          message:
            parsed.message ??
            'This account uses Google sign-in. Use "Forgot password" to set one.',
        });
      } else {
        setResult({
          ok: false,
          title: 'Could not change password',
          message: parsed?.message ?? 'Something went wrong.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Pick a password you don't use anywhere else. After saving, all your
          other devices will be signed out (this device stays signed in).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && 'ok' in result && result.ok ? (
          <AuthBanner variant="success" title="Password changed">
            Other devices have been signed out. Your password is now active.
          </AuthBanner>
        ) : null}
        {result && !result.ok ? (
          <AuthBanner variant="danger" title={result.title}>
            {result.message}
          </AuthBanner>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="cp-current">Current password</Label>
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
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              placeholder={`At least ${MIN_LENGTH} characters`}
            />
            <PasswordRules password={next} dirty={next.length > 0} />
          </div>
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
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
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Logout all ──────────────────────────────────────────────────────

function LogoutAllCard({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
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
        message:
          parsed?.message ?? 'Could not sign you out — please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign out of all devices</CardTitle>
        <CardDescription>
          Ends every active TradeHub session, including this one. Use this if
          you've signed in on a device you no longer have, or suspect your
          account has been accessed without your permission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result?.ok ? (
          <AuthBanner variant="success" title="All sessions revoked">
            {result.revoked} session{result.revoked === 1 ? '' : 's'} signed
            out. Redirecting you to sign in…
          </AuthBanner>
        ) : null}
        {result && !result.ok ? (
          <AuthBanner variant="danger" title="Could not complete">
            {result.message}
          </AuthBanner>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={handleLogoutAll}
          disabled={busy}
        >
          {busy ? 'Signing out…' : 'Sign out everywhere'}
        </Button>
      </CardContent>
    </Card>
  );
}
