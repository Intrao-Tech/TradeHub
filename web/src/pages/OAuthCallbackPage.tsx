import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { AuthBanner } from '@/components/AuthBanner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  postAuthRedirect,
  type AccountSummary,
} from '@/lib/auth-routing';

type Props = { onLogin: () => void };

export default function OAuthCallbackPage({ onLogin }: Props) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState<
    | { kind: 'pending' }
    | { kind: 'error'; message: string }
    | { kind: 'account_exists'; email: string; intent: 'login' | 'register' }
    | { kind: 'no_google_account' }
  >({ kind: 'pending' });
  const handled = useRef(false);

  // Parse params once on mount.
  const inputs = useMemo(() => {
    return {
      access: params.get('access_token'),
      refresh: params.get('refresh_token'),
      err: params.get('error'),
      next: params.get('next') || '/profile',
      state: params.get('state') as
        | 'PENDING_EMAIL_VERIFICATION'
        | 'ACTIVE'
        | 'DEACTIVATED'
        | null,
      email: params.get('email') ?? '',
      intent: (params.get('intent') === 'register' ? 'register' : 'login') as
        | 'login'
        | 'register',
      isWorker: params.get('is_worker') === 'true',
      isEmployer: params.get('is_employer') === 'true',
      isStaff: params.get('is_staff') === 'true',
    };
  }, [params]);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (inputs.err === 'ACCOUNT_EXISTS' && inputs.email) {
      setView({ kind: 'account_exists', email: inputs.email, intent: inputs.intent });
      return;
    }
    if (inputs.err === 'NO_GOOGLE_ACCOUNT') {
      setView({ kind: 'no_google_account' });
      return;
    }
    if (inputs.err) {
      setView({ kind: 'error', message: inputs.err });
      return;
    }
    if (!inputs.access || !inputs.refresh) {
      setView({ kind: 'error', message: 'Missing tokens in callback URL.' });
      return;
    }

    setTokens(inputs.access, inputs.refresh);
    onLogin();

    const account: AccountSummary = {
      id: 0,
      email: inputs.email,
      is_worker: inputs.isWorker,
      is_employer: inputs.isEmployer,
      is_staff: inputs.isStaff,
      verification_state: inputs.state ?? 'ACTIVE',
    };
    navigate(postAuthRedirect(account, inputs.next), { replace: true });
  }, [inputs, navigate, onLogin]);

  return (
    <AuthShell>
      <Card>
        {view.kind === 'pending' ? (
          <>
            <CardHeader>
              <CardTitle className="text-center">Signing you in…</CardTitle>
              <CardDescription className="text-center">
                One moment while we set up your session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" aria-live="polite">
              <Skeleton className="mx-auto h-4 w-3/4" />
              <Skeleton className="mx-auto h-4 w-1/2" />
            </CardContent>
          </>
        ) : null}

        {view.kind === 'account_exists' ? (
          <>
            <CardHeader>
              <CardTitle>
                {view.intent === 'register'
                  ? 'You already have a TradeHub account'
                  : 'We found an existing account'}
              </CardTitle>
              <CardDescription>
                There is already a TradeHub account for{' '}
                <span className="font-medium text-fg">{view.email}</span>.{' '}
                {view.intent === 'register'
                  ? 'Sign in to that account instead of creating a new one.'
                  : 'Sign in with your password to continue. You can link Google later in Settings → Security.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AuthBanner variant="info" title="Why this step?">
                {view.intent === 'register'
                  ? 'We never duplicate accounts. If you forgot your password, use "Forgot password" on the sign-in screen.'
                  : 'We never automatically merge accounts based on email — that way nobody can take over your TradeHub account by signing into Google with the same address.'}
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to={`/login?email=${encodeURIComponent(view.email)}`}>
                  {view.intent === 'register'
                    ? 'Sign in to your account'
                    : 'Sign in with password'}
                </Link>
              </Button>
            </CardContent>
          </>
        ) : null}

        {view.kind === 'no_google_account' ? (
          <>
            <CardHeader>
              <CardTitle>No TradeHub account yet</CardTitle>
              <CardDescription>
                We couldn't find a TradeHub account for this Google identity.
                Sign up first, then you can use Google to sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AuthBanner variant="info" title="Why this step?">
                We never silently create accounts when you click "Sign in" —
                that way you always know when an account is being made for you.
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to="/register">Create a TradeHub account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </CardContent>
          </>
        ) : null}

        {view.kind === 'error' ? (
          <>
            <CardHeader>
              <CardTitle>Sign-in failed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AuthBanner variant="danger" title="Something went wrong">
                {view.message}
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>
    </AuthShell>
  );
}
