import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { setTokens } from '../api';

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
    <div className="auth-shell">
      <div className="auth-card center">
        {error ? (
          <>
            <h1>Login failed</h1>
            <div className="alert alert-error">{error}</div>
            <Link to="/login" className="btn btn-block">Back to login</Link>
          </>
        ) : (
          <>
            <h1>Signing you in...</h1>
            <p className="muted">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
}
