import { useState, useEffect } from 'react';
import { api } from '../api';

type ReferralItem = {
  id: string | number;
  title?: string;
  status?: string;
  postcode_area?: string | null;
  referral_offers?: Array<{ id: string | number; status?: string }>;
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
};

type OfferItem = {
  id: string | number;
  status?: string;
  referral?: ReferralItem;
};

function jsonPre(data: unknown) {
  return (
    <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
      {data == null ? '' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function ReferralsPage() {
  const [error, setError] = useState('');
  const [lastJson, setLastJson] = useState<unknown>(null);

  const [myReferrals, setMyReferrals] = useState<Paginated<ReferralItem> | null>(null);
  const [searchStatus, setSearchStatus] = useState('');
  const [searchPostcode, setSearchPostcode] = useState('');
  const [searchPage, setSearchPage] = useState('1');
  const [searchLimit, setSearchLimit] = useState('20');
  const [searchResult, setSearchResult] = useState<Paginated<ReferralItem> | null>(null);

  const [offersMine, setOffersMine] = useState<Paginated<OfferItem> | null>(null);

  const [offerRecipient, setOfferRecipient] = useState<Record<string, string>>({});
  const [offerMessage, setOfferMessage] = useState<Record<string, string>>({});

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createProjectType, setCreateProjectType] = useState('');
  const [createPostcodeArea, setCreatePostcodeArea] = useState('');
  const [createEstimated, setCreateEstimated] = useState('');
  const [createCommission, setCreateCommission] = useState('');
  const [createClientName, setCreateClientName] = useState('');
  const [createClientPhone, setCreateClientPhone] = useState('');
  const [createClientEmail, setCreateClientEmail] = useState('');

  async function loadMyReferrals() {
    setError('');
    try {
      const data = await api<Paginated<ReferralItem>>('/referrals/me');
      setMyReferrals(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMyReferrals(null);
    }
  }

  async function loadMyOffers() {
    setError('');
    try {
      const data = await api<Paginated<OfferItem>>('/referrals/offers/me');
      setOffersMine(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOffersMine(null);
    }
  }

  useEffect(() => {
    void loadMyReferrals();
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setLastJson(null);
    try {
      const params = new URLSearchParams();
      if (searchStatus) params.set('status', searchStatus);
      if (searchPostcode) params.set('postcode_area', searchPostcode);
      params.set('page', searchPage || '1');
      params.set('limit', searchLimit || '20');
      const data = await api<Paginated<ReferralItem>>(`/referrals?${params.toString()}`);
      setSearchResult(data);
      setLastJson(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSearchResult(null);
    }
  }

  async function handleCreateReferral(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLastJson(null);
    try {
      const body: Record<string, unknown> = {
        title: createTitle,
        description: createDescription || undefined,
        project_type: createProjectType || undefined,
        postcode_area: createPostcodeArea || undefined,
        client_name: createClientName || undefined,
        client_phone: createClientPhone || undefined,
        client_email: createClientEmail || undefined,
      };
      if (createEstimated !== '') body.estimated_value = Number(createEstimated);
      if (createCommission !== '') body.commission_pct = Number(createCommission);

      const created = await api('/referrals', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setLastJson(created);
      await loadMyReferrals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cancelReferral(id: string | number) {
    setError('');
    setLastJson(null);
    try {
      const out = await api(`/referrals/${id}`, { method: 'DELETE' });
      setLastJson(out);
      await loadMyReferrals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendOffer(referralId: string | number) {
    const key = String(referralId);
    setError('');
    setLastJson(null);
    try {
      const out = await api(`/referrals/${referralId}/offers`, {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: Number(offerRecipient[key]),
          message: offerMessage[key] || undefined,
        }),
      });
      setLastJson(out);
      await loadMyReferrals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function respondOffer(offerId: string | number, accept: boolean) {
    setError('');
    setLastJson(null);
    try {
      const out = await api(`/referrals/offers/${offerId}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ accept }),
      });
      setLastJson(out);
      await loadMyOffers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1>Referrals</h1>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}

      <section style={{ marginBottom: 24 }}>
        <h2>My referrals</h2>
        <button type="button" onClick={() => void loadMyReferrals()}>
          My Referrals / Refresh
        </button>
        {myReferrals?.items?.map((r) => {
          const key = String(r.id);
          return (
            <div
              key={key}
              style={{
                border: '1px solid #ccc',
                padding: 12,
                marginTop: 12,
                borderRadius: 4,
              }}
            >
              <div>
                <strong>#{key}</strong> {r.title ?? ''} — {r.status ?? ''}
              </div>
              <button type="button" onClick={() => void cancelReferral(r.id)} style={{ marginTop: 8 }}>
                Cancel
              </button>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Send offer</div>
                <input
                  type="number"
                  placeholder="recipient_id (worker)"
                  value={offerRecipient[key] ?? ''}
                  onChange={(e) =>
                    setOfferRecipient((p) => ({ ...p, [key]: e.target.value }))
                  }
                  style={{ marginRight: 8 }}
                />
                <input
                  placeholder="message"
                  value={offerMessage[key] ?? ''}
                  onChange={(e) =>
                    setOfferMessage((p) => ({ ...p, [key]: e.target.value }))
                  }
                  style={{ marginRight: 8, width: 200 }}
                />
                <button type="button" onClick={() => void sendOffer(r.id)}>
                  Send Offer
                </button>
              </div>
            </div>
          );
        })}
        <h3>Raw — my referrals</h3>
        {jsonPre(myReferrals)}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Search referrals</h2>
        <form onSubmit={runSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label>
            status{' '}
            <input value={searchStatus} onChange={(e) => setSearchStatus(e.target.value)} />
          </label>
          <label>
            postcode_area{' '}
            <input value={searchPostcode} onChange={(e) => setSearchPostcode(e.target.value)} />
          </label>
          <label>
            page{' '}
            <input value={searchPage} onChange={(e) => setSearchPage(e.target.value)} />
          </label>
          <label>
            limit{' '}
            <input value={searchLimit} onChange={(e) => setSearchLimit(e.target.value)} />
          </label>
          <button type="submit">Search</button>
          <button type="button" onClick={() => void runSearch()}>
            Refresh search
          </button>
        </form>
        <h3>Raw — search result</h3>
        {jsonPre(searchResult)}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Create referral</h2>
        <form onSubmit={handleCreateReferral} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>
            title *{' '}
            <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} required />
          </label>
          <label>
            description{' '}
            <textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={2} />
          </label>
          <label>
            project_type{' '}
            <input value={createProjectType} onChange={(e) => setCreateProjectType(e.target.value)} />
          </label>
          <label>
            postcode_area{' '}
            <input value={createPostcodeArea} onChange={(e) => setCreatePostcodeArea(e.target.value)} />
          </label>
          <label>
            estimated_value{' '}
            <input
              type="number"
              step="any"
              value={createEstimated}
              onChange={(e) => setCreateEstimated(e.target.value)}
            />
          </label>
          <label>
            commission_pct{' '}
            <input
              type="number"
              step="any"
              value={createCommission}
              onChange={(e) => setCreateCommission(e.target.value)}
            />
          </label>
          <label>
            client_name{' '}
            <input value={createClientName} onChange={(e) => setCreateClientName(e.target.value)} />
          </label>
          <label>
            client_phone{' '}
            <input value={createClientPhone} onChange={(e) => setCreateClientPhone(e.target.value)} />
          </label>
          <label>
            client_email{' '}
            <input type="email" value={createClientEmail} onChange={(e) => setCreateClientEmail(e.target.value)} />
          </label>
          <button type="submit">Create Referral</button>
        </form>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>My received offers (workers)</h2>
        <button type="button" onClick={() => void loadMyOffers()}>
          My Received Offers / Refresh
        </button>
        {offersMine?.items?.map((o) => (
          <div
            key={String(o.id)}
            style={{
              border: '1px solid #ccc',
              padding: 12,
              marginTop: 12,
              borderRadius: 4,
            }}
          >
            <div>
              Offer <strong>#{String(o.id)}</strong> — {o.status ?? ''}
            </div>
            {o.referral ? (
              <div style={{ fontSize: 13 }}>Referral: {JSON.stringify(o.referral.title)}</div>
            ) : null}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void respondOffer(o.id, true)}>
                Accept
              </button>
              <button type="button" onClick={() => void respondOffer(o.id, false)}>
                Decline
              </button>
            </div>
          </div>
        ))}
        <h3>Raw — my offers</h3>
        {jsonPre(offersMine)}
      </section>

      <h2>Last action response</h2>
      {jsonPre(lastJson)}
    </div>
  );
}
