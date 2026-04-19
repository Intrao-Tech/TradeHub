import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

type Props = { onLogin: () => void };

export default function OAuthCallbackPage({ onLogin }: Props) {
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    const errParam = params.get('error');
    const next = params.get('next') || '/dashboard';

    if (errParam) {
      setError(errParam);
      return;
    }
    if (!access || !refresh) {
      setError('Missing tokens in callback URL.');
      return;
    }

    setTokens(access, refresh);
    onLogin();
    window.location.replace(next);
  }, []);

  return (
    <AuthShell>
      <Card>
        {error ? (
          <>
            <CardHeader>
              <CardTitle>Login failed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
              <Button asChild size="lg" className="w-full">
                <Link to="/login">Back to login</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-center">Signing you in…</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <p className="text-center text-sm text-fg-muted">Redirecting…</p>
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
