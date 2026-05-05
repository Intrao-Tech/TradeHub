import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { AuthBanner } from '../components/AuthBanner';
import { AvatarUploader } from '../components/profile/AvatarUploader';
import { PortfolioTab } from '../components/profile/PortfolioTab';
import { DocumentsTab } from '../components/profile/DocumentsTab';
import {
  VerificationBadge,
  verificationFromLevel,
} from '../components/VerificationBadge';
import { MilestonesStrip } from '../components/MilestonesStrip';
import {
  CompletenessPanel,
  type CompletenessAction,
} from '../components/profile/CompletenessPanel';
import { SpecialisationPicker } from '../components/profile/SpecialisationPicker';
import { LanguagesEditor } from '../components/profile/LanguagesEditor';
import {
  LONDON_BOROUGH_NAMES,
  POSTCODE_OUTWARD_REGEX,
  postcodeAreasFor,
} from '../lib/london-boroughs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function initialsFor(name: string): string {
  if (!name) return 'TH';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || 'TH';
}

export default function ProfilePage() {
  const {
    account,
    clientProfile,
    isWorker,
    isEmployer,
    verificationState,
    loading,
    error: loadError,
    refetch,
  } = useAccountMe();

  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [postcodeAreaClient, setPostcodeAreaClient] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [yearsExperience, setYearsExperience] = useState('');
  const [dayRateMin, setDayRateMin] = useState('');
  const [dayRateMax, setDayRateMax] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [workerAvailable, setWorkerAvailable] = useState(true);
  const [languages, setLanguages] = useState<string[]>([]);

  const [companyName, setCompanyName] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');
  const [teamSize, setTeamSize] = useState('');


  const cp = clientProfile;
  const workerId = cp?.id != null ? String(cp.id) : '';
  const postcodeOptions = useMemo(() => postcodeAreasFor(city), [city]);

  const [activeTab, setActiveTab] = useState<'profile' | 'portfolio' | 'documents'>('profile');
  const [hasPortfolioItem, setHasPortfolioItem] = useState(false);
  const [hasUploadedDocument, setHasUploadedDocument] = useState(false);

  // Lightweight summary fetch for the completeness panel only — sub-components
  // own their own (richer) loads. We refetch when the account cache replaces
  // (post-save) so flipping a section to "Done" lands without a full reload.
  useEffect(() => {
    if (!cp) return;
    const cancel = { current: false };
    if (workerId) {
      api<unknown[]>(`/portfolio/worker/${workerId}`)
        .then((items) => {
          if (!cancel.current) setHasPortfolioItem(items.length > 0);
        })
        .catch(() => {
          /* non-fatal — completeness card just stays "not done" */
        });
    }
    api<unknown[]>('/documents/me')
      .then((docs) => {
        if (!cancel.current) setHasUploadedDocument(docs.length > 0);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancel.current = true;
    };
  }, [cp, workerId]);

  function handleCompletenessAction(action: CompletenessAction) {
    if (action.switchTab) {
      setActiveTab(action.switchTab);
      return;
    }
    if (action.scrollTo) {
      requestAnimationFrame(() => {
        document
          .getElementById(action.scrollTo!)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  // Hydrate editor inputs from the cache. Re-runs when the cache snapshot
  // replaces (initial load, post-save refetch, auth-change invalidation).
  useEffect(() => {
    if (!cp) return;
    setDisplayName(cp.display_name ?? '');
    setBio(cp.bio ?? '');
    setCity(cp.city ?? '');
    setPostcodeAreaClient(cp.postcode_area ?? '');
    setAvatarUrl(cp.avatar_url ?? '');
    const wp = cp.worker_profile;
    if (wp) {
      setYearsExperience(wp.years_experience != null ? String(wp.years_experience) : '');
      setDayRateMin(wp.day_rate_min != null ? String(wp.day_rate_min) : '');
      setDayRateMax(wp.day_rate_max != null ? String(wp.day_rate_max) : '');
      setAvailableFrom(
        wp.available_from != null
          ? String(wp.available_from).slice(0, 10)
          : '',
      );
      setWorkerAvailable(Boolean(wp.is_available));
      setLanguages(Array.isArray(wp.languages) ? wp.languages : []);
    }
    const ep = cp.employer_profile;
    if (ep) {
      setCompanyName(ep.company_name ?? '');
      setCompanyNumber(ep.company_number ?? '');
      setTeamSize(ep.team_size != null ? String(ep.team_size) : '');
    }
  }, [cp]);

  function flash(msg: string, err?: string) {
    setActionOk(msg);
    setActionError(err ?? '');
    if (msg) setTimeout(() => setActionOk(''), 4000);
  }

  function reportError(err: unknown) {
    const parsed = parseApiError(err);
    setActionError(parsed?.message ?? (err instanceof Error ? err.message : String(err)));
  }

  async function submitClient(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const patch: Record<string, string> = { display_name: displayName };
      if (bio !== '') patch.bio = bio;
      if (city !== '') patch.city = city;
      if (postcodeAreaClient !== '') patch.postcode_area = postcodeAreaClient;
      if (avatarUrl !== '') patch.avatar_url = avatarUrl;
      await api('/client-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      flash('Client profile updated');
      await refetch();
    } catch (err) {
      reportError(err);
    }
  }

  async function submitWorker(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    const min = dayRateMin.trim() !== '' ? Number(dayRateMin) : null;
    const max = dayRateMax.trim() !== '' ? Number(dayRateMax) : null;
    if (min != null && max != null && max < min) {
      setActionError('Day rate max must be greater than or equal to min.');
      return;
    }
    try {
      const bodyObj: Record<string, unknown> = {
        is_available: workerAvailable,
      };
      if (yearsExperience.trim() !== '') {
        bodyObj.years_experience = Number(yearsExperience);
      }
      if (min != null) bodyObj.day_rate_min = min;
      if (max != null) bodyObj.day_rate_max = max;
      if (availableFrom.trim() !== '') {
        bodyObj.available_from = new Date(availableFrom).toISOString();
      }
      bodyObj.languages = languages;
      await api('/worker-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(bodyObj),
      });
      flash('Worker profile updated');
      await refetch();
    } catch (err) {
      reportError(err);
    }
  }

  async function submitEmployer(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const bodyObj: Record<string, unknown> = {};
      if (companyName.trim() !== '') bodyObj.company_name = companyName;
      if (companyNumber.trim() !== '') bodyObj.company_number = companyNumber;
      if (teamSize.trim() !== '') bodyObj.team_size = Number(teamSize);
      await api('/employer-profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(bodyObj),
      });
      flash('Employer profile updated');
      await refetch();
    } catch (err) {
      reportError(err);
    }
  }

  if (loadError && !account) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (loading && !account) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <p className="text-sm text-fg-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
          <p className="text-sm text-fg-muted">
            Manage your account, portfolio, and verification documents.
          </p>
        </div>
        {cp && (isWorker || isEmployer) ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to={
                isWorker
                  ? `/workers/${String(cp.id)}`
                  : `/employers/${String(cp.id)}`
              }
            >
              View public profile
            </Link>
          </Button>
        ) : null}
      </div>

      {cp ? <MyTrustSummary clientProfileId={cp.id} /> : null}

      {verificationState === 'PENDING_EMAIL_VERIFICATION' && account ? (
        <EmailNotVerifiedBanner email={account.email} />
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}
      {actionOk ? (
        <div
          role="status"
          className="rounded-md border border-success/40 bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {actionOk}
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'profile' | 'portfolio' | 'documents')}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {isWorker ? (
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          ) : null}
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {account ? (
            <AccountSection
              email={account.email}
              emailVerifiedAt={account.email_verified_at}
              phone={account.phone}
              phoneVerified={account.phone_verified}
              verificationState={verificationState}
            />
          ) : null}

          {cp ? (
            <CompletenessPanel
              isWorker={isWorker}
              isEmployer={isEmployer}
              clientProfile={cp}
              workerProfile={cp.worker_profile}
              employerProfile={cp.employer_profile}
              hasPortfolioItem={hasPortfolioItem}
              hasUploadedDocument={hasUploadedDocument}
              onAction={handleCompletenessAction}
            />
          ) : null}

          {cp ? (
            <Card id="section-avatar">
              <CardHeader>
                <CardTitle>Avatar</CardTitle>
                <CardDescription>
                  Square photo, ≥ 256×256 px. JPEG, PNG, or WebP up to 5 MB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AvatarUploader
                  avatarUrl={avatarUrl}
                  fallback={initialsFor(displayName)}
                  onChanged={refetch}
                />
              </CardContent>
            </Card>
          ) : null}

          {cp ? (
            <Card id="section-client">
              <CardHeader>
                <CardTitle>Client profile</CardTitle>
                <CardDescription>Public details shown to other users.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitClient} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="p-display-name">Display name</Label>
                    <Input
                      id="p-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={150}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="p-bio">Bio</Label>
                    <Textarea
                      id="p-bio"
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={2000}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-city">City (London borough)</Label>
                    <Select
                      value={city || '__none__'}
                      onValueChange={(v) => {
                        const next = v === '__none__' ? '' : v;
                        setCity(next);
                        if (
                          next &&
                          postcodeAreaClient &&
                          !postcodeAreasFor(next).includes(postcodeAreaClient)
                        ) {
                          setPostcodeAreaClient('');
                        }
                      }}
                    >
                      <SelectTrigger id="p-city">
                        <SelectValue placeholder="Select borough" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {LONDON_BOROUGH_NAMES.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-postcode">Postcode area</Label>
                    <Select
                      value={postcodeAreaClient || '__none__'}
                      onValueChange={(v) =>
                        setPostcodeAreaClient(v === '__none__' ? '' : v)
                      }
                      disabled={postcodeOptions.length === 0}
                    >
                      <SelectTrigger id="p-postcode">
                        <SelectValue
                          placeholder={
                            city ? 'Select outward code' : 'Pick a borough first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {postcodeOptions.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {postcodeAreaClient &&
                    !POSTCODE_OUTWARD_REGEX.test(postcodeAreaClient) ? (
                      <p className="text-xs text-danger">
                        Outward code looks invalid (e.g. SW1, EC2A, NW10).
                      </p>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit">Save client profile</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-fg-muted">No client profile on this account.</p>
          )}

          {cp && isWorker ? (
            <Card id="section-worker">
              <CardHeader>
                <CardTitle>Worker profile</CardTitle>
                <CardDescription>Rates, availability, and experience.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitWorker} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="w-years">Years experience</Label>
                    <Input
                      id="w-years"
                      type="number"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-rate-min">Day rate min</Label>
                    <Input
                      id="w-rate-min"
                      type="number"
                      step="0.01"
                      value={dayRateMin}
                      onChange={(e) => setDayRateMin(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-rate-max">Day rate max</Label>
                    <Input
                      id="w-rate-max"
                      type="number"
                      step="0.01"
                      value={dayRateMax}
                      onChange={(e) => setDayRateMax(e.target.value)}
                    />
                    {dayRateMin &&
                    dayRateMax &&
                    Number(dayRateMax) < Number(dayRateMin) ? (
                      <p className="text-xs text-danger">
                        Max must be ≥ min.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="w-available-from">Available from</Label>
                    <Input
                      id="w-available-from"
                      type="date"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={workerAvailable}
                      onChange={(e) => setWorkerAvailable(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Is available
                  </label>
                  <div className="sm:col-span-2">
                    <Button type="submit">Save worker profile</Button>
                  </div>
                </form>
                <div className="mt-6 space-y-2 border-t border-border-default pt-4">
                  <Label>Specialisations</Label>
                  <p className="text-xs text-fg-muted">
                    Pick one or more trades you cover. These power filters in
                    Worker search.
                  </p>
                  <SpecialisationPicker
                    links={cp.worker_profile?.worker_specialisations}
                    onChanged={refetch}
                  />
                </div>
                <div className="mt-6 border-t border-border-default pt-4">
                  <LanguagesEditor value={languages} onChange={setLanguages} />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {cp && isEmployer ? (
            <Card id="section-employer">
              <CardHeader>
                <CardTitle>Employer profile</CardTitle>
                <CardDescription>Company details.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitEmployer} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="e-company">Company name</Label>
                    <Input
                      id="e-company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="e-number">Company number</Label>
                    <Input
                      id="e-number"
                      value={companyNumber}
                      onChange={(e) => setCompanyNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="e-team">Team size</Label>
                    <Input
                      id="e-team"
                      type="number"
                      value={teamSize}
                      onChange={(e) => setTeamSize(e.target.value)}
                      min={0}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit">Save employer profile</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {cp ? <VerificationSection /> : null}
        </TabsContent>

        {isWorker ? (
          <TabsContent value="portfolio" className="space-y-6">
            {cp ? (
              <PortfolioTab workerId={workerId} flash={flash} />
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent value="documents" className="space-y-6">
          {cp ? (
            <DocumentsTab
              isWorker={isWorker}
              isEmployer={isEmployer}
              flash={flash}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              You need a client profile to upload documents.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

type AccountSectionProps = {
  email: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerified: boolean;
  verificationState: 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED' | null;
};

function AccountSection({
  email,
  emailVerifiedAt,
  phone,
  phoneVerified,
  verificationState,
}: AccountSectionProps) {
  const verifiedDate = formatDate(emailVerifiedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Email, phone, and verification state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-fg-muted">Email</p>
            <p className="text-sm text-fg">{email}</p>
            {verifiedDate ? (
              <p className="text-xs text-fg-muted">Verified on {verifiedDate}</p>
            ) : null}
          </div>
          {emailVerifiedAt ? (
            <Badge variant="success" title={emailVerifiedAt}>
              Verified
            </Badge>
          ) : (
            <Badge variant="warning">Pending</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-fg-muted">Phone</p>
            <p className="text-sm text-fg">{phone ?? 'Not set'}</p>
          </div>
          {phone ? (
            phoneVerified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="outline">Unverified</Badge>
            )
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-fg-muted">Account state</p>
            <p className="text-sm text-fg">
              {verificationState
                ? VERIFICATION_STATE_LABEL[verificationState]
                : 'Unknown'}
            </p>
          </div>
          {verificationState ? (
            <Badge variant={VERIFICATION_STATE_VARIANT[verificationState]}>
              {VERIFICATION_STATE_LABEL[verificationState]}
            </Badge>
          ) : null}
        </div>

        <div className="border-t border-border-default pt-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/security">Manage security</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const VERIFICATION_STATE_LABEL: Record<
  'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED',
  string
> = {
  PENDING_EMAIL_VERIFICATION: 'Pending email verification',
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
};

const VERIFICATION_STATE_VARIANT: Record<
  'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED',
  'success' | 'warning' | 'danger'
> = {
  PENDING_EMAIL_VERIFICATION: 'warning',
  ACTIVE: 'success',
  DEACTIVATED: 'danger',
};

function EmailNotVerifiedBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function resend() {
    setSending(true);
    setError('');
    try {
      await api('/auth/verify-email/send', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Failed to resend verification email.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthBanner
      variant="warning"
      title="Verify your email"
      action={
        sent ? (
          <p className="text-xs">Check your inbox for the link.</p>
        ) : (
          <Button type="button" size="sm" onClick={resend} disabled={sending}>
            {sending ? 'Sending…' : 'Resend verification email'}
          </Button>
        )
      }
    >
      <p>
        We sent a confirmation link to <strong>{email}</strong>. You can keep
        editing your profile in the meantime.
      </p>
      {error ? <p className="mt-1 text-xs">{error}</p> : null}
    </AuthBanner>
  );
}

type PublicLevelResponse = {
  verification_level: string;
  flags?: {
    identity_verified?: boolean;
    insurance_approved?: boolean;
    company_house_verified?: boolean;
    company_letterhead_approved?: boolean;
    right_to_work_verified?: boolean;
    hmrc_cis_verified?: boolean;
    certification_doc_types?: string[];
  };
  reviews?: { count?: number; average?: number | null };
};

function MyTrustSummary({
  clientProfileId,
}: {
  clientProfileId: string | number | bigint;
}) {
  const [data, setData] = useState<PublicLevelResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PublicLevelResponse>(`/verification/levels/${clientProfileId}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientProfileId]);

  if (!data) return null;

  return (
    <div className="rounded-md border border-border-default bg-raised p-3 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-fg">Trust status</span>
        <VerificationBadge state={verificationFromLevel(data.verification_level)} />
      </div>
      <MilestonesStrip flags={data.flags} reviews={data.reviews} />
    </div>
  );
}

type StripeIdentityStatus =
  | 'requires_input'
  | 'processing'
  | 'verified'
  | 'canceled';

const VERIFICATION_LEVEL_LABEL: Record<string, string> = {
  UNVERIFIED: 'Unverified',
  BASIC: 'Basic — identity verified',
  CERTIFIED: 'Certified',
  PREMIUM: 'Premium',
};

function VerificationSection() {
  const [searchParams] = useSearchParams();
  const justCompleted = searchParams.get('verification') === 'complete';
  const cameFromRetryEmail = searchParams.get('verification') === 'retry';
  const [level, setLevel] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<StripeIdentityStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useMemo(
    () => async () => {
      try {
        const me = await api<{ verification_level: string }>('/verification/me');
        setLevel(me.verification_level);
      } catch {
        setLevel('UNVERIFIED');
      }
      try {
        const s = await api<{ status: StripeIdentityStatus | null }>(
          '/verification/identity/status',
        );
        setSessionStatus(s.status);
      } catch {
        setSessionStatus(null);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while Stripe is actually processing (or the user just returned
  // from the redirect and the webhook may not have landed yet). Once Stripe
  // settles to a terminal state — `verified`, `requires_input`, `canceled` —
  // there's nothing to wait for, so we stop polling.
  useEffect(() => {
    const verifiedNow =
      level === 'BASIC' || level === 'CERTIFIED' || level === 'PREMIUM';
    if (verifiedNow) return;
    const shouldPoll = justCompleted || sessionStatus === 'processing';
    if (!shouldPoll) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [justCompleted, sessionStatus, level, refresh]);

  async function startVerification() {
    setError('');
    setLoading(true);
    try {
      const res = await api<{ verification_url: string }>(
        '/verification/identity/start',
        { method: 'POST' },
      );
      if (res.verification_url) {
        window.open(res.verification_url, '_blank');
        // Optimistically reflect the new in-progress state so the CTA hides
        // immediately; the next refresh confirms via Stripe.
        setSessionStatus('processing');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const verified = level !== null && level !== 'UNVERIFIED';
  // ONLY hide the CTA while Stripe is actively reviewing. `requires_input` /
  // `canceled` are terminal failure states — the user must be able to retry.
  const inProgress = !verified && sessionStatus === 'processing';
  const lastAttemptFailed =
    !verified &&
    (sessionStatus === 'requires_input' || sessionStatus === 'canceled');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity verification</CardTitle>
        <CardDescription>
          Verify your identity to build trust with other users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {justCompleted && !verified && !lastAttemptFailed ? (
          <div
            role="status"
            className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
          >
            Verification submitted — your status will update once Stripe finishes
            the check (usually a few seconds).
          </div>
        ) : null}
        {(cameFromRetryEmail || lastAttemptFailed) && !verified && !inProgress ? (
          <div
            role="status"
            className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
          >
            Your last verification attempt didn't go through. Try again with a
            sharper photo and an in-date ID — you can re-run the check below.
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Status:</span>
          <Badge
            variant={
              verified
                ? 'success'
                : inProgress
                  ? 'info'
                  : lastAttemptFailed
                    ? 'danger'
                    : 'warning'
            }
          >
            {verified
              ? VERIFICATION_LEVEL_LABEL[level!] ?? level
              : inProgress
                ? 'In review'
                : lastAttemptFailed
                  ? 'Last attempt failed'
                  : level
                    ? VERIFICATION_LEVEL_LABEL[level] ?? level
                    : 'Loading…'}
          </Badge>
        </div>
        {verified ? (
          <p className="text-sm text-success">Your identity has been verified.</p>
        ) : inProgress ? (
          <p className="text-sm text-info">
            We're waiting for Stripe to confirm your check. You'll get an email
            with the result, or refresh this page in a minute or two.
          </p>
        ) : (
          <>
            {!lastAttemptFailed ? (
              <p className="text-sm text-fg-muted">
                Verify your identity with a passport, driving licence, or
                national ID card.
              </p>
            ) : null}
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
            ) : null}
            <Button type="button" onClick={startVerification} disabled={loading}>
              {loading
                ? 'Starting…'
                : lastAttemptFailed
                  ? 'Try again'
                  : 'Verify my identity'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
