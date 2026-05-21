import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { VerificationsCard } from '../components/profile/VerificationsCard';
import { EmptyState } from '../components/EmptyState';
import { ReviewsTab } from '@/components/reviews/ReviewsTab';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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

type EmployerDetail = {
  id: string | number;
  company_name?: string | null;
  company_number?: string | null;
  team_size?: number | null;
  rating_avg?: string | number | null;
  rating_count?: number | null;
  client_profile?: ClientProfile | null;
};

function formatMemberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export default function EmployerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [employer, setEmployer] = useState<EmployerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api<EmployerDetail>(`/employer-profiles/${id}`)
      .then((data) => setEmployer(data))
      .catch((err) => {
        const parsed = parseApiError(err);
        setError(parsed?.message ?? 'Could not load this employer.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !employer) {
    return (
      <EmptyState
        icon={Building2}
        title="Employer not found"
        description={error || 'This profile may have been removed.'}
        action={
          <Button asChild variant="outline">
            <Link to="/employers">Back to employer search</Link>
          </Button>
        }
      />
    );
  }

  const cp = employer.client_profile;
  const displayName = employer.company_name ?? cp?.display_name ?? 'Employer';
  const memberSince = formatMemberSince(cp?.created_at);
  const loggedIn = Boolean(getToken());

  return (
    <div className="space-y-6">
      <ProfileHeader
        displayName={displayName}
        avatarUrl={cp?.avatar_url}
        role="EMPLOYER"
        city={cp?.city}
        postcodeArea={cp?.postcode_area}
        verificationLevel={cp?.verification_level}
        clientProfileId={cp?.id}
        rating={employer.rating_avg}
        ratingCount={employer.rating_count}
        hideMilestonesStrip
      />

      {!loggedIn ? (
        <div className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          <Link to="/login" className="font-medium underline">
            Sign in
          </Link>{' '}
          to contact this employer or apply to their jobs.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left rail */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6">
              <Stat
                label="Team size"
                value={
                  employer.team_size != null ? String(employer.team_size) : '—'
                }
              />
              {memberSince ? (
                <Stat label="Member since" value={memberSince} />
              ) : null}
            </CardContent>
          </Card>

          <VerificationsCard clientProfileId={cp?.id} role="EMPLOYER" />
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
                  This employer hasn’t added a bio yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {employer.company_name ? (
                  <Field label="Company" value={employer.company_name} />
                ) : null}
                {employer.company_number ? (
                  <Field
                    label="Companies House"
                    value={employer.company_number}
                  />
                ) : null}
                {employer.team_size != null ? (
                  <Field label="Team size" value={String(employer.team_size)} />
                ) : null}
                {!employer.company_name &&
                !employer.company_number &&
                employer.team_size == null ? (
                  <p className="text-sm text-fg-muted sm:col-span-2">
                    This employer hasn’t added company details yet.
                  </p>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewsTab
                subjectId={employer.id}
                subjectKind="employer"
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}
