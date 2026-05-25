import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Handshake, MessageCircle } from 'lucide-react';
import { api, parseApiError } from '../api';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';

type ContractRow = {
  id: string | number;
  position: number;
  status: 'DRAFT' | 'PROPOSED' | 'ACTIVE' | 'ENDED';
  end_reason?: string | null;
  agreed_amount?: string | number | null;
  project_type?: string | null;
  site_postcode?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

type CounterpartyParty = {
  id: string | number;
  client_profile?: {
    display_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    postcode_area?: string | null;
  } | null;
};

type CollaborationRow = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
  first_contracted_at?: string | null;
  last_contract_id?: string | number | null;
  created_at?: string | null;
  worker?: CounterpartyParty | null;
  employer?: CounterpartyParty | null;
  contracts?: ContractRow[];
  conversation?: { id: string | number } | null;
};

type ListResponse = {
  items: CollaborationRow[];
  total: number;
  page: number;
  limit: number;
};

type StatusTab = 'ALL' | 'CHAT_ONLY' | 'PROPOSED' | 'ACTIVE' | 'ENDED';
type RoleTab = 'WORKER' | 'EMPLOYER';

const STATUS_TABS: StatusTab[] = [
  'ALL',
  'CHAT_ONLY',
  'PROPOSED',
  'ACTIVE',
  'ENDED',
];
const STATUS_LABEL: Record<StatusTab, string> = {
  ALL: 'All',
  CHAT_ONLY: 'Chat only',
  PROPOSED: 'Proposed',
  ACTIVE: 'Active',
  ENDED: 'Ended',
};

function pickRowState(row: CollaborationRow): StatusTab {
  const contracts = row.contracts ?? [];
  if (contracts.length === 0) return 'CHAT_ONLY';
  const inFlight = contracts.find((c) =>
    ['DRAFT', 'PROPOSED', 'ACTIVE'].includes(c.status),
  );
  if (inFlight) return inFlight.status === 'PROPOSED' ? 'PROPOSED' : 'ACTIVE';
  return 'ENDED';
}

function fmtGbp(value?: string | number | null) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(n);
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

const stateBadgeVariant: Record<
  StatusTab,
  'info' | 'warning' | 'success' | 'secondary' | 'outline'
> = {
  ALL: 'outline',
  CHAT_ONLY: 'outline',
  PROPOSED: 'warning',
  ACTIVE: 'success',
  ENDED: 'secondary',
};

export default function CollaborationsPage() {
  const { account, isWorker, isEmployer, loading: accountLoading } =
    useAccountMe();

  const [data, setData] = useState<CollaborationRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [roleTab, setRoleTab] = useState<RoleTab | null>(null);

  const myAccountId = account?.id != null ? String(account.id) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<ListResponse>(
        '/collaborations/me?page=1&limit=100',
      );
      setData(res.items ?? []);
    } catch (err) {
      setError(
        parseApiError(err)?.message ?? 'Could not load your collaborations.',
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    void load();
  }, [accountLoading, load]);

  const availableRoles = useMemo<RoleTab[]>(() => {
    if (!myAccountId) return [];
    const roles = new Set<RoleTab>();
    for (const row of data) {
      if (String(row.worker_id) === myAccountId) roles.add('WORKER');
      if (String(row.employer_id) === myAccountId) roles.add('EMPLOYER');
    }
    return Array.from(roles);
  }, [data, myAccountId]);

  useEffect(() => {
    if (availableRoles.length < 2) {
      if (roleTab !== null) setRoleTab(null);
      return;
    }
    if (roleTab == null) {
      setRoleTab(isWorker ? 'WORKER' : 'EMPLOYER');
    }
  }, [availableRoles, roleTab, isWorker]);

  const filteredByRole = useMemo(() => {
    if (!myAccountId || roleTab == null) return data;
    return data.filter((row) =>
      roleTab === 'WORKER'
        ? String(row.worker_id) === myAccountId
        : String(row.employer_id) === myAccountId,
    );
  }, [data, myAccountId, roleTab]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: filteredByRole.length,
      CHAT_ONLY: 0,
      PROPOSED: 0,
      ACTIVE: 0,
      ENDED: 0,
    };
    for (const row of filteredByRole) c[pickRowState(row)] += 1;
    return c;
  }, [filteredByRole]);

  const filtered = useMemo(() => {
    if (statusTab === 'ALL') return filteredByRole;
    return filteredByRole.filter((row) => pickRowState(row) === statusTab);
  }, [filteredByRole, statusTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Collaborations
          </h1>
          <p className="text-sm text-fg-muted">
            Each row is a long-running working relationship with one
            counterparty. Contracts live inside.
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {availableRoles.length === 2 ? (
        <Tabs
          value={roleTab ?? 'WORKER'}
          onValueChange={(v) => setRoleTab(v as RoleTab)}
        >
          <TabsList>
            <TabsTrigger value="WORKER">
              <Briefcase className="h-4 w-4" /> As worker
            </TabsTrigger>
            <TabsTrigger value="EMPLOYER">
              <Handshake className="h-4 w-4" /> As employer
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABEL[s]}
              <Badge variant="outline" className="ml-1 text-xs">
                {counts[s]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No collaborations here"
          description={
            isEmployer
              ? 'Accept a worker on a job post to start a working relationship.'
              : 'Apply for jobs and an employer accept will create a collaboration here.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => {
            const meIsWorker = String(row.worker_id) === myAccountId;
            const counterparty = meIsWorker ? row.employer : row.worker;
            const cpName = counterparty?.client_profile?.display_name ?? '—';
            const cpCity = counterparty?.client_profile?.city ?? '';
            const state = pickRowState(row);
            const contractsCount = row.contracts?.length ?? 0;
            const lastContract =
              row.contracts && row.contracts.length > 0
                ? row.contracts[row.contracts.length - 1]
                : null;
            return (
              <li key={String(row.id)}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{cpName}</CardTitle>
                        <CardDescription>
                          {cpCity ? `${cpCity} · ` : ''}
                          since {fmtDate(row.first_contracted_at ?? row.created_at)}
                          {' · '}
                          {contractsCount} contract
                          {contractsCount === 1 ? '' : 's'}
                        </CardDescription>
                      </div>
                      <Badge variant={stateBadgeVariant[state]}>
                        {STATUS_LABEL[state]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {lastContract ? (
                      <p>
                        Latest:{' '}
                        <strong>
                          {lastContract.project_type ?? 'Untitled'}
                        </strong>{' '}
                        · {fmtGbp(lastContract.agreed_amount)} ·{' '}
                        <Badge variant="outline">{lastContract.status}</Badge>
                      </p>
                    ) : (
                      <p className="text-fg-muted">
                        No contracts yet — talk in chat then{' '}
                        {meIsWorker
                          ? 'wait for the employer to propose one'
                          : 'create one tied to one of your job posts'}
                        .
                      </p>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 border-t border-border-default pt-4">
                    <Button asChild>
                      <Link to={`/collaborations/${row.id}`}>Open</Link>
                    </Button>
                    {row.conversation?.id ? (
                      <Button asChild variant="outline">
                        <Link to={`/inbox/${row.conversation.id}`}>
                          <MessageCircle className="h-4 w-4" />
                          Chat
                        </Link>
                      </Button>
                    ) : null}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
