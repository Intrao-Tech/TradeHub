import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, Building2, Users } from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { ProfileHeader } from '../components/profile/ProfileHeader';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ClientProfile = {
  id: string | number;
  display_name?: string;
  bio?: string | null;
  city?: string | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  verification_level?: string | number | null;
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
  const displayName =
    employer.company_name ?? cp?.display_name ?? 'Employer';
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
      />

      {!loggedIn ? (
        <div className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          <Link to="/login" className="font-medium underline">
            Sign in
          </Link>{' '}
          to contact this employer or apply to their jobs.
        </div>
      ) : null}

      <Tabs defaultValue="about" className="space-y-4">
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
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
                  This employer hasn’t added a bio yet.
                </p>
              )}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {employer.company_name ? (
                  <DetailRow
                    icon={Building2}
                    label="Company"
                    value={employer.company_name}
                  />
                ) : null}
                {employer.company_number ? (
                  <DetailRow
                    icon={Briefcase}
                    label="Companies House"
                    value={employer.company_number}
                  />
                ) : null}
                {employer.team_size != null ? (
                  <DetailRow
                    icon={Users}
                    label="Team size"
                    value={`${employer.team_size}`}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <ReviewsTab
            subjectId={employer.id}
            subjectKind="employer"
            subjectName={displayName}
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
