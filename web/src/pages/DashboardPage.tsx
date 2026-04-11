import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type ClientProfile = {
  display_name: string;
  slug: string;
  verification_level: string;
  worker_profile: Record<string, unknown> | null;
  employer_profile: Record<string, unknown> | null;
};

type AccountMe = {
  id: number;
  email: string;
  status: string;
  client_profile: ClientProfile | null;
  staff_member: Record<string, unknown> | null;
};

function rolesFromAccount(me: AccountMe): string[] {
  const roles: string[] = [];
  if (me.client_profile?.worker_profile) roles.push('WORKER');
  if (me.client_profile?.employer_profile) roles.push('EMPLOYER');
  if (me.staff_member) roles.push('STAFF');
  return roles;
}

export default function DashboardPage() {
  const [me, setMe] = useState<AccountMe | null>(null);
  const [loadError, setLoadError] = useState('');
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError('');
      try {
        const data = await api<AccountMe>('/account/me');
        if (!cancelled) setMe(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
      try {
        const count = await api<number>('/notifications/unread-count');
        if (!cancelled) setUnreadCount(count);
      } catch {
        /* ignore, not critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roles = me ? rolesFromAccount(me) : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Your account overview and quick actions.</p>
        </div>
        {unreadCount !== null && (
          <Link to="/notifications" className="btn">
            Notifications <span className="badge badge-primary">{unreadCount}</span>
          </Link>
        )}
      </div>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {!me && !loadError && <div className="empty-state">Loading your account…</div>}

      {me && (
        <div className="grid-2">
          <div className="card">
            <h2>Account</h2>
            <dl className="kv">
              <dt>ID</dt><dd>{String(me.id)}</dd>
              <dt>Email</dt><dd>{me.email}</dd>
              <dt>Status</dt><dd><span className="badge badge-success">{me.status}</span></dd>
              <dt>Roles</dt>
              <dd>
                {roles.length ? (
                  roles.map((r) => <span key={r} className="badge badge-primary" style={{ marginRight: 6 }}>{r}</span>)
                ) : (
                  <span className="muted">none</span>
                )}
              </dd>
            </dl>
          </div>

          {me.client_profile ? (
            <div className="card">
              <h2>Client profile</h2>
              <dl className="kv">
                <dt>Display name</dt><dd>{me.client_profile.display_name}</dd>
                <dt>Slug</dt><dd><code>{me.client_profile.slug}</code></dd>
                <dt>Verification</dt>
                <dd><span className="badge">{me.client_profile.verification_level}</span></dd>
              </dl>
              <div className="row" style={{ marginTop: 14 }}>
                <Link to="/profile" className="btn">Edit profile</Link>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2>Client profile</h2>
              <p className="muted">No client profile yet.</p>
            </div>
          )}

          <div className="card">
            <h2>Quick actions</h2>
            <div className="stack-sm stack">
              <Link to="/jobs" className="btn">Browse jobs</Link>
              <Link to="/workers" className="btn">Find workers</Link>
              <Link to="/my-applications" className="btn">My applications</Link>
              <Link to="/inbox" className="btn">Inbox</Link>
            </div>
          </div>

          {(me.client_profile?.worker_profile || me.client_profile?.employer_profile) && (
            <div className="card">
              <h2>Profile data</h2>
              {me.client_profile?.worker_profile && (
                <>
                  <h4>Worker</h4>
                  <pre>{JSON.stringify(me.client_profile.worker_profile, null, 2)}</pre>
                </>
              )}
              {me.client_profile?.employer_profile && (
                <>
                  <h4>Employer</h4>
                  <pre>{JSON.stringify(me.client_profile.employer_profile, null, 2)}</pre>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
