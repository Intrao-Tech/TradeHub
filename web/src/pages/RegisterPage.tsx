import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Hammer, HardHat } from 'lucide-react';
import { api, parseApiError } from '../api';
import { AuthShell } from '@/components/AppShell';
import { AuthBanner } from '@/components/AuthBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput, combinePhone } from '@/components/PhoneInput';
import { PasswordRules } from '@/components/PasswordRules';
import { checkPassword, describeReason, MIN_LENGTH } from '@/lib/password-policy';
import {
  readPendingProjectRef,
  clearPendingProjectRef,
} from '@/components/referral/pendingProjectRef';
import { isSafeNext } from '@/lib/auth-routing';

type RegisterResponse = {
  pending_verification: boolean;
  email: string;
};

type Role = 'WORKER' | 'EMPLOYER';

type Props = { onRegister: () => void };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export default function RegisterPage({ onRegister: _onRegister }: Props) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get('ref')?.toUpperCase().trim() || null;
  const nextParam = searchParams.get('next');
  // A logged-out project-referral click (stashed by useRefAttribution) is
  // applied here as an ACCOUNT referral — a brand-new user becomes the
  // referrer's signup. An explicit /r/:code link (URL ?ref=) takes priority.
  const effectiveRefCode = useMemo(
    () => refCode ?? readPendingProjectRef()?.code ?? null,
    [refCode],
  );
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('GB');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [error, setError] = useState<
    | { title: string; message: string; emailTaken?: string }
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  const policy = useMemo(() => checkPassword(password), [password]);
  const passwordsMatch =
    password.length > 0 && password === confirmPassword;

  // Discover whether Google is configured.
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
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve referrer display name for the "You were referred by X" banner.
  useEffect(() => {
    if (!effectiveRefCode) {
      setReferrerName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/referral/who-referred?code=${encodeURIComponent(effectiveRefCode)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { display_name: string | null };
        if (!cancelled) setReferrerName(data.display_name);
      } catch {
        /* ignore — invalid code is silently dropped on signup anyway */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRefCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!role) return;
    setError(null);
    if (!policy.ok) {
      setError({
        title: t('register.error.passwordRejected'),
        message: policy.reasons.map(describeReason).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setError({
        title: t('register.error.passwordsTitle'),
        message: t('register.error.passwordsBody'),
      });
      return;
    }

    // Role-specific name validation
    if (role === 'WORKER' && (!firstName.trim() || !surname.trim())) {
      setError({
        title: t('register.error.missingNameTitle'),
        message: t('register.error.missingNameBody'),
      });
      return;
    }
    if (role === 'EMPLOYER' && !companyName.trim()) {
      setError({
        title: t('register.error.missingCompanyTitle'),
        message: t('register.error.missingCompanyBody'),
      });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        email,
        password,
        role,
      };
      if (role === 'WORKER') {
        body.first_name = firstName.trim();
        body.surname = surname.trim();
      } else {
        body.company_name = companyName.trim();
      }
      const fullPhone = combinePhone(phoneCountry, phoneLocal);
      if (fullPhone) body.phone = fullPhone;
      if (effectiveRefCode) body.referred_by_code = effectiveRefCode;

      await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      // A project-ref (if any) is now consumed as an account referral — clear
      // the stash so the post-verify login doesn't also replay a project intent.
      clearPendingProjectRef();
      // Stash the post-auth target so the email-verify confirm step (a fresh
      // tab from the inbox) can route back to where the user originally
      // intended to go (e.g. /workers/123 after a SignupGatePopup click).
      if (nextParam && isSafeNext(nextParam)) {
        try {
          localStorage.setItem('auth_next', nextParam);
        } catch {
          /* localStorage quota / disabled — non-fatal */
        }
      }
      // No tokens issued. Send the user to /verify-email so they confirm.
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setError({
          title: t('register.error.passwordRejected'),
          message:
            reasons.map((r) => describeReason(r as never)).join(' ') ||
            (parsed.message ?? t('register.error.pickStronger')),
        });
      } else if (parsed?.code === 'EMAIL_TAKEN') {
        const emailFromBody =
          typeof parsed.body?.email === 'string'
            ? (parsed.body.email as string)
            : email;
        setError({
          title: t('register.error.emailTakenTitle'),
          message: t('register.error.emailTakenBody'),
          emailTaken: emailFromBody,
        });
      } else {
        setError({
          title: t('register.error.signUpFailed'),
          message: parsed?.message ?? t('shared.genericError'),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!role) return;
    try {
      const params = new URLSearchParams({
        role,
        return_to: '/profile',
        intent: 'register',
      });
      // Carry the referral code so Google signups attribute it too.
      if (effectiveRefCode) params.set('ref', effectiveRefCode);
      const res = await fetch(`${API_BASE}/auth/google/start?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { redirect_url: string };
      // Consumed as an account referral via the OAuth flow — clear the stash.
      clearPendingProjectRef();
      window.location.href = data.redirect_url;
    } catch {
      setError({
        title: t('register.error.googleTitle'),
        message: t('register.error.googleBody'),
      });
    }
  }

  if (!role) {
    return (
      <AuthShell
        contentClassName="max-w-3xl"
        headerGradient
        footer={
          <>
            {t('register.alreadyHaveAccount')}{' '}
            <Link
              to="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('shared.logIn')}
            </Link>
          </>
        }
      >
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {t('register.welcome')}
          </h1>
          <p className="mt-3 text-base text-fg-muted">
            {t('register.whichDescribes')}
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <RoleCard
            icon={<Hammer className="h-12 w-12" />}
            title={t('register.roleWorker')}
            description={t('register.roleWorkerDesc')}
            onClick={() => setRole('WORKER')}
          />
          <RoleCard
            icon={<HardHat className="h-12 w-12" />}
            title={t('register.roleEmployer')}
            description={t('register.roleEmployerDesc')}
            onClick={() => setRole('EMPLOYER')}
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      contentClassName="max-w-xl"
      headerAction={
        <p className="text-sm text-fg">
          {role === 'WORKER' ? t('register.hereToHire') : t('register.lookingForWork')}{' '}
          <button
            type="button"
            onClick={() => setRole(role === 'WORKER' ? 'EMPLOYER' : 'WORKER')}
            className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {role === 'WORKER' ? t('register.joinAsEmployer') : t('register.applyAsTradesperson')}
          </button>
        </p>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {role === 'WORKER'
            ? t('register.titleWorker')
            : t('register.titleEmployer')}
        </h1>

        {referrerName ? (
          <AuthBanner variant="info" title={t('register.referredBy', { name: referrerName })}>
            {t('register.referredByBody')}
          </AuthBanner>
        ) : null}

        {error ? (
          <AuthBanner
            variant="danger"
            title={error.title}
            action={
              error.emailTaken ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Link
                    to={`/login?email=${encodeURIComponent(error.emailTaken)}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {t('register.signInInstead')}
                  </Link>
                  <Link
                    to="/forgot-password"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {t('shared.forgotPassword')}
                  </Link>
                </div>
              ) : null
            }
          >
            {error.message}
          </AuthBanner>
        ) : null}

        {googleEnabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleGoogle}
            >
              <GoogleIcon />
              {t('shared.continueWithGoogle')}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border-default" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-page px-2 text-xs uppercase tracking-wide text-fg-subtle">
                  {t('shared.or')}
                </span>
              </div>
            </div>
          </>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
            {role === 'WORKER' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reg-firstname">{t('register.firstNameLabel')}</Label>
                  <Input
                    id="reg-firstname"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Mike"
                    autoComplete="given-name"
                    required
                    minLength={1}
                    maxLength={75}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-surname">{t('register.surnameLabel')}</Label>
                  <Input
                    id="reg-surname"
                    type="text"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="Thompson"
                    autoComplete="family-name"
                    required
                    minLength={1}
                    maxLength={75}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reg-company">{t('register.companyLabel')}</Label>
                <Input
                  id="reg-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Build Ltd"
                  autoComplete="organization"
                  required
                  minLength={2}
                  maxLength={150}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reg-email">{t('shared.email')}</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">{t('register.passwordLabel')}</Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('shared.atLeastChars', { count: MIN_LENGTH })}
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
              />
              <PasswordRules password={password} dirty={password.length > 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm-password">{t('register.confirmLabel')}</Label>
              <Input
                id="reg-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="text-xs text-warning">{t('register.passwordsDontMatch')}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-phone">
                {t('register.phoneLabel')}{' '}
                <span className="text-fg-subtle">{t('register.optional')}</span>
              </Label>
              <PhoneInput
                inputId="reg-phone"
                countryIso={phoneCountry}
                onCountryIsoChange={setPhoneCountry}
                localNumber={phoneLocal}
                onLocalNumberChange={setPhoneLocal}
              />
            </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t('register.creatingAccount') : t('register.createAccount')}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

function RoleCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-5 rounded-lg border border-border-default bg-raised p-5 text-center transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="role-tile-gradient flex aspect-square items-center justify-center rounded-md text-fg">
        {icon}
      </span>
      <span className="space-y-1">
        <span className="flex items-center justify-center gap-2 text-lg font-semibold text-fg">
          {title}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="block text-sm text-fg-muted">{description}</span>
      </span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
