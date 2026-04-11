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

export default function RegisterPage({ onRegister }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('WORKER');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="muted">Join TradeHub as a worker or employer.</p>

        {error && <div className="alert alert-error">{error}</div>}

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
            I am a
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="WORKER">Worker / Tradesperson</option>
              <option value="EMPLOYER">Employer / Contractor</option>
            </select>
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="muted small center" style={{ marginTop: 20 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
