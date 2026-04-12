import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setTokens } from '../api';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  account: { id: number; email: string };
};

type Props = { onLogin: () => void };

export default function InternalLoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.access_token, data.refresh_token);
      onLogin();
      navigate('/internal/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ borderTop: '4px solid #dc2626' }}>
        <h1 style={{ fontSize: 20 }}>TradeHub Internal</h1>
        <p className="muted">Staff & admin access only.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@tradehub.co.uk"
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
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn-block" disabled={loading}
            style={{ background: '#dc2626' }}>
            {loading ? 'Signing in…' : 'Staff sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
