import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
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
      setView({ kind: 'error', message: t('oauthCallback.missingTokens') });
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
  }, [inputs, navigate, onLogin, t]);

  return (
    <AuthShell>
      <Card>
        {view.kind === 'pending' ? (
          <>
            <CardHeader>
              <CardTitle className="text-center">{t('oauthCallback.pendingTitle')}</CardTitle>
              <CardDescription className="text-center">
                {t('oauthCallback.pendingDescription')}
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
                  ? t('oauthCallback.existsTitleRegister')
                  : t('oauthCallback.existsTitleLogin')}
              </CardTitle>
              <CardDescription>
                <Trans
                  i18nKey="oauthCallback.existsFor"
                  ns="auth"
                  values={{ email: view.email }}
                  components={[<span className="font-medium text-fg" />]}
                />{' '}
                {view.intent === 'register'
                  ? t('oauthCallback.existsBodyRegister')
                  : t('oauthCallback.existsBodyLogin')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AuthBanner variant="info" title={t('oauthCallback.whyTitle')}>
                {view.intent === 'register'
                  ? t('oauthCallback.whyRegister')
                  : t('oauthCallback.whyLogin')}
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to={`/login?email=${encodeURIComponent(view.email)}`}>
                  {view.intent === 'register'
                    ? t('oauthCallback.signInToAccount')
                    : t('oauthCallback.signInWithPassword')}
                </Link>
              </Button>
            </CardContent>
          </>
        ) : null}

        {view.kind === 'no_google_account' ? (
          <>
            <CardHeader>
              <CardTitle>{t('oauthCallback.noAccountTitle')}</CardTitle>
              <CardDescription>
                {t('oauthCallback.noAccountBody')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AuthBanner variant="info" title={t('oauthCallback.whyTitle')}>
                {t('oauthCallback.whyNoSilent')}
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to="/register">{t('oauthCallback.createAccount')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link to="/login">{t('shared.backToSignIn')}</Link>
              </Button>
            </CardContent>
          </>
        ) : null}

        {view.kind === 'error' ? (
          <>
            <CardHeader>
              <CardTitle>{t('oauthCallback.failedTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AuthBanner variant="danger" title={t('oauthCallback.failedBanner')}>
                {view.message}
              </AuthBanner>
              <Button asChild size="lg" className="w-full">
                <Link to="/login">{t('shared.backToSignIn')}</Link>
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>
    </AuthShell>
  );
}
