import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { api, getToken, clearTokens } from './api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import WorkerSearchPage from './pages/WorkerSearchPage';
import EmployerSearchPage from './pages/EmployerSearchPage';
import ProfilePage from './pages/ProfilePage';
import CollaborationsPage from './pages/CollaborationsPage';
import ReferralsPage from './pages/ReferralsPage';
import ReviewsPage from './pages/ReviewsPage';
import AdminPage from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';
import JobBoardPage from './pages/JobBoardPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import InboxPage from './pages/InboxPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';

type NavItem = { to: string; label: string };

const PUBLIC_NAV: NavItem[] = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/workers', label: 'Workers' },
  { to: '/employers', label: 'Employers' },
  { to: '/reviews', label: 'Reviews' },
];

const PRIVATE_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/profile', label: 'My Profile' },
  { to: '/my-applications', label: 'Applications' },
  { to: '/collaborations', label: 'Collaborations' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/admin', label: 'Admin' },
];

function Protected({ loggedIn, children }: { loggedIn: boolean; children: React.ReactElement }) {
  const location = useLocation();
  if (!loggedIn) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return children;
}

function App() {
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
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearTokens();
    setLoggedIn(false);
    window.dispatchEvent(new Event('auth-changed'));
  };

  const onAuthSuccess = () => {
    setLoggedIn(true);
    window.dispatchEvent(new Event('auth-changed'));
  };

  return (
    <BrowserRouter>
      <nav className="nav">
        <div className="nav-inner">
          <NavLink to={loggedIn ? '/dashboard' : '/jobs'} className="nav-brand">
            Trade<span>Hub</span>
          </NavLink>
          {PUBLIC_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
          {loggedIn && PRIVATE_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
          <div className="nav-spacer" />
          {loggedIn ? (
            <div className="nav-user">
              <button type="button" className="btn-ghost" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">Login</NavLink>
              <NavLink to="/register" className="btn btn-primary" style={{ marginLeft: 4 }}>Sign up</NavLink>
            </>
          )}
        </div>
      </nav>

      <Routes>
        <Route path="/login" element={<LoginPage onLogin={onAuthSuccess} />} />
        <Route path="/register" element={<RegisterPage onRegister={onAuthSuccess} />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage onLogin={onAuthSuccess} />} />

        <Route path="/jobs" element={<div className="page"><JobBoardPage /></div>} />
        <Route path="/workers" element={<div className="page"><WorkerSearchPage /></div>} />
        <Route path="/employers" element={<div className="page"><EmployerSearchPage /></div>} />
        <Route path="/reviews" element={<div className="page"><ReviewsPage /></div>} />

        <Route path="/dashboard" element={<Protected loggedIn={loggedIn}><div className="page"><DashboardPage /></div></Protected>} />
        <Route path="/profile" element={<Protected loggedIn={loggedIn}><div className="page"><ProfilePage /></div></Protected>} />
        <Route path="/collaborations" element={<Protected loggedIn={loggedIn}><div className="page"><CollaborationsPage /></div></Protected>} />
        <Route path="/referrals" element={<Protected loggedIn={loggedIn}><div className="page"><ReferralsPage /></div></Protected>} />
        <Route path="/notifications" element={<Protected loggedIn={loggedIn}><div className="page"><NotificationsPage /></div></Protected>} />
        <Route path="/admin" element={<Protected loggedIn={loggedIn}><div className="page"><AdminPage /></div></Protected>} />
        <Route path="/my-applications" element={<Protected loggedIn={loggedIn}><div className="page"><MyApplicationsPage /></div></Protected>} />
        <Route path="/inbox" element={<Protected loggedIn={loggedIn}><div className="page"><InboxPage /></div></Protected>} />

        <Route path="/" element={<Navigate to={loggedIn ? '/dashboard' : '/jobs'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
