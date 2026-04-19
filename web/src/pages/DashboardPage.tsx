import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Dashboard</h1>
          <p className="text-sm text-fg-muted">Your account overview and quick actions.</p>
        </div>
        {unreadCount !== null ? (
          <Button asChild variant="outline">
            <Link to="/notifications">
              Notifications
              <Badge variant={unreadCount > 0 ? 'warning' : 'outline'} className="ml-1">
                {unreadCount}
              </Badge>
            </Link>
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {loadError}
        </div>
      ) : null}

      {!me && !loadError ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : null}

      {me ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your core account details.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-fg-muted">ID</dt>
                <dd className="text-fg">{String(me.id)}</dd>
                <dt className="text-fg-muted">Email</dt>
                <dd className="text-fg">{me.email}</dd>
                <dt className="text-fg-muted">Status</dt>
                <dd>
                  <Badge variant="success">{me.status}</Badge>
                </dd>
                <dt className="text-fg-muted">Roles</dt>
                <dd className="flex flex-wrap gap-1">
                  {roles.length ? (
                    roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-fg-subtle">none</span>
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>

          {me.client_profile ? (
            <Card>
              <CardHeader>
                <CardTitle>Client profile</CardTitle>
                <CardDescription>Public-facing identity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-fg-muted">Display name</dt>
                  <dd className="text-fg">{me.client_profile.display_name}</dd>
                  <dt className="text-fg-muted">Slug</dt>
                  <dd>
                    <code className="rounded bg-subtle px-1.5 py-0.5 text-xs text-fg">
                      {me.client_profile.slug}
                    </code>
                  </dd>
                  <dt className="text-fg-muted">Verification</dt>
                  <dd>
                    <VerificationBadge
                      state={verificationFromLevel(me.client_profile.verification_level)}
                    />
                  </dd>
                </dl>
                <div>
                  <Button asChild variant="outline">
                    <Link to="/profile">Edit profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Client profile</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-fg-muted">No client profile yet.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to="/jobs">Browse jobs</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/workers">Find workers</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/my-applications">My applications</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/inbox">Inbox</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {me.client_profile?.worker_profile || me.client_profile?.employer_profile ? (
            <Card>
              <CardHeader>
                <CardTitle>Profile data</CardTitle>
                <CardDescription>Raw JSON for debugging.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {me.client_profile?.worker_profile ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-fg">Worker</h4>
                    <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                      {JSON.stringify(me.client_profile.worker_profile, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {me.client_profile?.employer_profile ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-fg">Employer</h4>
                    <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                      {JSON.stringify(me.client_profile.employer_profile, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
