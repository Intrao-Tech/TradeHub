import { useCallback, useEffect, useState } from 'react';
import { ListChecks, Plus, ShieldAlert } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '../EmptyState';
const ACTION_OPTIONS = [
  'PAYMENT_MARK_PAID',
  'PAYMENT_MARK_FAILED',
  'PAYMENT_RETRY_TRANSFER',
  'ESCROW_FORCE_RELEASE',
  'ESCROW_FORCE_REFUND',
  'ESCROW_FORCE_CANCEL',
  'VERIFICATION_DOC_APPROVE',
  'VERIFICATION_DOC_REJECT',
  'VERIFICATION_LEVEL_OVERRIDE',
  'USER_SUSPEND',
  'USER_UNSUSPEND',
  'USER_DELETE',
  'PLATFORM_SETTING_UPDATE',
  'STAFF_INVITE',
  'STAFF_ROLE_GRANT',
  'STAFF_ROLE_REVOKE',
  'BROADCAST_MESSAGE',
] as const;

type ConditionType =
  | 'AMOUNT_GT'
  | 'REQUESTING_STAFF_HAS_ROLE'
  | 'DOCUMENT_TYPE_EQUALS';

/**
 * Which condition kinds make sense for each action. Conditions read fields
 * off the action `context`; if the action never populates that field the
 * condition can never match → the rule would silently never fire. We hide
 * those buttons in the UI to prevent the trap.
 *
 * REQUESTING_STAFF_HAS_ROLE is always available (it reads the requester,
 * not the action context).
 */
const ACTION_COMPATIBLE_CONDITIONS: Record<
  (typeof ACTION_OPTIONS)[number],
  ConditionType[]
> = {
  // Money actions — amount_pence comes from the milestone/payment context
  ESCROW_FORCE_RELEASE: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  ESCROW_FORCE_REFUND: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  ESCROW_FORCE_CANCEL: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  PAYMENT_MARK_PAID: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  PAYMENT_MARK_FAILED: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  PAYMENT_RETRY_TRANSFER: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  // Document actions — doc_type comes from the document context
  VERIFICATION_DOC_APPROVE: [
    'DOCUMENT_TYPE_EQUALS',
    'REQUESTING_STAFF_HAS_ROLE',
  ],
  VERIFICATION_DOC_REJECT: [
    'DOCUMENT_TYPE_EQUALS',
    'REQUESTING_STAFF_HAS_ROLE',
  ],
  // Everything else — only requester role makes sense
  VERIFICATION_LEVEL_OVERRIDE: ['REQUESTING_STAFF_HAS_ROLE'],
  USER_SUSPEND: ['REQUESTING_STAFF_HAS_ROLE'],
  USER_UNSUSPEND: ['REQUESTING_STAFF_HAS_ROLE'],
  USER_DELETE: ['REQUESTING_STAFF_HAS_ROLE'],
  PLATFORM_SETTING_UPDATE: ['REQUESTING_STAFF_HAS_ROLE'],
  STAFF_INVITE: ['REQUESTING_STAFF_HAS_ROLE'],
  STAFF_ROLE_GRANT: ['REQUESTING_STAFF_HAS_ROLE'],
  STAFF_ROLE_REVOKE: ['REQUESTING_STAFF_HAS_ROLE'],
  BROADCAST_MESSAGE: ['REQUESTING_STAFF_HAS_ROLE'],
};

const CONDITION_LABEL: Record<ConditionType, string> = {
  AMOUNT_GT: '+ Amount >',
  REQUESTING_STAFF_HAS_ROLE: '+ Requestor role',
  DOCUMENT_TYPE_EQUALS: '+ Document type',
};

type Condition =
  | { type: 'AMOUNT_GT'; threshold_pence: number }
  | { type: 'REQUESTING_STAFF_HAS_ROLE'; staff_role_name: 'ADMIN' | 'STAFF' }
  | { type: 'DOCUMENT_TYPE_EQUALS'; document_type: string };

type Rule = {
  id: string;
  name: string;
  description: string | null;
  target_action: string;
  required_approver_role: string;
  is_active: boolean;
  conditions: { id: string; type: string; [k: string]: unknown }[];
};

export function AdminApprovalRulesTab() {
  const { isAdmin } = useAccountMe();
  const [rules, setRules] = useState<Rule[]>([]);
  const [err, setErr] = useState('');
  // Form state — shared between create and edit. `editingId` distinguishes:
  //   null → CREATE mode (POST /admin/approval-rules)
  //   string id → EDIT mode (PATCH /admin/approval-rules/:id with name/desc/is_active only)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAction, setTargetAction] = useState<string>(ACTION_OPTIONS[0]);
  const [approverRole, setApproverRole] = useState<'ADMIN' | 'STAFF'>('ADMIN');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [createErr, setCreateErr] = useState('');
  const [createMsg, setCreateMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName('');
    setDescription('');
    setTargetAction(ACTION_OPTIONS[0]);
    setApproverRole('ADMIN');
    setConditions([]);
    setIsActive(true);
    setCreateErr('');
    setCreateMsg('');
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description ?? '');
    setTargetAction(r.target_action);
    setApproverRole(r.required_approver_role as 'ADMIN' | 'STAFF');
    setConditions(
      r.conditions.map((c) => {
        const t = c.type;
        if (t === 'AMOUNT_GT') {
          return {
            type: 'AMOUNT_GT' as const,
            threshold_pence: Number(c.threshold_pence ?? 0),
          };
        }
        if (t === 'REQUESTING_STAFF_HAS_ROLE') {
          return {
            type: 'REQUESTING_STAFF_HAS_ROLE' as const,
            staff_role_name:
              (c.staff_role_name as 'ADMIN' | 'STAFF') ?? 'STAFF',
          };
        }
        return {
          type: 'DOCUMENT_TYPE_EQUALS' as const,
          document_type: String(c.document_type ?? 'PASSPORT'),
        };
      }),
    );
    setIsActive(r.is_active);
    setCreateErr('');
    setCreateMsg('');
  }

  const load = useCallback(async () => {
    setErr('');
    try {
      const data = await api<Rule[]>('/admin/approval-rules');
      setRules(data);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load rules');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function addCondition(type: Condition['type']) {
    if (type === 'AMOUNT_GT') {
      setConditions((cs) => [...cs, { type, threshold_pence: 50000 }]);
    } else if (type === 'REQUESTING_STAFF_HAS_ROLE') {
      setConditions((cs) => [...cs, { type, staff_role_name: 'STAFF' }]);
    } else {
      setConditions((cs) => [...cs, { type, document_type: 'PASSPORT' }]);
    }
  }

  async function submit() {
    setCreateErr('');
    setCreateMsg('');
    if (!name.trim()) {
      setCreateErr('Name required');
      return;
    }
    if (!conditions.length) {
      setCreateErr('At least one condition required');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        // Edit: backend accepts name / description / is_active + condition
        // VALUES (types/structure stay immutable). target_action and
        // approver_role can't change after creation.
        await api(`/admin/approval-rules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            is_active: isActive,
            conditions,
          }),
        });
        setCreateMsg('Rule updated.');
      } else {
        const body = {
          name: name.trim(),
          description: description.trim() || undefined,
          target_action: targetAction,
          required_approver_role: approverRole,
          conditions,
        };
        await api('/admin/approval-rules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setCreateMsg('Rule created.');
      }
      resetForm();
      void load();
    } catch (e) {
      setCreateErr(parseApiError(e)?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await api(`/admin/approval-rules/${id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Deactivate failed');
    }
  }

  return (
    <div
      className={
        isAdmin
          ? 'grid gap-4 lg:grid-cols-[1fr_1fr]'
          : 'grid gap-4'
      }
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-fg-muted" />
            <CardTitle>Existing rules</CardTitle>
          </div>
          <CardDescription>
            Rules are AND-ed against incoming actions. A match queues the
            request for the required approver role.
            {!isAdmin
              ? ' Only admins can create or deactivate rules.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {err}
            </div>
          ) : null}
          {rules.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No rules yet"
              description="Create your first rule on the right — every admin action will run immediately until you do."
            />
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className={
                    'rounded border p-3 space-y-1 ' +
                    (editingId === r.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border-subtle')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-xs text-fg-muted">
                        {r.description ?? '—'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant={r.is_active ? 'success' : 'secondary'}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          variant={editingId === r.id ? 'primary' : 'ghost'}
                          onClick={() =>
                            editingId === r.id ? resetForm() : startEdit(r)
                          }
                        >
                          {editingId === r.id ? 'Cancel edit' : 'Edit'}
                        </Button>
                      ) : null}
                      {isAdmin && r.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deactivate(r.id)}
                        >
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs flex flex-wrap gap-1">
                    <Badge variant="outline">{r.target_action}</Badge>
                    <Badge variant="outline">
                      approver: {r.required_approver_role}
                    </Badge>
                    {r.conditions.map((c) => (
                      <Badge key={c.id} variant="outline">
                        {c.type}
                        {'threshold_pence' in c
                          ? ` > £${(Number(c.threshold_pence) / 100).toFixed(2)}`
                          : 'staff_role_name' in c
                            ? `: ${String(c.staff_role_name)}`
                            : 'document_type' in c
                              ? `: ${String(c.document_type)}`
                              : ''}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-fg-muted" />
            <CardTitle>{editingId ? 'Edit rule' : 'New rule'}</CardTitle>
          </div>
          <CardDescription>
            {editingId
              ? 'Update the name, description, active state — or tweak the condition values (thresholds, role names, document types). Target action, approver role and the set of condition types are immutable — deactivate and create a new rule to change them.'
              : 'Pick an action, the approver role, and any conditions that must all match for the rule to fire.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {createErr ? (
            <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {createErr}
            </div>
          ) : null}
          {createMsg ? (
            <div className="text-sm rounded bg-success-subtle text-success px-2 py-1">
              {createMsg}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Target action{editingId ? ' (immutable)' : ''}
              </Label>
              <Select
                value={targetAction}
                disabled={!!editingId}
                onValueChange={(next) => {
                  setTargetAction(next);
                  // Prune conditions that don't apply to the new action so
                  // the user can't accidentally save a rule that never fires.
                  const allowed = new Set(
                    ACTION_COMPATIBLE_CONDITIONS[
                      next as (typeof ACTION_OPTIONS)[number]
                    ] ?? [],
                  );
                  setConditions((cs) =>
                    cs.filter((c) => allowed.has(c.type)),
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Required approver{editingId ? ' (immutable)' : ''}
              </Label>
              <Select
                value={approverRole}
                disabled={!!editingId}
                onValueChange={(v: 'ADMIN' | 'STAFF') => setApproverRole(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="STAFF">STAFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {editingId ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              Active
            </label>
          ) : null}

          <div className="space-y-2">
            <Label>Conditions (AND-ed)</Label>
            <div className="space-y-2">
              {conditions.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded border border-border-subtle p-2 flex items-center gap-2"
                >
                  <Badge variant="outline">{c.type}</Badge>
                  {c.type === 'AMOUNT_GT' ? (
                    <Input
                      type="number"
                      value={c.threshold_pence}
                      onChange={(e) =>
                        setConditions((arr) =>
                          arr.map((x, i) =>
                            i === idx
                              ? { type: 'AMOUNT_GT', threshold_pence: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className="w-32 text-sm"
                    />
                  ) : null}
                  {c.type === 'REQUESTING_STAFF_HAS_ROLE' ? (
                    <Select
                      value={c.staff_role_name}
                      onValueChange={(v: 'ADMIN' | 'STAFF') =>
                        setConditions((arr) =>
                          arr.map((x, i) =>
                            i === idx
                              ? {
                                  type: 'REQUESTING_STAFF_HAS_ROLE',
                                  staff_role_name: v,
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="STAFF">STAFF</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {c.type === 'DOCUMENT_TYPE_EQUALS' ? (
                    <Input
                      value={c.document_type}
                      onChange={(e) =>
                        setConditions((arr) =>
                          arr.map((x, i) =>
                            i === idx
                              ? {
                                  type: 'DOCUMENT_TYPE_EQUALS',
                                  document_type: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      className="w-40 text-sm"
                    />
                  ) : null}
                  {!editingId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConditions((arr) =>
                          arr.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              {!editingId ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {(
                      ACTION_COMPATIBLE_CONDITIONS[
                        targetAction as (typeof ACTION_OPTIONS)[number]
                      ] ?? []
                    )
                      .filter(
                        // Only show buttons for condition kinds the user hasn't
                        // already added — there's no reason to add two
                        // AMOUNT_GT conditions to the same rule.
                        (kind) => !conditions.some((c) => c.type === kind),
                      )
                      .map((kind) => (
                        <Button
                          key={kind}
                          size="sm"
                          variant="outline"
                          onClick={() => addCondition(kind)}
                        >
                          {CONDITION_LABEL[kind]}
                        </Button>
                      ))}
                  </div>
                  <p className="text-[11px] text-fg-muted">
                    Only conditions valid for{' '}
                    <span className="font-mono">{targetAction}</span> are shown.
                    Switching the action will drop incompatible conditions.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-fg-muted">
                  Condition <em>values</em> are editable above (e.g. change the
                  AMOUNT_GT threshold or the required role). Condition{' '}
                  <em>types</em> are immutable — deactivate this rule and create
                  a new one to add or remove conditions.
                </p>
              )}
            </div>
          </div>

          <Button onClick={() => void submit()} disabled={busy}>
            {busy
              ? 'Saving…'
              : editingId
                ? 'Save changes'
                : 'Create rule'}
          </Button>
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
