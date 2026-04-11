import { useState, useEffect } from 'react';
import { api } from '../api';

type ApplicationRow = {
  id: string | number;
  status: string;
  initiated_by: string;
  proposed_rate?: string | number | null;
  job_post?: { title?: string; id?: string | number } | null;
};

type AppListResponse = {
  items: ApplicationRow[];
  total: number;
  page: number;
  limit: number;
};

type JobPostRow = {
  id: string | number;
  title: string;
  status?: string;
};

type JobListResponse = {
  items: JobPostRow[];
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

export default function MyApplicationsPage() {
  const [workerList, setWorkerList] = useState<AppListResponse | null>(null);
  const [workerError, setWorkerError] = useState('');
  const [employerPosts, setEmployerPosts] = useState<JobListResponse | null>(null);
  const [employerError, setEmployerError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobApps, setJobApps] = useState<AppListResponse | null>(null);
  const [jobAppsError, setJobAppsError] = useState('');

  const [inviteWorkerId, setInviteWorkerId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  async function loadWorkerApps() {
    setWorkerError('');
    try {
      const data = await api<AppListResponse>('/job-applications/me?page=1&limit=50');
      setWorkerList(data);
    } catch (e) {
      setWorkerError(e instanceof Error ? e.message : String(e));
      setWorkerList(null);
    }
  }

  async function loadEmployerPosts() {
    setEmployerError('');
    try {
      const data = await api<JobListResponse>('/job-posts/me?page=1&limit=50');
      setEmployerPosts(data);
    } catch (e) {
      setEmployerError(e instanceof Error ? e.message : String(e));
      setEmployerPosts(null);
    }
  }

  useEffect(() => {
    void loadWorkerApps();
    void loadEmployerPosts();
  }, []);

  async function loadApplicationsForJob(jobId: string | number) {
    const sid = String(jobId);
    setSelectedJobId(sid);
    setJobApps(null);
    setJobAppsError('');
    try {
      const data = await api<AppListResponse>(`/job-applications/jobs/${sid}?page=1&limit=50`);
      setJobApps(data);
    } catch (e) {
      setJobAppsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function patchAppStatus(id: string | number, status: string) {
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setLastActionJson(out);
      await loadWorkerApps();
      if (selectedJobId) void loadApplicationsForJob(selectedJobId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toCollaboration(id: string | number) {
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/${id}/to-collaboration`, { method: 'POST' });
      setLastActionJson(out);
      if (selectedJobId) void loadApplicationsForJob(selectedJobId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function inviteWorker(jobPostId: string) {
    setActionError('');
    setLastActionJson(null);
    if (!inviteWorkerId.trim()) {
      setActionError('worker_id required');
      return;
    }
    try {
      const out = await api(`/job-applications/jobs/${jobPostId}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          worker_id: Number(inviteWorkerId),
          message: inviteMessage.trim() || undefined,
        }),
      });
      setLastActionJson(out);
      setInviteWorkerId('');
      setInviteMessage('');
      void loadApplicationsForJob(jobPostId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1>My Applications</h1>
      {actionError ? <div style={{ color: 'red', marginBottom: 8 }}>{actionError}</div> : null}

      <h2>Worker: my applications</h2>
      {workerError ? <div style={{ color: 'orange', marginBottom: 8 }}>{workerError}</div> : null}
      <button type="button" onClick={() => void loadWorkerApps()} style={{ marginBottom: 8 }}>
        Refresh worker list
      </button>
      {workerList?.items?.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 24, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>job title</th>
              <th style={th}>status</th>
              <th style={th}>initiated_by</th>
              <th style={th}>proposed_rate</th>
              <th style={th}>actions</th>
            </tr>
          </thead>
          <tbody>
            {workerList.items.map((a) => {
              const id = String(a.id);
              return (
                <tr key={id}>
                  <td style={td}>{a.job_post?.title ?? String(a.job_post?.id ?? '—')}</td>
                  <td style={td}>{a.status}</td>
                  <td style={td}>{a.initiated_by}</td>
                  <td style={td}>{a.proposed_rate != null ? String(a.proposed_rate) : '—'}</td>
                  <td style={td}>
                    <button type="button" onClick={() => void patchAppStatus(a.id, 'WITHDRAWN')}>
                      Withdraw
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>{workerList ? 'No applications (or not a worker).' : '…'}</p>
      )}
      {jsonPre(workerList)}

      <h2>Employer: my job posts</h2>
      {employerError ? <div style={{ color: 'orange', marginBottom: 8 }}>{employerError}</div> : null}
      <button type="button" onClick={() => void loadEmployerPosts()} style={{ marginBottom: 8 }}>
        Refresh employer posts
      </button>
      {employerPosts?.items?.length ? (
        <ul style={{ fontSize: 14 }}>
          {employerPosts.items.map((p) => (
            <li key={String(p.id)}>
              <button type="button" onClick={() => void loadApplicationsForJob(p.id)} style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer', padding: 0 }}>
                {p.title}
              </button>{' '}
              <span style={{ color: '#666' }}>({p.status})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{employerPosts ? 'No job posts (or not an employer).' : '…'}</p>
      )}
      {jsonPre(employerPosts)}

      <h2>Applications for selected job</h2>
      {selectedJobId ? <p>job_post_id: {selectedJobId}</p> : <p>Select a job post above.</p>}
      {jobAppsError ? <div style={{ color: 'red' }}>{jobAppsError}</div> : null}
      {jobApps?.items?.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>application id</th>
              <th style={th}>status</th>
              <th style={th}>initiated_by</th>
              <th style={th}>proposed_rate</th>
              <th style={th}>actions</th>
            </tr>
          </thead>
          <tbody>
            {jobApps.items.map((a) => {
              const id = String(a.id);
              return (
                <tr key={id}>
                  <td style={td}>{id}</td>
                  <td style={td}>{a.status}</td>
                  <td style={td}>{a.initiated_by}</td>
                  <td style={td}>{a.proposed_rate != null ? String(a.proposed_rate) : '—'}</td>
                  <td style={{ ...td, verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <button type="button" onClick={() => void patchAppStatus(a.id, 'REVIEWED')}>
                        Review
                      </button>
                      <button type="button" onClick={() => void patchAppStatus(a.id, 'SHORTLISTED')}>
                        Shortlist
                      </button>
                      <button type="button" onClick={() => void patchAppStatus(a.id, 'ACCEPTED')}>
                        Accept
                      </button>
                      <button type="button" onClick={() => void patchAppStatus(a.id, 'REJECTED')}>
                        Reject
                      </button>
                      <button type="button" onClick={() => void toCollaboration(a.id)}>
                        Convert to Collaboration
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : selectedJobId && !jobAppsError ? (
        <p>{jobApps ? 'No applications.' : 'Loading…'}</p>
      ) : null}
      {jsonPre(jobApps)}

      {selectedJobId ? (
        <div style={{ marginTop: 16, maxWidth: 400 }}>
          <h3>Invite worker to this job</h3>
          <label>
            worker_id{' '}
            <input type="number" value={inviteWorkerId} onChange={(e) => setInviteWorkerId(e.target.value)} />
          </label>
          <label style={{ display: 'block', marginTop: 8 }}>
            message (optional){' '}
            <textarea value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} rows={2} style={{ width: '100%' }} />
          </label>
          <button type="button" style={{ marginTop: 8 }} onClick={() => void inviteWorker(selectedJobId)}>
            Invite Worker
          </button>
        </div>
      ) : null}

      <h2>Last mutation response</h2>
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
