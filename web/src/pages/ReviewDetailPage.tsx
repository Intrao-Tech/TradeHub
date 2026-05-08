import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, SearchX } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import {
  VerificationBadge,
  verificationFromLevel,
} from '@/components/VerificationBadge';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { getReviewById, type Review } from '@/components/reviews/api';

type ClientProfileLite = {
  id?: string | number;
  display_name?: string;
  avatar_url?: string | null;
  verification_level?: string | number | null;
};

type CounterpartyResponse = {
  id: string | number;
  client_profile?: ClientProfileLite | null;
};

type Outcome =
  | { kind: 'loading' }
  | { kind: 'review'; review: Review }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

type CounterpartyState =
  | { kind: 'loading' }
  | { kind: 'ready'; party: CounterpartyResponse }
  | { kind: 'fallback' };

type BackLink = {
  label: string;
  to?: string;
  fallbackToHistory?: boolean;
};

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { account, clientProfile, isStaff } = useAccountMe();

  const [outcome, setOutcome] = useState<Outcome>({ kind: 'loading' });
  const [counterparty, setCounterparty] = useState<CounterpartyState>({
    kind: 'loading',
  });

  const myClientProfileId = clientProfile?.id != null ? String(clientProfile.id) : null;

  const load = useCallback(async () => {
    if (!id) return;
    setOutcome({ kind: 'loading' });
    setCounterparty({ kind: 'loading' });

    try {
      const review = await getReviewById(id);
      setOutcome({ kind: 'review', review });

      const collab = review.collaboration;
      if (collab) {
        const counterpartyId =
          review.reviewer_role === 'EMPLOYER'
            ? collab.worker_id
            : collab.employer_id;
        const path =
          review.reviewer_role === 'EMPLOYER'
            ? `/worker-profiles/${counterpartyId}`
            : `/employer-profiles/${counterpartyId}`;
        try {
          const party = await api<CounterpartyResponse>(path);
          setCounterparty({ kind: 'ready', party });
        } catch {
          setCounterparty({ kind: 'fallback' });
        }
      } else {
        setCounterparty({ kind: 'fallback' });
      }
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed?.status === 403) {
        setOutcome({ kind: 'forbidden' });
      } else if (parsed?.status === 404) {
        setOutcome({ kind: 'not-found' });
      } else {
        setOutcome({
          kind: 'error',
          message: parsed?.message ?? 'Could not load this review.',
        });
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink: BackLink = useMemo(() => {
    const referrer =
      typeof document !== 'undefined' ? document.referrer : '';
    let referrerPath: string | null = null;
    if (referrer && typeof window !== 'undefined') {
      try {
        const url = new URL(referrer);
        if (url.origin === window.location.origin) {
          referrerPath = url.pathname;
        }
      } catch {
        /* ignore */
      }
    }

    if (referrerPath?.startsWith('/admin') && isStaff) {
      return { label: '← Back to publish queue', to: '/admin?tab=reviews' };
    }

    const review = outcome.kind === 'review' ? outcome.review : null;
    const cpReady = counterparty.kind === 'ready' ? counterparty.party : null;

    if (referrerPath?.startsWith('/workers/')) {
      const referrerWorkerId = referrerPath.split('/')[2];
      const cpWorkerId =
        review?.reviewer_role === 'EMPLOYER' && review.collaboration?.worker_id
          ? String(review.collaboration.worker_id)
          : null;
      if (
        cpWorkerId != null &&
        referrerWorkerId === cpWorkerId &&
        cpReady?.client_profile?.display_name
      ) {
        return {
          label: `← Back to ${cpReady.client_profile.display_name}'s reviews`,
          to: referrerPath,
        };
      }
      return { label: '← Back to worker reviews', to: referrerPath };
    }

    if (referrerPath?.startsWith('/employers/')) {
      const referrerEmpId = referrerPath.split('/')[2];
      const cpEmpId =
        review?.reviewer_role === 'WORKER' && review.collaboration?.employer_id
          ? String(review.collaboration.employer_id)
          : null;
      if (
        cpEmpId != null &&
        referrerEmpId === cpEmpId &&
        cpReady?.client_profile?.display_name
      ) {
        return {
          label: `← Back to ${cpReady.client_profile.display_name}'s reviews`,
          to: referrerPath,
        };
      }
      return { label: '← Back to employer reviews', to: referrerPath };
    }

    return { label: '← Back', fallbackToHistory: true };
  }, [outcome, counterparty, isStaff]);

  function renderBack() {
    if (backLink.to) {
      return (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={backLink.to}>
            <ArrowLeft />
            {backLink.label.replace(/^← /, '')}
          </Link>
        </Button>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate('/');
        }}
      >
        <ArrowLeft />
        Back
      </Button>
    );
  }

  if (outcome.kind === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (outcome.kind === 'forbidden') {
    return (
      <div className="space-y-4">
        {renderBack()}
        <EmptyState
          icon={Lock}
          title="Review not available"
          description="This review hasn't been published yet."
        />
      </div>
    );
  }

  if (outcome.kind === 'not-found') {
    return (
      <div className="space-y-4">
        {renderBack()}
        <EmptyState
          icon={SearchX}
          title="Review not found"
          action={
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (outcome.kind === 'error') {
    return (
      <div className="space-y-4">
        {renderBack()}
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {outcome.message}
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const review = outcome.review;
  const collab = review.collaboration;
  const counterpartyKind: 'worker' | 'employer' =
    review.reviewer_role === 'EMPLOYER' ? 'worker' : 'employer';
  const counterpartyId =
    counterpartyKind === 'worker' ? collab?.worker_id : collab?.employer_id;
  const counterpartyHref =
    counterpartyId != null
      ? `/${counterpartyKind === 'worker' ? 'workers' : 'employers'}/${counterpartyId}`
      : null;

  const isAuthor =
    myClientProfileId != null &&
    collab != null &&
    ((review.reviewer_role === 'WORKER' &&
      String(collab.worker_id) === myClientProfileId) ||
      (review.reviewer_role === 'EMPLOYER' &&
        String(collab.employer_id) === myClientProfileId));
  const isCounterparty =
    myClientProfileId != null &&
    collab != null &&
    ((review.reviewer_role === 'WORKER' &&
      String(collab.employer_id) === myClientProfileId) ||
      (review.reviewer_role === 'EMPLOYER' &&
        String(collab.worker_id) === myClientProfileId));
  const canSeeCollabLink = isAuthor || isCounterparty || isStaff;

  return (
    <article className="space-y-6">
      {renderBack()}

      {!review.is_published ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          This review is not public yet — pending staff review.
        </div>
      ) : null}

      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Review
          </h1>
          <Badge variant={review.is_published ? 'success' : 'warning'}>
            {review.is_published ? 'Published' : 'Draft'}
          </Badge>
        </div>

        <div className="rounded-md border border-border-default bg-raised p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Reviewed
          </p>
          <CounterpartyChip
            state={counterparty}
            kind={counterpartyKind}
            counterpartyId={counterpartyId}
            href={counterpartyHref}
          />
        </div>
      </header>

      <ReviewCard review={review} linkToPermalink={false} />

      {canSeeCollabLink && collab?.id != null ? (
        <div className="rounded-md border border-border-default p-4 text-sm">
          <p className="mb-1 font-medium text-fg">About this collaboration</p>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to={`/collaborations/${collab.id}`}>
              View collaboration #{String(collab.id)}
            </Link>
          </Button>
        </div>
      ) : null}

      {!account ? (
        <p className="text-xs text-fg-muted">
          You're viewing this review as a guest.
        </p>
      ) : null}
    </article>
  );
}

function CounterpartyChip({
  state,
  kind,
  counterpartyId,
  href,
}: {
  state: CounterpartyState;
  kind: 'worker' | 'employer';
  counterpartyId: string | number | null | undefined;
  href: string | null;
}) {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const cp =
    state.kind === 'ready' ? state.party.client_profile ?? null : null;
  const fallbackName =
    counterpartyId != null
      ? `${kind === 'worker' ? 'Worker' : 'Employer'} #${counterpartyId}`
      : kind === 'worker'
        ? 'Worker'
        : 'Employer';
  const name = cp?.display_name ?? fallbackName;
  const initial = name.charAt(0).toUpperCase() || '?';

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-10 w-10 text-sm">
        {cp?.avatar_url ? <AvatarImage src={cp.avatar_url} alt={name} /> : null}
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <Link
              to={href}
              className="truncate text-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-fg">{name}</span>
          )}
          {cp ? (
            <VerificationBadge
              state={verificationFromLevel(cp.verification_level)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
