import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate as formatDateLib } from '@/lib/format';
import { specLabel, tagLabel } from '@/lib/specialisations';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  Tag,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/EmptyState';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';
import { formatPay } from '@/components/jobs/PayLine';
import { formatRelative } from '@/lib/relative-time';

type Specialisation = { id?: number; name?: string };
type TagItem = { id?: number; name?: string };

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
      postcode_area?: string | null;
    } | null;
  } | null;
  specialisations?: Array<{ specialisation?: Specialisation }>;
  tags?: Array<{ tag?: TagItem }>;
};

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function payTypeLabel(payType: string | undefined, t: TFn): string {
  if (payType === 'DAY_RATE') return t('card.payDayRate');
  if (payType === 'FIXED_PRICE') return t('card.payFixed');
  return t('detail.payLabel');
}

function formatDate(iso: string): string {
  return formatDateLib(iso, 'long');
}

function initials(name?: string | null): string {
  if (!name) return 'E';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export default function PublicJobDetailPage() {
  const { t } = useTranslation('jobs');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

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
          message: parsed?.message ?? t('detail.loadError'),
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
        title={t('detail.notFoundTitle')}
        description={t('detail.notFoundDesc')}
        action={
          <Button asChild variant="outline">
            <Link to="/jobs">{t('detail.backToBoard')}</Link>
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
          {t('detail.back')}
        </Button>
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error?.message ?? t('detail.loadErrorGeneric')}
        </div>
      </div>
    );
  }

  const specs = (detail.specialisations ?? [])
    .map((s) => (s.specialisation?.name ? specLabel(s.specialisation.name, t) : null))
    .filter(Boolean) as string[];
  const tagNames = (detail.tags ?? [])
    .map((tg) => (tg.tag?.name ? tagLabel(tg.tag.name, t) : null))
    .filter(Boolean) as string[];
  const skills = [...specs, ...tagNames];

  const employerName =
    detail.employer?.company_name ??
    detail.employer?.client_profile?.display_name ??
    t('detail.employerFallback');
  const employerAvatar = detail.employer?.client_profile?.avatar_url ?? undefined;
  const employerVerification = verificationFromLevel(
    detail.employer?.client_profile?.verification_level,
  );
  const employerLocation = detail.employer?.client_profile?.postcode_area ?? null;

  const signupHref = `/register?next=${encodeURIComponent(`/jobs/${id}`)}`;
  const loginHref = `/login?next=${encodeURIComponent(`/jobs/${id}`)}`;

  return (
    <article className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/jobs">
          <ArrowLeft />
          {t('detail.backToJobs')}
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              {detail.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
              {detail.created_at ? (
                <span>{t('detail.posted', { time: formatRelative(detail.created_at, t) })}</span>
              ) : null}
              {detail.postcode_area ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {detail.postcode_area}
                </span>
              ) : null}
              {detail.is_urgent ? (
                <Badge variant="danger" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t('card.urgent')}
                </Badge>
              ) : null}
            </div>
          </header>

          {detail.description ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-fg">{t('detail.summary')}</h2>
              <p className="whitespace-pre-wrap text-sm text-fg">{detail.description}</p>
            </section>
          ) : null}

          <section className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Stat icon={Tag} value={formatPay(detail, t)} label={payTypeLabel(detail.pay_type, t)} />
            {detail.duration_days != null ? (
              <Stat
                icon={Clock}
                value={t('card.durationDays', { count: detail.duration_days })}
                label={t('detail.duration')}
              />
            ) : null}
            {detail.postcode_area ? (
              <Stat icon={MapPin} value={detail.postcode_area} label={t('detail.location')} />
            ) : null}
            {detail.start_date ? (
              <Stat
                icon={Calendar}
                value={formatDate(detail.start_date)}
                label={t('detail.startDate')}
              />
            ) : null}
            {detail.site_address ? (
              <Stat
                icon={MapPin}
                value={detail.site_address}
                label={t('detail.siteAddress')}
              />
            ) : null}
          </section>

          {skills.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-fg">{t('detail.skills')}</h2>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-fg">{t('detail.aboutEmployer')}</h2>
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12 shrink-0 rounded-md">
                {employerAvatar ? (
                  <AvatarImage src={employerAvatar} alt={employerName} />
                ) : null}
                <AvatarFallback className="rounded-md">
                  {initials(employerName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-fg">{employerName}</p>
                {employerLocation ? (
                  <p className="text-sm text-fg-muted">{employerLocation}</p>
                ) : null}
                <VerificationBadge state={employerVerification} />
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="text-lg font-semibold text-fg">
                {t('detail.ctaTitle')}
              </h3>
              <Button asChild size="lg" className="w-full">
                <Link to={signupHref}>{t('detail.signUp')}</Link>
              </Button>
              <p className="text-center text-sm text-fg-muted">
                {t('detail.alreadyHaveAccount')}{' '}
                <Link
                  to={loginHref}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t('detail.logIn')}
                </Link>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-fg" aria-hidden />
      <div className="min-w-0">
        <div className="truncate text-base font-medium text-fg">{value}</div>
        <div className="text-xs text-fg-muted">{label}</div>
      </div>
    </div>
  );
}
