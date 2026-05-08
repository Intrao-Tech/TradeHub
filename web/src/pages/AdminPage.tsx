import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ReviewsPublishQueueTab } from '@/components/admin/ReviewsPublishQueueTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StaffManagementCard } from '@/components/StaffManagementCard';
import { VerificationQueueTab } from '@/components/admin/VerificationQueueTab';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const QUEUE_TYPES = [
  'VERIFICATION',
  'REVIEW',
  'DISPUTE',
  'REFERRAL',
  'FRAUD',
] as const;
const QUEUE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'DISMISSED',
] as const;
const ACTION_TYPES = [
  'ASSIGNED',
  'STARTED',
  'RESOLVED',
  'DISMISSED',
  'ESCALATED',
  'COMMENTED',
] as const;
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      {message}
    </div>
  ) : null;
}

function JsonBlock({ data }: { data: unknown }) {
  if (data == null) return null;
  return (
    <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function queueStatusVariant(
  status?: string,
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'IN_PROGRESS':
      return 'info';
    case 'DISMISSED':
      return 'secondary';
    case 'OPEN':
      return 'warning';
    default:
      return 'outline';
  }
}

type ModerationQueueRow = {
  id: string | number;
  entity_type: string;
  entity_id: string | number;
  queue_type: string;
  status: string;
  priority: number;
  document_id?: string | number | null;
};

const ADMIN_TABS = [
  'moderation',
  'staff',
  'documents',
  'reviews',
  'plans',
  'specialisations',
  'audit',
] as const;

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab =
    tabParam && (ADMIN_TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : 'moderation';

  /* Moderation */
  const [queueType, setQueueType] = useState<string>(QUEUE_TYPES[0]);
  const [queueStatus, setQueueStatus] = useState<string>('');
  const [queuePage, setQueuePage] = useState(1);
  const [queueLimit, setQueueLimit] = useState(10);
  const [queueData, setQueueData] = useState<unknown>(null);
  const [queueErr, setQueueErr] = useState('');
  const [detailId, setDetailId] = useState('');
  const [moderationDetail, setModerationDetail] = useState<unknown>(null);
  const [detailErr, setDetailErr] = useState('');
  const [actionModId, setActionModId] = useState('');
  const [actionType, setActionType] = useState<string>(ACTION_TYPES[0]);
  const [actionNotes, setActionNotes] = useState('');
  const [actionData, setActionData] = useState<unknown>(null);
  const [actionErr, setActionErr] = useState('');

  /* Document */

  /* Plans */
  const [plansData, setPlansData] = useState<unknown>(null);
  const [plansErr, setPlansErr] = useState('');
  const [planName, setPlanName] = useState('');
  const [planMonthly, setPlanMonthly] = useState('');
  const [planYearly, setPlanYearly] = useState('');
  const [planMaxRef, setPlanMaxRef] = useState('');
  const [planActive, setPlanActive] = useState(true);
  const [createPlanRes, setCreatePlanRes] = useState<unknown>(null);
  const [createPlanErr, setCreatePlanErr] = useState('');
  const [updPlanId, setUpdPlanId] = useState('');
  const [updName, setUpdName] = useState('');
  const [updMonthly, setUpdMonthly] = useState('');
  const [updYearly, setUpdYearly] = useState('');
  const [updMaxRef, setUpdMaxRef] = useState('');
  const [updActive, setUpdActive] = useState<boolean | ''>('');
  const [updRes, setUpdRes] = useState<unknown>(null);
  const [updErr, setUpdErr] = useState('');

  /* Specialisations */
  const [specList, setSpecList] = useState<unknown>(null);
  const [specErr, setSpecErr] = useState('');
  const [specName, setSpecName] = useState('');
  const [createSpecRes, setCreateSpecRes] = useState<unknown>(null);
  const [createSpecErr, setCreateSpecErr] = useState('');
  const [delSpecErr, setDelSpecErr] = useState<Record<string, string>>({});

  /* Audit */
  const [auditAccountId, setAuditAccountId] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditEntityType, setAuditEntityType] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(20);
  const [auditData, setAuditData] = useState<unknown>(null);
  const [auditErr, setAuditErr] = useState('');

  async function loadQueue() {
    setQueueErr('');
    try {
      const q = new URLSearchParams();
      q.set('queue_type', queueType);
      if (queueStatus) q.set('status', queueStatus);
      q.set('page', String(queuePage));
      q.set('limit', String(queueLimit));
      const data = await api<unknown>(`/moderation/queue?${q.toString()}`);
      setQueueData(data);
    } catch (e) {
      setQueueErr(errMsg(e));
    }
  }

  async function loadModerationDetail(id: string) {
    setDetailErr('');
    try {
      const data = await api<unknown>(`/moderation/${encodeURIComponent(id)}`);
      setModerationDetail(data);
    } catch (e) {
      setDetailErr(errMsg(e));
    }
  }

  async function submitAction(e: FormEvent) {
    e.preventDefault();
    setActionErr('');
    setActionData(null);
    const id = actionModId.trim();
    if (!id) {
      setActionErr('Moderation id required');
      return;
    }
    try {
      const body: { action_type: string; notes?: string } = {
        action_type: actionType,
      };
      if (actionNotes.trim()) body.notes = actionNotes.trim();
      const data = await api<unknown>(`/moderation/${encodeURIComponent(id)}/actions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setActionData(data);
    } catch (e) {
      setActionErr(errMsg(e));
    }
  }

  async function loadPlans() {
    setPlansErr('');
    try {
      const data = await api<unknown>('/subscriptions/plans');
      setPlansData(data);
    } catch (e) {
      setPlansErr(errMsg(e));
    }
  }

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    setCreatePlanErr('');
    setCreatePlanRes(null);
    try {
      const body: Record<string, unknown> = {
        name: planName,
        price_monthly: Number(planMonthly),
        is_active: planActive,
      };
      if (planYearly !== '') body.price_yearly = Number(planYearly);
      if (planMaxRef !== '') body.max_referrals = Number(planMaxRef);
      const data = await api<unknown>('/subscriptions/plans', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreatePlanRes(data);
    } catch (e) {
      setCreatePlanErr(errMsg(e));
    }
  }

  async function updatePlan(e: FormEvent) {
    e.preventDefault();
    setUpdErr('');
    setUpdRes(null);
    const id = updPlanId.trim();
    if (!id) {
      setUpdErr('plan_id required');
      return;
    }
    try {
      const body: Record<string, unknown> = {};
      if (updName.trim()) body.name = updName.trim();
      if (updMonthly !== '') body.price_monthly = Number(updMonthly);
      if (updYearly !== '') body.price_yearly = Number(updYearly);
      if (updMaxRef !== '') body.max_referrals = Number(updMaxRef);
      if (updActive !== '') body.is_active = updActive;
      if (Object.keys(body).length === 0) {
        setUpdErr('Provide at least one field to update');
        return;
      }
      const data = await api<unknown>(
        `/subscriptions/plans/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      setUpdRes(data);
    } catch (e) {
      setUpdErr(errMsg(e));
    }
  }

  async function loadSpecialisations() {
    setSpecErr('');
    try {
      const data = await api<unknown>('/specialisations');
      setSpecList(data);
    } catch (e) {
      setSpecErr(errMsg(e));
    }
  }

  async function createSpecialisation(e: FormEvent) {
    e.preventDefault();
    setCreateSpecErr('');
    setCreateSpecRes(null);
    try {
      const data = await api<unknown>('/specialisations', {
        method: 'POST',
        body: JSON.stringify({ name: specName }),
      });
      setCreateSpecRes(data);
    } catch (e) {
      setCreateSpecErr(errMsg(e));
    }
  }

  async function deleteSpecialisation(id: number | string) {
    setDelSpecErr((prev) => ({ ...prev, [String(id)]: '' }));
    try {
      await api(`/specialisations/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
      });
      await loadSpecialisations();
    } catch (e) {
      setDelSpecErr((prev) => ({
        ...prev,
        [String(id)]: errMsg(e),
      }));
    }
  }

  async function searchAudit(e: FormEvent) {
    e.preventDefault();
    setAuditErr('');
    try {
      const q = new URLSearchParams();
      if (auditAccountId.trim()) q.set('account_id', auditAccountId.trim());
      if (auditAction.trim()) q.set('action', auditAction.trim());
      if (auditEntityType.trim()) q.set('entity_type', auditEntityType.trim());
      if (auditFrom.trim()) q.set('from_date', auditFrom.trim());
      if (auditTo.trim()) q.set('to_date', auditTo.trim());
      q.set('page', String(auditPage));
      q.set('limit', String(auditLimit));
      const data = await api<unknown>(`/audit?${q.toString()}`);
      setAuditData(data);
    } catch (e) {
      setAuditErr(errMsg(e));
    }
  }

  const queueItems: ModerationQueueRow[] =
    queueData &&
    typeof queueData === 'object' &&
    queueData !== null &&
    'data' in queueData &&
    Array.isArray((queueData as { data: unknown }).data)
      ? ((queueData as { data: ModerationQueueRow[] }).data)
      : [];

  const auditItems: unknown[] =
    auditData &&
    typeof auditData === 'object' &&
    auditData !== null &&
    'data' in auditData &&
    Array.isArray((auditData as { data: unknown }).data)
      ? ((auditData as { data: unknown[] }).data)
      : [];

  const specRows: { id: number; name: string }[] =
    Array.isArray(specList)
      ? (specList as { id: number; name: string }[])
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff / Admin</h1>
        <p className="text-sm text-fg-muted">
          Moderation queue, document review, plans, specialisations, and audit log.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setSearchParams({ tab: v })}
        className="space-y-4"
      >
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="moderation">Moderation</TabsTrigger>
          <TabsTrigger value="staff">Members</TabsTrigger>
          <TabsTrigger value="documents">Verification</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="specialisations">Specialisations</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Moderation queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={queueErr} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Queue type</Label>
                  <Select value={queueType} onValueChange={setQueueType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUEUE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={queueStatus === '' ? '__any__' : queueStatus}
                    onValueChange={(v) => setQueueStatus(v === '__any__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">(any)</SelectItem>
                      {QUEUE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="q-page">Page</Label>
                  <Input
                    id="q-page"
                    type="number"
                    min={1}
                    value={queuePage}
                    onChange={(e) => setQueuePage(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="q-limit">Limit</Label>
                  <Input
                    id="q-limit"
                    type="number"
                    min={1}
                    max={100}
                    value={queueLimit}
                    onChange={(e) => setQueueLimit(Number(e.target.value) || 10)}
                  />
                </div>
              </div>
              <Button type="button" onClick={() => void loadQueue()}>
                Load queue
              </Button>

              {queueItems.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Queue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Doc</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueItems.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell>{String(row.id)}</TableCell>
                        <TableCell>
                          {row.entity_type} · {String(row.entity_id)}
                        </TableCell>
                        <TableCell>{row.queue_type}</TableCell>
                        <TableCell>
                          <Badge variant={queueStatusVariant(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>{row.priority}</TableCell>
                        <TableCell>
                          {row.document_id != null ? String(row.document_id) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const sid = String(row.id);
                              setDetailId(sid);
                              setActionModId(sid);
                              void loadModerationDetail(sid);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
              <JsonBlock data={queueData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Item details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="detail-id">Moderation ID</Label>
                  <Input
                    id="detail-id"
                    value={detailId}
                    onChange={(e) => setDetailId(e.target.value)}
                    placeholder="id"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    const id = detailId.trim();
                    if (id) void loadModerationDetail(id);
                  }}
                >
                  Load
                </Button>
              </div>
              <ErrorBox message={detailErr} />
              <JsonBlock data={moderationDetail} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={actionErr} />
              <form onSubmit={submitAction} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="action-mod-id">Moderation ID</Label>
                  <Input
                    id="action-mod-id"
                    value={actionModId}
                    onChange={(e) => setActionModId(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Action type</Label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="action-notes">Notes</Label>
                  <Input
                    id="action-notes"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">Submit action</Button>
                </div>
              </form>
              <JsonBlock data={actionData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <StaffManagementCard />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <VerificationQueueTab />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <ReviewsPublishQueueTab />
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Subscription plans</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadPlans()}>
                  Load plans
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ErrorBox message={plansErr} />
              <JsonBlock data={plansData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={createPlanErr} />
              <form onSubmit={createPlan} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-monthly">Price monthly</Label>
                  <Input
                    id="plan-monthly"
                    type="number"
                    step="0.01"
                    min={0}
                    value={planMonthly}
                    onChange={(e) => setPlanMonthly(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-yearly">Price yearly</Label>
                  <Input
                    id="plan-yearly"
                    type="number"
                    step="0.01"
                    min={0}
                    value={planYearly}
                    onChange={(e) => setPlanYearly(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-maxref">Max referrals</Label>
                  <Input
                    id="plan-maxref"
                    type="number"
                    min={0}
                    value={planMaxRef}
                    onChange={(e) => setPlanMaxRef(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={planActive}
                    onChange={(e) => setPlanActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  is_active
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit">Create plan</Button>
                </div>
              </form>
              <JsonBlock data={createPlanRes} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={updErr} />
              <form onSubmit={updatePlan} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="upd-plan-id">Plan ID</Label>
                  <Input
                    id="upd-plan-id"
                    type="number"
                    min={1}
                    value={updPlanId}
                    onChange={(e) => setUpdPlanId(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upd-name">Name</Label>
                  <Input
                    id="upd-name"
                    value={updName}
                    onChange={(e) => setUpdName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upd-monthly">Price monthly</Label>
                  <Input
                    id="upd-monthly"
                    type="number"
                    step="0.01"
                    min={0}
                    value={updMonthly}
                    onChange={(e) => setUpdMonthly(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upd-yearly">Price yearly</Label>
                  <Input
                    id="upd-yearly"
                    type="number"
                    step="0.01"
                    min={0}
                    value={updYearly}
                    onChange={(e) => setUpdYearly(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upd-maxref">Max referrals</Label>
                  <Input
                    id="upd-maxref"
                    type="number"
                    min={0}
                    value={updMaxRef}
                    onChange={(e) => setUpdMaxRef(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>is_active</Label>
                  <Select
                    value={updActive === '' ? '__omit__' : String(updActive)}
                    onValueChange={(v) => {
                      if (v === '__omit__') setUpdActive('');
                      else setUpdActive(v === 'true');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__omit__">(omit)</SelectItem>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">Update plan</Button>
                </div>
              </form>
              <JsonBlock data={updRes} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specialisations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Specialisations</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadSpecialisations()}
                >
                  Load all
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={specErr} />
              <form onSubmit={createSpecialisation} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="spec-name">Name</Label>
                  <Input
                    id="spec-name"
                    value={specName}
                    onChange={(e) => setSpecName(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit">Create</Button>
              </form>
              <ErrorBox message={createSpecErr} />
              <JsonBlock data={createSpecRes} />

              {specRows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specRows.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.id}</TableCell>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void deleteSpecialisation(s.id)}
                          >
                            Delete
                          </Button>
                          {delSpecErr[String(s.id)] ? (
                            <p className="mt-1 text-xs text-danger">
                              {delSpecErr[String(s.id)]}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ErrorBox message={auditErr} />
              <form onSubmit={searchAudit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="a-account">Account ID</Label>
                  <Input
                    id="a-account"
                    value={auditAccountId}
                    onChange={(e) => setAuditAccountId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-action">Action</Label>
                  <Input
                    id="a-action"
                    value={auditAction}
                    onChange={(e) => setAuditAction(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-entity">Entity type</Label>
                  <Input
                    id="a-entity"
                    value={auditEntityType}
                    onChange={(e) => setAuditEntityType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-from">From date</Label>
                  <Input
                    id="a-from"
                    type="datetime-local"
                    value={auditFrom}
                    onChange={(e) => setAuditFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-to">To date</Label>
                  <Input
                    id="a-to"
                    type="datetime-local"
                    value={auditTo}
                    onChange={(e) => setAuditTo(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="a-page">Page</Label>
                    <Input
                      id="a-page"
                      type="number"
                      min={1}
                      value={auditPage}
                      onChange={(e) => setAuditPage(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="a-limit">Limit</Label>
                    <Input
                      id="a-limit"
                      type="number"
                      min={1}
                      max={100}
                      value={auditLimit}
                      onChange={(e) => setAuditLimit(Number(e.target.value) || 20)}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button type="submit">Search</Button>
                </div>
              </form>
              {auditItems.length > 0 ? (
                <ul className="space-y-2">
                  {auditItems.map((row, i) => (
                    <li key={i}>
                      <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(row, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              ) : null}
              <JsonBlock data={auditData} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
