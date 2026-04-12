import { useState, useEffect } from 'react';
import { api } from '../api';

type CollaborationRow = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
  status: string;
  project_type?: string | null;
  agreed_amount?: unknown;
  started_at?: string | null;
  ended_at?: string | null;
};

type ListResponse = {
  items: CollaborationRow[];
  total: number;
  page: number;
  limit: number;
};

function jsonPre(data: unknown) {
  return (
    <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
      {data == null ? '' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function CollaborationsPage() {
  const [list, setList] = useState<ListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const [createWorkerId, setCreateWorkerId] = useState('');
  const [createEmployerId, setCreateEmployerId] = useState('');
  const [createProjectType, setCreateProjectType] = useState('');
  const [createPostcode, setCreatePostcode] = useState('');
  const [createAmount, setCreateAmount] = useState('');
  const [createReferralId, setCreateReferralId] = useState('');

  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [escrowJob, setEscrowJob] = useState<Record<string, string>>({});
  const [escrowFee, setEscrowFee] = useState<Record<string, string>>({});
  const [escrowByCollab, setEscrowByCollab] = useState<Record<string, unknown>>({});

  async function loadCollaborations() {
    setListError('');
    try {
      const data = await api<ListResponse>('/collaborations/me?page=1&limit=20');
      setList(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setList(null);
    }
  }

  useEffect(() => {
    void loadCollaborations();
  }, []);

  async function handleCreateCollaboration(e: React.FormEvent) {
    e.preventDefault();
    setActionError('');
    setLastActionJson(null);
    try {
      const body: Record<string, unknown> = {
        project_type: createProjectType || undefined,
        site_postcode: createPostcode || undefined,
      };
      if (createAmount !== '') body.agreed_amount = Number(createAmount);
      if (createReferralId !== '') body.referral_id = Number(createReferralId);
      if (createWorkerId !== '') body.worker_id = Number(createWorkerId);
      if (createEmployerId !== '') body.employer_id = Number(createEmployerId);

      const created = await api('/collaborations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setLastActionJson(created);
      await loadCollaborations();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function patchStatus(id: string | number, status: string) {
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/collaborations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setLastActionJson(out);
      await loadCollaborations();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function flagCollaboration(id: string | number) {
    const reason = flagReasons[String(id)]?.trim();
    if (!reason) {
      setActionError('Flag reason is required');
      return;
    }
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/collaborations/${id}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setLastActionJson(out);
      await loadCollaborations();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createEscrow(id: string | number) {
    const job = escrowJob[String(id)];
    const fee = escrowFee[String(id)];
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/escrow/collaboration/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          job_amount: Number(job),
          platform_fee: Number(fee),
        }),
      });
      setLastActionJson(out);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function viewEscrow(id: string | number) {
    setActionError('');
    try {
      const out = await api(`/escrow/collaboration/${id}`);
      setEscrowByCollab((prev) => ({ ...prev, [String(id)]: out }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function fundEscrow(escrowId: string | number) {
    setActionError('');
    try {
      const out = await api<{ checkout_url: string }>(`/escrow/${escrowId}/deposit`, {
        method: 'POST',
      });
      if (out.checkout_url) {
        window.open(out.checkout_url, '_blank');
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1>Collaborations</h1>
      {listError ? <div style={{ color: 'red', marginBottom: 8 }}>{listError}</div> : null}
      {actionError ? <div style={{ color: 'red', marginBottom: 8 }}>{actionError}</div> : null}

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => void loadCollaborations()}>
          Refresh list
        </button>
      </div>

      <h2>My collaborations</h2>
      {list?.items?.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 24, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>id</th>
              <th style={th}>worker_id</th>
              <th style={th}>employer_id</th>
              <th style={th}>status</th>
              <th style={th}>project_type</th>
              <th style={th}>agreed_amount</th>
              <th style={th}>started_at</th>
              <th style={th}>ended_at</th>
              <th style={th}>actions</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((c) => {
              const id = c.id;
              const key = String(id);
              return (
                <tr key={key}>
                  <td style={td}>{String(id)}</td>
                  <td style={td}>{String(c.worker_id)}</td>
                  <td style={td}>{String(c.employer_id)}</td>
                  <td style={td}>{c.status}</td>
                  <td style={td}>{c.project_type ?? '—'}</td>
                  <td style={td}>{c.agreed_amount != null ? String(c.agreed_amount) : '—'}</td>
                  <td style={td}>{c.started_at ?? '—'}</td>
                  <td style={td}>{c.ended_at ?? '—'}</td>
                  <td style={{ ...td, verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button type="button" onClick={() => void patchStatus(id, 'CONFIRMED')}>
                          Confirm
                        </button>
                        <button type="button" onClick={() => void patchStatus(id, 'IN_PROGRESS')}>
                          Start
                        </button>
                        <button type="button" onClick={() => void patchStatus(id, 'COMPLETED')}>
                          Complete
                        </button>
                        <button type="button" onClick={() => void patchStatus(id, 'REJECTED')}>
                          Reject
                        </button>
                        <button type="button" onClick={() => void patchStatus(id, 'DISPUTED')}>
                          Dispute
                        </button>
                      </div>
                      <label>
                        Flag reason{' '}
                        <input
                          value={flagReasons[key] ?? ''}
                          onChange={(e) =>
                            setFlagReasons((p) => ({ ...p, [key]: e.target.value }))
                          }
                          placeholder="reason"
                          style={{ width: '100%' }}
                        />
                      </label>
                      <button type="button" onClick={() => void flagCollaboration(id)}>
                        Flag
                      </button>
                      <div style={{ borderTop: '1px solid #ccc', paddingTop: 6 }}>
                        <div style={{ fontSize: 11, marginBottom: 4 }}>Create escrow (employer)</div>
                        <input
                          placeholder="job_amount"
                          value={escrowJob[key] ?? ''}
                          onChange={(e) =>
                            setEscrowJob((p) => ({ ...p, [key]: e.target.value }))
                          }
                          style={{ width: '100%', marginBottom: 4 }}
                        />
                        <input
                          placeholder="platform_fee"
                          value={escrowFee[key] ?? ''}
                          onChange={(e) =>
                            setEscrowFee((p) => ({ ...p, [key]: e.target.value }))
                          }
                          style={{ width: '100%', marginBottom: 4 }}
                        />
                        <button type="button" onClick={() => void createEscrow(id)}>
                          Create Escrow
                        </button>
                      </div>
                      <button type="button" onClick={() => void viewEscrow(id)}>
                        View Escrow
                      </button>
                      {escrowByCollab[key] != null && (
                        <>
                          {jsonPre(escrowByCollab[key])}
                          {(escrowByCollab[key] as Record<string, unknown>)?.status === 'CREATED' ||
                           (escrowByCollab[key] as Record<string, unknown>)?.status === 'DEPOSIT_PENDING' ? (
                            <button
                              type="button"
                              style={{ background: '#635bff', color: '#fff', fontWeight: 600, marginTop: 4 }}
                              onClick={() => void fundEscrow((escrowByCollab[key] as Record<string, unknown>).id as string)}
                            >
                              Fund via Stripe
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>{list ? 'No collaborations.' : 'Loading…'}</p>
      )}
      {jsonPre(list)}

      <h2>Create collaboration</h2>
      <p style={{ fontSize: 13 }}>
        Employers: set worker_id only. Workers: set employer_id only.
      </p>
      <form onSubmit={handleCreateCollaboration} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
        <label>
          worker_id (employer){' '}
          <input
            type="number"
            value={createWorkerId}
            onChange={(e) => setCreateWorkerId(e.target.value)}
          />
        </label>
        <label>
          employer_id (worker){' '}
          <input
            type="number"
            value={createEmployerId}
            onChange={(e) => setCreateEmployerId(e.target.value)}
          />
        </label>
        <label>
          project_type{' '}
          <input value={createProjectType} onChange={(e) => setCreateProjectType(e.target.value)} />
        </label>
        <label>
          site_postcode{' '}
          <input value={createPostcode} onChange={(e) => setCreatePostcode(e.target.value)} />
        </label>
        <label>
          agreed_amount{' '}
          <input
            type="number"
            step="any"
            value={createAmount}
            onChange={(e) => setCreateAmount(e.target.value)}
          />
        </label>
        <label>
          referral_id (optional){' '}
          <input
            type="number"
            value={createReferralId}
            onChange={(e) => setCreateReferralId(e.target.value)}
          />
        </label>
        <button type="submit">Create Collaboration</button>
      </form>
      <h3>Last mutation response</h3>
      {jsonPre(lastActionJson)}
    </div>
  );
}

const th: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: 6,
  textAlign: 'left',
  background: '#eee',
};
const td: React.CSSProperties = { border: '1px solid #ccc', padding: 6 };
