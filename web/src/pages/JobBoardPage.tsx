import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';

type JobPostRow = {
  id: string | number;
  title: string;
  pay_type: string;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
  postcode_area?: string | null;
  is_urgent?: boolean;
  status?: string;
  employer?: {
    company_name?: string | null;
    client_profile?: { display_name?: string | null } | null;
  } | null;
  specialisations?: Array<{ specialisation?: { name?: string; id?: number } }>;
  tags?: Array<{ tag?: { name?: string; id?: number } }>;
  _count?: { applications?: number };
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

function employerName(j: JobPostRow): string {
  const d = j.employer?.client_profile?.display_name;
  const c = j.employer?.company_name;
  return (d && String(d)) || (c && String(c)) || '—';
}

function payLine(j: JobPostRow): string {
  if (j.pay_type === 'DAY_RATE') {
    const a = j.day_rate_min != null ? String(j.day_rate_min) : '—';
    const b = j.day_rate_max != null ? String(j.day_rate_max) : '—';
    return `DAY_RATE ${a} – ${b} / day`;
  }
  if (j.pay_type === 'FIXED_PRICE') {
    return `FIXED ${j.fixed_price != null ? String(j.fixed_price) : '—'}`;
  }
  return String(j.pay_type);
}

function parseIdList(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => !Number.isNaN(n));
}

export default function JobBoardPage() {
  const loggedIn = !!getToken();
  const [list, setList] = useState<JobListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const [searchTitle, setSearchTitle] = useState('');
  const [postcodeArea, setPostcodeArea] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobPostRow | null>(null);
  const [detailError, setDetailError] = useState('');

  const [applyCoverByJob, setApplyCoverByJob] = useState<Record<string, string>>({});

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPayType, setCreatePayType] = useState<'DAY_RATE' | 'FIXED_PRICE'>('DAY_RATE');
  const [createDayMin, setCreateDayMin] = useState('');
  const [createDayMax, setCreateDayMax] = useState('');
  const [createFixed, setCreateFixed] = useState('');
  const [createPostcode, setCreatePostcode] = useState('');
  const [createDuration, setCreateDuration] = useState('');
  const [createUrgent, setCreateUrgent] = useState(false);
  const [createSpecIds, setCreateSpecIds] = useState('');
  const [createTagIds, setCreateTagIds] = useState('');

  const querySuffix = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', 'OPEN');
    p.set('page', '1');
    p.set('limit', '50');
    if (searchTitle.trim()) p.set('search', searchTitle.trim());
    if (postcodeArea.trim()) p.set('postcode_area', postcodeArea.trim());
    return `?${p.toString()}`;
  }, [searchTitle, postcodeArea]);

  async function loadJobs() {
    setListError('');
    try {
      const data = await api<JobListResponse>(`/job-posts${querySuffix}`);
      setList(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setList(null);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [querySuffix]);

  async function openDetail(id: string | number) {
    const sid = String(id);
    setSelectedId(sid);
    setDetail(null);
    setDetailError('');
    try {
      const d = await api<JobPostRow>(`/job-posts/${sid}`);
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionError('');
    setLastActionJson(null);
    const body: Record<string, unknown> = {
      title: createTitle,
      description: createDescription || undefined,
      postcode_area: createPostcode || undefined,
      pay_type: createPayType,
      is_urgent: createUrgent,
      duration_days: createDuration === '' ? undefined : Number(createDuration),
      specialisation_ids: parseIdList(createSpecIds),
      tag_ids: parseIdList(createTagIds),
    };
    if (createPayType === 'DAY_RATE') {
      if (createDayMin !== '') body.day_rate_min = Number(createDayMin);
      if (createDayMax !== '') body.day_rate_max = Number(createDayMax);
    } else {
      if (createFixed !== '') body.fixed_price = Number(createFixed);
    }
    if ((body.specialisation_ids as number[]).length === 0) delete body.specialisation_ids;
    if ((body.tag_ids as number[]).length === 0) delete body.tag_ids;

    try {
      const out = await api('/job-posts', { method: 'POST', body: JSON.stringify(body) });
      setLastActionJson(out);
      await loadJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyToJob(jobId: string | number) {
    const key = String(jobId);
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/jobs/${key}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          cover_message: applyCoverByJob[key]?.trim() || undefined,
        }),
      });
      setLastActionJson(out);
      await loadJobs();
      if (selectedId === key) void openDetail(key);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h1>Job Board</h1>
      {!loggedIn && (
        <div className="alert alert-info">
          Browsing as guest. <Link to="/login">Sign in</Link> to apply or post jobs.
        </div>
      )}
      {listError ? <div className="alert alert-error">{listError}</div> : null}
      {actionError ? <div className="alert alert-error">{actionError}</div> : null}

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Search title{' '}
          <input value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} placeholder="search" />
        </label>
        <label>
          Postcode area{' '}
          <input value={postcodeArea} onChange={(e) => setPostcodeArea(e.target.value)} placeholder="e.g. SW1" />
        </label>
        <button type="button" onClick={() => void loadJobs()}>
          Refresh
        </button>
      </div>

      {loggedIn ? (
        <>
          <h2>Create job post (employer only)</h2>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 8, maxWidth: 480, marginBottom: 24 }}>
            <label>
              title * <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} required />
            </label>
            <label>
              description <textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={3} style={{ width: '100%' }} />
            </label>
            <label>
              pay_type{' '}
              <select value={createPayType} onChange={(e) => setCreatePayType(e.target.value as 'DAY_RATE' | 'FIXED_PRICE')}>
                <option value="DAY_RATE">DAY_RATE</option>
                <option value="FIXED_PRICE">FIXED_PRICE</option>
              </select>
            </label>
            {createPayType === 'DAY_RATE' ? (
              <>
                <label>
                  day_rate_min <input type="number" step="any" value={createDayMin} onChange={(e) => setCreateDayMin(e.target.value)} />
                </label>
                <label>
                  day_rate_max <input type="number" step="any" value={createDayMax} onChange={(e) => setCreateDayMax(e.target.value)} />
                </label>
              </>
            ) : (
              <label>
                fixed_price <input type="number" step="any" value={createFixed} onChange={(e) => setCreateFixed(e.target.value)} />
              </label>
            )}
            <label>
              postcode_area <input value={createPostcode} onChange={(e) => setCreatePostcode(e.target.value)} />
            </label>
            <label>
              duration_days <input type="number" value={createDuration} onChange={(e) => setCreateDuration(e.target.value)} />
            </label>
            <label>
              <input type="checkbox" checked={createUrgent} onChange={(e) => setCreateUrgent(e.target.checked)} /> is_urgent
            </label>
            <label>
              specialisation_ids (comma-separated){' '}
              <input value={createSpecIds} onChange={(e) => setCreateSpecIds(e.target.value)} placeholder="1, 2" />
            </label>
            <label>
              tag_ids (comma-separated){' '}
              <input value={createTagIds} onChange={(e) => setCreateTagIds(e.target.value)} placeholder="1, 2" />
            </label>
            <button type="submit">Create Job Post</button>
          </form>
          <h3>Last create response</h3>
          {jsonPre(lastActionJson)}
        </>
      ) : null}

      <h2>Open job posts</h2>
      {list?.items?.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>title</th>
              <th style={th}>employer</th>
              <th style={th}>pay</th>
              <th style={th}>postcode</th>
              <th style={th}>specialisations</th>
              <th style={th}>tags</th>
              <th style={th}>urgent</th>
              <th style={th}>actions</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((j) => {
              const id = String(j.id);
              const specs = (j.specialisations ?? []).map((s) => s.specialisation?.name ?? s.specialisation?.id).join(', ') || '—';
              const tags = (j.tags ?? []).map((t) => t.tag?.name ?? t.tag?.id).join(', ') || '—';
              return (
                <tr key={id}>
                  <td style={td}>
                    <button type="button" style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer', textAlign: 'left', padding: 0 }} onClick={() => void openDetail(j.id)}>
                      {j.title}
                    </button>
                  </td>
                  <td style={td}>{employerName(j)}</td>
                  <td style={td}>{payLine(j)}</td>
                  <td style={td}>{j.postcode_area ?? '—'}</td>
                  <td style={td}>{specs}</td>
                  <td style={td}>{tags}</td>
                  <td style={td}>{j.is_urgent ? 'URGENT' : '—'}</td>
                  <td style={{ ...td, verticalAlign: 'top' }}>
                    {loggedIn ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <textarea
                          placeholder="cover message (optional)"
                          value={applyCoverByJob[id] ?? ''}
                          onChange={(e) => setApplyCoverByJob((p) => ({ ...p, [id]: e.target.value }))}
                          rows={2}
                          style={{ width: '100%' }}
                        />
                        <button type="button" onClick={() => void applyToJob(j.id)}>
                          Apply (worker only)
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#888' }}>login to apply</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>{list ? 'No jobs.' : 'Loading…'}</p>
      )}

      <h2>Raw list JSON</h2>
      {jsonPre(list)}

      <h2>Selected job</h2>
      {selectedId ? (
        <>
          <p>id: {selectedId}</p>
          {detailError ? <div style={{ color: 'red' }}>{detailError}</div> : null}
          {detail ? (
            <>
              <p>
                Applications count: <strong>{detail._count?.applications ?? '—'}</strong>
              </p>
              {jsonPre(detail)}
            </>
          ) : (
            !detailError && <p>Loading…</p>
          )}
        </>
      ) : (
        <p>Click a job title for details.</p>
      )}
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
