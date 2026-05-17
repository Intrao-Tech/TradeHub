import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, RefreshCw, X } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import {
  endContract,
  respondToContract,
  type ContractRow,
} from '@/components/escrow';

type FullContract = ContractRow & {
  collaboration: {
    id: string;
    worker_id: string;
    employer_id: string;
    worker: { client_profile: { display_name: string } };
    employer: { client_profile: { display_name: string } };
    conversation?: { id: string } | null;
  };
};

const fmtGbp = (s: string | null | undefined) => {
  if (!s) return '—';
  const n = Number(s);
  return Number.isFinite(n)
    ? new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
      }).format(n)
    : '—';
};

const fmtDate = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { account } = useAccountMe();
  const [contract, setContract] = useState<FullContract | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState<
    'COMPLETED' | 'CANCELED' | 'ABANDONED'
  >('COMPLETED');
  const [endSubmitting, setEndSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!contractId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<FullContract>(`/contracts/${contractId}`);
      setContract(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Failed to load contract');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const myAccountId = account ? String(account.id) : null;
  const isWorker =
    contract != null &&
    myAccountId != null &&
    String(contract.collaboration.worker_id) === myAccountId;
  const isEmployer =
    contract != null &&
    myAccountId != null &&
    String(contract.collaboration.employer_id) === myAccountId;
  const isParty = isWorker || isEmployer;
  const isCounterparty =
    contract?.status === 'PROPOSED' &&
    ((contract.initiated_by === 'WORKER' && isEmployer) ||
      (contract.initiated_by === 'EMPLOYER' && isWorker));

  async function respond(accept: boolean) {
    if (!contract) return;
    try {
      await respondToContract(contract.id, accept);
      toast.success(accept ? 'Contract accepted' : 'Contract declined');
      void load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not respond');
    }
  }

  async function submitEnd() {
    if (!contract) return;
    setEndSubmitting(true);
    try {
      await endContract(contract.id, endReason);
      toast.success(`Contract ended (${endReason.toLowerCase()})`);
      setEndOpen(false);
      void load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not end contract');
    } finally {
      setEndSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Contract #{contract?.position ?? '…'}
        </h1>
        <p className="text-sm text-fg-muted">
          {contract?.project_type ?? '—'}
          {contract?.site_postcode ? ` · ${contract.site_postcode}` : ''}
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw />
          Refresh
        </Button>
        {contract ? (
          <Button asChild variant="outline">
            <Link to={`/collaborations/${contract.collaboration.id}`}>
              View relationship
            </Link>
          </Button>
        ) : null}
        {contract?.collaboration.conversation?.id ? (
          <Button asChild variant="outline">
            <Link
              to={`/inbox/${contract.collaboration.conversation.id}`}
            >
              <MessageCircle />
              Open chat
            </Link>
          </Button>
        ) : null}
        {contract && contract.status === 'ACTIVE' ? (
          <Button asChild>
            <Link to={`/contracts/${contract.id}/escrow`}>Open escrow</Link>
          </Button>
        ) : null}
        {isCounterparty ? (
          <>
            <Button type="button" onClick={() => void respond(true)}>
              Accept contract
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void respond(false)}
            >
              Decline
            </Button>
          </>
        ) : null}
        {isParty &&
        contract &&
        ['DRAFT', 'PROPOSED', 'ACTIVE'].includes(contract.status) ? (
          <Dialog open={endOpen} onOpenChange={setEndOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="destructive">
                <X />
                End contract
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>End contract</DialogTitle>
                <DialogDescription>
                  Choose a reason. PENDING milestones will be auto-canceled.
                  In-flight (FUNDED / SUBMITTED / DISPUTED) milestones must
                  be resolved first.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Select
                  value={endReason}
                  onValueChange={(v) =>
                    setEndReason(v as 'COMPLETED' | 'CANCELED' | 'ABANDONED')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLETED">
                      COMPLETED — work delivered
                    </SelectItem>
                    <SelectItem value="CANCELED">
                      CANCELED — mutual cancel
                    </SelectItem>
                    <SelectItem value="ABANDONED">
                      ABANDONED — no longer pursuing
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEndOpen(false)}
                  disabled={endSubmitting}
                >
                  Keep open
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void submitEnd()}
                  disabled={endSubmitting}
                >
                  {endSubmitting ? 'Ending…' : 'End contract'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Status, agreed amount, and key dates for this contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-fg-muted">Status</dt>
              <dd>
                <Badge variant="info">{contract?.status ?? '—'}</Badge>
                {contract?.end_reason ? (
                  <span className="ml-2 text-xs text-fg-muted">
                    ({contract.end_reason})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Agreed amount</dt>
              <dd className="font-semibold">{fmtGbp(contract?.agreed_amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Started</dt>
              <dd>{fmtDate(contract?.started_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Ended</dt>
              <dd>{fmtDate(contract?.ended_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Worker</dt>
              <dd>{contract?.collaboration.worker.client_profile.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Employer</dt>
              <dd>{contract?.collaboration.employer.client_profile.display_name}</dd>
            </div>
            {contract?.project_referrer_id ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-fg-muted">Project referrer</dt>
                <dd>
                  {contract.project_referrer_role === 'WORKER'
                    ? 'Worker→Worker share'
                    : 'Employer→Employer share'}{' '}
                  · account #{contract.project_referrer_id}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-fg-muted">Loading…</p> : null}
    </div>
  );
}
