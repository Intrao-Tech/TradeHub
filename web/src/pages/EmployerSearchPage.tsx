import { useState, type FormEvent } from 'react';
import { api } from '../api';

type EmployerRow = {
  id?: string | number;
  company_name?: string | null;
  rating_avg?: string | number;
  team_size?: number | null;
};

type EmployerSearchResponse = {
  data: EmployerRow[];
  total: number;
  page: number;
  limit: number;
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

export default function EmployerSearchPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [results, setResults] = useState<EmployerSearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function doSearch(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      if (search.trim() !== '') {
        sp.set('search', search.trim());
      }
      const data = await api<EmployerSearchResponse>(`/employer-profiles?${sp.toString()}`);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Employer search</h1>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}

      <form onSubmit={doSearch} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
          <label>
            Search{' '}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Company name contains…"
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
        <button type="submit" style={{ marginTop: 12 }} disabled={loading}>
          {loading ? 'Searching…' : 'Search Employers'}
        </button>
      </form>

      {results ? (
        <section>
          <h2>Results ({results.total} total)</h2>
          <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', marginBottom: 16 }}>
            {JSON.stringify(results, null, 2)}
          </pre>
          {results.data.map((emp) => (
            <div key={String(emp.id)} style={cardStyle}>
              <div>
                <strong>{emp.company_name ?? '(no name)'}</strong>
              </div>
              <div>Rating: {emp.rating_avg ?? '—'}</div>
              <div>Team size: {emp.team_size ?? '—'}</div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
