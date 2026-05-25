import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  JobPostForm,
  type JobPostFormValues,
} from '@/components/jobs/JobPostForm';
import { valueFromReadAttachments } from '@/components/jobs/attachmentValue';
import { toast } from '@/components/ui/toast';

type JobPostDetail = {
  id: string | number;
  title: string;
  description?: string | null;
  postcode_area?: string | null;
  site_address?: string | null;
  pay_type?: 'DAY_RATE' | 'FIXED_PRICE';
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
  duration_days?: number | null;
  start_date?: string | null;
  expires_at?: string | null;
  is_urgent?: boolean;
  status?: string;
  employer_id?: string | number;
  specialisations?: Array<{ specialisation_id?: number }>;
  tags?: Array<{ tag_id?: number }>;
  attachments?: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
  _count?: { applications?: number };
};

const FROZEN_FIELDS = new Set<keyof JobPostFormValues>([
  'pay_type',
  'day_rate_min',
  'day_rate_max',
  'fixed_price',
  'postcode_area',
  'specialisation_ids',
]);

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isEmployer, clientProfile, loading: accountLoading } = useAccountMe();

  const [post, setPost] = useState<JobPostDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<JobPostDetail>(`/job-posts/${id}`)
      .then((data) => {
        if (cancelled) return;
        setPost(data);
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
  }, [id]);

  const initial: Partial<JobPostFormValues> | null = useMemo(() => {
    if (!post) return null;
    return {
      title: post.title ?? '',
      description: post.description ?? '',
      pay_type: post.pay_type ?? 'DAY_RATE',
      day_rate_min:
        post.day_rate_min != null ? String(post.day_rate_min) : '',
      day_rate_max:
        post.day_rate_max != null ? String(post.day_rate_max) : '',
      fixed_price: post.fixed_price != null ? String(post.fixed_price) : '',
      postcode_area: post.postcode_area ?? '',
      site_address: post.site_address ?? '',
      duration_days:
        post.duration_days != null ? String(post.duration_days) : '',
      start_date: post.start_date ? toDateInput(post.start_date) : '',
      expires_at: post.expires_at ? toDateInput(post.expires_at) : '',
      is_urgent: Boolean(post.is_urgent),
      specialisation_ids:
        post.specialisations
          ?.map((s) => s.specialisation_id)
          .filter((x): x is number => typeof x === 'number') ?? [],
      tag_ids:
        post.tags
          ?.map((t) => t.tag_id)
          .filter((x): x is number => typeof x === 'number') ?? [],
      attachments: valueFromReadAttachments(post.attachments ?? []),
    };
  }, [post]);

  if (!accountLoading && !isEmployer) {
    return <Navigate to="/profile" replace />;
  }

  if (post && clientProfile?.employer_profile?.id != null) {
    if (
      String(post.employer_id ?? '') !==
      String(clientProfile.employer_profile.id)
    ) {
      return <Navigate to={`/jobs/${post.id}`} replace />;
    }
  }

  const applicationsCount = post?._count?.applications ?? 0;
  const frozenFields = applicationsCount > 0 ? FROZEN_FIELDS : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/my-jobs">
            <ArrowLeft />
            Back to my jobs
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error.message}
        </div>
      ) : post && initial ? (
        <>
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
              Edit job
            </h1>
            <p className="break-words text-sm text-fg-muted">{post.title}</p>
          </header>

          {applicationsCount > 0 ? (
            <div
              role="status"
              className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
            >
              This job has {applicationsCount} application
              {applicationsCount === 1 ? '' : 's'}. Pay, location, and
              specialisations are locked so applicants aren't surprised.
            </div>
          ) : null}

          <JobPostForm
            key={String(post.id)}
            mode="edit"
            jobPostId={post.id}
            initial={initial}
            frozenFields={frozenFields}
            onSuccess={() => {
              toast.success('Job updated');
              navigate(`/jobs/${post.id}`);
            }}
            onCancel={() => navigate('/my-jobs')}
            submitLabel="Save changes"
          />
        </>
      ) : null}
    </div>
  );
}

function toDateInput(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}
