import { useEffect, useMemo, useState } from 'react';
import type { TranslateFn } from '@/i18n/types';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, Hammer, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, getToken, parseApiError } from '../api';
import { formatMoney, formatDate } from '@/lib/format';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { VerificationsCard } from '../components/profile/VerificationsCard';
import { EmptyState } from '../components/EmptyState';
import { ReviewsTab } from '@/components/reviews/ReviewsTab';
import { languageName } from '../lib/iso-639-1';
import { specLabel } from '../lib/specialisations';
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
import { InviteToJobButton } from '@/components/workers/InviteToJobButton';
import { SaveWorkerButton } from '@/components/workers/SaveWorkerButton';

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
  is_saved?: boolean;
  rating_avg?: string | number | null;
  rating_count?: number | null;
  languages?: string[];
  client_profile?: ClientProfile | null;
  worker_specialisations?: Specialisation[];
  portfolio_items?: PortfolioItem[];
};

type TFn = TranslateFn;

function formatRate(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
  t: TFn,
): string | null {
  if (min == null && max == null) return null;
  const value =
    min != null && max != null
      ? `${formatMoney(Number(min), { decimals: 0 })} – ${formatMoney(Number(max), { decimals: 0 })}`
      : formatMoney(Number(min ?? max), { decimals: 0 });
  return t('detail.ratePerDay', { value });
}

function formatMemberSince(iso: string | null | undefined): string | null {
  return formatDate(iso, 'monthYear') || null;
}

export default function WorkerDetailPage() {
  const { t } = useTranslation('workers');
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
        setError(parsed?.message ?? t('detail.loadError'));
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
  const projects = useMemo(
    () => portfolio.filter((p) => p.item_type === 'PROJECT'),
    [portfolio],
  );
  const otherExperiences = useMemo(
    () =>
      portfolio.filter(
        (p) =>
          p.item_type !== 'CERTIFICATION' &&
          p.item_type !== 'PROJECT',
      ),
    [portfolio],
  );
  const specs = useMemo(
    () =>
      (worker?.worker_specialisations ?? [])
        .map((s) => (s.specialisation?.name ? specLabel(s.specialisation.name, t) : null))
        .filter(Boolean) as string[],
    [worker?.worker_specialisations, t],
  );

  if (loading) {
    return <DetailSkeleton />;
  }
  if (error || !worker) {
    return (
      <EmptyState
        icon={Hammer}
        title={t('detail.notFoundTitle')}
        description={error || t('detail.notFoundDesc')}
        action={
          <Button asChild variant="outline">
            <Link to="/workers">{t('detail.backToSearch')}</Link>
          </Button>
        }
      />
    );
  }

  const cp = worker.client_profile;
  const displayName = cp?.display_name ?? t('detail.nameFallback');
  const rate = formatRate(worker.day_rate_min, worker.day_rate_max, t);
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

      <div className="flex flex-col gap-3 rounded-md border border-border-default bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {rate ? (
            <p className="text-lg font-semibold text-fg sm:text-xl">{rate}</p>
          ) : (
            <p className="text-sm text-fg-muted">{t('detail.rateNotSet')}</p>
          )}
          {worker.years_experience != null ? (
            <p className="text-xs text-fg-muted">
              {t('detail.yearsExperience', { count: worker.years_experience })}
            </p>
          ) : null}
        </div>
        {loggedIn && isEmployer && id ? (
          <div className="flex flex-wrap items-center gap-2">
            <SaveWorkerButton
              workerId={id}
              initialSaved={!!worker.is_saved}
              variant="pill"
              className="w-auto"
            />
            <ShareForCommissionButton
              kind="WORKER"
              targetId={id}
              targetTitle={displayName}
            />
            <InviteToJobButton workerId={id} workerName={displayName} />
          </div>
        ) : null}
      </div>

      {!loggedIn ? (
        <div className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          <Link to="/login" className="font-medium underline">
            {t('detail.signIn')}
          </Link>
          {t('detail.toContact')}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left rail */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6">
              <Stat
                label={t('detail.experience')}
                value={
                  worker.years_experience != null
                    ? t('detail.experienceYears', { count: worker.years_experience })
                    : '—'
                }
              />
              {worker.available_from ? (
                <Stat
                  label={t('detail.availableFrom')}
                  value={formatDate(worker.available_from, 'short')}
                />
              ) : null}
              {memberSince ? (
                <Stat label={t('detail.memberSince')} value={memberSince} />
              ) : null}
            </CardContent>
          </Card>

          {worker.languages && worker.languages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('detail.languages')}</CardTitle>
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
              <CardTitle>{t('detail.about')}</CardTitle>
            </CardHeader>
            <CardContent>
              {cp?.bio ? (
                <p className="whitespace-pre-line text-sm text-fg">{cp.bio}</p>
              ) : (
                <p className="text-sm text-fg-muted">{t('detail.noBio')}</p>
              )}
            </CardContent>
          </Card>

          {specs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('detail.skills')}</CardTitle>
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
              <CardTitle>{t('detail.portfolio')}</CardTitle>
              <CardDescription>{t('detail.portfolioDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {projects.map((item) => (
                    <PortfolioItemCard key={String(item.id)} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title={t('detail.noPortfolioTitle')}
                  description={t('detail.noPortfolioDesc')}
                />
              )}
            </CardContent>
          </Card>

          {otherExperiences.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('detail.otherExperiences')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {otherExperiences.map((item) => (
                    <PortfolioItemCard key={String(item.id)} item={item} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.certifications')}</CardTitle>
            </CardHeader>
            <CardContent>
              {certifications.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {certifications.map((item) => (
                    <PortfolioItemCard key={String(item.id)} item={item} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-muted">{t('detail.noCertifications')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.reviews')}</CardTitle>
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
  const { t } = useTranslation('workers');
  return (
    <Card className="bg-subtle">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{item.title ?? t('detail.untitled')}</CardTitle>
          {item.verified ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {t('detail.verified')}
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
          <p className="text-sm text-fg-muted">{t('detail.noDescription')}</p>
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

