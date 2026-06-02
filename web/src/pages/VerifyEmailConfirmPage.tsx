import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, parseApiError, setTokens } from '../api';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  isSafeNext,
  postAuthRedirect,
  type AccountSummary,
} from '@/lib/auth-routing';

type ConfirmResponse = {
  access_token: string;
  refresh_token: string;
  account: AccountSummary;
};

type ConfirmState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'error'; code?: string; message: string };

type Props = { onLogin: () => void };

export default function VerifyEmailConfirmPage({ onLogin }: Props) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ConfirmState>({ kind: 'idle' });
  // Guard against React 18 StrictMode dev double-mount: the verify token is
  // single-use, so two invocations consume it and the second sees TOKEN_INVALID.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!token) {
      setState({
        kind: 'error',
        message: t('verifyConfirm.noToken'),
      });
      return;
    }
    setState({ kind: 'pending' });
    (async () => {
      try {
        const data = await api<ConfirmResponse>('/auth/verify-email/confirm', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        setTokens(data.access_token, data.refresh_token);
        onLogin();
        setState({ kind: 'success' });
        // RegisterPage stashes the pre-signup `next` in localStorage so we can
        // return the user to the page they came from (e.g. /workers/123 after
        // a SignupGatePopup click). Consume + clear.
        let stashed: string | null = null;
        try {
          stashed = localStorage.getItem('auth_next');
          localStorage.removeItem('auth_next');
        } catch {
          /* ignore */
        }
        const target = stashed && isSafeNext(stashed)
          ? stashed
          : '/profile?reason=verified';
        // Brief success → land on intended next, or profile.
        setTimeout(() => {
          navigate(postAuthRedirect(data.account, target), {
            replace: true,
          });
        }, 800);
      } catch (err) {
        const parsed = parseApiError(err);
        setState({
          kind: 'error',
          code: parsed?.code,
          message: parsed?.message ?? t('verifyConfirm.invalidOrExpired'),
        });
      }
    })();
  }, [token, onLogin, navigate]);

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('verifyConfirm.title')}</CardTitle>
          <CardDescription>{t('verifyConfirm.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === 'pending' ? (
            <div className="space-y-3" aria-live="polite">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {state.kind === 'success' ? (
            <AuthBanner variant="success" title={t('verifyConfirm.successTitle')}>
              {t('verifyConfirm.successBody')}
            </AuthBanner>
          ) : null}

          {state.kind === 'error' ? (
            <>
              <AuthBanner variant="danger" title={t('verifyConfirm.errorTitle')}>
                {state.message}
              </AuthBanner>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link to="/verify-email">{t('verifyConfirm.sendNewLink')}</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">{t('shared.backToSignIn')}</Link>
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
