import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, Hammer, ShieldCheck } from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { VerificationsCard } from '../components/profile/VerificationsCard';
import { EmptyState } from '../components/EmptyState';
import { ReviewsTab } from '@/components/reviews/ReviewsTab';
import { languageName } from '../lib/iso-639-1';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShareForCommissionButton } from '@/components/referral/ShareForCommissionButton';
import { useRefAttribution } from '@/components/referral/useRefAttribution';
import { useAccountMe } from '@/hooks/useAccountMe';

type Specialisation = {
  specialisation_id?: string | number;
  is_primary?: boolean;
  specialisation?: { id?: string | number; name?: string; slug?: string };
};

type PortfolioItem = {
  id: string | number;
  item_type?: string;
  title?: string;
  description?: string | null;
  sort_order?: number | null;
  verified?: boolean;
};

type ClientProfile = {
  id: string | number;
  display_name?: string;
  bio?: string | null;
  city?: string | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  verification_level?: string | number | null;
  created_at?: string | null;
};

type WorkerDetail = {
  id: string | number;
  years_experience?: number | null;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  available_from?: string | null;
  is_available?: boolean;
  rating_avg?: string | number | null;
  rating_count?: number | null;
  languages?: string[];
  client_profile?: ClientProfile | null;
  worker_specialisations?: Specialisation[];
  portfolio_items?: PortfolioItem[];
};

function formatRate(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return `£${Number(min).toFixed(0)} – £${Number(max).toFixed(0)} / day`;
  }
  return `£${Number(min ?? max).toFixed(0)} / day`;
}

function formatMemberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isEmployer } = useAccountMe();
  useRefAttribution({ targetId: id ?? null, targetRole: 'EMPLOYER' });
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api<WorkerDetail>(`/worker-profiles/${id}`)
      .then((data) => setWorker(data))
      .catch((err) => {
        const parsed = parseApiError(err);
        setError(parsed?.message ?? 'Could not load this worker.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const portfolio = useMemo(
    () => worker?.portfolio_items ?? [],
    [worker?.portfolio_items],
  );
  const certifications = useMemo(
    () => portfolio.filter((p) => p.item_type === 'CERTIFICATION'),
    [portfolio],
  );
  const work = useMemo(
    () => portfolio.filter((p) => p.item_type !== 'CERTIFICATION'),
    [portfolio],
  );
  const specs = useMemo(
    () =>
      (worker?.worker_specialisations ?? [])
        .map((s) => s.specialisation?.name)
        .filter(Boolean) as string[],
    [worker?.worker_specialisations],
  );

  if (loading) {
    return <DetailSkeleton />;
  }
  if (error || !worker) {
    return (
      <EmptyState
        icon={Hammer}
        title="Worker not found"
        description={error || 'This profile may have been removed.'}
        action={
          <Button asChild variant="outline">
            <Link to="/workers">Back to worker search</Link>
          </Button>
        }
      />
    );
  }

  const cp = worker.client_profile;
  const displayName = cp?.display_name ?? 'Tradesperson';
  const rate = formatRate(worker.day_rate_min, worker.day_rate_max);
  const memberSince = formatMemberSince(cp?.created_at);
  const loggedIn = Boolean(getToken());

  return (
    <div className="space-y-6">
      <ProfileHeader
        displayName={displayName}
        avatarUrl={cp?.avatar_url}
        role="WORKER"
        city={cp?.city}
        postcodeArea={cp?.postcode_area}
        verificationLevel={cp?.verification_level}
        clientProfileId={cp?.id}
        rating={worker.rating_avg}
        ratingCount={worker.rating_count}
        isAvailable={worker.is_available}
        hideMilestonesStrip
      />

      {loggedIn && isEmployer && id ? (
        <div className="flex justify-end">
          <ShareForCommissionButton
            kind="WORKER"
            targetId={id}
            targetTitle={displayName}
          />
        </div>
      ) : null}

      {!loggedIn ? (
        <div className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          <Link to="/login" className="font-medium underline">
            Sign in
          </Link>{' '}
          to contact this tradesperson.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left rail */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6">
              <Stat label="Day rate" value={rate ?? '—'} />
              <Stat
                label="Experience"
                value={
                  worker.years_experience != null
                    ? `${worker.years_experience} yr${worker.years_experience === 1 ? '' : 's'}`
                    : '—'
                }
              />
              {worker.available_from ? (
                <Stat
                  label="Available from"
                  value={new Date(worker.available_from).toLocaleDateString()}
                />
              ) : null}
              {memberSince ? (
                <Stat label="Member since" value={memberSince} />
              ) : null}
            </CardContent>
          </Card>

          {worker.languages && worker.languages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {worker.languages.map((code) => (
                    <Badge key={code} variant="outline">
                      {languageName(code)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <VerificationsCard clientProfileId={cp?.id} role="WORKER" />
        </aside>

        {/* Main column */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              {cp?.bio ? (
                <p className="whitespace-pre-line text-sm text-fg">{cp.bio}</p>
              ) : (
                <p className="text-sm text-fg-muted">
                  This tradesperson hasn’t added a bio yet.
                </p>
              )}
            </CardContent>
          </Card>

          {specs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {specs.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Portfolio</CardTitle>
              <CardDescription>Past projects and work samples.</CardDescription>
            </CardHeader>
            <CardContent>
              {work.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {work.map((item) => (
                    <PortfolioItemCard key={String(item.id)} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title="No portfolio yet"
                  description="This tradesperson hasn’t added any project history."
                />
              )}
            </CardContent>
          </Card>

          {certifications.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {certifications.map((item) => (
                    <PortfolioItemCard key={String(item.id)} item={item} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewsTab
                subjectId={worker.id}
                subjectKind="worker"
                subjectName={displayName}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="text-sm font-semibold text-fg">{value}</p>
    </div>
  );
}

function PortfolioItemCard({ item }: { item: PortfolioItem }) {
  return (
    <Card className="bg-subtle">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{item.title ?? 'Untitled'}</CardTitle>
          {item.verified ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
          ) : null}
        </div>
        {item.item_type ? (
          <CardDescription className="capitalize">
            {item.item_type.toLowerCase()}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {item.description ? (
          <p className="line-clamp-4 text-sm text-fg-muted">
            {item.description}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">No description provided.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

