import { useState } from 'react';
import { api } from '../api';

type ReviewRow = {
  overall_rating?: number;
  quality_rating?: number | null;
  reliability_rating?: number | null;
  communication_rating?: number | null;
  payment_rating?: number | null;
  safety_rating?: number | null;
  comment?: string | null;
  reviewer_role?: string;
  is_published?: boolean;
};

type ReviewListResponse = {
  items: ReviewRow[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
};

function jsonPre(data: unknown) {
  return (
    <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
      {data == null ? '' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function optionalRating(name: string, value: string, onChange: (v: string) => void) {
  return (
    <label style={{ display: 'block' }}>
      {name} (1–5, optional){' '}
      <input
        type="number"
        min={1}
        max={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function ReviewsPage() {
  const [error, setError] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [workerReviews, setWorkerReviews] = useState<ReviewListResponse | null>(null);
  const [employerReviews, setEmployerReviews] = useState<ReviewListResponse | null>(null);

  const [collabId, setCollabId] = useState('');
  const [overallRating, setOverallRating] = useState('5');
  const [qualityRating, setQualityRating] = useState('');
  const [reliabilityRating, setReliabilityRating] = useState('');
  const [communicationRating, setCommunicationRating] = useState('');
  const [paymentRating, setPaymentRating] = useState('');
  const [safetyRating, setSafetyRating] = useState('');
  const [comment, setComment] = useState('');
  const [createResult, setCreateResult] = useState<unknown>(null);

  async function searchWorkerReviews(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    try {
      const id = workerId.trim();
      if (!id) {
        setError('worker_id is required');
        return;
      }
      const data = await api<ReviewListResponse>(
        `/reviews/worker/${id}?page=1&limit=10`,
      );
      setWorkerReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWorkerReviews(null);
    }
  }

  async function searchEmployerReviews(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    try {
      const id = employerId.trim();
      if (!id) {
        setError('employer_id is required');
        return;
      }
      const data = await api<ReviewListResponse>(
        `/reviews/employer/${id}?page=1&limit=10`,
      );
      setEmployerReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEmployerReviews(null);
    }
  }

  async function handleCreateReview(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreateResult(null);
    try {
      const cid = collabId.trim();
      if (!cid) {
        setError('collaboration_id is required');
        return;
      }
      const body: Record<string, unknown> = {
        overall_rating: Number(overallRating),
        comment: comment || undefined,
      };
      const addOpt = (k: string, v: string) => {
        if (v !== '') body[k] = Number(v);
      };
      addOpt('quality_rating', qualityRating);
      addOpt('reliability_rating', reliabilityRating);
      addOpt('communication_rating', communicationRating);
      addOpt('payment_rating', paymentRating);
      addOpt('safety_rating', safetyRating);

      const out = await api(`/reviews/collaboration/${cid}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreateResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function renderReviewCards(items: ReviewRow[] | undefined) {
    if (!items?.length) return <p>No reviews in this result.</p>;
    return (
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((rev, i) => (
          <li
            key={i}
            style={{
              border: '1px solid #ccc',
              padding: 10,
              marginBottom: 8,
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            <div>
              <strong>Overall</strong>: {rev.overall_rating ?? '—'} |{' '}
              <strong>Reviewer</strong>: {rev.reviewer_role ?? '—'} |{' '}
              <strong>Published</strong>: {String(rev.is_published ?? false)}
            </div>
            <div style={{ fontSize: 12, color: '#444' }}>
              Q {rev.quality_rating ?? '—'} · Rel {rev.reliability_rating ?? '—'} · Com{' '}
              {rev.communication_rating ?? '—'} · Pay {rev.payment_rating ?? '—'} · Safe{' '}
              {rev.safety_rating ?? '—'}
            </div>
            <div style={{ marginTop: 6 }}>{rev.comment ?? <em>No comment</em>}</div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <h1>Reviews</h1>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}

      <section style={{ marginBottom: 24 }}>
        <h2>Search worker reviews</h2>
        <form onSubmit={searchWorkerReviews} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            worker_id{' '}
            <input
              type="number"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              required
            />
          </label>
          <button type="submit">Search</button>
          <button type="button" onClick={() => void searchWorkerReviews()}>
            Refresh
          </button>
        </form>
        {renderReviewCards(workerReviews?.items)}
        <h3>Raw JSON</h3>
        {jsonPre(workerReviews)}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Search employer reviews</h2>
        <form onSubmit={searchEmployerReviews} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            employer_id{' '}
            <input
              type="number"
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
              required
            />
          </label>
          <button type="submit">Search</button>
          <button type="button" onClick={() => void searchEmployerReviews()}>
            Refresh
          </button>
        </form>
        {renderReviewCards(employerReviews?.items)}
        <h3>Raw JSON</h3>
        {jsonPre(employerReviews)}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Create review</h2>
        <form onSubmit={handleCreateReview} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <label>
            collaboration_id *{' '}
            <input
              type="number"
              value={collabId}
              onChange={(e) => setCollabId(e.target.value)}
              required
            />
          </label>
          <label>
            overall_rating (1–5) *{' '}
            <input
              type="number"
              min={1}
              max={5}
              value={overallRating}
              onChange={(e) => setOverallRating(e.target.value)}
              required
            />
          </label>
          {optionalRating('quality_rating', qualityRating, setQualityRating)}
          {optionalRating('reliability_rating', reliabilityRating, setReliabilityRating)}
          {optionalRating('communication_rating', communicationRating, setCommunicationRating)}
          {optionalRating('payment_rating', paymentRating, setPaymentRating)}
          {optionalRating('safety_rating', safetyRating, setSafetyRating)}
          <label>
            comment{' '}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </label>
          <button type="submit">Create Review</button>
        </form>
        <h3>Create response</h3>
        {jsonPre(createResult)}
      </section>
    </div>
  );
}
