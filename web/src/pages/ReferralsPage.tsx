import { useState, useEffect } from 'react';
import { RefreshCw, Send, Inbox as InboxIcon, Share2 } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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

function statusVariant(
  status?: string,
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' {
  switch (status) {
    case 'ACCEPTED':
      return 'success';
    case 'DECLINED':
    case 'CANCELLED':
      return 'danger';
    case 'OPEN':
    case 'PENDING':
      return 'warning';
    default:
      return 'outline';
  }
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

  const [offerOpenId, setOfferOpenId] = useState<string | null>(null);
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
      setOfferOpenId(null);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-fg-muted">
          Share leads and earn commission when a worker wins the job.
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">My referrals</h2>
          <Button type="button" variant="outline" onClick={() => void loadMyReferrals()}>
            <RefreshCw />
            Refresh
          </Button>
        </div>
        {myReferrals?.items?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {myReferrals.items.map((r) => {
              const key = String(r.id);
              return (
                <Card key={key} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{r.title ?? `Referral #${key}`}</CardTitle>
                        <CardDescription>#{key}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(r.status)}>{r.status ?? '—'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2 text-sm">
                    {r.postcode_area ? (
                      <p className="text-xs text-fg-muted">{r.postcode_area}</p>
                    ) : null}
                    {r.referral_offers?.length ? (
                      <p className="text-xs text-fg-muted">
                        {r.referral_offers.length} offer
                        {r.referral_offers.length === 1 ? '' : 's'} sent
                      </p>
                    ) : null}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 border-t border-border-default pt-4">
                    <Dialog
                      open={offerOpenId === key}
                      onOpenChange={(open) => setOfferOpenId(open ? key : null)}
                    >
                      <DialogTrigger asChild>
                        <Button type="button" size="sm">
                          <Send />
                          Send offer
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send referral offer</DialogTitle>
                          <DialogDescription>
                            Offer referral #{key} to a specific worker.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor={`offer-recipient-${key}`}>Recipient ID (worker)</Label>
                            <Input
                              id={`offer-recipient-${key}`}
                              type="number"
                              value={offerRecipient[key] ?? ''}
                              onChange={(e) =>
                                setOfferRecipient((p) => ({ ...p, [key]: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`offer-message-${key}`}>Message</Label>
                            <Textarea
                              id={`offer-message-${key}`}
                              rows={3}
                              value={offerMessage[key] ?? ''}
                              onChange={(e) =>
                                setOfferMessage((p) => ({ ...p, [key]: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOfferOpenId(null)}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={() => void sendOffer(r.id)}>
                            Send offer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void cancelReferral(r.id)}
                    >
                      Cancel referral
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : myReferrals ? (
          <EmptyState
            icon={Share2}
            title="No referrals yet"
            description="Create a referral to share a lead."
          />
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
        {myReferrals ? (
          <details className="rounded-md border border-border-default bg-raised">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-muted">
              Raw — my referrals
            </summary>
            <pre className="rounded-b-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {JSON.stringify(myReferrals, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Search referrals</CardTitle>
          <CardDescription>Browse open referrals on the marketplace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={runSearch}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-2">
              <Label htmlFor="r-search-status">Status</Label>
              <Input
                id="r-search-status"
                value={searchStatus}
                onChange={(e) => setSearchStatus(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-search-postcode">Postcode area</Label>
              <Input
                id="r-search-postcode"
                value={searchPostcode}
                onChange={(e) => setSearchPostcode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-search-page">Page</Label>
              <Input
                id="r-search-page"
                value={searchPage}
                onChange={(e) => setSearchPage(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-search-limit">Limit</Label>
              <Input
                id="r-search-limit"
                value={searchLimit}
                onChange={(e) => setSearchLimit(e.target.value)}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={() => void runSearch()}>
                <RefreshCw />
                Refresh
              </Button>
            </div>
          </form>
          {searchResult ? (
            <details className="rounded-md border border-border-default bg-raised">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-muted">
                Raw — search result
              </summary>
              <pre className="rounded-b-md bg-subtle text-fg p-3 text-xs overflow-auto">
                {JSON.stringify(searchResult, null, 2)}
              </pre>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create referral</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateReferral} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="r-title">Title *</Label>
              <Input
                id="r-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="r-description">Description</Label>
              <Textarea
                id="r-description"
                rows={2}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-project-type">Project type</Label>
              <Input
                id="r-project-type"
                value={createProjectType}
                onChange={(e) => setCreateProjectType(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-postcode">Postcode area</Label>
              <Input
                id="r-postcode"
                value={createPostcodeArea}
                onChange={(e) => setCreatePostcodeArea(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-estimated">Estimated value</Label>
              <Input
                id="r-estimated"
                type="number"
                step="any"
                value={createEstimated}
                onChange={(e) => setCreateEstimated(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-commission">Commission %</Label>
              <Input
                id="r-commission"
                type="number"
                step="any"
                value={createCommission}
                onChange={(e) => setCreateCommission(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-client-name">Client name</Label>
              <Input
                id="r-client-name"
                value={createClientName}
                onChange={(e) => setCreateClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-client-phone">Client phone</Label>
              <Input
                id="r-client-phone"
                value={createClientPhone}
                onChange={(e) => setCreateClientPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="r-client-email">Client email</Label>
              <Input
                id="r-client-email"
                type="email"
                value={createClientEmail}
                onChange={(e) => setCreateClientEmail(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create referral</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">My received offers</h2>
          <Button type="button" variant="outline" onClick={() => void loadMyOffers()}>
            <RefreshCw />
            Refresh
          </Button>
        </div>
        {offersMine?.items?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {offersMine.items.map((o) => (
              <Card key={String(o.id)} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Offer #{String(o.id)}</CardTitle>
                      {o.referral ? (
                        <CardDescription>
                          Referral: {String(o.referral.title ?? '—')}
                        </CardDescription>
                      ) : null}
                    </div>
                    <Badge variant={statusVariant(o.status)}>{o.status ?? '—'}</Badge>
                  </div>
                </CardHeader>
                <CardFooter className="flex gap-2 border-t border-border-default pt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void respondOffer(o.id, true)}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void respondOffer(o.id, false)}
                  >
                    Decline
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : offersMine ? (
          <EmptyState
            icon={InboxIcon}
            title="No offers yet"
            description="Workers will see offers sent to them here."
          />
        ) : (
          <p className="text-sm text-fg-muted">Click Refresh to load your offers.</p>
        )}
        {offersMine ? (
          <details className="rounded-md border border-border-default bg-raised">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-muted">
              Raw — my offers
            </summary>
            <pre className="rounded-b-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {JSON.stringify(offersMine, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

      {lastJson ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-fg-muted">Last action response</h3>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {JSON.stringify(lastJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
