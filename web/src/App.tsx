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

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkerSearchPage = lazy(() => import('./pages/WorkerSearchPage'));
const WorkerDetailPage = lazy(() => import('./pages/WorkerDetailPage'));
const EmployerSearchPage = lazy(() => import('./pages/EmployerSearchPage'));
const EmployerDetailPage = lazy(() => import('./pages/EmployerDetailPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CollaborationsPage = lazy(() => import('./pages/CollaborationsPage'));
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'));
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const JobBoardPage = lazy(() => import('./pages/JobBoardPage'));
const MyApplicationsPage = lazy(() => import('./pages/MyApplicationsPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));

// ── Nav items ───────────────────────────────────────────────────────

const PUBLIC_NAV: NavItem[] = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/workers', label: 'Workers' },
  { to: '/employers', label: 'Employers' },
  { to: '/reviews', label: 'Reviews' },
];

const PRIVATE_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/profile', label: 'Profile' },
  { to: '/my-applications', label: 'Applications' },
  { to: '/collaborations', label: 'Work' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/notifications', label: 'Alerts' },
  { to: '/settings/security', label: 'Settings' },
];

const STAFF_NAV: NavItem[] = [
  { to: '/admin', label: 'Admin' },
  { to: '/settings/security', label: 'Settings' },
];

// ── Helpers ─────────────────────────────────────────────────────────

function Protected({
  loggedIn,
  children,
}: {
  loggedIn: boolean;
  children: React.ReactElement;
}) {
  const location = useLocation();
  if (!loggedIn) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
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
          <Route path="/jobs" element={<JobBoardPage />} />
          <Route path="/workers" element={<WorkerSearchPage />} />
          <Route path="/workers/:id" element={<WorkerDetailPage />} />
          <Route path="/employers" element={<EmployerSearchPage />} />
          <Route path="/employers/:id" element={<EmployerDetailPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />

          {/* Private */}
          <Route path="/dashboard" element={<Protected loggedIn={loggedIn}><DashboardPage /></Protected>} />
          <Route path="/profile" element={<Protected loggedIn={loggedIn}><ProfilePage /></Protected>} />
          <Route path="/collaborations" element={<Protected loggedIn={loggedIn}><CollaborationsPage /></Protected>} />
          <Route path="/referrals" element={<Protected loggedIn={loggedIn}><ReferralsPage /></Protected>} />
          <Route path="/notifications" element={<Protected loggedIn={loggedIn}><NotificationsPage /></Protected>} />
          <Route path="/my-applications" element={<Protected loggedIn={loggedIn}><MyApplicationsPage /></Protected>} />
          <Route path="/inbox" element={<Protected loggedIn={loggedIn}><InboxPage /></Protected>} />
          <Route path="/settings/security" element={<Protected loggedIn={loggedIn}><SettingsSecurityPage /></Protected>} />

          {/* Marketplace stragglers landing on /internal/* — punt them to the staff subdomain */}
          <Route path="/internal/*" element={<MarketplaceInternalBounce />} />

          {/* Default */}
          <Route path="/" element={<Navigate to={loggedIn ? '/profile' : '/jobs'} replace />} />
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
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/admin" element={<Protected loggedIn={loggedIn}><AdminPage /></Protected>} />
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
    </BrowserRouter>
  );
}

export default App;
