import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { NewContractSheet } from '@/components/contracts/NewContractSheet';

type CounterpartyParty = {
  id: string | number;
  client_profile?: {
    display_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    postcode_area?: string | null;
  } | null;
};

type ContractRow = {
  id: string | number;
  position: number;
  status: 'DRAFT' | 'PROPOSED' | 'ACTIVE' | 'ENDED';
  end_reason?: string | null;
  agreed_amount?: string | null;
  project_type?: string | null;
  site_postcode?: string | null;
  initiated_by?: 'WORKER' | 'EMPLOYER' | string;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
};

type CollaborationData = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
  first_contracted_at?: string | null;
  last_contract_id?: string | number | null;
  created_at?: string;
  worker?: CounterpartyParty | null;
  employer?: CounterpartyParty | null;
  contracts?: ContractRow[];
  conversation?: { id: string | number } | null;
};

const fmtGbp = (value?: string | number | null) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(n);
};

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
};

const contractStatusVariant = (
  status: ContractRow['status'],
): 'info' | 'warning' | 'success' | 'secondary' | 'outline' => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'PROPOSED':
      return 'warning';
    case 'ENDED':
      return 'secondary';
    default:
      return 'outline';
  }
};

export default function CollaborationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { account, isEmployer, clientProfile } = useAccountMe();
  const [collab, setCollab] = useState<CollaborationData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<CollaborationData>(`/collaborations/${id}`);
      setCollab(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Failed to load relationship');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const myAccountId = account ? String(account.id) : null;
  const isParty =
    myAccountId != null &&
    collab != null &&
    (String(collab.worker_id) === myAccountId ||
      String(collab.employer_id) === myAccountId);
  const employerSide =
    myAccountId != null &&
    collab != null &&
    String(collab.employer_id) === myAccountId &&
    isEmployer;
  const inFlight = collab?.contracts?.find((c) =>
    ['DRAFT', 'PROPOSED', 'ACTIVE'].includes(c.status),
  );
  const totalContracts = collab?.contracts?.length ?? 0;
  const totalReleased = (collab?.contracts ?? [])
    .filter((c) => c.status === 'ENDED' && c.end_reason === 'COMPLETED')
    .reduce((s, c) => s + Number(c.agreed_amount ?? 0), 0);

  const counterparty = (() => {
    if (!collab || !myAccountId) return null;
    const meIsWorker = String(collab.worker_id) === myAccountId;
    return meIsWorker ? collab.employer : collab.worker;
  })();
  const counterpartyName =
    counterparty?.client_profile?.display_name ?? 'Counterparty';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/collaborations"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to collaborations
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
          {collab?.worker?.client_profile?.display_name ?? 'Worker'}{' '}
          ↔{' '}
          {collab?.employer?.client_profile?.display_name ?? 'Employer'}
        </h1>
        <p className="text-sm text-fg-muted">
          Working relationship · since{' '}
          {fmtDate(collab?.first_contracted_at ?? collab?.created_at)}
          {totalContracts > 0
            ? ` · ${totalContracts} contract${totalContracts === 1 ? '' : 's'}`
            : ' · no contracts yet'}
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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw />
          Refresh
        </Button>
        {collab?.conversation?.id ? (
          <Button asChild>
            <Link to={`/inbox/${collab.conversation.id}`}>
              <MessageCircle />
              Open chat with {counterpartyName}
            </Link>
          </Button>
        ) : null}
        {employerSide && !inFlight ? (
          <NewContractSheet
            collabId={collab.id}
            initiator="EMPLOYER"
            onCreated={() => void load()}
          />
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Counterparty</CardTitle>
            <CardDescription>
              {clientProfile ? 'Your collaborator on this relationship.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="font-medium text-fg">
              {counterparty?.client_profile?.display_name ?? '—'}
            </div>
            <div className="text-fg-muted">
              {counterparty?.client_profile?.city ?? ''}
              {counterparty?.client_profile?.postcode_area
                ? ` · ${counterparty.client_profile.postcode_area}`
                : ''}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              Aggregate stats across every contract on this relationship.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              Contracts: <strong>{totalContracts}</strong>
            </div>
            <div>
              Total released: <strong>{fmtGbp(totalReleased)}</strong>
            </div>
            <div>
              First contracted: {fmtDate(collab?.first_contracted_at)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contracts</CardTitle>
          <CardDescription>
            Each contract is a paid engagement with its own escrow + milestones.
            {employerSide
              ? ' Use "New contract" above to propose a new one tied to one of your job posts.'
              : ' Wait for the employer to propose a new contract here.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!collab?.contracts?.length ? (
            <p className="text-sm text-fg-muted">
              No contracts yet.
              {employerSide
                ? ' Discuss scope in chat first, then click "New contract".'
                : ''}
            </p>
          ) : (
            <ul className="space-y-2">
              {collab.contracts.map((c) => (
                <li
                  key={String(c.id)}
                  className="rounded-md border border-border-default bg-raised px-3 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium truncate">
                        Contract #{c.position} ·{' '}
                        {c.project_type ?? 'Untitled'}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {fmtGbp(c.agreed_amount)}{' '}
                        {c.site_postcode ? `· ${c.site_postcode}` : ''}{' '}
                        {c.started_at
                          ? `· started ${fmtDate(c.started_at)}`
                          : ''}
                        {c.ended_at ? `· ended ${fmtDate(c.ended_at)}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={contractStatusVariant(c.status)}>
                        {c.status}
                        {c.end_reason ? ` · ${c.end_reason}` : ''}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/contracts/${c.id}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        {loading ? (
          <CardFooter>
            <p className="text-xs text-fg-muted">Loading…</p>
          </CardFooter>
        ) : null}
      </Card>

      {!isParty && collab ? (
        <p className="text-xs text-fg-muted">
          Read-only view (you are not a participant of this relationship).
        </p>
      ) : null}
    </div>
  );
}
