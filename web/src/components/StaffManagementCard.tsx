import { useEffect, useState } from 'react';
import {
  KeyRound,
  Mail,
  ShieldCheck,
  ShieldOff,
  UserCheck,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { AuthBanner } from '@/components/AuthBanner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  staff_role: 'ADMIN' | 'MODERATOR';
  status: string;
  last_login_at: string | null;
  created_at: string;
  invite_expires_at: string | null;
  invite_active: boolean;
  invite_expired: boolean;
  has_signed_in: boolean;
};

type AccountMe = {
  id: string | number;
  staff_member?: { staff_role?: string } | null;
};

export function StaffManagementCard() {
  const [me, setMe] = useState<AccountMe | null>(null);
  const isAdmin =
    typeof me?.staff_member?.staff_role === 'string' &&
    me.staff_member.staff_role === 'ADMIN';
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [loadError, setLoadError] = useState('');

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [staffRole, setStaffRole] = useState<'ADMIN' | 'MODERATOR'>('MODERATOR');
  const [submitting, setSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<
    | { ok: true; email: string; promoted: boolean }
    | { ok: false; title: string; message: string }
    | null
  >(null);

  // Per-row action result (toasted as a banner above the list)
  const [rowResult, setRowResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null);

  async function load() {
    setLoadError('');
    try {
      const data = await api<StaffRow[]>('/staff');
      setStaff(data);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.status === 403) {
        setLoadError(
          'You don\'t have permission to manage staff. Only admins can access this section.',
        );
      } else {
        setLoadError(parsed?.message ?? 'Could not load staff list.');
      }
    }
  }

  useEffect(() => {
    void api<AccountMe>('/account/me').then(setMe).catch(() => setMe(null));
    void load();
  }, []);

  // ── Create / promote ───────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateResult(null);
    setSubmitting(true);
    try {
      const data = await api<{ promoted_existing_account?: boolean }>('/staff', {
        method: 'POST',
        body: JSON.stringify({
          email,
          display_name: displayName,
          staff_role: staffRole,
        }),
      });
      setCreateResult({
        ok: true,
        email,
        promoted: data.promoted_existing_account === true,
      });
      setEmail('');
      setDisplayName('');
      setStaffRole('MODERATOR');
      setCreateOpen(false);
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      const code = parsed?.code;
      const title =
        code === 'ALREADY_STAFF'
          ? 'Already a staff member'
          : code === 'ACCOUNT_DEACTIVATED'
            ? 'Account is deactivated'
            : code === 'ACCOUNT_NOT_VERIFIED'
              ? 'Account is not verified'
              : 'Could not create staff account';
      setCreateResult({
        ok: false,
        title,
        message: parsed?.message ?? 'Something went wrong.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Per-row actions ────────────────────────────────────────────

  async function withRowAction<T>(
    fn: () => Promise<T>,
    successMessage: string,
  ): Promise<void> {
    setRowResult(null);
    try {
      await fn();
      setRowResult({ ok: true, message: successMessage });
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      setRowResult({
        ok: false,
        message: parsed?.message ?? 'Action failed.',
      });
    }
  }

  function handleChangeRole(row: StaffRow, newRole: 'ADMIN' | 'MODERATOR') {
    if (row.staff_role === newRole) return;
    void withRowAction(
      () =>
        api(`/staff/${row.id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ staff_role: newRole }),
        }),
      `${row.email} is now ${newRole}.`,
    );
  }

  function handleReinvite(row: StaffRow) {
    void withRowAction(
      () => api(`/staff/${row.id}/reinvite`, { method: 'POST' }),
      `Fresh invite emailed to ${row.email}.`,
    );
  }

  function handleResetPassword(row: StaffRow) {
    if (
      !confirm(
        `Reset password for ${row.email}? A new password will be emailed and they'll be signed out everywhere.`,
      )
    ) {
      return;
    }
    void withRowAction(
      () => api(`/staff/${row.id}/reset-password`, { method: 'POST' }),
      `New password emailed to ${row.email}. They've been signed out of all devices.`,
    );
  }

  function handleDeactivate(row: StaffRow) {
    if (!confirm(`Deactivate staff account ${row.email}?`)) return;
    void withRowAction(
      () => api(`/staff/${row.id}`, { method: 'DELETE' }),
      `${row.email} deactivated.`,
    );
  }

  function handleReactivate(row: StaffRow) {
    void withRowAction(
      () => api(`/staff/${row.id}/reactivate`, { method: 'POST' }),
      `${row.email} reactivated.`,
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              All TradeHub admins and moderators.{' '}
              {isAdmin
                ? 'You can create new staff, change roles, reset passwords, and deactivate accounts.'
                : 'Only admins can change roles, create new staff, or reset passwords.'}
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen((v) => !v)}
            >
              {createOpen ? 'Cancel' : 'Add staff'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {createResult?.ok ? (
          <AuthBanner variant="success" title={createResult.promoted ? 'Existing account promoted to staff' : 'Staff account created'}>
            {createResult.promoted ? (
              <>
                <span className="font-medium text-fg">{createResult.email}</span>{' '}
                already had a TradeHub account — we promoted it to staff and
                sent them a notification email. Their existing password still
                works.
              </>
            ) : (
              <>
                We emailed sign-in instructions to{' '}
                <span className="font-medium text-fg">{createResult.email}</span>.
                The invite expires in 24 hours.
              </>
            )}
          </AuthBanner>
        ) : null}
        {createResult && !createResult.ok ? (
          <AuthBanner variant="danger" title={createResult.title}>
            {createResult.message}
          </AuthBanner>
        ) : null}

        {createOpen && isAdmin ? (
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.moderator@tradehub.co.uk"
                required
              />
              <p className="text-xs text-fg-muted">
                Existing client emails can be promoted — they keep their current password.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-name">Display name</Label>
              <Input
                id="staff-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Moderator"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">Role</Label>
              <Select
                value={staffRole}
                onValueChange={(v) =>
                  setStaffRole(v as 'ADMIN' | 'MODERATOR')
                }
              >
                <SelectTrigger id="staff-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MODERATOR">Moderator</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Create + send invite'}
              </Button>
            </div>
          </form>
        ) : null}

        {loadError ? (
          <AuthBanner variant="danger" title="Could not load staff">
            {loadError}
          </AuthBanner>
        ) : null}

        {rowResult ? (
          <AuthBanner
            variant={rowResult.ok ? 'success' : 'danger'}
            title={rowResult.ok ? 'Done' : 'Action failed'}
          >
            {rowResult.message}
          </AuthBanner>
        ) : null}

        {staff ? (
          staff.length === 0 ? (
            <p className="text-sm text-fg-muted">No staff accounts yet.</p>
          ) : (
            <ul className="divide-y divide-border-default rounded-md border border-border-default">
              {staff.map((s) => {
                const isSelf = me != null && String(me.id) === s.id;
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-fg">
                        {s.display_name}{' '}
                        <span className="text-xs text-fg-muted">({s.email})</span>
                        {isSelf ? (
                          <span className="ml-2 text-xs text-primary">you</span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                        <Badge variant={s.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {s.status}
                        </Badge>
                        <Badge variant={s.staff_role === 'ADMIN' ? 'default' : 'outline'}>
                          {s.staff_role}
                        </Badge>
                        {s.invite_expired ? (
                          <Badge variant="danger">invite expired</Badge>
                        ) : s.invite_active ? (
                          <Badge variant="warning">invite pending</Badge>
                        ) : null}
                        <span>
                          {s.last_login_at
                            ? `last seen ${new Date(s.last_login_at).toLocaleString()}`
                            : 'never signed in'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin && !isSelf ? (
                        <>
                          {/* Role change */}
                          <Select
                            value={s.staff_role}
                            onValueChange={(v) =>
                              handleChangeRole(s, v as 'ADMIN' | 'MODERATOR')
                            }
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MODERATOR">Moderator</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Re-invite (never signed in) OR Reset password (already used) */}
                          {!s.has_signed_in && s.status === 'ACTIVE' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReinvite(s)}
                            >
                              <Mail />
                              Resend invite
                            </Button>
                          ) : null}
                          {s.has_signed_in && s.status === 'ACTIVE' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleResetPassword(s)}
                            >
                              <KeyRound />
                              Reset password
                            </Button>
                          ) : null}

                          {/* Deactivate / Reactivate */}
                          {s.status === 'ACTIVE' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeactivate(s)}
                            >
                              <ShieldOff />
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReactivate(s)}
                            >
                              <UserCheck />
                              Reactivate
                            </Button>
                          )}
                        </>
                      ) : null}
                      {isSelf ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          You can't change your own role here
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
      </CardContent>
    </Card>
  );
}
