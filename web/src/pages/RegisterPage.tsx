import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h1>Register</h1>
      {error ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>
      ) : null}
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Email{' '}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Password{' '}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        </div>
        <div>
          <label>
            Display name{' '}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
            />
          </label>
        </div>
        <div>
          <label>
            Role{' '}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="WORKER">WORKER</option>
              <option value="EMPLOYER">EMPLOYER</option>
            </select>
          </label>
        </div>
        <div>
          <label>
            Phone (optional){' '}
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>
        <button type="submit">Register</button>
      </form>
    </div>
  );
}
