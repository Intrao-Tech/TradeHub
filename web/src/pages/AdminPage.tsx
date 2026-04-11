import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';

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
const DOC_STATUSES = ['IN_REVIEW', 'APPROVED', 'REJECTED'] as const;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div style={{ color: 'red', marginBottom: 8 }}>{message}</div>
  ) : null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 32,
        padding: 16,
        border: '1px solid #ccc',
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
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

export default function AdminPage() {
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
  const [docId, setDocId] = useState('');
  const [docStatus, setDocStatus] = useState<string>(DOC_STATUSES[0]);
  const [docRes, setDocRes] = useState<unknown>(null);
  const [docErr, setDocErr] = useState('');

  /* Review publish */
  const [reviewId, setReviewId] = useState('');
  const [publishRes, setPublishRes] = useState<unknown>(null);
  const [publishErr, setPublishErr] = useState('');

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

  async function patchDocumentStatus(e: FormEvent) {
    e.preventDefault();
    setDocErr('');
    setDocRes(null);
    const id = docId.trim();
    if (!id) {
      setDocErr('document_id required');
      return;
    }
    try {
      const data = await api<unknown>(
        `/documents/${encodeURIComponent(id)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: docStatus }),
        },
      );
      setDocRes(data);
    } catch (e) {
      setDocErr(errMsg(e));
    }
  }

  async function publishReview(e: FormEvent) {
    e.preventDefault();
    setPublishErr('');
    setPublishRes(null);
    const id = reviewId.trim();
    if (!id) {
      setPublishErr('review_id required');
      return;
    }
    try {
      const data = await api<unknown>(
        `/reviews/${encodeURIComponent(id)}/publish`,
        { method: 'PATCH' },
      );
      setPublishRes(data);
    } catch (e) {
      setPublishErr(errMsg(e));
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
    <div>
      <h1>Staff / Admin</h1>

      <Section title="Moderation Queue">
        <ErrorBox message={queueErr} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <label>
            queue_type{' '}
            <select
              value={queueType}
              onChange={(e) => setQueueType(e.target.value)}
            >
              {QUEUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            status{' '}
            <select
              value={queueStatus}
              onChange={(e) => setQueueStatus(e.target.value)}
            >
              <option value="">(any)</option>
              {QUEUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            page{' '}
            <input
              type="number"
              min={1}
              value={queuePage}
              onChange={(e) => setQueuePage(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            limit{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={queueLimit}
              onChange={(e) => setQueueLimit(Number(e.target.value) || 10)}
            />
          </label>
        </div>
        <button type="button" onClick={() => void loadQueue()}>
          Load Queue
        </button>
        {queueData != null ? (
          <pre style={{ marginTop: 12, overflow: 'auto' }}>
            {JSON.stringify(queueData, null, 2)}
          </pre>
        ) : null}
        {queueItems.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {queueItems.map((row) => (
              <li
                key={String(row.id)}
                style={{
                  borderBottom: '1px solid #eee',
                  padding: '8px 0',
                }}
              >
                <div>
                  id={String(row.id)} · {row.entity_type} · entity_id=
                  {String(row.entity_id)} · {row.queue_type} · {row.status} ·
                  priority={row.priority} · document_id=
                  {row.document_id != null ? String(row.document_id) : '—'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const sid = String(row.id);
                    setDetailId(sid);
                    setActionModId(sid);
                    void loadModerationDetail(sid);
                  }}
                >
                  View Details
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <h3>Item details</h3>
        <div style={{ marginBottom: 8 }}>
          <label>
            moderation id (manual){' '}
            <input
              value={detailId}
              onChange={(e) => setDetailId(e.target.value)}
              placeholder="id"
            />
          </label>{' '}
          <button
            type="button"
            onClick={() => {
              const id = detailId.trim();
              if (id) void loadModerationDetail(id);
            }}
          >
            Load
          </button>
        </div>
        <ErrorBox message={detailErr} />
        {moderationDetail != null ? (
          <pre style={{ overflow: 'auto' }}>
            {JSON.stringify(moderationDetail, null, 2)}
          </pre>
        ) : null}

        <h3>Add Action</h3>
        <ErrorBox message={actionErr} />
        <form onSubmit={submitAction}>
          <div style={{ marginBottom: 8 }}>
            <label>
              moderation id{' '}
              <input
                value={actionModId}
                onChange={(e) => setActionModId(e.target.value)}
                required
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              action_type{' '}
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              notes{' '}
              <input
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </label>
          </div>
          <button type="submit">POST action</button>
        </form>
        {actionData != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(actionData, null, 2)}
          </pre>
        ) : null}
      </Section>

      <Section title="Document Review">
        <ErrorBox message={docErr} />
        <form onSubmit={patchDocumentStatus}>
          <div style={{ marginBottom: 8 }}>
            <label>
              document_id{' '}
              <input
                type="number"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                required
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>
              status{' '}
              <select
                value={docStatus}
                onChange={(e) => setDocStatus(e.target.value)}
              >
                {DOC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit">PATCH status</button>
        </form>
        {docRes != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(docRes, null, 2)}
          </pre>
        ) : null}
      </Section>

      <Section title="Review Publishing">
        <ErrorBox message={publishErr} />
        <form onSubmit={publishReview}>
          <label>
            review_id{' '}
            <input
              type="number"
              value={reviewId}
              onChange={(e) => setReviewId(e.target.value)}
              required
            />
          </label>{' '}
          <button type="submit">Publish Review</button>
        </form>
        {publishRes != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(publishRes, null, 2)}
          </pre>
        ) : null}
      </Section>

      <Section title="Subscription Plans">
        <ErrorBox message={plansErr} />
        <button type="button" onClick={() => void loadPlans()}>
          Load Plans
        </button>
        {plansData != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(plansData, null, 2)}
          </pre>
        ) : null}

        <h3>Create Plan</h3>
        <ErrorBox message={createPlanErr} />
        <form onSubmit={createPlan}>
          <div>
            <label>
              name <input value={planName} onChange={(e) => setPlanName(e.target.value)} required />
            </label>
          </div>
          <div>
            <label>
              price_monthly{' '}
              <input
                type="number"
                step="0.01"
                min={0}
                value={planMonthly}
                onChange={(e) => setPlanMonthly(e.target.value)}
                required
              />
            </label>
          </div>
          <div>
            <label>
              price_yearly{' '}
              <input
                type="number"
                step="0.01"
                min={0}
                value={planYearly}
                onChange={(e) => setPlanYearly(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              max_referrals{' '}
              <input
                type="number"
                min={0}
                value={planMaxRef}
                onChange={(e) => setPlanMaxRef(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={planActive}
                onChange={(e) => setPlanActive(e.target.checked)}
              />{' '}
              is_active
            </label>
          </div>
          <button type="submit">Create Plan</button>
        </form>
        {createPlanRes != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(createPlanRes, null, 2)}
          </pre>
        ) : null}

        <h3>Update Plan</h3>
        <ErrorBox message={updErr} />
        <form onSubmit={updatePlan}>
          <div>
            <label>
              plan_id{' '}
              <input
                type="number"
                min={1}
                value={updPlanId}
                onChange={(e) => setUpdPlanId(e.target.value)}
                required
              />
            </label>
          </div>
          <div>
            <label>
              name <input value={updName} onChange={(e) => setUpdName(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              price_monthly{' '}
              <input
                type="number"
                step="0.01"
                min={0}
                value={updMonthly}
                onChange={(e) => setUpdMonthly(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              price_yearly{' '}
              <input
                type="number"
                step="0.01"
                min={0}
                value={updYearly}
                onChange={(e) => setUpdYearly(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              max_referrals{' '}
              <input
                type="number"
                min={0}
                value={updMaxRef}
                onChange={(e) => setUpdMaxRef(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              is_active{' '}
              <select
                value={updActive === '' ? '' : String(updActive)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') setUpdActive('');
                  else setUpdActive(v === 'true');
                }}
              >
                <option value="">(omit)</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>
          <button type="submit">Update Plan</button>
        </form>
        {updRes != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(updRes, null, 2)}
          </pre>
        ) : null}
      </Section>

      <Section title="Specialisation Management">
        <ErrorBox message={specErr} />
        <button type="button" onClick={() => void loadSpecialisations()}>
          Load All
        </button>
        {specList != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(specList, null, 2)}
          </pre>
        ) : null}

        <h3>Create</h3>
        <ErrorBox message={createSpecErr} />
        <form onSubmit={createSpecialisation}>
          <label>
            name{' '}
            <input
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              required
            />
          </label>{' '}
          <button type="submit">POST</button>
        </form>
        {createSpecRes != null ? (
          <pre style={{ marginTop: 8, overflow: 'auto' }}>
            {JSON.stringify(createSpecRes, null, 2)}
          </pre>
        ) : null}

        {specRows.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {specRows.map((s) => (
              <li key={s.id} style={{ marginTop: 8 }}>
                {s.id}: {s.name}{' '}
                <button
                  type="button"
                  onClick={() => void deleteSpecialisation(s.id)}
                >
                  Delete
                </button>
                {delSpecErr[String(s.id)] ? (
                  <div style={{ color: 'red', fontSize: 12 }}>
                    {delSpecErr[String(s.id)]}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Audit Log">
        <ErrorBox message={auditErr} />
        <form onSubmit={searchAudit}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label>
              account_id{' '}
              <input
                value={auditAccountId}
                onChange={(e) => setAuditAccountId(e.target.value)}
              />
            </label>
            <label>
              action{' '}
              <input
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
              />
            </label>
            <label>
              entity_type{' '}
              <input
                value={auditEntityType}
                onChange={(e) => setAuditEntityType(e.target.value)}
              />
            </label>
            <label>
              from_date{' '}
              <input
                type="datetime-local"
                value={auditFrom}
                onChange={(e) => setAuditFrom(e.target.value)}
              />
            </label>
            <label>
              to_date{' '}
              <input
                type="datetime-local"
                value={auditTo}
                onChange={(e) => setAuditTo(e.target.value)}
              />
            </label>
            <label>
              page{' '}
              <input
                type="number"
                min={1}
                value={auditPage}
                onChange={(e) => setAuditPage(Number(e.target.value) || 1)}
              />
            </label>
            <label>
              limit{' '}
              <input
                type="number"
                min={1}
                max={100}
                value={auditLimit}
                onChange={(e) => setAuditLimit(Number(e.target.value) || 20)}
              />
            </label>
          </div>
          <button type="submit" style={{ marginTop: 8 }}>
            Search
          </button>
        </form>
        {auditItems.length > 0 ? (
          <ul style={{ marginTop: 12 }}>
            {auditItems.map((row, i) => (
              <li key={i}>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(row, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        ) : null}
        {auditData != null ? (
          <pre style={{ marginTop: 12, overflow: 'auto' }}>
            {JSON.stringify(auditData, null, 2)}
          </pre>
        ) : null}
      </Section>
    </div>
  );
}
