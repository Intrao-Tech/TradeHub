import { useState, type FormEvent } from 'react';
import { api } from '../api';

type WorkerSpec = {
  specialisation_id?: string | number;
  specialisation?: { id?: string | number; name?: string; slug?: string };
};

type WorkerRow = {
  id?: string | number;
  rating_avg?: string | number;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  is_available?: boolean;
  client_profile?: { display_name?: string; postcode_area?: string };
  worker_specialisations?: WorkerSpec[];
};

type WorkerSearchResponse = {
  data: WorkerRow[];
  total: number;
  page: number;
  limit: number;
};

type Specialisation = {
  id: string | number;
  name?: string;
  slug?: string;
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

function appendQuery(
  sp: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
) {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  sp.set(key, String(value));
}

export default function WorkerSearchPage() {
  const [postcodeArea, setPostcodeArea] = useState('');
  const [specialisationId, setSpecialisationId] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [minRating, setMinRating] = useState('');
  const [dayRateMin, setDayRateMin] = useState('');
  const [dayRateMax, setDayRateMax] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [results, setResults] = useState<WorkerSearchResponse | null>(null);
  const [specialisations, setSpecialisations] = useState<Specialisation[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadSpecialisations() {
    setError('');
    try {
      const data = await api<Specialisation[]>('/specialisations');
      setSpecialisations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      appendQuery(sp, 'page', page);
      appendQuery(sp, 'limit', limit);
      appendQuery(sp, 'postcode_area', postcodeArea.trim());
      if (specialisationId.trim() !== '') {
        appendQuery(sp, 'specialisation_id', Number(specialisationId));
      }
      if (isAvailable) {
        sp.set('is_available', 'true');
      }
      if (minRating.trim() !== '') {
        appendQuery(sp, 'min_rating', Number(minRating));
      }
      if (dayRateMin.trim() !== '') {
        appendQuery(sp, 'day_rate_min', Number(dayRateMin));
      }
      if (dayRateMax.trim() !== '') {
        appendQuery(sp, 'day_rate_max', Number(dayRateMax));
      }
      const qs = sp.toString();
      const data = await api<WorkerSearchResponse>(`/worker-profiles?${qs}`);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Worker search</h1>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}

      <form onSubmit={search} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
          <label>
            Postcode area{' '}
            <input
              value={postcodeArea}
              onChange={(e) => setPostcodeArea(e.target.value)}
              placeholder="e.g. SW1"
            />
          </label>
          <label>
            Specialisation ID{' '}
            <input
              type="number"
              value={specialisationId}
              onChange={(e) => setSpecialisationId(e.target.value)}
              min={1}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
            />{' '}
            Is available (filter)
          </label>
          <label>
            Min rating{' '}
            <input
              type="number"
              step="0.01"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              min={0}
            />
          </label>
          <label>
            Day rate min (budget){' '}
            <input
              type="number"
              step="0.01"
              value={dayRateMin}
              onChange={(e) => setDayRateMin(e.target.value)}
              min={0}
            />
          </label>
          <label>
            Day rate max (budget){' '}
            <input
              type="number"
              step="0.01"
              value={dayRateMax}
              onChange={(e) => setDayRateMax(e.target.value)}
              min={0}
            />
          </label>
          <label>
            Page{' '}
            <input
              type="number"
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
              min={1}
            />
          </label>
          <label>
            Limit{' '}
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 10)}
              min={1}
              max={100}
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search Workers'}
          </button>
          <button type="button" onClick={loadSpecialisations}>
            Load All Specialisations
          </button>
        </div>
      </form>

      {specialisations ? (
        <section style={{ marginBottom: 24 }}>
          <h2>Specialisations (raw)</h2>
          <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(specialisations, null, 2)}
          </pre>
        </section>
      ) : null}

      {results ? (
        <section>
          <h2>Results ({results.total} total)</h2>
          <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', marginBottom: 16 }}>
            {JSON.stringify(results, null, 2)}
          </pre>
          {results.data.map((w) => {
            const name = w.client_profile?.display_name ?? '(no name)';
            const specs =
              w.worker_specialisations
                ?.map((ws) => ws.specialisation?.name ?? String(ws.specialisation_id ?? ''))
                .filter(Boolean)
                .join(', ') ?? '—';
            const rateMin = w.day_rate_min ?? '—';
            const rateMax = w.day_rate_max ?? '—';
            return (
              <div key={String(w.id)} style={cardStyle}>
                <strong>{name}</strong>
                <div>Rating: {w.rating_avg ?? '—'}</div>
                <div>
                  Day rate: {rateMin} – {rateMax}
                </div>
                <div>Specialisations: {specs}</div>
                <div>Availability: {w.is_available ? 'Available' : 'Not available'}</div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
