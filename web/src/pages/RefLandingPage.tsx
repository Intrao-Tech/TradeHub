import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

/**
 * Landing page for `/r/:code` (referral share links).
 *
 * The backend already serves `GET /api/r/:code` which sets the account-ref
 * cookie and 302-redirects to FRONTEND_URL. We just bounce the browser there
 * via a top-level navigation — that way the cookie is set by the backend
 * origin without any CORS / credentials hassle.
 */
export default function RefLandingPage() {
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    if (!code) {
      window.location.replace('/');
      return;
    }
    window.location.replace(`${API}/r/${encodeURIComponent(code)}`);
  }, [code]);

  return (
    <div className="flex items-center justify-center py-20 text-sm text-fg-muted">
      Following referral link…
    </div>
  );
}
