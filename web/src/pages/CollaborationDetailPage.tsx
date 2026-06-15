import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, RefreshCw, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { formatMoney, formatDate } from '@/lib/format';
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
import { LeaveReviewSheet } from '@/components/reviews/LeaveReviewSheet';
import { getReviewsByCollaboration, type Review } from '@/components/reviews/api';

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
  job_post_id?: string | number | null;
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
  return formatMoney(n);
};

const fmtDate = (value?: string | null) => formatDate(value) || '—';

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
  const { t } = useTranslation('collaborations');
  const { id } = useParams<{ id: string }>();
  const { account, isEmployer, isStaff, clientProfile, verificationState } =
    useAccountMe();
  const [collab, setCollab] = useState<CollaborationData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
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
      setError(parseApiError(err)?.message ?? t('relationship.loadError'));
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

  // Existing reviews (incl. the caller's own pending drafts) decide whether the
  // "Leave a review" CTA still applies. Only participants may call this — staff
  // viewers and outsiders skip the fetch. Failures are silent: the CTA simply
  // stays hidden rather than blocking the page.
  const loadReviews = useCallback(async () => {
    if (!id || !isParty || isStaff) return;
    try {
      setReviews(await getReviewsByCollaboration(id));
    } catch {
      setReviews([]);
    }
  }, [id, isParty, isStaff]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);
  const employerSide =
    myAccountId != null &&
    collab != null &&
    String(collab.employer_id) === myAccountId &&
    isEmployer;
  // Job posts that already have an active/pending contract with this worker —
  // those can't be re-contracted until the current one ends, but OTHER job
  // posts still can (one in-flight contract per job post, not per relationship).
  const takenJobPostIds = new Set(
    (collab?.contracts ?? [])
      .filter(
        (c) =>
          ['DRAFT', 'PROPOSED', 'ACTIVE'].includes(c.status) &&
          c.job_post_id != null,
      )
      .map((c) => String(c.job_post_id)),
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
    counterparty?.client_profile?.display_name ?? t('relationship.counterpartyFallback');

  // Reviews are gated to a finished job. The backend resolves the latest ENDED
  // contract and enforces one review per (contract, role); we mirror that here
  // so the CTA only shows when it can actually succeed.
  const meIsWorker =
    collab != null && myAccountId != null && String(collab.worker_id) === myAccountId;
  const myRole: Review['reviewer_role'] = meIsWorker ? 'WORKER' : 'EMPLOYER';
  const hasCompletedContract = (collab?.contracts ?? []).some(
    (c) => c.status === 'ENDED' && c.end_reason === 'COMPLETED',
  );
  const alreadyReviewed = reviews.some((r) => r.reviewer_role === myRole);
  const canLeaveReview =
    isParty && !isStaff && hasCompletedContract && !alreadyReviewed;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/collaborations"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('relationship.back')}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
          {collab?.worker?.client_profile?.display_name ?? t('relationship.workerFallback')}{' '}
          ↔{' '}
          {collab?.employer?.client_profile?.display_name ?? t('relationship.employerFallback')}
        </h1>
        <p className="text-sm text-fg-muted">
          {t('relationship.subtitleSince', {
            date: fmtDate(collab?.first_contracted_at ?? collab?.created_at),
          })}
          {totalContracts > 0
            ? t('relationship.contractsSuffix', { count: totalContracts })
            : t('relationship.noContractsSuffix')}
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
          {t('relationship.refresh')}
        </Button>
        {collab?.conversation?.id ? (
          <Button asChild>
            <Link to={`/inbox/${collab.conversation.id}`}>
              <MessageCircle />
              {t('relationship.openChatWith', { name: counterpartyName })}
            </Link>
          </Button>
        ) : null}
        {employerSide ? (
          <NewContractSheet
            collabId={collab.id}
            initiator="EMPLOYER"
            takenJobPostIds={takenJobPostIds}
            onCreated={() => void load()}
          />
        ) : null}
        {canLeaveReview && verificationState === 'ACTIVE' ? (
          <Button type="button" variant="outline" onClick={() => setReviewOpen(true)}>
            <Star />
            {t('leaveReview.title')}
          </Button>
        ) : canLeaveReview &&
          verificationState === 'PENDING_EMAIL_VERIFICATION' ? (
          <Button asChild variant="outline">
            <Link to="/verify-email">{t('leaveReview.verifyCta')}</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('relationship.counterparty')}</CardTitle>
            <CardDescription>
              {clientProfile ? t('relationship.counterpartyDesc') : ''}
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
            <CardTitle>{t('relationship.activity')}</CardTitle>
            <CardDescription>{t('relationship.activityDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              {t('relationship.contractsCount')} <strong>{totalContracts}</strong>
            </div>
            <div>
              {t('relationship.totalReleased')} <strong>{fmtGbp(totalReleased)}</strong>
            </div>
            <div>
              {t('relationship.firstContracted')} {fmtDate(collab?.first_contracted_at)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('relationship.contracts')}</CardTitle>
          <CardDescription>
            {employerSide
              ? t('relationship.contractsDescEmployer')
              : t('relationship.contractsDescWorker')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!collab?.contracts?.length ? (
            <p className="text-sm text-fg-muted">
              {employerSide
                ? t('relationship.noContractsEmployer')
                : t('relationship.noContracts')}
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
                        {t('relationship.contractLine', {
                          position: c.position,
                          type: c.project_type ?? t('relationship.untitled'),
                        })}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {fmtGbp(c.agreed_amount)}{' '}
                        {c.site_postcode ? `· ${c.site_postcode}` : ''}{' '}
                        {c.started_at
                          ? t('relationship.started', { date: fmtDate(c.started_at) })
                          : ''}
                        {c.ended_at
                          ? t('relationship.ended', { date: fmtDate(c.ended_at) })
                          : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={contractStatusVariant(c.status)}>
                        {t(`contractStatus.${c.status.toLowerCase()}`, { defaultValue: c.status })}
                        {c.end_reason
                          ? ` · ${t(`endReason.${c.end_reason.toLowerCase()}`, { defaultValue: c.end_reason })}`
                          : ''}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/contracts/${c.id}`}>{t('relationship.open')}</Link>
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
            <p className="text-xs text-fg-muted">{t('relationship.loading')}</p>
          </CardFooter>
        ) : null}
      </Card>

      {!isParty && collab ? (
        <p className="text-xs text-fg-muted">{t('relationship.readOnly')}</p>
      ) : null}

      {id && clientProfile ? (
        <LeaveReviewSheet
          collaborationId={String(id)}
          clientProfileId={clientProfile.id}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          onSubmitted={() => {
            setReviewOpen(false);
            void loadReviews();
          }}
        />
      ) : null}
    </div>
  );
}
