import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Pencil } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { AuthBanner } from '../components/AuthBanner';
import { AvatarUploader } from '../components/profile/AvatarUploader';
import { PhoneInput, combinePhone } from '../components/PhoneInput';
import { COUNTRIES } from '../lib/countries';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PortfolioTab } from '../components/profile/PortfolioTab';
import { DocumentsTab } from '../components/profile/DocumentsTab';
import {
  VerificationBadge,
  verificationFromLevel,
} from '../components/VerificationBadge';
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

function formatRate(min?: string | number | null, max?: string | number | null): string {
  const m = min == null || min === '' ? null : Number(min);
  const x = max == null || max === '' ? null : Number(max);
  if (m == null && x == null) return '—';
  if (m != null && x != null) return `£${m}–£${x}/day`;
  if (m != null) return `from £${m}/day`;
  return `up to £${x}/day`;
}

function formatRating(avg?: string | number | null, count?: number | null): {
  avg: string;
  count: number;
} {
  const a = avg == null || avg === '' ? null : Number(avg);
  return {
    avg: a == null || Number.isNaN(a) ? '—' : a.toFixed(1),
    count: count ?? 0,
  };
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

  const [hasPortfolioItem, setHasPortfolioItem] = useState(false);
  const [hasUploadedDocument, setHasUploadedDocument] = useState(false);

  // Lightweight summary fetch so the completeness panel can show portfolio /
  // documents as "done" without forcing a full PortfolioTab / DocumentsTab load.
  useEffect(() => {
    if (!cp) return;
    const cancel = { current: false };
    if (workerId) {
      api<unknown[]>(`/portfolio/worker/${workerId}`)
        .then((items) => {
          if (!cancel.current) setHasPortfolioItem(items.length > 0);
        })
        .catch(() => {
          /* non-fatal */
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
    const targetId =
      action.scrollTo ??
      (action.switchTab === 'portfolio'
        ? 'section-portfolio'
        : action.switchTab === 'documents'
          ? 'section-documents'
          : null);
    if (!targetId) return;
    requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Hydrate editor inputs from the cache.
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
      setLanguages(
        Array.isArray(wp.worker_languages)
          ? wp.worker_languages
              .map((l) => l.language_code)
              .filter((c): c is string => typeof c === 'string')
          : [],
      );
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
      flash('Public details updated');
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
      flash('Worker details updated');
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
        <p className="text-sm text-fg-muted">Loading…</p>
      </div>
    );
  }

  const rating = formatRating(
    cp?.worker_profile?.rating_avg,
    cp?.worker_profile?.rating_count ?? null,
  );

  const headerCard = cp ? (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-4">
          <AvatarUploader
            avatarUrl={avatarUrl}
            fallback={initialsFor(displayName)}
            onChanged={refetch}
            compact
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-lg font-semibold text-fg">
              {displayName || 'Add a display name'}
            </h2>
            <div>
              <VerificationBadge
                state={verificationFromLevel(cp.verification_level ?? 'UNVERIFIED')}
              />
            </div>
            {(city || postcodeAreaClient) ? (
              <p className="inline-flex max-w-full items-center gap-1 text-sm text-fg-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {[city, postcodeAreaClient].filter(Boolean).join(' · ')}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        {isWorker || isEmployer ? (
          <Button asChild variant="outline" size="sm" className="w-full">
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
      </CardContent>
    </Card>
  ) : null;

  const statsCard = isWorker ? (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Rating</p>
          <p className="text-lg font-semibold text-fg">{rating.avg}</p>
          <p className="text-xs text-fg-muted">{rating.count} reviews</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Day rate</p>
          <p className="text-lg font-semibold text-fg">
            {formatRate(
              cp?.worker_profile?.day_rate_min,
              cp?.worker_profile?.day_rate_max,
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const employerRating = formatRating(
    cp?.employer_profile?.rating_avg,
    cp?.employer_profile?.rating_count ?? null,
  );
  const employerStatsCard = isEmployer ? (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Rating</p>
          <p className="text-lg font-semibold text-fg">{employerRating.avg}</p>
          <p className="text-xs text-fg-muted">{employerRating.count} reviews</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Team size</p>
          <p className="text-lg font-semibold text-fg">
            {cp?.employer_profile?.team_size ?? '—'}
          </p>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const availabilityCard = isWorker && cp ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={workerAvailable}
            onChange={(e) => setWorkerAvailable(e.target.checked)}
            className="h-4 w-4"
          />
          Available for work
        </label>
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="w-available-from" className="text-xs">
            Available from
          </Label>
          <Input
            id="w-available-from"
            type="date"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" onClick={(e) => submitWorker(e as unknown as FormEvent)}>
          Save
        </Button>
      </CardContent>
    </Card>
  ) : null;

  const languagesCard = isWorker && cp ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Languages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <LanguagesEditor value={languages} onChange={setLanguages} />
        <Button type="button" size="sm" onClick={(e) => submitWorker(e as unknown as FormEvent)}>
          Save
        </Button>
      </CardContent>
    </Card>
  ) : null;

  const verificationsCard = cp ? <VerificationSection /> : null;

  const accountCard = account ? (
    <AccountSection
      email={account.email}
      emailVerifiedAt={account.email_verified_at}
      phone={account.phone}
      phoneVerified={account.phone_verified}
      verificationState={verificationState}
      onPhoneChanged={refetch}
    />
  ) : null;

  return (
    <div className="space-y-6">
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

      {isWorker ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Left rail */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {headerCard}
            {statsCard}
            {availabilityCard}
            {languagesCard}
            {verificationsCard}
            {accountCard}
          </aside>

          {/* Main column */}
          <div className="space-y-4">
            {/* Public details: display name, bio, city, postcode */}
            {cp ? (
              <Card id="section-client">
                <CardHeader>
                  <CardTitle>Public details</CardTitle>
                  <CardDescription>What clients see on your profile.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={submitClient}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div className="flex flex-col gap-2.5 sm:col-span-2">
                      <Label htmlFor="p-display-name">Display name</Label>
                      <Input
                        id="p-display-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={150}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5 sm:col-span-2">
                      <Label htmlFor="p-bio">Bio</Label>
                      <Textarea
                        id="p-bio"
                        rows={4}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={2000}
                        placeholder="Tell clients what you do, your specialties, and what makes you stand out."
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="p-city">City (London borough)</Label>
                      <Select
                        value={city || '__none__'}
                        onValueChange={(v) => {
                          // Radix Select can fire onValueChange with '' during
                          // an external value-prop transition (hidden form
                          // <select> sync). Ignore empty; only act on real
                          // user picks (which fire '__none__' for "Not set").
                          if (!v) return;
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
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="p-postcode">Postcode area</Label>
                      <Select
                        value={postcodeAreaClient || '__none__'}
                        onValueChange={(v) => {
                          if (!v) return;
                          setPostcodeAreaClient(v === '__none__' ? '' : v);
                        }}
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
                      <Button type="submit">Save public details</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-fg-muted">No client profile on this account.</p>
            )}

            {/* Worker rate + experience */}
            {cp ? (
              <Card id="section-worker">
                <CardHeader>
                  <CardTitle>Rate & experience</CardTitle>
                  <CardDescription>How clients price and find you.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={submitWorker}
                    className="grid gap-4 sm:grid-cols-3"
                  >
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="w-years">Years experience</Label>
                      <Input
                        id="w-years"
                        type="number"
                        value={yearsExperience}
                        onChange={(e) => setYearsExperience(e.target.value)}
                        min={0}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="w-rate-min">Day rate min (£)</Label>
                      <Input
                        id="w-rate-min"
                        type="number"
                        step="0.01"
                        value={dayRateMin}
                        onChange={(e) => setDayRateMin(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="w-rate-max">Day rate max (£)</Label>
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
                    <div className="sm:col-span-3">
                      <Button type="submit">Save rate & experience</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {/* Skills / specialisations */}
            {cp ? (
              <Card id="section-skills">
                <CardHeader>
                  <CardTitle>Skills</CardTitle>
                  <CardDescription>
                    Trades you cover. These power filters in worker search.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SpecialisationPicker
                    links={cp.worker_profile?.worker_specialisations}
                    onChanged={refetch}
                  />
                </CardContent>
              </Card>
            ) : null}

            {/* Portfolio */}
            {cp ? (
              <Card id="section-portfolio">
                <CardHeader>
                  <CardTitle>Portfolio</CardTitle>
                  <CardDescription>
                    Showcase past projects with photos and descriptions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PortfolioTab workerId={workerId} flash={flash} />
                </CardContent>
              </Card>
            ) : null}

            {/* Documents */}
            {cp ? (
              <Card id="section-documents">
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>
                    Insurance, accreditations, and other verification artefacts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DocumentsTab
                    isWorker={isWorker}
                    isEmployer={isEmployer}
                    flash={flash}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : isEmployer ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Left rail */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {headerCard}
            {employerStatsCard}
            {verificationsCard}
            {accountCard}
          </aside>

          {/* Main column */}
          <div className="space-y-4">
            {/* Public details: display name, bio, city, postcode */}
            {cp ? (
              <Card id="section-client">
                <CardHeader>
                  <CardTitle>Public details</CardTitle>
                  <CardDescription>What workers see on your profile.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={submitClient}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div className="flex flex-col gap-2.5 sm:col-span-2">
                      <Label htmlFor="p-display-name-e">Display name</Label>
                      <Input
                        id="p-display-name-e"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={150}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5 sm:col-span-2">
                      <Label htmlFor="p-bio-e">Bio</Label>
                      <Textarea
                        id="p-bio-e"
                        rows={4}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={2000}
                        placeholder="Tell workers about your business, the kind of jobs you post, and how you work."
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="p-city-e">City (London borough)</Label>
                      <Select
                        value={city || '__none__'}
                        onValueChange={(v) => {
                          if (!v) return;
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
                        <SelectTrigger id="p-city-e">
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
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="p-postcode-e">Postcode area</Label>
                      <Select
                        value={postcodeAreaClient || '__none__'}
                        onValueChange={(v) => {
                          if (!v) return;
                          setPostcodeAreaClient(v === '__none__' ? '' : v);
                        }}
                        disabled={postcodeOptions.length === 0}
                      >
                        <SelectTrigger id="p-postcode-e">
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
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit">Save public details</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {/* Company details (employer-specific) */}
            {cp ? (
              <Card id="section-employer">
                <CardHeader>
                  <CardTitle>Company details</CardTitle>
                  <CardDescription>
                    How workers identify and verify your business.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={submitEmployer}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div className="flex flex-col gap-2.5 sm:col-span-2">
                      <Label htmlFor="e-company">Company name</Label>
                      <Input
                        id="e-company"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="e-number">Companies House number</Label>
                      <Input
                        id="e-number"
                        value={companyNumber}
                        onChange={(e) => setCompanyNumber(e.target.value)}
                        placeholder="e.g. 12345678"
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
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
                      <Button type="submit">Save company details</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {/* Documents (employer types: INSURANCE, COMPANY_LETTERHEAD, OTHER) */}
            {cp ? (
              <Card id="section-documents">
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>
                    Insurance, company letterhead, and other verification artefacts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DocumentsTab
                    isWorker={isWorker}
                    isEmployer={isEmployer}
                    flash={flash}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : (
        // No role: minimal fallback (signed up but no client profile yet)
        <div className="space-y-6">{accountCard}</div>
      )}
    </div>
  );
}

type AccountSectionProps = {
  email: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerified: boolean;
  verificationState: 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED' | null;
  onPhoneChanged: () => void | Promise<void>;
};

function AccountSection({
  email,
  emailVerifiedAt,
  phone,
  phoneVerified,
  verificationState,
  onPhoneChanged,
}: AccountSectionProps) {
  const verifiedDate = formatDate(emailVerifiedAt);
  const [phoneOpen, setPhoneOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-fg-muted">Email</p>
            <p className="truncate text-sm text-fg">{email}</p>
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
            <p className="text-sm text-fg">{phone || 'Not set'}</p>
          </div>
          <div className="flex items-center gap-2">
            {phone ? (
              phoneVerified ? (
                <Badge variant="success">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={phone ? 'Edit phone' : 'Add phone'}
              onClick={() => setPhoneOpen(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <EditPhoneDialog
          open={phoneOpen}
          onOpenChange={setPhoneOpen}
          currentPhone={phone}
          onSaved={onPhoneChanged}
        />

        <div className="border-t border-border-default pt-3">
          <Button asChild variant="outline" size="sm" className="w-full">
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

function parseE164(phone: string | null): { iso: string; local: string } {
  if (!phone) return { iso: 'GB', local: '' };
  const digits = phone.replace(/^\+/, '').replace(/\D/g, '');
  // Match by longest dial-code first so e.g. "44" wins over "4".
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial)) {
      return { iso: c.iso, local: digits.slice(c.dial.length) };
    }
  }
  return { iso: 'GB', local: digits };
}

type EditPhoneDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone: string | null;
  onSaved: () => void | Promise<void>;
};

function EditPhoneDialog({
  open,
  onOpenChange,
  currentPhone,
  onSaved,
}: EditPhoneDialogProps) {
  const initial = useMemo(() => parseE164(currentPhone), [currentPhone]);
  const [iso, setIso] = useState(initial.iso);
  const [local, setLocal] = useState(initial.local);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-sync when the dialog opens (account may have refetched).
  useEffect(() => {
    if (open) {
      setIso(initial.iso);
      setLocal(initial.local);
      setError('');
    }
  }, [open, initial.iso, initial.local]);

  async function save(nextPhone: string) {
    setError('');
    setSaving(true);
    try {
      await api('/account/me', {
        method: 'PATCH',
        body: JSON.stringify({ phone: nextPhone }),
      });
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not update phone number.');
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    const combined = combinePhone(iso, local);
    if (!combined) {
      setError('Enter a phone number, or press Remove to clear it.');
      return;
    }
    void save(combined);
  }

  function handleRemove() {
    void save('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{currentPhone ? 'Edit phone' : 'Add phone'}</DialogTitle>
          <DialogDescription>
            Used by support and verified clients. Not shown publicly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PhoneInput
            countryIso={iso}
            onCountryIsoChange={setIso}
            localNumber={local}
            onLocalNumberChange={setLocal}
            inputId="account-phone"
          />
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="flex flex-row-reverse gap-2 sm:justify-between">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {currentPhone ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={saving}
              className="text-danger hover:text-danger"
            >
              Remove
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        setSessionStatus('processing');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const verified = level !== null && level !== 'UNVERIFIED';
  const inProgress = !verified && sessionStatus === 'processing';
  const lastAttemptFailed =
    !verified &&
    (sessionStatus === 'requires_input' || sessionStatus === 'canceled');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identity verification</CardTitle>
        <CardDescription>Build trust with verified ID.</CardDescription>
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
            sharper photo and an in-date ID.
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
            We're waiting for Stripe to confirm your check.
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
            <Button type="button" size="sm" onClick={startVerification} disabled={loading}>
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
