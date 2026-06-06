import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyRound,
  Mail,
  ShieldCheck,
  ShieldOff,
  UserCheck,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { AuthBanner } from '@/components/AuthBanner';
import { formatDateTime } from '@/lib/format';
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
  staff_role: string;
  staff_roles?: string[];
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

type RoleRow = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
};

export function StaffManagementCard() {
  const { t } = useTranslation('admin');
  const [me, setMe] = useState<AccountMe | null>(null);
  const isAdmin =
    typeof me?.staff_member?.staff_role === 'string' &&
    me.staff_member.staff_role === 'ADMIN';
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loadError, setLoadError] = useState('');

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [staffRole, setStaffRole] = useState<string>('STAFF');
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
        setLoadError(t('staff.noPermission'));
      } else {
        setLoadError(parsed?.message ?? t('staff.loadFailed'));
      }
    }
  }

  useEffect(() => {
    void api<AccountMe>('/account/me').then(setMe).catch(() => setMe(null));
    void api<RoleRow[]>('/admin/roles')
      .then(setRoles)
      .catch(() => setRoles([]));
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
      setStaffRole('STAFF');
      setCreateOpen(false);
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      const code = parsed?.code;
      const title =
        code === 'ALREADY_STAFF'
          ? t('staff.errAlreadyStaff')
          : code === 'ACCOUNT_DEACTIVATED'
            ? t('staff.errDeactivated')
            : code === 'ACCOUNT_NOT_VERIFIED'
              ? t('staff.errNotVerified')
              : t('staff.errCreateFailed');
      setCreateResult({
        ok: false,
        title,
        message: parsed?.message ?? t('staff.errGeneric'),
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
        message: parsed?.message ?? t('staff.actionFailed'),
      });
    }
  }

  function handleChangeRole(row: StaffRow, newRole: string) {
    if (row.staff_role === newRole) return;
    void withRowAction(
      () =>
        api(`/staff/${row.id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ staff_role: newRole }),
        }),
      t('staff.roleChanged', { email: row.email, role: newRole }),
    );
  }

  function handleReinvite(row: StaffRow) {
    void withRowAction(
      () => api(`/staff/${row.id}/reinvite`, { method: 'POST' }),
      t('staff.reinvited', { email: row.email }),
    );
  }

  function handleResetPassword(row: StaffRow) {
    if (!confirm(t('staff.resetConfirm', { email: row.email }))) {
      return;
    }
    void withRowAction(
      () => api(`/staff/${row.id}/reset-password`, { method: 'POST' }),
      t('staff.resetDone', { email: row.email }),
    );
  }

  function handleDeactivate(row: StaffRow) {
    if (!confirm(t('staff.deactivateConfirm', { email: row.email }))) return;
    void withRowAction(
      () => api(`/staff/${row.id}`, { method: 'DELETE' }),
      t('staff.deactivated', { email: row.email }),
    );
  }

  function handleReactivate(row: StaffRow) {
    void withRowAction(
      () => api(`/staff/${row.id}/reactivate`, { method: 'POST' }),
      t('staff.reactivated', { email: row.email }),
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{t('staff.title')}</CardTitle>
            <CardDescription>
              {t('staff.descBase')}
              {isAdmin ? t('staff.descAdmin') : t('staff.descNonAdmin')}
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen((v) => !v)}
            >
              {createOpen ? t('staff.cancel') : t('staff.addStaff')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {createResult?.ok ? (
          <AuthBanner variant="success" title={createResult.promoted ? t('staff.promotedTitle') : t('staff.createdTitle')}>
            {createResult.promoted ? (
              <>
                <span className="font-medium text-fg">{createResult.email}</span>
                {t('staff.promotedBody')}
              </>
            ) : (
              <>
                {t('staff.createdPre')}
                <span className="font-medium text-fg">{createResult.email}</span>
                {t('staff.createdPost')}
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
              <Label htmlFor="staff-email">{t('staff.email')}</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('staff.emailPlaceholder')}
                required
              />
              <p className="text-xs text-fg-muted">{t('staff.emailHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-name">{t('staff.displayName')}</Label>
              <Input
                id="staff-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('staff.displayNamePlaceholder')}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">{t('staff.role')}</Label>
              <Select
                value={staffRole}
                onValueChange={setStaffRole}
              >
                <SelectTrigger id="staff-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(roles.length > 0
                    ? roles
                    : ([
                        { id: 0, name: 'STAFF' } as RoleRow,
                        { id: 1, name: 'ADMIN' } as RoleRow,
                      ])
                  ).map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? t('staff.sending') : t('staff.createSendInvite')}
              </Button>
            </div>
          </form>
        ) : null}

        {loadError ? (
          <AuthBanner variant="danger" title={t('staff.loadErrorTitle')}>
            {loadError}
          </AuthBanner>
        ) : null}

        {rowResult ? (
          <AuthBanner
            variant={rowResult.ok ? 'success' : 'danger'}
            title={rowResult.ok ? t('staff.done') : t('staff.rowActionFailed')}
          >
            {rowResult.message}
          </AuthBanner>
        ) : null}

        {staff ? (
          staff.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('staff.noStaff')}</p>
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
                          <span className="ml-2 text-xs text-primary">{t('staff.you')}</span>
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
                          <Badge variant="danger">{t('staff.inviteExpired')}</Badge>
                        ) : s.invite_active ? (
                          <Badge variant="warning">{t('staff.invitePending')}</Badge>
                        ) : null}
                        <span>
                          {s.last_login_at
                            ? t('staff.lastSeen', {
                                when: formatDateTime(s.last_login_at),
                              })
                            : t('staff.neverSignedIn')}
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
                              handleChangeRole(s, v)
                            }
                          >
                            <SelectTrigger className="h-8 w-40 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(roles.length > 0
                                ? roles
                                : ([
                                    { id: 0, name: 'STAFF' } as RoleRow,
                                    { id: 1, name: 'ADMIN' } as RoleRow,
                                  ])
                              ).map((r) => (
                                <SelectItem key={r.name} value={r.name}>
                                  {r.name}
                                </SelectItem>
                              ))}
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
                              {t('staff.resendInvite')}
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
                              {t('staff.resetPassword')}
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
                              {t('staff.deactivate')}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReactivate(s)}
                            >
                              <UserCheck />
                              {t('staff.reactivate')}
                            </Button>
                          )}
                        </>
                      ) : null}
                      {isSelf ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {t('staff.cantChangeOwnRole')}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <p className="text-sm text-fg-muted">{t('staff.loading')}</p>
        )}
      </CardContent>
    </Card>
  );
}
