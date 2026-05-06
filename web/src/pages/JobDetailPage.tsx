import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Briefcase, MapPin } from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { AuthBanner } from '@/components/AuthBanner';
import { EmployerChip } from '@/components/jobs/EmployerChip';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { ApplicationStatusBadge } from '@/components/jobs/ApplicationStatusBadge';
import { ApplyJobSheet } from '@/components/jobs/ApplyJobSheet';
import { AttachmentList } from '@/components/jobs/AttachmentList';
import { formatPay } from '@/components/jobs/PayLine';
import { formatRelative } from '@/lib/relative-time';
import { toast } from '@/components/ui/toast';

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
  expires_at?: string | null;
  created_at?: string;
  employer?: {
    id?: string | number;
    company_name?: string | null;
    client_profile?: {
      display_name?: string | null;
      verification_level?: string | null;
      avatar_url?: string | null;
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

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loggedIn = !!getToken();
  const { isWorker, isEmployer, clientProfile, verificationState } = useAccountMe();

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

  return (
    <article className="space-y-6">
      <div>
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

      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Pay
          </p>
          <p className="text-lg font-semibold text-fg">{formatPay(detail)}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          {detail.duration_days != null ? (
            <DetailField label="Duration">
              {detail.duration_days} day{detail.duration_days === 1 ? '' : 's'}
            </DetailField>
          ) : null}
          {detail.start_date ? (
            <DetailField label="Start date">
              {new Date(detail.start_date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </DetailField>
          ) : null}
          {detail.site_address ? (
            <DetailField label="Site address" className="sm:col-span-2">
              {detail.site_address}
            </DetailField>
          ) : null}
        </CardContent>
      </Card>

      {detail.description ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-fg">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-fg">{detail.description}</p>
        </section>
      ) : null}

      {specs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-fg">Required specialisations</h2>
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
      />

      <CtaBar
        loggedIn={loggedIn}
        isWorker={isWorker}
        isEmployer={isEmployer}
        ownsPost={ownsPost}
        verificationState={verificationState}
        isClosed={isClosed}
        myApp={myApp}
        nextHref={nextHref}
        jobId={String(id)}
        onApply={() => setApplyOpen(true)}
      />

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

type CtaBarProps = {
  loggedIn: boolean;
  isWorker: boolean;
  isEmployer: boolean;
  ownsPost: boolean;
  verificationState: string | null;
  isClosed: boolean;
  myApp: MyApplication | null;
  nextHref: string;
  jobId: string;
  onApply: () => void;
};

function CtaBar({
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
}: CtaBarProps) {
  if (!loggedIn) {
    return (
      <StickyBar>
        <Button asChild className="w-full sm:w-auto">
          <Link to={`/login?next=${encodeURIComponent(nextHref)}`}>
            Sign in to apply
          </Link>
        </Button>
      </StickyBar>
    );
  }

  if (isEmployer && ownsPost) {
    return (
      <StickyBar>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button asChild variant="outline">
            <Link to={`/my-jobs/${jobId}/edit`}>Edit</Link>
          </Button>
          <Button asChild>
            <Link to={`/my-jobs/${jobId}/applicants`}>View applicants</Link>
          </Button>
        </div>
      </StickyBar>
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
        <StickyBar>
          <Button disabled className="w-full sm:w-auto">
            Application withdrawn
          </Button>
        </StickyBar>
      );
    }
    return (
      <StickyBar>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/my-applications">Application submitted · View status</Link>
        </Button>
      </StickyBar>
    );
  }

  if (isClosed) {
    return (
      <StickyBar>
        <Button disabled className="w-full sm:w-auto">
          Closed
        </Button>
      </StickyBar>
    );
  }

  if (verificationState === 'PENDING_EMAIL_VERIFICATION') {
    return (
      <StickyBar>
        <Button disabled className="w-full sm:w-auto" title="Verify your email to apply">
          Apply
        </Button>
      </StickyBar>
    );
  }

  return (
    <StickyBar>
      <Button onClick={onApply} className="w-full sm:w-auto">
        Apply
      </Button>
    </StickyBar>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border-default bg-page/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:bg-raised">
      {children}
    </div>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-1 text-sm text-fg">{children}</p>
    </div>
  );
}
