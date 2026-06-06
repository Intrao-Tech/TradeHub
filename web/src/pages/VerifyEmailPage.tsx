import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

// Auth pages are intentionally English-only (I18N decision): language is an
// authenticated-only setting, switched from the account menu.

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyEmailPage() {
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
      setError(err instanceof Error ? err.message : 'Could not send the email. Try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Confirm your email</CardTitle>
          <CardDescription>
            {queryEmail ? (
              <>
                We sent a confirmation link to{' '}
                <span className="font-medium text-fg">{queryEmail}</span>. Click it to
                activate your account.
              </>
            ) : (
              'Open the email we sent you and click the confirmation link to activate your account.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthBanner variant="info" title="Why this step?">
            TradeHub is built on verified identities. Confirming your email keeps fake
            accounts out of the marketplace and protects the people you'll work with.
          </AuthBanner>

          {sent ? (
            <AuthBanner variant="success" title="Email sent">
              If an account exists with that email, a fresh confirmation link is on its
              way. The link is valid for 24 hours.
            </AuthBanner>
          ) : null}

          {error ? (
            <AuthBanner variant="danger" title="Could not send email">
              {error}
            </AuthBanner>
          ) : null}

          <form onSubmit={handleResend} className="space-y-3">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="resend-email">Resend to</Label>
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
                ? 'Sending…'
                : cooldown > 0
                  ? `Try again in ${cooldown}s`
                  : 'Resend confirmation email'}
            </Button>
          </form>

          <p className="text-center text-sm text-fg-muted">
            Already confirmed?{' '}
            <Link
              to="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
