import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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

function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());

  useEffect(() => {
    const check = () => setLoggedIn(!!getToken());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  const handleLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearTokens();
    setLoggedIn(false);
  };

  return (
    <BrowserRouter>
      <nav style={{ padding: '10px 20px', background: '#1a1a2e', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ color: '#e94560', marginRight: '20px', fontSize: '18px' }}>TradeHub</strong>
        <Link to="/jobs" style={navLink}>Job Board</Link>
        {loggedIn ? (
          <>
            <Link to="/dashboard" style={navLink}>Dashboard</Link>
            <Link to="/profile" style={navLink}>My Profile</Link>
            <Link to="/workers" style={navLink}>Workers</Link>
            <Link to="/employers" style={navLink}>Employers</Link>
            <Link to="/collaborations" style={navLink}>Collaborations</Link>
            <Link to="/referrals" style={navLink}>Referrals</Link>
            <Link to="/reviews" style={navLink}>Reviews</Link>
            <Link to="/notifications" style={navLink}>Notifications</Link>
            <Link to="/my-applications" style={navLink}>My Applications</Link>
            <Link to="/inbox" style={navLink}>Inbox</Link>
            <Link to="/admin" style={navLink}>Admin</Link>
            <button onClick={handleLogout} style={{ ...navLink, background: 'none', border: '1px solid #e94560', cursor: 'pointer', padding: '4px 12px', borderRadius: '4px' }}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={navLink}>Login</Link>
            <Link to="/register" style={navLink}>Register</Link>
          </>
        )}
      </nav>

      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={() => setLoggedIn(true)} />} />
          <Route path="/register" element={<RegisterPage onRegister={() => setLoggedIn(true)} />} />
          <Route path="/dashboard" element={loggedIn ? <DashboardPage /> : <Navigate to="/login" />} />
          <Route path="/profile" element={loggedIn ? <ProfilePage /> : <Navigate to="/login" />} />
          <Route path="/jobs" element={<JobBoardPage />} />
          <Route path="/workers" element={<WorkerSearchPage />} />
          <Route path="/employers" element={<EmployerSearchPage />} />
          <Route path="/collaborations" element={loggedIn ? <CollaborationsPage /> : <Navigate to="/login" />} />
          <Route path="/referrals" element={loggedIn ? <ReferralsPage /> : <Navigate to="/login" />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/notifications" element={loggedIn ? <NotificationsPage /> : <Navigate to="/login" />} />
          <Route path="/admin" element={loggedIn ? <AdminPage /> : <Navigate to="/login" />} />
          <Route path="/my-applications" element={loggedIn ? <MyApplicationsPage /> : <Navigate to="/login" />} />
          <Route path="/inbox" element={loggedIn ? <InboxPage /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={loggedIn ? '/dashboard' : '/login'} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const navLink: React.CSSProperties = { color: '#eee', textDecoration: 'none', fontSize: '14px' };

export default App;
