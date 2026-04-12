import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';

const DOC_TYPES = [
  'ID_PHOTO',
  'SELFIE',
  'INSURANCE',
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'COMPANY_LETTERHEAD',
  'PROJECT_PHOTO',
  'OTHER',
] as const;

type PortfolioItem = {
  id: string | number;
  item_type?: string;
  title?: string;
  description?: string | null;
};

type DocumentRow = {
  id: string | number;
  doc_type?: string;
  status?: string;
  file_url?: string;
  created_at?: string;
};

type AccountMe = {
  client_profile?: {
    id: string | number;
    display_name?: string;
    bio?: string | null;
    city?: string | null;
    postcode_area?: string | null;
    avatar_url?: string | null;
    worker_profile?: Record<string, unknown> | null;
    employer_profile?: Record<string, unknown> | null;
  } | null;
};

const sectionStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
  marginBottom: 20,
};

export default function ProfilePage() {
  const [account, setAccount] = useState<AccountMe | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [postcodeAreaClient, setPostcodeAreaClient] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [yearsExperience, setYearsExperience] = useState('');
  const [dayRateMin, setDayRateMin] = useState('');
  const [dayRateMax, setDayRateMax] = useState('');
  const [workerAvailable, setWorkerAvailable] = useState(true);

  const [companyName, setCompanyName] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');
  const [teamSize, setTeamSize] = useState('');

  const [portfolio, setPortfolio] = useState<PortfolioItem[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [uploadDocType, setUploadDocType] = useState<string>(DOC_TYPES[0]);
  const [uploadResult, setUploadResult] = useState<unknown>(null);

  const [expTitle, setExpTitle] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expCompany, setExpCompany] = useState('');
  const [expRole, setExpRole] = useState('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');

  const [projTitle, setProjTitle] = useState('');
  const [projDescription, setProjDescription] = useState('');
  const [projType, setProjType] = useState('');
  const [projPostcode, setProjPostcode] = useState('');
  const [projValue, setProjValue] = useState('');

  const [certTitle, setCertTitle] = useState('');
  const [certDescription, setCertDescription] = useState('');
  const [certType, setCertType] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [certIssuingBody, setCertIssuingBody] = useState('');
  const [certIssuedAt, setCertIssuedAt] = useState('');
  const [certExpiresAt, setCertExpiresAt] = useState('');

  const cp = account?.client_profile;
  const workerId = cp?.id != null ? String(cp.id) : '';
  const isWorker = Boolean(cp?.worker_profile);
  const isEmployer = Boolean(cp?.employer_profile);

  async function refreshAccount() {
    setLoadError('');
    try {
      const me = await api<AccountMe>('/account/me');
      setAccount(me);
      const c = me.client_profile;
      if (c) {
        setDisplayName(c.display_name ?? '');
        setBio(c.bio ?? '');
        setCity(c.city ?? '');
        setPostcodeAreaClient(c.postcode_area ?? '');
        setAvatarUrl(c.avatar_url ?? '');
        const wp = c.worker_profile as {
          years_experience?: number | null;
          day_rate_min?: string | number | null;
          day_rate_max?: string | number | null;
          is_available?: boolean;
        } | null;
        if (wp) {
          setYearsExperience(wp.years_experience != null ? String(wp.years_experience) : '');
          setDayRateMin(wp.day_rate_min != null ? String(wp.day_rate_min) : '');
          setDayRateMax(wp.day_rate_max != null ? String(wp.day_rate_max) : '');
          setWorkerAvailable(Boolean(wp.is_available));
        }
        const ep = c.employer_profile as {
          company_name?: string | null;
          company_number?: string | null;
          team_size?: number | null;
        } | null;
        if (ep) {
          setCompanyName(ep.company_name ?? '');
          setCompanyNumber(ep.company_number ?? '');
          setTeamSize(ep.team_size != null ? String(ep.team_size) : '');
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refreshAccount();
  }, []);

  function flash(msg: string, err?: string) {
    setActionOk(msg);
    setActionError(err ?? '');
    if (msg) setTimeout(() => setActionOk(''), 4000);
  }

  async function submitClient(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const patch: Record<string, string> = { display_name: displayName };
      if (bio !== '') patch.bio = bio;
      if (city !== '') patch.city = city;
      if (postcodeAreaClient !== '') patch.postcode_area = postcodeAreaClient;
      if (avatarUrl !== '') patch.avatar_url = avatarUrl;
      await api('/client-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      flash('Client profile updated');
      await refreshAccount();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitWorker(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const bodyObj: Record<string, unknown> = {
        is_available: workerAvailable,
      };
      if (yearsExperience.trim() !== '') {
        bodyObj.years_experience = Number(yearsExperience);
      }
      if (dayRateMin.trim() !== '') {
        bodyObj.day_rate_min = Number(dayRateMin);
      }
      if (dayRateMax.trim() !== '') {
        bodyObj.day_rate_max = Number(dayRateMax);
      }
      await api('/worker-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(bodyObj),
      });
      flash('Worker profile updated');
      await refreshAccount();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitEmployer(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const bodyObj: Record<string, unknown> = {};
      if (companyName.trim() !== '') bodyObj.company_name = companyName;
      if (companyNumber.trim() !== '') bodyObj.company_number = companyNumber;
      if (teamSize.trim() !== '') bodyObj.team_size = Number(teamSize);
      await api('/employer-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(bodyObj),
      });
      flash('Employer profile updated');
      await refreshAccount();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadPortfolio() {
    setActionError('');
    if (!workerId) return;
    try {
      const items = await api<PortfolioItem[]>(`/portfolio/worker/${workerId}`);
      setPortfolio(items);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deletePortfolioItem(id: string | number) {
    setActionError('');
    try {
      await api(`/portfolio/${id}`, { method: 'DELETE' });
      flash('Portfolio item deleted');
      await loadPortfolio();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addExperience(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string> = { title: expTitle };
      if (expDescription.trim()) body.description = expDescription;
      if (expCompany.trim()) body.company_name = expCompany;
      if (expRole.trim()) body.role = expRole;
      if (expStart.trim()) body.start_date = expStart;
      if (expEnd.trim()) body.end_date = expEnd;
      await api('/portfolio/experience', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Experience added');
      setExpTitle('');
      setExpDescription('');
      setExpCompany('');
      setExpRole('');
      setExpStart('');
      setExpEnd('');
      await loadPortfolio();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addProject(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string | number> = { title: projTitle };
      if (projDescription.trim()) body.description = projDescription;
      if (projType.trim()) body.project_type = projType;
      if (projPostcode.trim()) body.site_postcode = projPostcode;
      if (projValue.trim()) body.project_value = Number(projValue);
      await api('/portfolio/project', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Project added');
      setProjTitle('');
      setProjDescription('');
      setProjType('');
      setProjPostcode('');
      setProjValue('');
      await loadPortfolio();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addCertification(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string> = {
        title: certTitle,
        cert_type: certType,
      };
      if (certDescription.trim()) body.description = certDescription;
      if (certNumber.trim()) body.cert_number = certNumber;
      if (certIssuingBody.trim()) body.issuing_body = certIssuingBody;
      if (certIssuedAt.trim()) body.issued_at = certIssuedAt;
      if (certExpiresAt.trim()) body.expires_at = certExpiresAt;
      await api('/portfolio/certification', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Certification added');
      setCertTitle('');
      setCertDescription('');
      setCertType('');
      setCertNumber('');
      setCertIssuingBody('');
      setCertIssuedAt('');
      setCertExpiresAt('');
      await loadPortfolio();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadDocuments() {
    setActionError('');
    try {
      const list = await api<DocumentRow[]>('/documents/me');
      setDocuments(list);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function uploadDocument(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setActionError('Choose a file');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', uploadDocType);
      const result = await api<unknown>('/documents/upload', {
        method: 'POST',
        body: formData,
      });
      setUploadResult(result);
      flash('Document uploaded');
      input.value = '';
      await loadDocuments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteDocument(id: string | number) {
    setActionError('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      flash('Document deleted');
      await loadDocuments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loadError && !account) {
    return (
      <div>
        <h1>My profile</h1>
        <div style={{ color: 'red' }}>{loadError}</div>
      </div>
    );
  }

  return (
    <div>
      <h1>My profile</h1>
      {actionError ? <div style={{ color: 'red', marginBottom: 8 }}>{actionError}</div> : null}
      {actionOk ? <div style={{ color: 'green', marginBottom: 8 }}>{actionOk}</div> : null}

      <section style={sectionStyle}>
        <h2>Account (raw)</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto' }}>
          {JSON.stringify(account, null, 2)}
        </pre>
        <button type="button" onClick={refreshAccount}>
          Reload account
        </button>
      </section>

      {cp ? (
        <section style={sectionStyle}>
          <h2>Update Client Profile</h2>
          <form onSubmit={submitClient}>
            <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
              <label>
                Display name{' '}
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              <label>
                Bio <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
              </label>
              <label>
                City{' '}
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                Postcode area{' '}
                <input value={postcodeAreaClient} onChange={(e) => setPostcodeAreaClient(e.target.value)} />
              </label>
              <label>
                Avatar URL{' '}
                <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              Save client profile
            </button>
          </form>
        </section>
      ) : (
        <p>No client profile on this account.</p>
      )}

      {cp && isWorker ? (
        <section style={sectionStyle}>
          <h2>Update Worker Profile</h2>
          <form onSubmit={submitWorker}>
            <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
              <label>
                Years experience{' '}
                <input
                  type="number"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  min={0}
                />
              </label>
              <label>
                Day rate min{' '}
                <input
                  type="number"
                  step="0.01"
                  value={dayRateMin}
                  onChange={(e) => setDayRateMin(e.target.value)}
                />
              </label>
              <label>
                Day rate max{' '}
                <input
                  type="number"
                  step="0.01"
                  value={dayRateMax}
                  onChange={(e) => setDayRateMax(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={workerAvailable}
                  onChange={(e) => setWorkerAvailable(e.target.checked)}
                />{' '}
                Is available
              </label>
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              Save worker profile
            </button>
          </form>
        </section>
      ) : null}

      {cp && isEmployer ? (
        <section style={sectionStyle}>
          <h2>Update Employer Profile</h2>
          <form onSubmit={submitEmployer}>
            <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
              <label>
                Company name{' '}
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </label>
              <label>
                Company number{' '}
                <input value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
              </label>
              <label>
                Team size{' '}
                <input
                  type="number"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  min={0}
                />
              </label>
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              Save employer profile
            </button>
          </form>
        </section>
      ) : null}

      {cp && isWorker ? (
        <section style={sectionStyle}>
          <h2>My Portfolio</h2>
          <p>Worker ID: {workerId}</p>
          <button type="button" onClick={loadPortfolio} style={{ marginBottom: 12 }}>
            Load Portfolio
          </button>
          {portfolio ? (
            <>
              <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', marginBottom: 12 }}>
                {JSON.stringify(portfolio, null, 2)}
              </pre>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {portfolio.map((item) => (
                  <li
                    key={String(item.id)}
                    style={{
                      border: '1px solid #ccc',
                      padding: 8,
                      marginBottom: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>
                      [{item.item_type}] {item.title}
                    </span>
                    <button type="button" onClick={() => deletePortfolioItem(item.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3>Add experience</h3>
          <form onSubmit={addExperience} style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gap: 6, maxWidth: 480 }}>
              <input
                placeholder="Title *"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                required
              />
              <textarea
                placeholder="Description"
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
              />
              <input
                placeholder="Company name"
                value={expCompany}
                onChange={(e) => setExpCompany(e.target.value)}
              />
              <input placeholder="Role" value={expRole} onChange={(e) => setExpRole(e.target.value)} />
              <input
                type="datetime-local"
                value={expStart}
                onChange={(e) => setExpStart(e.target.value)}
              />
              <input
                type="datetime-local"
                value={expEnd}
                onChange={(e) => setExpEnd(e.target.value)}
              />
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              POST /portfolio/experience
            </button>
          </form>

          <h3>Add project</h3>
          <form onSubmit={addProject} style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gap: 6, maxWidth: 480 }}>
              <input
                placeholder="Title *"
                value={projTitle}
                onChange={(e) => setProjTitle(e.target.value)}
                required
              />
              <textarea
                placeholder="Description"
                value={projDescription}
                onChange={(e) => setProjDescription(e.target.value)}
              />
              <input
                placeholder="Project type"
                value={projType}
                onChange={(e) => setProjType(e.target.value)}
              />
              <input
                placeholder="Site postcode"
                value={projPostcode}
                onChange={(e) => setProjPostcode(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Project value"
                value={projValue}
                onChange={(e) => setProjValue(e.target.value)}
              />
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              POST /portfolio/project
            </button>
          </form>

          <h3>Add certification</h3>
          <form onSubmit={addCertification}>
            <div style={{ display: 'grid', gap: 6, maxWidth: 480 }}>
              <input
                placeholder="Title *"
                value={certTitle}
                onChange={(e) => setCertTitle(e.target.value)}
                required
              />
              <textarea
                placeholder="Description"
                value={certDescription}
                onChange={(e) => setCertDescription(e.target.value)}
              />
              <input
                placeholder="Cert type *"
                value={certType}
                onChange={(e) => setCertType(e.target.value)}
                required
              />
              <input
                placeholder="Cert number"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
              />
              <input
                placeholder="Issuing body"
                value={certIssuingBody}
                onChange={(e) => setCertIssuingBody(e.target.value)}
              />
              <input
                type="datetime-local"
                value={certIssuedAt}
                onChange={(e) => setCertIssuedAt(e.target.value)}
              />
              <input
                type="datetime-local"
                value={certExpiresAt}
                onChange={(e) => setCertExpiresAt(e.target.value)}
              />
            </div>
            <button type="submit" style={{ marginTop: 8 }}>
              POST /portfolio/certification
            </button>
          </form>
        </section>
      ) : null}

      {cp ? (
        <VerificationSection />
      ) : null}

      {cp ? (
        <section style={sectionStyle}>
          <h2>My Documents</h2>
          <button type="button" onClick={loadDocuments} style={{ marginBottom: 12 }}>
            Load Documents
          </button>
          {documents ? (
            <>
              <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', marginBottom: 12 }}>
                {JSON.stringify(documents, null, 2)}
              </pre>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {documents.map((doc) => (
                  <li
                    key={String(doc.id)}
                    style={{
                      border: '1px solid #ccc',
                      padding: 8,
                      marginBottom: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>
                      {doc.doc_type} — {doc.status} — {doc.file_url}
                    </span>
                    {doc.status === 'PENDING' ? (
                      <button type="button" onClick={() => deleteDocument(doc.id)}>
                        Delete
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3>Upload</h3>
          <form onSubmit={uploadDocument}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="file" name="file" required />
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button type="submit">POST /documents/upload</button>
            </div>
          </form>
          {uploadResult != null ? (
            <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', marginTop: 12 }}>
              {JSON.stringify(uploadResult, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function VerificationSection() {
  const [searchParams] = useSearchParams();
  const justCompleted = searchParams.get('verification') === 'complete';
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ verification_level: string }>('/verification/status')
      .then((d) => setStatus(d.verification_level))
      .catch(() => setStatus('UNVERIFIED'));
  }, []);

  async function startVerification() {
    setError('');
    setLoading(true);
    try {
      const res = await api<{ verification_url: string }>('/verification/start', {
        method: 'POST',
      });
      if (res.verification_url) {
        window.open(res.verification_url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const verified = status === 'IDENTITY_VERIFIED';

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h2>Identity Verification</h2>
      {justCompleted && (
        <div style={{ color: '#0f766e', marginBottom: 8 }}>
          Verification submitted — status will update shortly.
        </div>
      )}
      <p>
        Status:{' '}
        <strong style={{ color: verified ? '#16a34a' : '#d97706' }}>
          {status ?? 'loading...'}
        </strong>
      </p>
      {verified ? (
        <p style={{ color: '#16a34a' }}>Your identity has been verified.</p>
      ) : (
        <>
          <p className="muted small">
            Verify your identity with a passport, driving licence, or national ID card.
            This helps build trust with other users on TradeHub.
          </p>
          {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={startVerification} disabled={loading}>
            {loading ? 'Starting...' : 'Verify my identity'}
          </button>
        </>
      )}
    </section>
  );
}
