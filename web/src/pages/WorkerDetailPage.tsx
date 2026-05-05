import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  Briefcase,
  Hammer,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { EmptyState } from '../components/EmptyState';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
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
      />

      {!loggedIn ? (
        <div className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          <Link to="/login" className="font-medium underline">
            Sign in
          </Link>{' '}
          to contact this tradesperson.
        </div>
      ) : null}

      <Tabs defaultValue="about" className="space-y-4">
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cp?.bio ? (
                <p className="whitespace-pre-line text-sm text-fg">{cp.bio}</p>
              ) : (
                <p className="text-sm text-fg-muted">
                  This tradesperson hasn’t added a bio yet.
                </p>
              )}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {rate ? (
                  <DetailRow icon={Briefcase} label="Day rate" value={rate} />
                ) : null}
                {worker.years_experience != null ? (
                  <DetailRow
                    icon={Star}
                    label="Experience"
                    value={`${worker.years_experience} year${worker.years_experience === 1 ? '' : 's'}`}
                  />
                ) : null}
                {worker.available_from ? (
                  <DetailRow
                    icon={ShieldCheck}
                    label="Available from"
                    value={new Date(worker.available_from).toLocaleDateString()}
                  />
                ) : null}
              </div>
              {specs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-fg-muted">
                    Specialisations
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {specs.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {worker.languages && worker.languages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-fg-muted">
                    Languages
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {worker.languages.map((code) => (
                      <Badge key={code} variant="outline">
                        {languageName(code)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="certifications" className="space-y-4">
          {certifications.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {certifications.map((item) => (
                <PortfolioItemCard key={String(item.id)} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Award}
              title="No certifications listed"
              description="Trade certifications appear here once added."
            />
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <EmptyState
            icon={Star}
            title="Reviews coming soon"
            description="Two-way verified reviews will appear here once collaborations complete."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-fg">
      <Icon className="h-4 w-4 text-fg-muted" />
      <span className="text-fg-muted">{label}:</span>
      <span className="font-medium">{value}</span>
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
