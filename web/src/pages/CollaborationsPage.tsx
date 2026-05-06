import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Handshake, Plus } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import {
  CollaborationStatusBadge,
  type CollaborationStatus,
} from '@/components/collaborations/CollaborationStatusBadge';
import {
  CounterpartyChip,
  type CounterpartyParty,
} from '@/components/collaborations/CounterpartyChip';
import {
  NewCollaborationSheet,
  type NewCollaborationRole,
} from '@/components/collaborations/NewCollaborationSheet';

type CollaborationRow = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
  initiated_by: 'WORKER' | 'EMPLOYER' | string;
  status: string;
  project_type?: string | null;
  site_postcode?: string | null;
  agreed_amount?: string | number | null;
  flagged?: boolean;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  worker?: CounterpartyParty | null;
  employer?: CounterpartyParty | null;
};

type ListResponse = {
  items: CollaborationRow[];
  total: number;
  page: number;
  limit: number;
};

type StatusTab = 'ALL' | CollaborationStatus;

const STATUS_TABS: StatusTab[] = [
  'ALL',
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'DISPUTED',
  'REJECTED',
];

const STATUS_LABEL: Record<StatusTab, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  REJECTED: 'Rejected',
};

type RoleTab = 'WORKER' | 'EMPLOYER';

function formatGbp(value?: string | number | null): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function CollaborationsPage() {
  const navigate = useNavigate();
  const { clientProfile, isWorker, isEmployer, loading: accountLoading } =
    useAccountMe();

  const [data, setData] = useState<CollaborationRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [roleTab, setRoleTab] = useState<RoleTab | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetRole, setSheetRole] = useState<NewCollaborationRole>('WORKER');

  const myClientProfileId =
    clientProfile?.id != null ? String(clientProfile.id) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<ListResponse>('/collaborations/me?page=1&limit=100');
      setData(res.items ?? []);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not load your collaborations.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    void load();
  }, [accountLoading, load]);

  // Derive which role tabs are present based on the rows (Decision Q1).
  const availableRoles = useMemo<RoleTab[]>(() => {
    if (!myClientProfileId) return [];
    const roles = new Set<RoleTab>();
    for (const row of data) {
      if (String(row.worker_id) === myClientProfileId) roles.add('WORKER');
      if (String(row.employer_id) === myClientProfileId) roles.add('EMPLOYER');
    }
    return Array.from(roles);
  }, [data, myClientProfileId]);

  // Set a sensible default role tab once we know what roles the user has rows for.
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
    if (!myClientProfileId || roleTab == null) return data;
    return data.filter((row) =>
      roleTab === 'WORKER'
        ? String(row.worker_id) === myClientProfileId
        : String(row.employer_id) === myClientProfileId,
    );
  }, [data, myClientProfileId, roleTab]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: 0,
      PENDING: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      DISPUTED: 0,
      REJECTED: 0,
    };
    for (const row of filteredByRole) {
      c.ALL += 1;
      const k = (row.status ?? '').toUpperCase() as StatusTab;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [filteredByRole]);

  const visible = useMemo(() => {
    if (statusTab === 'ALL') return filteredByRole;
    return filteredByRole.filter(
      (r) => (r.status ?? '').toUpperCase() === statusTab,
    );
  }, [filteredByRole, statusTab]);

  function openSheet(role: NewCollaborationRole) {
    setSheetRole(role);
    setSheetOpen(true);
  }

  const canInitiate = isWorker || isEmployer;
  const initiatorRole: NewCollaborationRole = isWorker ? 'WORKER' : 'EMPLOYER';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Collaborations
          </h1>
          <p className="text-sm text-fg-muted">
            Track engagements through pending, confirmed, in-progress, and
            completed.
          </p>
        </div>
        {canInitiate ? (
          <Button
            type="button"
            onClick={() => openSheet(initiatorRole)}
            className="self-start sm:self-auto"
          >
            <Plus />
            New collaboration
          </Button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {availableRoles.length >= 2 ? (
        <Tabs
          value={roleTab ?? 'WORKER'}
          onValueChange={(v) => setRoleTab(v as RoleTab)}
        >
          <TabsList className="bg-subtle p-1">
            <TabsTrigger value="WORKER">As worker</TabsTrigger>
            <TabsTrigger value="EMPLOYER">As employer</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-subtle p-1 sm:w-auto">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="gap-2">
              {STATUS_LABEL[t]}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {counts[t]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={
            data.length === 0
              ? 'No collaborations yet'
              : 'No collaborations match these filters'
          }
          description={
            data.length === 0
              ? 'Accept a job application to start one, or invite someone manually.'
              : 'Try a different status or role filter.'
          }
          action={
            data.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline">
                  <Link to="/jobs">
                    <Briefcase />
                    Browse jobs
                  </Link>
                </Button>
                {canInitiate ? (
                  <Button onClick={() => openSheet(initiatorRole)}>
                    <Plus />
                    New collaboration
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((row) => (
            <CollaborationRowCard
              key={String(row.id)}
              row={row}
              myClientProfileId={myClientProfileId}
            />
          ))}
        </div>
      )}

      <NewCollaborationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        role={sheetRole}
        onCreated={(created) => {
          void load();
          if (created.id != null) {
            navigate(`/collaborations/${String(created.id)}`);
          }
        }}
      />
    </div>
  );
}

function CollaborationRowCard({
  row,
  myClientProfileId,
}: {
  row: CollaborationRow;
  myClientProfileId: string | null;
}) {
  const myRole: 'WORKER' | 'EMPLOYER' | null =
    myClientProfileId == null
      ? null
      : String(row.worker_id) === myClientProfileId
        ? 'WORKER'
        : String(row.employer_id) === myClientProfileId
          ? 'EMPLOYER'
          : null;

  // The counterparty is the *other* side from `myRole`.
  const counterpartyRole: 'WORKER' | 'EMPLOYER' =
    myRole === 'WORKER' ? 'EMPLOYER' : 'WORKER';
  const counterparty =
    counterpartyRole === 'WORKER' ? row.worker ?? null : row.employer ?? null;

  const status = (row.status ?? '').toUpperCase() as CollaborationStatus;
  const detailHref = `/collaborations/${String(row.id)}`;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CounterpartyChip party={counterparty} role={counterpartyRole} />
          <CollaborationStatusBadge status={row.status} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Project type">{row.project_type ?? '—'}</Field>
          <Field label="Agreed amount">{formatGbp(row.agreed_amount)}</Field>
          <Field label="Started">{formatDate(row.started_at)}</Field>
          <Field label="Ended">
            {row.ended_at
              ? formatDate(row.ended_at)
              : status === 'IN_PROGRESS'
                ? 'In progress'
                : '—'}
          </Field>
        </dl>
        {row.flagged ? (
          <Badge variant="danger" className="gap-1">
            Flagged for review
          </Badge>
        ) : null}
      </CardContent>
      <CardFooter className="border-t border-border-default pt-4">
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link to={detailHref}>View collaboration</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}
