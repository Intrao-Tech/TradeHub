import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api, parseApiError } from '../api';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type ClientProfile = {
  id: string | number;
  slug?: string;
  display_name?: string;
  bio?: string | null;
  city?: string | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  verification_level?: string | number | null;
};

export default function ClientPublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    api<ClientProfile>(`/client-profiles/${slug}`)
      .then(setProfile)
      .catch((err) => {
        const parsed = parseApiError(err);
        setError(parsed?.message ?? 'Could not load this profile.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <EmptyState
        icon={Users}
        title="Profile not found"
        description={error || 'This profile may have been removed.'}
        action={
          <Button asChild variant="outline">
            <Link to="/clients">Back to directory</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProfileHeader
        displayName={profile.display_name ?? 'Member'}
        avatarUrl={profile.avatar_url}
        role="CLIENT"
        city={profile.city}
        postcodeArea={profile.postcode_area}
        verificationLevel={profile.verification_level}
        clientProfileId={profile.id}
      />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.bio ? (
            <p className="whitespace-pre-line text-sm text-fg">{profile.bio}</p>
          ) : (
            <p className="text-sm text-fg-muted">
              This member hasn’t added a bio yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
