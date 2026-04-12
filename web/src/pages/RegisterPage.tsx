import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setTokens } from '../api';

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
      <div className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <h1>Join TradeHub</h1>
          <p className="muted">How do you want to use the platform?</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
            <button
              type="button"
              className="role-card"
              onClick={() => setRole('WORKER')}
            >
              <span style={{ fontSize: 36 }}>&#128736;</span>
              <strong>I'm a tradesperson</strong>
              <span className="muted small">Find jobs, get hired, manage projects</span>
            </button>
            <button
              type="button"
              className="role-card"
              onClick={() => setRole('EMPLOYER')}
            >
              <span style={{ fontSize: 36 }}>&#127959;</span>
              <strong>I'm hiring</strong>
              <span className="muted small">Post jobs, find workers, manage payments</span>
            </button>
          </div>

          <p className="muted small center" style={{ marginTop: 20 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <button
          type="button"
          className="btn-ghost"
          style={{ alignSelf: 'flex-start', marginBottom: 8, padding: '4px 0' }}
          onClick={() => setRole(null)}
        >
          &larr; Change role
        </button>
        <h1>Create your account</h1>
        <p className="muted">
          Signing up as <strong>{role === 'WORKER' ? 'Tradesperson' : 'Employer'}</strong>.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <button type="button" className="btn google-btn" onClick={handleGoogle}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="auth-divider">or</div>

        <form onSubmit={handleSubmit} className="auth-form stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="at least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Mike Builder"
              required
              minLength={2}
            />
          </label>
          <label>
            Phone <span className="muted small">(optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 ..."
              autoComplete="tel"
            />
          </label>
          <button type="submit" className="btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="muted small center" style={{ marginTop: 20 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
