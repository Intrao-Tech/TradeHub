// TEST-AUTH-131 — frontend factories that mirror backend response shapes.
// Used by both MSW handlers and component tests.

import type { AccountSummary } from '@/lib/auth-routing';

export function makeAccountSummary(
  overrides: Partial<AccountSummary> & {
    staff_role?: 'ADMIN' | 'MODERATOR' | null;
  } = {},
): AccountSummary & { staff_role: 'ADMIN' | 'MODERATOR' | null } {
  return {
    id: overrides.id ?? '42',
    email: overrides.email ?? 'user@example.com',
    is_worker: overrides.is_worker ?? true,
    is_employer: overrides.is_employer ?? false,
    is_staff: overrides.is_staff ?? false,
    verification_state: overrides.verification_state ?? 'ACTIVE',
    staff_role: overrides.staff_role ?? null,
  };
}

export function makeLoginResponse(
  overrides: {
    email?: string;
    is_worker?: boolean;
    is_employer?: boolean;
    is_staff?: boolean;
    verification_state?:
      | 'PENDING_EMAIL_VERIFICATION'
      | 'ACTIVE'
      | 'DEACTIVATED';
    staff_role?: 'ADMIN' | 'MODERATOR' | null;
    withTokens?: boolean;
    token?: string | null;
  } = {},
) {
  return {
    access_token: overrides.token ?? 'test-access-token',
    refresh_token: 'test-refresh-token',
    account: makeAccountSummary({
      email: overrides.email,
      is_worker: overrides.is_worker,
      is_employer: overrides.is_employer,
      is_staff: overrides.is_staff,
      verification_state: overrides.verification_state,
      staff_role: overrides.staff_role ?? null,
    }),
  };
}

// ── TEST-PROF-161: Profiles factory shapes ──────────────────────
// Mock builders for the AccountMe / ClientProfile / WorkerProfile /
// EmployerProfile / PortfolioItem / Document shapes the Profiles
// frontend consumes through `useAccountMe` and `api<T>()` helpers.

export type MockClientProfile = {
  id: string;
  display_name: string;
  slug: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  postcode_area: string | null;
  verification_level: string;
  stripe_onboarding_complete: boolean;
  stripe_connect_account_id: string | null;
  worker_profile: MockWorkerProfile | null;
  employer_profile: MockEmployerProfile | null;
};

export type MockWorkerProfile = {
  id: string;
  years_experience: number | null;
  day_rate_min: string | null;
  day_rate_max: string | null;
  available_from: string | null;
  is_available: boolean;
  rating_avg: string;
  rating_count: number;
  languages: string[];
  worker_specialisations: Array<{
    specialisation_id: number;
    is_primary: boolean;
    specialisation: { id: number; name: string; slug: string };
  }>;
};

export type MockEmployerProfile = {
  id: string;
  company_name: string | null;
  company_number: string | null;
  team_size: number | null;
  rating_avg: string;
  rating_count: number;
};

export type MockDocument = {
  id: string;
  client_profile_id: string;
  doc_type: string;
  file_url: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type MockPortfolioItem = {
  id: string;
  worker_id: string;
  item_type: 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION';
  title: string;
  description: string | null;
  sort_order: number;
  verified: boolean;
  experience_detail?: { company_name?: string | null; role?: string | null } | null;
  project_detail?: { project_type?: string | null; site_postcode?: string | null } | null;
  certification_detail?: {
    cert_type: string;
    cert_number?: string | null;
    issuing_body?: string | null;
  } | null;
  portfolio_media: Array<{
    id: string;
    media_url: string;
    caption: string | null;
    sort_order: number;
  }>;
  portfolio_item_documents: Array<{ document_id: string; document?: MockDocument }>;
};

export type MockTrustLadderState = {
  level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
  hasIdApproved: boolean;
  hasCertification: boolean;
  hasInsurance: boolean;
  reviewCount: number;
};

export function mockWorkerProfile(
  overrides: Partial<MockWorkerProfile> = {},
): MockWorkerProfile {
  return {
    id: '1',
    years_experience: 5,
    day_rate_min: '180.00',
    day_rate_max: '260.00',
    available_from: null,
    is_available: true,
    rating_avg: '0',
    rating_count: 0,
    languages: ['en'],
    worker_specialisations: [],
    ...overrides,
  };
}

export function mockEmployerProfile(
  overrides: Partial<MockEmployerProfile> = {},
): MockEmployerProfile {
  return {
    id: '1',
    company_name: 'Test Construction Ltd',
    company_number: '12345678',
    team_size: 10,
    rating_avg: '0',
    rating_count: 0,
    ...overrides,
  };
}

export function mockClientProfile(
  overrides: Partial<MockClientProfile> = {},
): MockClientProfile {
  return {
    id: '1',
    display_name: 'Mike Builder',
    slug: 'mike-builder-abcdef',
    avatar_url: null,
    bio: null,
    city: 'Camden',
    postcode_area: 'NW1',
    verification_level: 'UNVERIFIED',
    stripe_onboarding_complete: false,
    stripe_connect_account_id: null,
    worker_profile: mockWorkerProfile(),
    employer_profile: null,
    ...overrides,
  };
}

export function mockDocument(
  overrides: Partial<MockDocument> = {},
): MockDocument {
  return {
    id: overrides.id ?? '101',
    client_profile_id: '1',
    doc_type: 'CSCS_CARD',
    file_url: '/uploads/test.pdf',
    status: 'PENDING',
    reviewed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function mockPortfolioItem(
  overrides: Partial<MockPortfolioItem> = {},
): MockPortfolioItem {
  return {
    id: '201',
    worker_id: '1',
    item_type: 'PROJECT',
    title: 'Loft conversion',
    description: 'Two-bed loft, full re-wire.',
    sort_order: 0,
    verified: false,
    project_detail: { project_type: 'Conversion', site_postcode: 'NW1' },
    portfolio_media: [],
    portfolio_item_documents: [],
    ...overrides,
  };
}

export function mockTrustLadderState(
  overrides: Partial<MockTrustLadderState> = {},
): MockTrustLadderState {
  return {
    level: 'UNVERIFIED',
    hasIdApproved: false,
    hasCertification: false,
    hasInsurance: false,
    reviewCount: 0,
    ...overrides,
  };
}

/**
 * AccountMe response shape — matches the `useAccountMe` consumer in
 * `web/src/hooks/useAccountMe.ts`. Pass overrides for role flips and
 * profile hydration.
 */
export function mockAccountMe(overrides: {
  status?: 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED';
  email?: string;
  phone?: string | null;
  phone_verified?: boolean;
  email_verified_at?: string | null;
  clientProfile?: Partial<MockClientProfile> | null;
  staff_member?: { id: string; staff_role: 'ADMIN' | 'MODERATOR' } | null;
} = {}) {
  const status = overrides.status ?? 'ACTIVE';
  const clientProfile =
    overrides.clientProfile === null
      ? null
      : mockClientProfile(overrides.clientProfile ?? {});
  return {
    id: '42',
    email: overrides.email ?? 'mike@example.com',
    email_verified_at:
      overrides.email_verified_at !== undefined
        ? overrides.email_verified_at
        : status === 'ACTIVE'
          ? new Date().toISOString()
          : null,
    phone: overrides.phone ?? '+447700900123',
    phone_verified: overrides.phone_verified ?? false,
    status,
    client_profile: clientProfile,
    staff_member: overrides.staff_member ?? null,
  };
}

// ── TEST-JOBS-003: Jobs & Applications mock builders ─────────────
//
// Shapes mirror what the API returns through `web/src/api.ts` for the
// Jobs surface. Override-friendly so tests can flip a single field
// (e.g., `status: 'CLOSED'`, `_count.applications: 1`) without rebuilding
// the whole nested tree.

export type MockSpecialisationCatalogItem = {
  id: number;
  name: string;
  slug: string;
};

export type MockTagCatalogItem = { id: number; name: string; slug: string };

export type MockEmployerForJob = {
  id: string;
  company_name: string | null;
  client_profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    verification_level: string;
  };
};

export type MockJobPost = {
  id: string;
  employer_id: string;
  title: string;
  description: string | null;
  postcode_area: string | null;
  site_address: string | null;
  pay_type: 'DAY_RATE' | 'FIXED_PRICE';
  day_rate_min: string | null;
  day_rate_max: string | null;
  fixed_price: string | null;
  duration_days: number | null;
  start_date: string | null;
  status: 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED';
  is_urgent: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  employer: MockEmployerForJob;
  specialisations: Array<{
    specialisation: MockSpecialisationCatalogItem;
  }>;
  tags: Array<{ tag: MockTagCatalogItem }>;
  _count: { applications: number };
};

export type MockJobApplication = {
  id: string;
  job_post_id: string;
  worker_id: string;
  initiated_by: 'WORKER' | 'EMPLOYER';
  status:
    | 'PENDING'
    | 'REVIEWED'
    | 'SHORTLISTED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'WITHDRAWN';
  cover_message: string | null;
  proposed_rate: string | null;
  responded_at: string | null;
  created_at: string;
  job_post: MockJobPost;
  worker_profile: {
    id: string;
    rating_avg: string;
    rating_count: number;
    client_profile: {
      id: string;
      display_name: string;
      avatar_url: string | null;
      verification_level: string;
    };
  };
};

export function mockSpecialisationCatalog(): MockSpecialisationCatalogItem[] {
  return [
    { id: 1, name: 'Plumbing', slug: 'plumbing' },
    { id: 2, name: 'Electrical', slug: 'electrical' },
    { id: 3, name: 'Carpentry', slug: 'carpentry' },
    { id: 4, name: 'Tiling', slug: 'tiling' },
    { id: 5, name: 'Roofing', slug: 'roofing' },
  ];
}

export function mockTagCatalog(): MockTagCatalogItem[] {
  return [
    { id: 10, name: 'Loft Conversion', slug: 'loft-conversion' },
    { id: 11, name: 'Kitchen Fitting', slug: 'kitchen-fitting' },
    { id: 12, name: 'Commercial Wiring', slug: 'commercial-wiring' },
  ];
}

function mockEmployerForJob(
  overrides: Partial<MockEmployerForJob> = {},
): MockEmployerForJob {
  return {
    id: '900',
    company_name: 'Acme Build Ltd',
    client_profile: {
      id: '900',
      display_name: 'Acme Build',
      avatar_url: null,
      verification_level: 'IDENTITY_VERIFIED',
    },
    ...overrides,
  };
}

export function mockJobPost(overrides: Partial<MockJobPost> = {}): MockJobPost {
  const now = new Date().toISOString();
  return {
    id: '1001',
    employer_id: '900',
    title: 'Wire two-bed flat',
    description: 'First fix electrical for a Camden flat. Two-week duration.',
    postcode_area: 'NW1',
    site_address: null,
    pay_type: 'DAY_RATE',
    day_rate_min: '200.00',
    day_rate_max: '280.00',
    fixed_price: null,
    duration_days: 10,
    start_date: null,
    status: 'OPEN',
    is_urgent: false,
    expires_at: null,
    created_at: now,
    updated_at: now,
    employer: mockEmployerForJob(),
    specialisations: [
      { specialisation: { id: 2, name: 'Electrical', slug: 'electrical' } },
    ],
    tags: [{ tag: { id: 12, name: 'Commercial Wiring', slug: 'commercial-wiring' } }],
    _count: { applications: 0 },
    ...overrides,
  };
}

export function mockJobApplication(
  overrides: Partial<MockJobApplication> = {},
): MockJobApplication {
  const now = new Date().toISOString();
  const post = overrides.job_post ?? mockJobPost();
  return {
    id: '5001',
    job_post_id: post.id,
    worker_id: '42',
    initiated_by: 'WORKER',
    status: 'PENDING',
    cover_message: null,
    proposed_rate: null,
    responded_at: null,
    created_at: now,
    job_post: post,
    worker_profile: {
      id: '42',
      rating_avg: '4.5',
      rating_count: 8,
      client_profile: {
        id: '42',
        display_name: 'Mike Builder',
        avatar_url: null,
        verification_level: 'UNVERIFIED',
      },
    },
    ...overrides,
  };
}

/** Common error body shape produced by the backend GlobalExceptionFilter. */
export function makeErrorBody(
  code: string,
  extras: Record<string, unknown> = {},
) {
  return {
    code,
    message: extras.message ?? `${code} error`,
    statusCode: extras.statusCode ?? 400,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}
