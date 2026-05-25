import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getToken } from '@/api';

/**
 * Landing page for `/r/:code` (account-referral share links).
 *
 * Forwards `:code` to `/register?ref=CODE` so the form persists
 * `account.referred_by_id` directly on signup. Pure URL flow — no cookies,
 * no server roundtrips needed.
 *
 * If the visitor is already logged in, the share is wasted (account-ref is
 * locked at signup) — bounce them to the home page so they don't see a
 * confusing register screen.
 */
export default function RefLandingPage() {
  const { code } = useParams<{ code: string }>();
  const loggedIn = !!getToken();

  // Strip framing chrome while we redirect.
  useEffect(() => {
    document.title = 'Following referral link…';
  }, []);

  if (!code) return <Navigate to="/" replace />;
  if (loggedIn) return <Navigate to="/" replace />;
  return (
    <Navigate to={`/register?ref=${encodeURIComponent(code)}`} replace />
  );
}
