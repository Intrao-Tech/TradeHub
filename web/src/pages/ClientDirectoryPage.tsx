import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Users } from 'lucide-react';
import { api, parseApiError } from '../api';
import { EmptyState } from '../components/EmptyState';
import {
  VerificationBadge,
  verificationFromLevel,
} from '../components/VerificationBadge';
import { publicFileUrl } from '../lib/files';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ClientProfile = {
  id: string | number;
  slug?: string;
  display_name?: string;
  bio?: string | null;
  city?: string | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  verification_level?: string | number | null;
};

type SearchResponse = {
  data: ClientProfile[];
  total: number;
  page: number;
  limit: number;
};

function initials(name?: string | null): string {
  if (!name) return 'TH';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'TH'
  );
}

export default function ClientDirectoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [postcodeArea, setPostcodeArea] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', '20');
      if (search.trim()) sp.set('search', search.trim());
      if (postcodeArea.trim()) sp.set('postcode_area', postcodeArea.trim());
      const data = await api<SearchResponse>(
        `/client-profiles?${sp.toString()}`,
      );
      setResults(data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not search.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Members</h1>
        <p className="text-sm text-fg-muted">
          Browse everyone with a TradeHub profile.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={runSearch}
            className="grid gap-4 sm:grid-cols-[1fr_auto_auto]"
          >
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="cd-search">Name contains</Label>
              <Input
                id="cd-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Mike"
              />
            </div>
            <div className="flex flex-col gap-2.5 sm:w-40">
              <Label htmlFor="cd-postcode">Postcode area</Label>
              <Input
                id="cd-postcode"
                value={postcodeArea}
                onChange={(e) => setPostcodeArea(e.target.value)}
                placeholder="SW1"
              />
            </div>
            <div className="self-end">
              <Button type="submit" disabled={loading}>
                <Search />
                {loading ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results ? (
        results.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.data.map((p) => (
              <Card
                key={String(p.id)}
                className="cursor-pointer transition-colors hover:border-border-strong"
                onClick={() => p.slug && navigate(`/clients/${p.slug}`)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <Avatar className="h-11 w-11">
                    {p.avatar_url ? (
                      <AvatarImage
                        src={publicFileUrl(p.avatar_url)}
                        alt={p.display_name ?? ''}
                      />
                    ) : null}
                    <AvatarFallback>
                      {initials(p.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-semibold text-fg">
                      {p.display_name ?? 'Member'}
                    </p>
                    {p.city || p.postcode_area ? (
                      <p className="flex items-center gap-1 text-xs text-fg-muted">
                        <MapPin className="h-3 w-3" />
                        {[p.city, p.postcode_area].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <VerificationBadge
                      state={verificationFromLevel(p.verification_level)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No members found"
            description="Try broadening your search."
          />
        )
      ) : (
        <EmptyState
          icon={Search}
          title="Start searching"
          description="Use the search above to browse members."
        />
      )}

      {results && results.total > results.limit ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={async () => {
              setPage((p) => Math.max(1, p - 1));
              await runSearch();
            }}
          >
            Previous
          </Button>
          <span className="text-xs text-fg-muted">
            Page {results.page} of {Math.ceil(results.total / results.limit)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              loading || page >= Math.ceil(results.total / results.limit)
            }
            onClick={async () => {
              setPage((p) => p + 1);
              await runSearch();
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
