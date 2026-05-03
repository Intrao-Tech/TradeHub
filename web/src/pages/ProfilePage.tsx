import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { AuthBanner } from '../components/AuthBanner';
import { AvatarUploader } from '../components/profile/AvatarUploader';
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

const DOC_TYPES = [
  'ID_PHOTO',
  'SELFIE',
  'INSURANCE',
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'COMPANY_LETTERHEAD',
  'PROJECT_PHOTO',
  'OTHER',
] as const;

type PortfolioType = 'experience' | 'project' | 'certification';

type PortfolioItem = {
  id: string | number;
  item_type?: string;
  title?: string;
  description?: string | null;
};

type DocumentRow = {
  id: string | number;
  doc_type?: string;
  status?: string;
  file_url?: string;
  created_at?: string;
};

function docStatusVariant(
  status?: string,
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'IN_REVIEW':
      return 'info';
    case 'PENDING':
      return 'warning';
    default:
      return 'outline';
  }
}

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

  const [companyName, setCompanyName] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');
  const [teamSize, setTeamSize] = useState('');

  const [portfolio, setPortfolio] = useState<PortfolioItem[] | null>(null);
  const [portfolioType, setPortfolioType] = useState<PortfolioType>('experience');
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [uploadDocType, setUploadDocType] = useState<string>(DOC_TYPES[0]);
  const [uploadResult, setUploadResult] = useState<unknown>(null);

  const [expTitle, setExpTitle] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expCompany, setExpCompany] = useState('');
  const [expRole, setExpRole] = useState('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');

  const [projTitle, setProjTitle] = useState('');
  const [projDescription, setProjDescription] = useState('');
  const [projType, setProjType] = useState('');
  const [projPostcode, setProjPostcode] = useState('');
  const [projValue, setProjValue] = useState('');

  const [certTitle, setCertTitle] = useState('');
  const [certDescription, setCertDescription] = useState('');
  const [certType, setCertType] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [certIssuingBody, setCertIssuingBody] = useState('');
  const [certIssuedAt, setCertIssuedAt] = useState('');
  const [certExpiresAt, setCertExpiresAt] = useState('');

  const cp = clientProfile;
  const workerId = cp?.id != null ? String(cp.id) : '';
  const postcodeOptions = useMemo(() => postcodeAreasFor(city), [city]);

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

  async function loadPortfolio() {
    setActionError('');
    if (!workerId) return;
    try {
      const items = await api<PortfolioItem[]>(`/portfolio/worker/${workerId}`);
      setPortfolio(items);
    } catch (err) {
      reportError(err);
    }
  }

  async function deletePortfolioItem(id: string | number) {
    setActionError('');
    try {
      await api(`/portfolio/${id}`, { method: 'DELETE' });
      flash('Portfolio item deleted');
      await loadPortfolio();
    } catch (err) {
      reportError(err);
    }
  }

  async function addExperience(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string> = { title: expTitle };
      if (expDescription.trim()) body.description = expDescription;
      if (expCompany.trim()) body.company_name = expCompany;
      if (expRole.trim()) body.role = expRole;
      if (expStart.trim()) body.start_date = expStart;
      if (expEnd.trim()) body.end_date = expEnd;
      await api('/portfolio/experience', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Experience added');
      setExpTitle('');
      setExpDescription('');
      setExpCompany('');
      setExpRole('');
      setExpStart('');
      setExpEnd('');
      await loadPortfolio();
    } catch (err) {
      reportError(err);
    }
  }

  async function addProject(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string | number> = { title: projTitle };
      if (projDescription.trim()) body.description = projDescription;
      if (projType.trim()) body.project_type = projType;
      if (projPostcode.trim()) body.site_postcode = projPostcode;
      if (projValue.trim()) body.project_value = Number(projValue);
      await api('/portfolio/project', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Project added');
      setProjTitle('');
      setProjDescription('');
      setProjType('');
      setProjPostcode('');
      setProjValue('');
      await loadPortfolio();
    } catch (err) {
      reportError(err);
    }
  }

  async function addCertification(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      const body: Record<string, string> = {
        title: certTitle,
        cert_type: certType,
      };
      if (certDescription.trim()) body.description = certDescription;
      if (certNumber.trim()) body.cert_number = certNumber;
      if (certIssuingBody.trim()) body.issuing_body = certIssuingBody;
      if (certIssuedAt.trim()) body.issued_at = certIssuedAt;
      if (certExpiresAt.trim()) body.expires_at = certExpiresAt;
      await api('/portfolio/certification', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash('Certification added');
      setCertTitle('');
      setCertDescription('');
      setCertType('');
      setCertNumber('');
      setCertIssuingBody('');
      setCertIssuedAt('');
      setCertExpiresAt('');
      await loadPortfolio();
    } catch (err) {
      reportError(err);
    }
  }

  async function loadDocuments() {
    setActionError('');
    try {
      const list = await api<DocumentRow[]>('/documents/me');
      setDocuments(list);
    } catch (err) {
      reportError(err);
    }
  }

  async function uploadDocument(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setActionError('Choose a file');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', uploadDocType);
      const result = await api<unknown>('/documents/upload', {
        method: 'POST',
        body: formData,
      });
      setUploadResult(result);
      flash('Document uploaded');
      input.value = '';
      await loadDocuments();
    } catch (err) {
      reportError(err);
    }
  }

  async function deleteDocument(id: string | number) {
    setActionError('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      flash('Document deleted');
      await loadDocuments();
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

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
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
            <Card>
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
            <Card>
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
            <Card>
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
              </CardContent>
            </Card>
          ) : null}

          {cp && isEmployer ? (
            <Card>
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

        <TabsContent value="portfolio" className="space-y-6">
          {cp && isWorker ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Portfolio items</CardTitle>
                      <CardDescription>Worker ID: {workerId}</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={loadPortfolio}>
                      Load portfolio
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {portfolio ? (
                    portfolio.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {portfolio.map((item) => (
                          <Card key={String(item.id)} className="bg-subtle">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <Badge variant="outline" className="mb-2">
                                    {item.item_type ?? 'item'}
                                  </Badge>
                                  <p className="text-sm font-semibold text-fg">{item.title}</p>
                                  {item.description ? (
                                    <p className="mt-1 line-clamp-3 text-xs text-fg-muted">
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Delete item"
                                  onClick={() => deletePortfolioItem(item.id)}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-fg-muted">No portfolio items yet.</p>
                    )
                  ) : (
                    <p className="text-sm text-fg-muted">Click “Load portfolio” to fetch.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add portfolio item</CardTitle>
                  <CardDescription>Choose a type to add a new entry.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Item type</Label>
                    <Select
                      value={portfolioType}
                      onValueChange={(v) => setPortfolioType(v as PortfolioType)}
                    >
                      <SelectTrigger className="sm:max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="experience">Experience</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="certification">Certification</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {portfolioType === 'experience' ? (
                    <form onSubmit={addExperience} className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="exp-title">Title *</Label>
                        <Input
                          id="exp-title"
                          value={expTitle}
                          onChange={(e) => setExpTitle(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="exp-desc">Description</Label>
                        <Textarea
                          id="exp-desc"
                          rows={2}
                          value={expDescription}
                          onChange={(e) => setExpDescription(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exp-company">Company name</Label>
                        <Input
                          id="exp-company"
                          value={expCompany}
                          onChange={(e) => setExpCompany(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exp-role">Role</Label>
                        <Input
                          id="exp-role"
                          value={expRole}
                          onChange={(e) => setExpRole(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exp-start">Start date</Label>
                        <Input
                          id="exp-start"
                          type="datetime-local"
                          value={expStart}
                          onChange={(e) => setExpStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exp-end">End date</Label>
                        <Input
                          id="exp-end"
                          type="datetime-local"
                          value={expEnd}
                          onChange={(e) => setExpEnd(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Button type="submit">Add experience</Button>
                      </div>
                    </form>
                  ) : null}

                  {portfolioType === 'project' ? (
                    <form onSubmit={addProject} className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="proj-title">Title *</Label>
                        <Input
                          id="proj-title"
                          value={projTitle}
                          onChange={(e) => setProjTitle(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="proj-desc">Description</Label>
                        <Textarea
                          id="proj-desc"
                          rows={2}
                          value={projDescription}
                          onChange={(e) => setProjDescription(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proj-type">Project type</Label>
                        <Input
                          id="proj-type"
                          value={projType}
                          onChange={(e) => setProjType(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proj-postcode">Site postcode</Label>
                        <Input
                          id="proj-postcode"
                          value={projPostcode}
                          onChange={(e) => setProjPostcode(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="proj-value">Project value</Label>
                        <Input
                          id="proj-value"
                          type="number"
                          step="0.01"
                          value={projValue}
                          onChange={(e) => setProjValue(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Button type="submit">Add project</Button>
                      </div>
                    </form>
                  ) : null}

                  {portfolioType === 'certification' ? (
                    <form onSubmit={addCertification} className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cert-title">Title *</Label>
                        <Input
                          id="cert-title"
                          value={certTitle}
                          onChange={(e) => setCertTitle(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cert-desc">Description</Label>
                        <Textarea
                          id="cert-desc"
                          rows={2}
                          value={certDescription}
                          onChange={(e) => setCertDescription(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cert-type">Cert type *</Label>
                        <Input
                          id="cert-type"
                          value={certType}
                          onChange={(e) => setCertType(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cert-number">Cert number</Label>
                        <Input
                          id="cert-number"
                          value={certNumber}
                          onChange={(e) => setCertNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cert-body">Issuing body</Label>
                        <Input
                          id="cert-body"
                          value={certIssuingBody}
                          onChange={(e) => setCertIssuingBody(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cert-issued">Issued at</Label>
                        <Input
                          id="cert-issued"
                          type="datetime-local"
                          value={certIssuedAt}
                          onChange={(e) => setCertIssuedAt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cert-expires">Expires at</Label>
                        <Input
                          id="cert-expires"
                          type="datetime-local"
                          value={certExpiresAt}
                          onChange={(e) => setCertExpiresAt(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Button type="submit">Add certification</Button>
                      </div>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-sm text-fg-muted">
              Portfolio is available for workers only.
            </p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          {cp ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>My documents</CardTitle>
                      <CardDescription>
                        Upload verification documents for review.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={loadDocuments}>
                      Load documents
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {documents ? (
                    documents.length > 0 ? (
                      <ul className="divide-y divide-border-default">
                        {documents.map((doc) => (
                          <li
                            key={String(doc.id)}
                            className="flex flex-wrap items-center justify-between gap-2 py-3"
                          >
                            <div className="min-w-0 flex-1 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-fg">{doc.doc_type}</span>
                                <Badge variant={docStatusVariant(doc.status)}>{doc.status}</Badge>
                              </div>
                              {doc.file_url ? (
                                <p className="truncate text-xs text-fg-muted">{doc.file_url}</p>
                              ) : null}
                            </div>
                            {doc.status === 'PENDING' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteDocument(doc.id)}
                              >
                                <Trash2 />
                                Delete
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-fg-muted">No documents uploaded.</p>
                    )
                  ) : (
                    <p className="text-sm text-fg-muted">Click “Load documents” to fetch.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Upload document</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={uploadDocument}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="doc-file">File</Label>
                      <Input id="doc-file" type="file" name="file" required />
                    </div>
                    <div className="space-y-2 sm:w-60">
                      <Label>Doc type</Label>
                      <Select value={uploadDocType} onValueChange={setUploadDocType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit">Upload</Button>
                  </form>
                  {uploadResult != null ? (
                    <pre className="mt-4 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                      {JSON.stringify(uploadResult, null, 2)}
                    </pre>
                  ) : null}
                </CardContent>
              </Card>
            </>
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

function VerificationSection() {
  const [searchParams] = useSearchParams();
  const justCompleted = searchParams.get('verification') === 'complete';
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ verification_level: string }>('/verification/status')
      .then((d) => setStatus(d.verification_level))
      .catch(() => setStatus('UNVERIFIED'));
  }, []);

  async function startVerification() {
    setError('');
    setLoading(true);
    try {
      const res = await api<{ verification_url: string }>('/verification/start', {
        method: 'POST',
      });
      if (res.verification_url) {
        window.open(res.verification_url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const verified = status === 'IDENTITY_VERIFIED';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity verification</CardTitle>
        <CardDescription>
          Verify your identity to build trust with other users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {justCompleted ? (
          <div
            role="status"
            className="rounded-md border border-success/40 bg-success-subtle px-3 py-2 text-sm text-success"
          >
            Verification submitted — status will update shortly.
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Status:</span>
          <Badge variant={verified ? 'success' : 'warning'}>
            {status ?? 'loading…'}
          </Badge>
        </div>
        {verified ? (
          <p className="text-sm text-success">Your identity has been verified.</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              Verify your identity with a passport, driving licence, or national ID card.
            </p>
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
            ) : null}
            <Button type="button" onClick={startVerification} disabled={loading}>
              {loading ? 'Starting…' : 'Verify my identity'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
