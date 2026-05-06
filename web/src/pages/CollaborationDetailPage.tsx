import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDashed,
  Flag,
  Handshake,
  Inbox,
  MessageCircle,
  Star,
} from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/ui/toast';
import {
  CollaborationStatusBadge,
  type CollaborationStatus,
} from '@/components/collaborations/CollaborationStatusBadge';
import {
  CounterpartyChip,
  type CounterpartyParty,
} from '@/components/collaborations/CounterpartyChip';
import { FlagCollaborationDialog } from '@/components/collaborations/FlagCollaborationDialog';
import { patchCollaborationStatus } from '@/components/collaborations/api';

type EscrowStatus =
  | 'CREATED'
  | 'DEPOSIT_PENDING'
  | 'HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'DISPUTED';

type EscrowTransaction = {
  id: string | number;
  status: string;
  job_amount?: string | number | null;
  platform_fee?: string | number | null;
  referral_commission?: string | number | null;
  worker_payout?: string | number | null;
  currency?: string | null;
  deposit_confirmed_at?: string | null;
  released_at?: string | null;
  refunded_at?: string | null;
  disputed_at?: string | null;
};

type Review = {
  id: string | number;
  reviewer_role: string;
  is_published: boolean;
};

type Collaboration = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
  initiated_by: 'WORKER' | 'EMPLOYER' | string;
  status: string;
  project_type?: string | null;
  site_postcode?: string | null;
  agreed_amount?: string | number | null;
  flagged: boolean;
  flag_reason?: string | null;
  confirmed_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  worker?: CounterpartyParty | null;
  employer?: CounterpartyParty | null;
  reviews?: Review[];
  escrow_transaction?: EscrowTransaction | null;
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'REJECTED']);

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

function escrowStatusVariant(
  status?: string | null,
): 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'outline' {
  switch ((status ?? '').toUpperCase()) {
    case 'HELD':
      return 'info';
    case 'RELEASED':
      return 'success';
    case 'DEPOSIT_PENDING':
    case 'CREATED':
      return 'warning';
    case 'REFUNDED':
      return 'secondary';
    case 'DISPUTED':
      return 'danger';
    default:
      return 'outline';
  }
}

function escrowStatusLabel(status?: string | null): string {
  switch ((status ?? '').toUpperCase()) {
    case 'HELD':
      return 'Held';
    case 'RELEASED':
      return 'Released';
    case 'DEPOSIT_PENDING':
      return 'Awaiting deposit';
    case 'CREATED':
      return 'Awaiting deposit';
    case 'REFUNDED':
      return 'Refunded';
    case 'DISPUTED':
      return 'Disputed';
    default:
      return status ?? 'Unknown';
  }
}

function escrowTimestamp(escrow: EscrowTransaction): { label: string; value: string } | null {
  const status = (escrow.status ?? '').toUpperCase() as EscrowStatus;
  if (status === 'HELD' && escrow.deposit_confirmed_at) {
    return { label: 'Deposit confirmed', value: formatDate(escrow.deposit_confirmed_at) };
  }
  if (status === 'RELEASED' && escrow.released_at) {
    return { label: 'Released', value: formatDate(escrow.released_at) };
  }
  if (status === 'REFUNDED' && escrow.refunded_at) {
    return { label: 'Refunded', value: formatDate(escrow.refunded_at) };
  }
  if (status === 'DISPUTED' && escrow.disputed_at) {
    return { label: 'Disputed', value: formatDate(escrow.disputed_at) };
  }
  return null;
}

export default function CollaborationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clientProfile, isStaff, loading: accountLoading } = useAccountMe();

  const [detail, setDetail] = useState<Collaboration | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<Collaboration>(`/collaborations/${id}`);
      setDetail(data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError({
        status: parsed?.status ?? 0,
        message: parsed?.message ?? 'Could not load this collaboration.',
      });
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const myClientProfileId = clientProfile?.id != null ? String(clientProfile.id) : null;

  const role: 'WORKER' | 'EMPLOYER' | null = useMemo(() => {
    if (!detail || !myClientProfileId) return null;
    if (String(detail.worker_id) === myClientProfileId) return 'WORKER';
    if (String(detail.employer_id) === myClientProfileId) return 'EMPLOYER';
    return null;
  }, [detail, myClientProfileId]);

  const isParticipant = role != null;
  const isResponder = useMemo(() => {
    if (!detail || role == null) return false;
    return detail.initiated_by !== role;
  }, [detail, role]);

  const status = (detail?.status ?? '').toUpperCase() as CollaborationStatus;
  const isTerminal = TERMINAL_STATUSES.has(status);

  async function patchStatus(nextStatus: string) {
    if (!id) return;
    setSubmittingStatus(nextStatus);
    setActionError('');
    try {
      await patchCollaborationStatus(id, nextStatus);
      toast.success('Status updated');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const parsed = parseApiError(err);
      setActionError(parsed?.message ?? 'Could not update status.');
      // Refetch in case of conflict to surface latest state.
      setRefreshKey((k) => k + 1);
    } finally {
      setSubmittingStatus(null);
    }
  }

  if (accountLoading || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !detail) {
    const notFound = error?.status === 404 || error?.status === 403;
    return notFound ? (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/collaborations">
            <ArrowLeft />
            Back to collaborations
          </Link>
        </Button>
        <EmptyState
          icon={Handshake}
          title="Collaboration not found"
          description="It may have been removed, or you don't have access to it."
          action={
            <Button asChild variant="outline">
              <Link to="/collaborations">Back to collaborations</Link>
            </Button>
          }
        />
      </div>
    ) : (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft />
          Back
        </Button>
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error?.message ?? 'Something went wrong loading this collaboration.'}
        </div>
        <Button onClick={() => setRefreshKey((k) => k + 1)} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const escrow = detail.escrow_transaction ?? null;
  const reviews = detail.reviews ?? [];
  const workerReview = reviews.find((r) => r.reviewer_role === 'WORKER');
  const employerReview = reviews.find((r) => r.reviewer_role === 'EMPLOYER');

  return (
    <article className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/collaborations">
            <ArrowLeft />
            Back to collaborations
          </Link>
        </Button>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Collaboration #{String(detail.id)}
          </h1>
          <CollaborationStatusBadge status={detail.status} />
          {detail.flagged ? (
            <Badge variant="danger" className="gap-1">
              <Flag className="h-3 w-3" />
              Flagged
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                Worker
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CounterpartyChip party={detail.worker ?? null} role="WORKER" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                Employer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CounterpartyChip party={detail.employer ?? null} role="EMPLOYER" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Project type">{detail.project_type ?? '—'}</Field>
            <Field label="Site postcode">{detail.site_postcode ?? '—'}</Field>
            <Field label="Agreed amount">{formatGbp(detail.agreed_amount)}</Field>
            <Field label="Started">{formatDate(detail.started_at)}</Field>
          </CardContent>
        </Card>
      </header>

      {detail.flagged ? (
        <div
          role="status"
          className="flex flex-wrap items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <Flag className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Flagged for staff review</p>
            <p className="text-xs">
              {detail.flag_reason
                ? detail.flag_reason
                : 'Flagged — no reason recorded.'}
            </p>
          </div>
        </div>
      ) : null}

      <ActionBar
        status={status}
        isParticipant={isParticipant}
        isResponder={isResponder}
        isStaff={isStaff}
        isTerminal={isTerminal}
        flagged={detail.flagged}
        submittingStatus={submittingStatus}
        actionError={actionError}
        onPatchStatus={(s) => void patchStatus(s)}
        onFlag={() => setFlagOpen(true)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EscrowSummaryCard escrow={escrow} collaborationId={String(detail.id)} />
        <ChatSummaryCard />
      </div>

      <ReviewsSummaryCard
        workerReview={workerReview}
        employerReview={employerReview}
      />

      <AuditTimeline detail={detail} />

      <FlagCollaborationDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        collaborationId={String(detail.id)}
        onFlagged={() => setRefreshKey((k) => k + 1)}
      />
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="text-fg">{children}</p>
    </div>
  );
}

type ActionBarProps = {
  status: CollaborationStatus;
  isParticipant: boolean;
  isResponder: boolean;
  isStaff: boolean;
  isTerminal: boolean;
  flagged: boolean;
  submittingStatus: string | null;
  actionError: string;
  onPatchStatus: (next: string) => void;
  onFlag: () => void;
};

function ActionBar({
  status,
  isParticipant,
  isResponder,
  isStaff,
  isTerminal,
  flagged,
  submittingStatus,
  actionError,
  onPatchStatus,
  onFlag,
}: ActionBarProps) {
  const transitions = useMemo(() => {
    if (!isParticipant) return [] as Array<{ next: string; label: string }>;
    if (status === 'PENDING' && isResponder) {
      return [
        { next: 'CONFIRMED', label: 'Confirm' },
        { next: 'REJECTED', label: 'Reject' },
      ];
    }
    if (status === 'CONFIRMED') return [{ next: 'IN_PROGRESS', label: 'Start work' }];
    if (status === 'IN_PROGRESS') return [{ next: 'COMPLETED', label: 'Mark complete' }];
    return [];
  }, [status, isParticipant, isResponder]);

  // Flag dispute is available on any non-terminal state for participants and staff.
  const showFlag = !isTerminal && (isParticipant || isStaff);

  if (!showFlag && transitions.length === 0 && !isStaff) {
    return null;
  }

  return (
    <section className="space-y-2">
      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-raised p-3">
        {isStaff && !isParticipant ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Staff cannot transition status — use the staff-tools surface"
            >
              Lifecycle actions disabled
            </Button>
          </>
        ) : null}
        {transitions.map((t) => (
          <Button
            key={t.next}
            type="button"
            size="sm"
            onClick={() => onPatchStatus(t.next)}
            disabled={submittingStatus != null}
          >
            {submittingStatus === t.next ? 'Updating…' : t.label}
          </Button>
        ))}
        {showFlag ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onFlag}
            disabled={submittingStatus != null}
          >
            <Flag />
            {flagged ? 'Update flag' : 'Flag dispute'}
          </Button>
        ) : null}
        {isParticipant && status === 'PENDING' && !isResponder ? (
          <p className="text-xs text-fg-muted">
            Waiting on the other party to confirm or reject.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function EscrowSummaryCard({
  escrow,
  collaborationId,
}: {
  escrow: EscrowTransaction | null;
  collaborationId: string;
}) {
  const escrowHref = escrow?.id != null ? `/escrow/${String(escrow.id)}` : `/escrow/${collaborationId}`;
  const timestamp = escrow ? escrowTimestamp(escrow) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4" />
          Escrow
        </CardTitle>
        <CardDescription>
          Escrow protects funds from deposit through release.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!escrow ? (
          <p className="text-fg-muted">No escrow yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={escrowStatusVariant(escrow.status)}>
                {escrowStatusLabel(escrow.status)}
              </Badge>
              {timestamp ? (
                <span className="text-xs text-fg-muted">
                  {timestamp.label}: {timestamp.value}
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <AmountRow label="Job amount" value={formatGbp(escrow.job_amount)} />
              <AmountRow label="Platform fee" value={formatGbp(escrow.platform_fee)} />
              <AmountRow
                label="Referral commission"
                value={formatGbp(escrow.referral_commission)}
              />
              <AmountRow label="Worker payout" value={formatGbp(escrow.worker_payout)} />
            </dl>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t border-border-default pt-4">
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to={escrowHref}>
            Manage payment
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}

function ChatSummaryCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          Conversation
        </CardTitle>
        <CardDescription>
          Per-collaboration messaging is coming soon. Use the inbox in the
          meantime.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-fg-muted">
        <p>
          Messages between you and the other party will surface here once chat
          ships.
        </p>
      </CardContent>
      <CardFooter className="border-t border-border-default pt-4">
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/inbox">
            Open inbox
            <Inbox />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ReviewsSummaryCard({
  workerReview,
  employerReview,
}: {
  workerReview: Review | undefined;
  employerReview: Review | undefined;
}) {
  const empty = !workerReview && !employerReview;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4" />
          Reviews
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {empty ? (
          <p className="text-fg-muted">No reviews yet.</p>
        ) : (
          <ul className="space-y-1">
            <li className="flex items-center justify-between gap-3">
              <span className="text-fg-muted">Worker review</span>
              <ReviewBadge review={workerReview} />
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-fg-muted">Employer review</span>
              <ReviewBadge review={employerReview} />
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewBadge({ review }: { review: Review | undefined }) {
  if (!review) return <Badge variant="outline">Not submitted</Badge>;
  return review.is_published ? (
    <Badge variant="success">Published</Badge>
  ) : (
    <Badge variant="secondary">Draft</Badge>
  );
}

function AuditTimeline({ detail }: { detail: Collaboration }) {
  const events: Array<{ label: string; value: string | null | undefined }> = [
    { label: 'Created', value: detail.created_at },
    { label: 'Confirmed', value: detail.confirmed_at },
    { label: 'Started', value: detail.started_at },
    { label: 'Ended', value: detail.ended_at },
  ].filter((e) => Boolean(e.value)) as Array<{ label: string; value: string }>;

  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDashed className="h-4 w-4" />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {events.map((e) => (
            <li key={e.label} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
              <div className="space-y-0.5">
                <p className="font-medium text-fg">{e.label}</p>
                <p className="text-xs text-fg-muted">{formatDate(e.value)}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
