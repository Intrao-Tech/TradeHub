import { useState, useEffect } from 'react';
import { Flag, RefreshCw, Handshake } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'IN_PROGRESS':
      return 'info';
    case 'CONFIRMED':
      return 'secondary';
    case 'DISPUTED':
      return 'danger';
    case 'REJECTED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'outline';
  }
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

  const [flagOpenId, setFlagOpenId] = useState<string | null>(null);
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
      setFlagOpenId(null);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Collaborations</h1>
          <p className="text-sm text-fg-muted">
            Manage your active and past work agreements.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadCollaborations()}>
          <RefreshCw />
          Refresh list
        </Button>
      </div>

      {listError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listError}
        </div>
      ) : null}
      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">My collaborations</h2>
        {list?.items?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {list.items.map((c) => {
              const id = c.id;
              const key = String(id);
              const escrow = escrowByCollab[key] as Record<string, unknown> | undefined;
              const escrowStatus = escrow?.status as string | undefined;
              const escrowFundable =
                escrowStatus === 'CREATED' || escrowStatus === 'DEPOSIT_PENDING';
              return (
                <Card key={key} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">Collaboration #{key}</CardTitle>
                        <CardDescription>
                          worker {String(c.worker_id)} · employer {String(c.employer_id)}
                        </CardDescription>
                      </div>
                      <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 text-sm">
                    <dl className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-xs text-fg-muted">Project type</dt>
                        <dd>{c.project_type ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Agreed amount</dt>
                        <dd>{c.agreed_amount != null ? String(c.agreed_amount) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Started</dt>
                        <dd>{c.started_at ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-muted">Ended</dt>
                        <dd>{c.ended_at ?? '—'}</dd>
                      </div>
                    </dl>

                    <div className="space-y-2 rounded-md border border-border-default bg-subtle p-3">
                      <p className="text-xs font-medium text-fg-muted">Create escrow (employer)</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="job_amount"
                          value={escrowJob[key] ?? ''}
                          onChange={(e) =>
                            setEscrowJob((p) => ({ ...p, [key]: e.target.value }))
                          }
                        />
                        <Input
                          placeholder="platform_fee"
                          value={escrowFee[key] ?? ''}
                          onChange={(e) =>
                            setEscrowFee((p) => ({ ...p, [key]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void createEscrow(id)}
                        >
                          Create escrow
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void viewEscrow(id)}
                        >
                          View escrow
                        </Button>
                      </div>
                      {escrow ? (
                        <div className="space-y-2">
                          <pre className="rounded-md bg-raised text-fg p-2 text-xs overflow-auto">
                            {JSON.stringify(escrow, null, 2)}
                          </pre>
                          {escrowFundable ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void fundEscrow(escrow.id as string)}
                            >
                              Fund via Stripe
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col items-stretch gap-2 border-t border-border-default pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchStatus(id, 'CONFIRMED')}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchStatus(id, 'IN_PROGRESS')}
                      >
                        Start
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchStatus(id, 'COMPLETED')}
                      >
                        Complete
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchStatus(id, 'REJECTED')}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchStatus(id, 'DISPUTED')}
                      >
                        Dispute
                      </Button>
                      <Dialog
                        open={flagOpenId === key}
                        onOpenChange={(open) => setFlagOpenId(open ? key : null)}
                      >
                        <DialogTrigger asChild>
                          <Button type="button" size="sm" variant="ghost">
                            <Flag />
                            Flag
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Flag collaboration #{key}</DialogTitle>
                            <DialogDescription>
                              Provide a reason. Staff will review.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Label htmlFor={`flag-${key}`}>Reason</Label>
                            <Input
                              id={`flag-${key}`}
                              placeholder="e.g. payment dispute"
                              value={flagReasons[key] ?? ''}
                              onChange={(e) =>
                                setFlagReasons((p) => ({ ...p, [key]: e.target.value }))
                              }
                            />
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setFlagOpenId(null)}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={() => void flagCollaboration(id)}>
                              Submit flag
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : list ? (
          <EmptyState
            icon={Handshake}
            title="No collaborations yet"
            description="Create one below or accept a referral offer."
          />
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}

        {list ? (
          <details className="rounded-md border border-border-default bg-raised">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-muted">
              Raw list JSON
            </summary>
            <pre className="rounded-b-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {JSON.stringify(list, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Create collaboration</CardTitle>
          <CardDescription>
            Employers: set worker_id only. Workers: set employer_id only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateCollaboration} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-worker-id">worker_id (employer)</Label>
              <Input
                id="c-worker-id"
                type="number"
                value={createWorkerId}
                onChange={(e) => setCreateWorkerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-employer-id">employer_id (worker)</Label>
              <Input
                id="c-employer-id"
                type="number"
                value={createEmployerId}
                onChange={(e) => setCreateEmployerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-project-type">project_type</Label>
              <Input
                id="c-project-type"
                value={createProjectType}
                onChange={(e) => setCreateProjectType(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-postcode">site_postcode</Label>
              <Input
                id="c-postcode"
                value={createPostcode}
                onChange={(e) => setCreatePostcode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-amount">agreed_amount</Label>
              <Input
                id="c-amount"
                type="number"
                step="any"
                value={createAmount}
                onChange={(e) => setCreateAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-referral-id">referral_id (optional)</Label>
              <Input
                id="c-referral-id"
                type="number"
                value={createReferralId}
                onChange={(e) => setCreateReferralId(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create collaboration</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {lastActionJson ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-fg-muted">Last mutation response</h3>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {JSON.stringify(lastActionJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
