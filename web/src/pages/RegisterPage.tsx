import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Hammer, HardHat } from 'lucide-react';
import { api, parseApiError } from '../api';
import { AuthShell } from '@/components/AppShell';
import { AuthBanner } from '@/components/AuthBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput, combinePhone } from '@/components/PhoneInput';
import { PasswordRules } from '@/components/PasswordRules';
import { checkPassword, describeReason, MIN_LENGTH } from '@/lib/password-policy';

type RegisterResponse = {
  pending_verification: boolean;
  email: string;
};

type Role = 'WORKER' | 'EMPLOYER';

type Props = { onRegister: () => void };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export default function RegisterPage({ onRegister: _onRegister }: Props) {
  const navigate = useNavigate();
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!role) return;
    setError(null);
    if (!policy.ok) {
      setError({
        title: 'Password rejected',
        message: policy.reasons.map(describeReason).join(' '),
      });
      return;
    }
    if (!passwordsMatch) {
      setError({
        title: 'Passwords don\'t match',
        message: 'Re-type the same password in the confirm field.',
      });
      return;
    }

    // Role-specific name validation
    if (role === 'WORKER' && (!firstName.trim() || !surname.trim())) {
      setError({
        title: 'Missing name',
        message: 'Please enter both your first name and surname.',
      });
      return;
    }
    if (role === 'EMPLOYER' && !companyName.trim()) {
      setError({
        title: 'Missing company name',
        message: 'Please enter your company name.',
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

      await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      // No tokens issued. Send the user to /verify-email so they confirm.
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.code === 'WEAK_PASSWORD') {
        const reasons = (parsed.body?.reasons as string[]) ?? [];
        setError({
          title: 'Password rejected',
          message:
            reasons.map((r) => describeReason(r as never)).join(' ') ||
            (parsed.message ?? 'Pick a stronger password.'),
        });
      } else if (parsed?.code === 'EMAIL_TAKEN') {
        const emailFromBody =
          typeof parsed.body?.email === 'string'
            ? (parsed.body.email as string)
            : email;
        setError({
          title: 'Account already exists',
          message:
            'There is already a TradeHub account for this email. Sign in to continue, or use "Forgot password" if you don\'t remember it.',
          emailTaken: emailFromBody,
        });
      } else {
        setError({
          title: 'Sign up failed',
          message: parsed?.message ?? 'Something went wrong. Please try again.',
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
      const res = await fetch(`${API_BASE}/auth/google/start?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { redirect_url: string };
      window.location.href = data.redirect_url;
    } catch {
      setError({
        title: 'Google unavailable',
        message:
          'Google sign-up is not available right now. Try again or use email + password.',
      });
    }
  }

  if (!role) {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle>Join TradeHub</CardTitle>
            <CardDescription>How do you want to use the platform?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleCard
                icon={<Hammer className="h-8 w-8" />}
                title="I'm a tradesperson"
                description="Find jobs, get hired, manage projects"
                onClick={() => setRole('WORKER')}
              />
              <RoleCard
                icon={<HardHat className="h-8 w-8" />}
                title="I'm hiring"
                description="Post jobs, find workers, manage payments"
                onClick={() => setRole('EMPLOYER')}
              />
            </div>
            <p className="text-center text-sm text-fg-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start -ml-2"
            onClick={() => setRole(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Change role
          </Button>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Signing up as{' '}
            <span className="font-medium text-fg">
              {role === 'WORKER' ? 'Tradesperson' : 'Employer'}
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      Sign in instead
                    </Link>
                    <Link
                      to="/forgot-password"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      Forgot password?
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
                Continue with Google
              </Button>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border-default" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-raised px-2 text-xs uppercase tracking-wide text-fg-subtle">
                    or
                  </span>
                </div>
              </div>
            </>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-email">Email</Label>
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
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
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
            <div className="space-y-2">
              <Label htmlFor="reg-confirm-password">Confirm password</Label>
              <Input
                id="reg-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="text-xs text-warning">Passwords don't match.</p>
              ) : null}
            </div>
            {role === 'WORKER' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reg-firstname">First name</Label>
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
                  <Label htmlFor="reg-surname">Surname</Label>
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
                <Label htmlFor="reg-company">Company name</Label>
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
              <Label htmlFor="reg-phone">
                Phone <span className="text-fg-subtle">(optional)</span>
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
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-fg-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
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
      className="flex flex-col items-start gap-2 rounded-md border border-border-default bg-raised p-4 text-left transition-colors hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-subtle text-primary">
        {icon}
      </span>
      <span className="font-semibold text-fg">{title}</span>
      <span className="text-xs text-fg-muted">{description}</span>
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
