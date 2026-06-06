import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
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
        setError(parsed?.message ?? t('directory.profileLoadError'));
      })
      .finally(() => setLoading(false));
  }, [slug, t]);

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
        title={t('directory.profileNotFound')}
        description={error || t('directory.profileRemoved')}
        action={
          <Button asChild variant="outline">
            <Link to="/clients">{t('directory.backToDirectory')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProfileHeader
        displayName={profile.display_name ?? t('directory.member')}
        avatarUrl={profile.avatar_url}
        role="CLIENT"
        city={profile.city}
        postcodeArea={profile.postcode_area}
        verificationLevel={profile.verification_level}
        clientProfileId={profile.id}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('directory.about')}</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.bio ? (
            <p className="whitespace-pre-line text-sm text-fg">{profile.bio}</p>
          ) : (
            <p className="text-sm text-fg-muted">{t('directory.noBio')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
