import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, parseApiError, setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { AuthBanner, bannerFromReason } from '@/components/AuthBanner';
import {
  Card,
  CardContent,
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

type LoginSuccess = {
  access_token: string;
  refresh_token: string;
  account: AccountSummary;
};

type LoginError = {
  code?:
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_DEACTIVATED'
    | 'EMAIL_NOT_VERIFIED'
    | string;
  message?: string;
  email?: string;
  // EMAIL_NOT_VERIFIED still includes the tokens in the body — backend
  // returns them with status 403 so the SPA can route to /verify-email.
  access_token?: string;
  refresh_token?: string;
} | null;

type Props = { onLogin: () => void };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<LoginError>(null);
  const [loading, setLoading] = useState(false);

  // Discover whether Google sign-in is configured on the marketplace.
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/providers`);
        if (!res.ok) return;
        const data = (await res.json()) as { google?: boolean };
        if (!cancelled) setGoogleEnabled(data.google === true);
      } catch {
        /* ignore — Google CTA stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const banner = bannerFromReason(reason);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<LoginSuccess>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.access_token, data.refresh_token);
      onLogin();
      navigate(postAuthRedirect(data.account, next), { replace: true });
    } catch (err) {
      const parsed = parseError(err);
      // EMAIL_NOT_VERIFIED comes back with tokens — keep them and route to verify
      if (
        parsed?.code === 'EMAIL_NOT_VERIFIED' &&
        parsed.access_token &&
        parsed.refresh_token
      ) {
        setTokens(parsed.access_token, parsed.refresh_token);
        onLogin();
        navigate(
          `/verify-email${parsed.email ? `?email=${encodeURIComponent(parsed.email)}` : ''}`,
          { replace: true },
        );
        return;
      }
      setError(parsed);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      const params = new URLSearchParams({
        return_to: next || '/profile',
        intent: 'login',
      });
      const res = await fetch(`${API_BASE}/auth/google/start?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { redirect_url: string };
      window.location.href = data.redirect_url;
    } catch {
      setError({
        code: 'GOOGLE_UNAVAILABLE',
        message:
          'Google sign-in is not available right now. Try again or sign in with email.',
      });
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-2xl">Log in to TradeHub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {banner ? (
            <AuthBanner variant={banner.variant} title={banner.title}>
              {banner.message}
            </AuthBanner>
          ) : null}

          {error ? (
            <AuthBanner
              variant="danger"
              title={errorTitle(error)}
              action={errorAction(error, email)}
            >
              {error.message ?? 'Something went wrong. Please try again.'}
            </AuthBanner>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {googleEnabled ? (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border-default" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-raised px-2 text-xs uppercase tracking-wide text-fg-subtle">
                    or
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleGoogle}
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            </>
          ) : null}

          <div className="space-y-3 border-t border-border-default pt-5">
            <p className="text-center text-sm text-fg-muted">
              Don't have a TradeHub account?
            </p>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/register">Sign up</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function parseError(err: unknown): LoginError {
  const parsed = parseApiError(err);
  if (!parsed) return { message: 'Something went wrong. Please try again.' };
  return {
    code: parsed.code,
    message: parsed.message,
    email: typeof parsed.body?.email === 'string' ? (parsed.body.email as string) : undefined,
    access_token:
      typeof parsed.body?.access_token === 'string'
        ? (parsed.body.access_token as string)
        : undefined,
    refresh_token:
      typeof parsed.body?.refresh_token === 'string'
        ? (parsed.body.refresh_token as string)
        : undefined,
  };
}

function errorTitle(error: NonNullable<LoginError>): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Sign in failed';
    case 'ACCOUNT_DEACTIVATED':
      return 'Account deactivated';
    case 'EMAIL_NOT_VERIFIED':
      return 'Email not verified';
    default:
      return 'Sign in failed';
  }
}

function errorAction(
  error: NonNullable<LoginError>,
  email: string,
): React.ReactNode {
  if (error.code === 'EMAIL_NOT_VERIFIED' && (error.email || email)) {
    return (
      <Link
        to={`/verify-email?email=${encodeURIComponent(error.email ?? email)}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        Resend verification email
      </Link>
    );
  }
  return null;
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
