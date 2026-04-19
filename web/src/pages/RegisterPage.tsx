import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Hammer, HardHat } from 'lucide-react';
import { api, setTokens } from '../api';
import { AuthShell } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type RegisterResponse = {
  access_token: string;
  refresh_token: string;
  account: { id: number; email: string };
};

type Role = 'WORKER' | 'EMPLOYER';

type Props = { onRegister: () => void };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export default function RegisterPage({ onRegister }: Props) {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!role) return;
    setError('');
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        email,
        password,
        display_name: displayName,
        role,
      };
      const trimmed = phone.trim();
      if (trimmed) body.phone = trimmed;

      const data = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setTokens(data.access_token, data.refresh_token);
      onRegister();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
    if (!role) return;
    const state = encodeURIComponent(JSON.stringify({ role, return_to: '/dashboard' }));
    window.location.href = `${API_BASE}/auth/google?state=${state}`;
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
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleGoogle}>
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border-default" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-raised px-2 text-xs uppercase tracking-wide text-fg-subtle">or</span>
            </div>
          </div>

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
                placeholder="at least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-name">Display name</Label>
              <Input
                id="reg-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mike Builder"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-phone">
                Phone <span className="text-fg-subtle">(optional)</span>
              </Label>
              <Input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 ..."
                autoComplete="tel"
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
