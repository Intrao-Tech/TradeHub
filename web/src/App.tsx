import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { api, clearTokens, getToken } from './api';
import {
  IS_STAFF_HOST,
  STAFF_BASE_URL,
} from './lib/host';
import { AppShell, type NavItem } from './components/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { Toaster } from './components/ui/toast';
import { replayPendingProjectRef } from './components/referral/pendingProjectRef';
import { useAccountMe } from './hooks/useAccountMe';

// ── Lazy pages ──────────────────────────────────────────────────────
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const InternalLoginPage = lazy(() => import('./pages/InternalLoginPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const VerifyEmailConfirmPage = lazy(() => import('./pages/VerifyEmailConfirmPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SettingsSecurityPage = lazy(() => import('./pages/SettingsSecurityPage'));

const WorkerSearchPage = lazy(() => import('./pages/WorkerSearchPage'));
const WorkerDetailPage = lazy(() => import('./pages/WorkerDetailPage'));
const EmployerSearchPage = lazy(() => import('./pages/EmployerSearchPage'));
const EmployerDetailPage = lazy(() => import('./pages/EmployerDetailPage'));
const ClientDirectoryPage = lazy(() => import('./pages/ClientDirectoryPage'));
const ClientPublicProfilePage = lazy(() => import('./pages/ClientPublicProfilePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CollaborationsPage = lazy(() => import('./pages/CollaborationsPage'));
const CollaborationDetailPage = lazy(() => import('./pages/CollaborationDetailPage'));
const EscrowPlaceholderPage = lazy(() => import('./pages/EscrowPlaceholderPage'));
const ContractDetailPage = lazy(() => import('./pages/ContractDetailPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const JobBoardPage = lazy(() => import('./pages/JobBoardPage'));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'));
const MyJobsPage = lazy(() => import('./pages/MyJobsPage'));
const MyJobApplicantsPage = lazy(() => import('./pages/MyJobApplicantsPage'));
const EditJobPage = lazy(() => import('./pages/EditJobPage'));
const MyApplicationsPage = lazy(() => import('./pages/MyApplicationsPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const RefLandingPage = lazy(() => import('./pages/RefLandingPage'));

// ── Nav items ───────────────────────────────────────────────────────

const PUBLIC_NAV: NavItem[] = [
  // Jobs is a "find work" surface — workers + logged-out viewers see it;
  // employers manage their own jobs at /my-jobs.
  { to: '/jobs', label: 'Jobs', hideForRole: 'employer' },
  // Workers don't browse other workers; employers don't browse other employers.
  { to: '/workers', label: 'Workers', hideForRole: 'worker' },
  { to: '/employers', label: 'Employers', hideForRole: 'employer' },
];

const PRIVATE_NAV: NavItem[] = [
  { to: '/my-applications', label: 'Applications', requires: 'worker' },
  { to: '/my-jobs', label: 'Posted jobs', requires: 'employer' },
  { to: '/collaborations', label: 'Collaborations' },
  { to: '/payments', label: 'Payments' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/support', label: 'Support' },
];

// Staff app only has the /admin route — top-level nav chip is noise.
// Navigation lives inside the AdminPage sidebar (Dashboard / Users / etc.).
const STAFF_NAV: NavItem[] = [];

// ── Helpers ─────────────────────────────────────────────────────────

function Protected({
  loggedIn,
  requires,
  children,
}: {
  loggedIn: boolean;
  /**
   * Optional role gate. When set, the route also requires the account to
   * have the matching profile. Mismatched roles redirect to `/profile`.
   */
  requires?: 'worker' | 'employer';
  children: React.ReactElement;
}) {
  const location = useLocation();
  const { isWorker, isEmployer, loading } = useAccountMe();

  if (!loggedIn) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  if (requires) {
    // Wait for the account cache before judging the role — avoids a flash
    // of the page followed by a redirect.
    if (loading) return null;
    const hasRole = requires === 'worker' ? isWorker : isEmployer;
    if (!hasRole) return <Navigate to="/profile" replace />;
  }

  return children;
}

/**
 * Inverse of Protected's `requires` gate: a publicly accessible route that
 * redirects users who have the named role (e.g. workers don't need to
 * browse other workers). Logged-out viewers and opposite-role users render
 * the children. Mirrors AppShell's `hideForRole` nav filter.
 */
function HideForRole({
  role,
  redirectTo = '/profile',
  children,
}: {
  role: 'worker' | 'employer';
  redirectTo?: string;
  children: React.ReactElement;
}) {
  const { isWorker, isEmployer, loading } = useAccountMe();
  // Logged-out viewers always see the page — no role data to gate on.
  if (!getToken()) return children;
  // Wait for the account cache before deciding so a logged-in user with the
  // matching role doesn't flash the page before the redirect kicks in.
  if (loading) return null;
  const hasRole = role === 'worker' ? isWorker : isEmployer;
  if (hasRole) return <Navigate to={redirectTo} replace />;
  return children;
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function FullPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

// Marketplace SPA bounces to staff subdomain if it sees an /internal/* path.
function MarketplaceInternalBounce() {
  const location = useLocation();
  useEffect(() => {
    window.location.replace(`${STAFF_BASE_URL}${location.pathname}${location.search}`);
  }, [location]);
  return <FullPageFallback />;
}

// ── Auth wiring ─────────────────────────────────────────────────────

function useAuthState() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const refreshAuth = useCallback(() => setLoggedIn(!!getToken()), []);
  useEffect(() => {
    window.addEventListener('storage', refreshAuth);
    window.addEventListener('auth-changed', refreshAuth);
    return () => {
      window.removeEventListener('storage', refreshAuth);
      window.removeEventListener('auth-changed', refreshAuth);
    };
  }, [refreshAuth]);

  const handleLogout = async () => {
    try {
      // AUTH-008-001 fix: include refresh_token in body so the server can revoke it.
      const refresh = localStorage.getItem('refresh_token');
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refresh ?? '' }),
      });
    } catch {
      /* ignore — clear local state anyway */
    }
    clearTokens();
    setLoggedIn(false);
    window.dispatchEvent(new Event('auth-changed'));
  };

  const onAuthSuccess = () => {
    setLoggedIn(true);
    window.dispatchEvent(new Event('auth-changed'));
    // Materialise a project-referral click made while logged out, if any.
    void replayPendingProjectRef();
  };

  return { loggedIn, handleLogout, onAuthSuccess };
}

// ── Marketplace router ──────────────────────────────────────────────

function MarketplaceRouter() {
  const { loggedIn, handleLogout, onAuthSuccess } = useAuthState();
  const location = useLocation();

  const isAuthRoute = [
    '/login',
    '/register',
    '/oauth/callback',
    '/verify-email',
    '/verify-email/confirm',
    '/forgot-password',
    '/reset-password',
  ].some((p) => location.pathname === p);

  if (isAuthRoute) {
    return (
      <Suspense fallback={<FullPageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={onAuthSuccess} />} />
          <Route path="/register" element={<RegisterPage onRegister={onAuthSuccess} />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage onLogin={onAuthSuccess} />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/verify-email/confirm" element={<VerifyEmailConfirmPage onLogin={onAuthSuccess} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell
      loggedIn={loggedIn}
      publicNav={PUBLIC_NAV}
      privateNav={PRIVATE_NAV}
      onLogout={handleLogout}
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/r/:code" element={<RefLandingPage />} />
          <Route path="/jobs" element={<HideForRole role="employer"><JobBoardPage /></HideForRole>} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/workers" element={<HideForRole role="worker"><WorkerSearchPage /></HideForRole>} />
          <Route path="/workers/:id" element={<Protected loggedIn={loggedIn}><WorkerDetailPage /></Protected>} />
          <Route path="/employers" element={<HideForRole role="employer"><EmployerSearchPage /></HideForRole>} />
          <Route path="/employers/:id" element={<Protected loggedIn={loggedIn}><EmployerDetailPage /></Protected>} />
          <Route path="/clients" element={<ClientDirectoryPage />} />
          <Route path="/clients/:slug" element={<ClientPublicProfilePage />} />
          {/* Private */}
          <Route path="/profile" element={<Protected loggedIn={loggedIn}><ProfilePage /></Protected>} />
          <Route path="/collaborations" element={<Protected loggedIn={loggedIn}><CollaborationsPage /></Protected>} />
          <Route path="/collaborations/:id" element={<Protected loggedIn={loggedIn}><CollaborationDetailPage /></Protected>} />
          <Route path="/escrow/:id" element={<Protected loggedIn={loggedIn}><EscrowPlaceholderPage /></Protected>} />
          <Route path="/contracts/:contractId" element={<Protected loggedIn={loggedIn}><ContractDetailPage /></Protected>} />
          <Route path="/contracts/:contractId/escrow" element={<Protected loggedIn={loggedIn}><EscrowPlaceholderPage /></Protected>} />
          <Route path="/payments" element={<Protected loggedIn={loggedIn}><WalletPage /></Protected>} />
          {/* Back-compat: old Stripe Connect return URLs and stale links */}
          <Route path="/wallet" element={<Navigate to="/payments" replace />} />
          <Route path="/referrals" element={<Protected loggedIn={loggedIn}><ReferralsPage /></Protected>} />
          <Route path="/my-applications" element={<Protected loggedIn={loggedIn} requires="worker"><MyApplicationsPage /></Protected>} />
          <Route path="/my-jobs" element={<Protected loggedIn={loggedIn} requires="employer"><MyJobsPage /></Protected>} />
          <Route path="/my-jobs/:id/applicants" element={<Protected loggedIn={loggedIn} requires="employer"><MyJobApplicantsPage /></Protected>} />
          <Route path="/my-jobs/:id/edit" element={<Protected loggedIn={loggedIn} requires="employer"><EditJobPage /></Protected>} />
          <Route path="/notifications" element={<Protected loggedIn={loggedIn}><NotificationsPage /></Protected>} />
          <Route path="/inbox" element={<Protected loggedIn={loggedIn}><InboxPage /></Protected>} />
          <Route path="/inbox/:conversationId" element={<Protected loggedIn={loggedIn}><InboxPage /></Protected>} />
          <Route path="/support" element={<Protected loggedIn={loggedIn}><SupportPage /></Protected>} />
          <Route path="/settings/security" element={<Protected loggedIn={loggedIn}><SettingsSecurityPage /></Protected>} />

          {/* Marketplace stragglers landing on /internal/* — punt them to the staff subdomain */}
          <Route path="/internal/*" element={<MarketplaceInternalBounce />} />

          {/* Default + catch-all (covers retired routes like /dashboard) */}
          <Route path="/" element={<Navigate to={loggedIn ? '/profile' : '/jobs'} replace />} />
          <Route path="*" element={<Navigate to={loggedIn ? '/profile' : '/jobs'} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

// ── Staff router (mounted only on internal.* host) ──────────────────

function StaffRouter() {
  const { loggedIn, handleLogout, onAuthSuccess } = useAuthState();
  const location = useLocation();

  const isAuthRoute = ['/login', '/oauth/callback'].some(
    (p) => location.pathname === p,
  );

  if (isAuthRoute) {
    return (
      <Suspense fallback={<FullPageFallback />}>
        <Routes>
          <Route path="/login" element={<InternalLoginPage onLogin={onAuthSuccess} />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage onLogin={onAuthSuccess} />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell
      loggedIn={loggedIn}
      publicNav={[]}
      privateNav={STAFF_NAV}
      onLogout={handleLogout}
      hideFooter
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/admin" element={<Protected loggedIn={loggedIn}><AdminPage /></Protected>} />
          <Route path="/notifications" element={<Protected loggedIn={loggedIn}><NotificationsPage /></Protected>} />
          <Route path="/settings/security" element={<Protected loggedIn={loggedIn}><SettingsSecurityPage /></Protected>} />
          <Route path="/" element={<Navigate to={loggedIn ? '/admin' : '/login'} replace />} />
          {/* Anything else on staff host → 404-equivalent: go to admin or login */}
          <Route path="*" element={<Navigate to={loggedIn ? '/admin' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function App() {
  return (
    <BrowserRouter>
      {IS_STAFF_HOST ? <StaffRouter /> : <MarketplaceRouter />}
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
