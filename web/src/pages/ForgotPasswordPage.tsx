import { useState } from 'react';
import { Link } from 'react-router-dom';
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
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Try again in a moment.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter the email you used to sign up — we'll send a one-time reset
            link if the account exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <>
              <AuthBanner variant="success" title="Check your inbox">
                If an account exists with that email, a password reset link is
                on its way. The link is valid for 1 hour and can be used once.
              </AuthBanner>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </>
          ) : (
            <>
              {error ? (
                <AuthBanner variant="danger" title="Could not send email">
                  {error}
                </AuthBanner>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col gap-2.5">
                  <Label htmlFor="forgot-email">Email</Label>
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
                  {submitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
              <p className="text-center text-sm text-fg-muted">
                Remembered it?{' '}
                <Link
                  to="/login"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
