import { useEffect, useState } from 'react';
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
  const [unreadError, setUnreadError] = useState('');
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchUnreadCount() {
    setUnreadError('');
    setUnreadCount(null);
    try {
      const count = await api<number>('/notifications/unread-count');
      setUnreadCount(count);
    } catch (err) {
      setUnreadError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h1>Dashboard</h1>
      {loadError ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{loadError}</div>
      ) : null}

      {!me && !loadError ? <div>Loading…</div> : null}

      {me ? (
        <>
          <h2>Account</h2>
          <div>id: {String(me.id)}</div>
          <div>email: {me.email}</div>
          <div>status: {me.status}</div>

          <h2>Role</h2>
          <div>{rolesFromAccount(me).join(' / ') || '(none)'}</div>

          {me.client_profile ? (
            <>
              <h2>Client profile</h2>
              <div>display_name: {me.client_profile.display_name}</div>
              <div>slug: {me.client_profile.slug}</div>
              <div>verification_level: {me.client_profile.verification_level}</div>
            </>
          ) : (
            <div>No client_profile</div>
          )}

          {me.client_profile?.worker_profile ? (
            <>
              <h2>Worker profile</h2>
              <pre>{JSON.stringify(me.client_profile.worker_profile, null, 2)}</pre>
            </>
          ) : null}

          {me.client_profile?.employer_profile ? (
            <>
              <h2>Employer profile</h2>
              <pre>{JSON.stringify(me.client_profile.employer_profile, null, 2)}</pre>
            </>
          ) : null}
        </>
      ) : null}

      <h2>Notifications</h2>
      {unreadError ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{unreadError}</div>
      ) : null}
      <button type="button" onClick={fetchUnreadCount}>
        Get unread count
      </button>
      {unreadCount !== null ? (
        <pre style={{ marginTop: 8 }}>{JSON.stringify(unreadCount, null, 2)}</pre>
      ) : null}
    </div>
  );
}
