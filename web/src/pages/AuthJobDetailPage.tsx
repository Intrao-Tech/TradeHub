import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Clock,
  Copy,
  MapPin,
  Users,
} from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/EmptyState';
import { AuthBanner } from '@/components/AuthBanner';
import { EmployerChip } from '@/components/jobs/EmployerChip';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { ApplicationStatusBadge } from '@/components/jobs/ApplicationStatusBadge';
import { ApplyJobSheet } from '@/components/jobs/ApplyJobSheet';
import { AttachmentList } from '@/components/jobs/AttachmentList';
import { formatPay } from '@/components/jobs/PayLine';
import { SaveJobButton } from '@/components/jobs/SaveJobButton';
import { formatRelative } from '@/lib/relative-time';
import { toast } from '@/components/ui/toast';
import { ShareForCommissionButton } from '@/components/referral/ShareForCommissionButton';
import { useRefAttribution } from '@/components/referral/useRefAttribution';
import { StarRating } from '@/components/StarRating';
import {
  VerificationBadge,
  verificationFromLevel,
} from '@/components/VerificationBadge';

type Specialisation = { id?: number; name?: string };
type Tag = { id?: number; name?: string };

type JobDetail = {
  id: string | number;
  title: string;
  description?: string | null;
  postcode_area?: string | null;
  site_address?: string | null;
  pay_type?: string;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
  duration_days?: number | null;
  start_date?: string | null;
  status?: string;
  is_urgent?: boolean;
  is_saved?: boolean;
  expires_at?: string | null;
  created_at?: string;
  employer?: {
    id?: string | number;
    company_name?: string | null;
    rating_avg?: string | number | null;
    rating_count?: number | null;
    client_profile?: {
      display_name?: string | null;
      verification_level?: string | null;
      avatar_url?: string | null;
      city?: string | null;
      postcode_area?: string | null;
      slug?: string | null;
      created_at?: string | null;
    } | null;
  } | null;
  specialisations?: Array<{ specialisation?: Specialisation }>;
  tags?: Array<{ tag?: Tag }>;
  attachments?: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
  _count?: { applications?: number };
};

type MyApplication = {
  id: string | number;
  status: string;
  job_post?: { id?: string | number } | null;
};

type MyApplicationsResponse = {
  items: MyApplication[];
};

export default function AuthJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loggedIn = !!getToken();
  const { isWorker, isEmployer, clientProfile, verificationState } = useAccountMe();
  useRefAttribution({ targetId: id ?? null, targetRole: 'WORKER' });

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [myApp, setMyApp] = useState<MyApplication | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    api<JobDetail>(`/job-posts/${id}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err);
        setError({
          status: parsed?.status ?? 0,
          message: parsed?.message ?? 'Could not load this job.',
        });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  // Worker-only: fetch own applications to detect "already applied" / status.
  useEffect(() => {
    if (!loggedIn || !isWorker || !id) {
      setMyApp(null);
      return;
    }
    let cancelled = false;
    api<MyApplicationsResponse>('/job-applications/me?page=1&limit=100')
      .then((data) => {
        if (cancelled) return;
        const match =
          data?.items?.find(
            (row) => String(row.job_post?.id ?? '') === String(id),
          ) ?? null;
        setMyApp(match);
      })
      .catch(() => {
        if (cancelled) return;
        setMyApp(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loggedIn, isWorker, refreshKey]);

  const ownsPost = useMemo(() => {
    if (!detail || !isEmployer) return false;
    const myEmployerId = clientProfile?.employer_profile?.id;
    if (myEmployerId == null) return false;
    return String(detail.employer?.id ?? '') === String(myEmployerId);
  }, [detail, isEmployer, clientProfile]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Job not found"
        description="This job has been removed or never existed."
        action={
          <Button asChild variant="outline">
            <Link to="/jobs">Back to job board</Link>
          </Button>
        }
      />
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft />
          Back
        </Button>
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error?.message ?? 'Something went wrong loading this job.'}
        </div>
      </div>
    );
  }

  const specs = (detail.specialisations ?? [])
    .map((s) => s.specialisation?.name)
    .filter(Boolean) as string[];
  const tags = (detail.tags ?? []).map((t) => t.tag?.name).filter(Boolean) as string[];
  const isClosed = detail.status != null && detail.status.toUpperCase() !== 'OPEN';
  const nextHref = `/jobs/${id}`;
  const proposalsCount = detail._count?.applications ?? 0;

  return (
    <article className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/jobs">
            <ArrowLeft />
            Back to jobs
          </Link>
        </Button>
      </div>

      {isClosed ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          This job is no longer accepting applications.
        </div>
      ) : null}

      {loggedIn && isWorker && verificationState === 'PENDING_EMAIL_VERIFICATION' ? (
        <AuthBanner variant="warning" title="Verify your email to apply">
          Confirm your email address to start applying to jobs.
        </AuthBanner>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {detail.is_urgent ? (
                <Badge variant="danger" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Urgent
                </Badge>
              ) : null}
              <JobStatusBadge status={detail.status} />
              {myApp ? <ApplicationStatusBadge status={myApp.status} /> : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              {detail.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
              <EmployerChip employer={detail.employer ?? null} />
              {detail.postcode_area ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {detail.postcode_area}
                </span>
              ) : null}
              {detail.created_at ? (
                <span>Posted {formatRelative(detail.created_at)}</span>
              ) : null}
              {detail.expires_at ? (
                <span>Expires {formatRelative(detail.expires_at)}</span>
              ) : null}
            </div>
          </header>

          <ScopeStrip detail={detail} />

          {detail.description ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-fg">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-fg">
                {detail.description}
              </p>
            </section>
          ) : null}

          {specs.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-fg">
                Required specialisations
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {specs.map((s) => (
                  <Badge key={`spec-${s}`} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          {tags.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-fg">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={`tag-${t}`} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <AttachmentList
            heading="Attachments"
            attachments={detail.attachments}
            previewImages
          />

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-fg">Activity on this job</h2>
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Users className="h-4 w-4" />
              <span>
                <span className="font-medium text-fg">
                  {proposalsCount >= 50 ? '50+' : proposalsCount}
                </span>{' '}
                {proposalsCount === 1 ? 'application' : 'applications'} received
              </span>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <ActionCard
            loggedIn={loggedIn}
            isWorker={isWorker}
            isEmployer={isEmployer}
            ownsPost={ownsPost}
            verificationState={verificationState}
            isClosed={isClosed}
            myApp={myApp}
            nextHref={nextHref}
            jobId={String(id)}
            jobTitle={detail.title}
            initialSaved={!!detail.is_saved}
            onApply={() => setApplyOpen(true)}
          />

          <AboutClientCard employer={detail.employer ?? null} />

          <JobLinkCard jobId={String(id)} />
        </aside>
      </div>

      {detail && id ? (
        <ApplyJobSheet
          open={applyOpen}
          onOpenChange={setApplyOpen}
          jobPostId={id}
          jobTitle={detail.title}
          onSuccess={(application) => {
            toast.success('Application submitted');
            setMyApp(application);
            setRefreshKey((k) => k + 1);
          }}
          onApiError={(parsed) => {
            if (!parsed) return 'unhandled';
            const code = parsed.code;
            const status = parsed.status;
            if (code === 'ALREADY_APPLIED' || status === 409) {
              toast.info("You've already applied to this job");
              setRefreshKey((k) => k + 1);
              return 'handled';
            }
            if (code === 'JOB_CLOSED') {
              toast.warning('This job is no longer accepting applications');
              setRefreshKey((k) => k + 1);
              return 'handled';
            }
            if (code === 'EMAIL_NOT_VERIFIED' || status === 403) {
              toast.error(parsed.message ?? 'Verify your email to apply');
              return 'handled';
            }
            // Heuristic fallback while BE-JOBS-2 / BE-JOBS-3 are in flight:
            // backend currently throws 400 with a string message for both.
            const message = parsed.message ?? '';
            if (/already applied/i.test(message)) {
              toast.info("You've already applied to this job");
              setRefreshKey((k) => k + 1);
              return 'handled';
            }
            if (/not open/i.test(message)) {
              toast.warning('This job is no longer accepting applications');
              setRefreshKey((k) => k + 1);
              return 'handled';
            }
            return 'unhandled';
          }}
        />
      ) : null}
    </article>
  );
}

function ScopeStrip({ detail }: { detail: JobDetail }) {
  const pay = formatPay(detail);
  const duration =
    detail.duration_days != null
      ? `${detail.duration_days} day${detail.duration_days === 1 ? '' : 's'}`
      : null;
  const startDate = detail.start_date
    ? new Date(detail.start_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const items: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
  }> = [
    { icon: Briefcase, label: payTypeLabel(detail.pay_type), value: pay },
  ];
  if (duration) {
    items.push({ icon: Clock, label: 'Duration', value: duration });
  }
  if (startDate) {
    items.push({ icon: CalendarDays, label: 'Start date', value: startDate });
  }
  if (detail.site_address) {
    items.push({ icon: MapPin, label: 'Site', value: detail.site_address });
  }
  return (
    <Card>
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-3">
            <it.icon className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {it.label}
              </div>
              <div className="truncate text-sm font-medium text-fg">
                {it.value}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function payTypeLabel(payType?: string): string {
  if (payType === 'DAY_RATE') return 'Day rate';
  if (payType === 'FIXED_PRICE') return 'Fixed price';
  return 'Pay';
}

type ActionCardProps = {
  loggedIn: boolean;
  isWorker: boolean;
  isEmployer: boolean;
  ownsPost: boolean;
  verificationState: string | null;
  isClosed: boolean;
  myApp: MyApplication | null;
  nextHref: string;
  jobId: string;
  jobTitle: string;
  initialSaved: boolean;
  onApply: () => void;
};

function ActionCard({
  loggedIn,
  isWorker,
  isEmployer,
  ownsPost,
  verificationState,
  isClosed,
  myApp,
  nextHref,
  jobId,
  jobTitle,
  initialSaved,
  onApply,
}: ActionCardProps) {
  // Employer-other: keep the existing behaviour of rendering nothing — but
  // still surface "About the client" elsewhere on the page. The wrapper
  // section below decides what to render given the role/state.
  const body = renderActionBody({
    loggedIn,
    isWorker,
    isEmployer,
    ownsPost,
    verificationState,
    isClosed,
    myApp,
    nextHref,
    jobId,
    onApply,
  });
  if (!body) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        {body}
        {loggedIn && isWorker ? (
          <SaveJobButton
            jobId={jobId}
            initialSaved={initialSaved}
            variant="pill"
          />
        ) : null}
        {loggedIn && isWorker ? (
          <ShareForCommissionButton
            kind="JOB"
            targetId={jobId}
            targetTitle={jobTitle}
            className="w-full"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function renderActionBody({
  loggedIn,
  isWorker,
  isEmployer,
  ownsPost,
  verificationState,
  isClosed,
  myApp,
  nextHref,
  jobId,
  onApply,
}: Omit<ActionCardProps, 'jobTitle'>): React.ReactNode {
  if (!loggedIn) {
    return (
      <Button asChild className="w-full">
        <Link to={`/login?next=${encodeURIComponent(nextHref)}`}>
          Sign in to apply
        </Link>
      </Button>
    );
  }

  if (isEmployer && ownsPost) {
    return (
      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link to={`/my-jobs/${jobId}/applicants`}>View applicants</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={`/my-jobs/${jobId}/edit`}>Edit</Link>
        </Button>
      </div>
    );
  }

  if (isEmployer && !ownsPost) {
    return null;
  }

  if (!isWorker) {
    return null;
  }

  if (myApp) {
    const upper = myApp.status.toUpperCase();
    if (upper === 'WITHDRAWN') {
      return (
        <Button disabled className="w-full">
          Application withdrawn
        </Button>
      );
    }
    return (
      <Button asChild className="w-full">
        <Link to="/my-applications">
          Application submitted · View status
        </Link>
      </Button>
    );
  }

  if (isClosed) {
    return (
      <Button disabled className="w-full">
        Closed
      </Button>
    );
  }

  if (verificationState === 'PENDING_EMAIL_VERIFICATION') {
    return (
      <Button
        disabled
        className="w-full"
        title="Verify your email to apply"
      >
        Apply
      </Button>
    );
  }

  return (
    <Button onClick={onApply} className="w-full">
      Apply
    </Button>
  );
}

function AboutClientCard({
  employer,
}: {
  employer: JobDetail['employer'] | null;
}) {
  if (!employer) return null;
  const cp = employer.client_profile ?? null;
  const displayName =
    cp?.display_name?.trim() || employer.company_name?.trim() || 'Client';
  const avatar = cp?.avatar_url ?? undefined;
  const verification = verificationFromLevel(cp?.verification_level);
  const showVerification = verification !== 'unverified';
  const ratingCount = employer.rating_count ?? 0;
  const ratingAvg =
    employer.rating_avg != null ? Number(employer.rating_avg) : 0;
  const showRating = ratingCount > 0 && Number.isFinite(ratingAvg);
  const location = [cp?.city, cp?.postcode_area].filter(Boolean).join(' · ');
  const memberSince = cp?.created_at
    ? new Date(cp.created_at).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="text-base font-semibold text-fg">About the client</h2>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0 text-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            {avatar ? <AvatarImage src={avatar} alt={displayName} /> : null}
            <AvatarFallback>
              {displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase())
                .join('') || 'C'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            {cp?.slug ? (
              <Link
                to={`/employers/${cp.slug}`}
                className="block truncate font-semibold text-fg hover:underline"
              >
                {displayName}
              </Link>
            ) : (
              <span className="block truncate font-semibold text-fg">
                {displayName}
              </span>
            )}
            {showVerification ? (
              <div className="mt-1">
                <VerificationBadge state={verification} />
              </div>
            ) : null}
          </div>
        </div>

        {showRating ? (
          <div className="flex items-center gap-2 text-fg-muted">
            <StarRating value={Math.round(ratingAvg)} size="sm" />
            <span className="font-medium text-fg">{ratingAvg.toFixed(1)}</span>
            <span>
              ({ratingCount} review{ratingCount === 1 ? '' : 's'})
            </span>
          </div>
        ) : null}

        {location ? (
          <div className="inline-flex items-center gap-1 text-fg-muted">
            <MapPin className="h-4 w-4" />
            {location}
          </div>
        ) : null}

        {memberSince ? (
          <div className="text-fg-muted">Member since {memberSince}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function JobLinkCard({ jobId }: { jobId: string }) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/jobs/${jobId}`
      : `/jobs/${jobId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="text-base font-semibold text-fg">Job link</h2>
      </CardHeader>
      <CardContent className="space-y-2 p-5 pt-0">
        <Input value={url} readOnly aria-label="Job link" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={copy}
        >
          <Copy />
          Copy link
        </Button>
      </CardContent>
    </Card>
  );
}
