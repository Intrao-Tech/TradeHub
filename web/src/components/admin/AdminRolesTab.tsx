import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { Badge } from '@/components/ui/badge';
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
import { EmptyState } from '../EmptyState';

type Role = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  member_count: number;
  permission_keys: string[];
  has_all_permissions: boolean;
  created_at: string;
};

type PermissionsByCategory = {
  total: number;
  categories: {
    category: string;
    items: { key: string; description: string; is_system: boolean }[];
  }[];
};

export function AdminRolesTab() {
  const { t } = useTranslation('admin');
  const { hasPermission } = useAccountMe();
  const canManage = hasPermission('roles.manage');

  const [roles, setRoles] = useState<Role[]>([]);
  const [permIndex, setPermIndex] = useState<PermissionsByCategory | null>(
    null,
  );
  const [err, setErr] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [r, p] = await Promise.all([
        api<Role[]>('/admin/roles'),
        api<PermissionsByCategory>('/admin/roles/permissions'),
      ]);
      setRoles(r);
      setPermIndex(p);
      if (selectedId == null && r.length > 0) setSelectedId(r[0].id);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('roles.loadError'));
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  async function deleteRole(role: Role) {
    if (!confirm(t('roles.confirmDelete', { name: role.name }))) return;
    try {
      await api(`/admin/roles/${role.id}`, { method: 'DELETE' });
      setSelectedId(null);
      void load();
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('roles.deleteFailed'));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.8fr]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-fg-muted" />
                <CardTitle>{t('roles.title')}</CardTitle>
              </div>
              <CardDescription>{t('roles.desc')}</CardDescription>
            </div>
            {canManage ? (
              <Button
                size="sm"
                variant={createOpen ? 'ghost' : 'outline'}
                onClick={() => setCreateOpen((v) => !v)}
              >
                {createOpen ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    {t('roles.cancel')}
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    {t('roles.newRole')}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}
          {roles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t('roles.noRoles')}
              description={t('roles.noRolesDesc')}
            />
          ) : (
            <ul className="space-y-1">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateOpen(false);
                      setSelectedId(r.id);
                    }}
                    className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                      !createOpen && selectedId === r.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border-subtle hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{r.name}</span>
                      <Badge
                        variant={r.is_system ? 'secondary' : 'outline'}
                      >
                        {r.is_system ? t('roles.system') : t('roles.custom')}
                      </Badge>
                    </div>
                    <div className="text-xs text-fg-muted mt-1">
                      {t('roles.memberCount', { count: r.member_count })} ·{' '}
                      {r.has_all_permissions
                        ? t('roles.everyPermission')
                        : t('roles.permissionCount', {
                            count: r.permission_keys.length,
                          })}
                    </div>
                    {r.description ? (
                      <div className="text-xs text-fg-muted mt-1 line-clamp-2">
                        {r.description}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {createOpen ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-fg-muted" />
              <CardTitle>{t('roles.createTitle')}</CardTitle>
            </div>
            <CardDescription>{t('roles.createDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RoleCreateForm
              permIndex={permIndex}
              onSaved={(role) => {
                setCreateOpen(false);
                setSelectedId(role.id);
                void load();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </CardContent>
        </Card>
      ) : (
        <RoleDetailCard
          role={selectedRole}
          permIndex={permIndex}
          canManage={canManage}
          onChanged={load}
          onDelete={deleteRole}
          onError={setErr}
        />
      )}
    </div>
  );
}

function RoleCreateForm({
  permIndex,
  onSaved,
  onCancel,
}: {
  permIndex: PermissionsByCategory | null;
  onSaved: (role: Role) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('admin');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      const created = await api<Role>('/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim().toUpperCase(),
          description: description.trim() || undefined,
          permission_keys: Array.from(selected),
        }),
      });
      onSaved(created);
    } catch (e2) {
      setErr(parseApiError(e2)?.message ?? t('roles.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err ? (
        <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {err}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('roles.nameLabel')}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('roles.namePlaceholder')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>{t('roles.descriptionLabel')}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('roles.descriptionPlaceholder')}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('roles.permissions')}</Label>
        <PermissionPicker
          permIndex={permIndex}
          selected={selected}
          onToggle={toggle}
          disabled={false}
        />
      </div>
      <div className="flex gap-2 sticky bottom-0 bg-bg pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? t('roles.creating') : t('roles.createRole')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('roles.cancel')}
        </Button>
      </div>
    </form>
  );
}

function RoleDetailCard({
  role,
  permIndex,
  canManage,
  onChanged,
  onDelete,
  onError,
}: {
  role: Role | null;
  permIndex: PermissionsByCategory | null;
  canManage: boolean;
  onChanged: () => void;
  onDelete: (role: Role) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role) {
      setDraft(new Set(role.permission_keys));
      setDirty(false);
    }
  }, [role?.id, role?.permission_keys.join('|')]);

  if (!role) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('roles.detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ShieldCheck}
            title={t('roles.noSelection')}
            description={t('roles.noSelectionDesc')}
          />
        </CardContent>
      </Card>
    );
  }

  const editable = canManage && role.name !== 'ADMIN';

  function toggle(key: string) {
    if (!editable) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!editable || !dirty) return;
    setSaving(true);
    try {
      await api(`/admin/roles/${role!.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission_keys: Array.from(draft) }),
      });
      setDirty(false);
      onChanged();
    } catch (e) {
      onError(parseApiError(e)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{role.name}</CardTitle>
              <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                {role.is_system ? t('roles.system') : t('roles.custom')}
              </Badge>
              {role.has_all_permissions ? (
                <Badge variant="success">{t('roles.allPermissions')}</Badge>
              ) : null}
            </div>
            <CardDescription>
              {role.description ?? t('roles.noDescription')} ·{' '}
              {t('roles.memberCount', { count: role.member_count })}
            </CardDescription>
          </div>
          {canManage && !role.is_system ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(role)}
              disabled={role.member_count > 0}
              title={
                role.member_count > 0 ? t('roles.reassignFirst') : ''
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('roles.delete')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {role.has_all_permissions ? (
          <p className="text-sm text-fg-muted">{t('roles.adminImplicit')}</p>
        ) : (
          <>
            <PermissionPicker
              permIndex={permIndex}
              selected={draft}
              onToggle={toggle}
              disabled={!editable}
            />
            {editable ? (
              <div className="flex items-center gap-2">
                <Button onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? t('roles.saving') : t('roles.savePermissions')}
                </Button>
                {dirty ? (
                  <span className="text-xs text-warning">
                    {t('roles.unsavedChanges')}
                  </span>
                ) : null}
              </div>
            ) : !canManage ? (
              <p className="text-xs text-fg-muted">{t('roles.viewOnly')}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionPicker({
  permIndex,
  selected,
  onToggle,
  disabled,
}: {
  permIndex: PermissionsByCategory | null;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('admin');
  if (!permIndex) return <p className="text-sm text-fg-muted">{t('roles.loading')}</p>;
  return (
    <div className="space-y-4">
      {permIndex.categories.map((cat) => (
        <div key={cat.category}>
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-1">
            {cat.category}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {cat.items.map((p) => {
              const on = selected.has(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                    on
                      ? 'border-primary bg-primary/5'
                      : 'border-border-subtle'
                  } ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-border-strong'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(p.key)}
                    disabled={disabled}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-[11px]">{p.key}</div>
                    <div className="text-fg-muted leading-snug">
                      {p.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
