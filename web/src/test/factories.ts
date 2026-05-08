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

// ── TEST-VER-003: Verification mock builders ────────────────────────
//
// Mirrors `GET /verification/levels/:id`, `GET /verification/me`,
// `GET /verification/ladder/:id`, and the staff queue payloads. Override
// pattern matches the rest of this file: spread + per-key overrides.

export type MockVerificationFlags = {
  identity_verified: boolean;
  insurance_approved: boolean;
  company_house_verified: boolean;
  company_letterhead_approved: boolean;
  right_to_work_verified: boolean;
  hmrc_cis_verified: boolean;
  certification_doc_types: string[];
};

export type MockVerificationLevels = {
  verification_level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
  last_evaluated_at: string;
  flags: MockVerificationFlags;
  reviews: { count: number; average: string | null };
};

export function mockVerificationLevels(
  overrides: Partial<MockVerificationLevels> & {
    flags?: Partial<MockVerificationFlags>;
    reviews?: Partial<MockVerificationLevels['reviews']>;
  } = {},
): MockVerificationLevels {
  return {
    verification_level: overrides.verification_level ?? 'BASIC',
    last_evaluated_at: overrides.last_evaluated_at ?? new Date().toISOString(),
    flags: {
      identity_verified: true,
      insurance_approved: false,
      company_house_verified: false,
      company_letterhead_approved: false,
      right_to_work_verified: false,
      hmrc_cis_verified: false,
      certification_doc_types: [],
      ...(overrides.flags ?? {}),
    },
    reviews: {
      count: 0,
      average: null,
      ...(overrides.reviews ?? {}),
    },
  };
}

export type MockVerificationMilestone = {
  milestone_type: string;
  achieved_at: string;
  expires_at: string | null;
  evidence_ref: string | null;
};

export type MockVerificationMe = {
  verification_level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
  milestones: MockVerificationMilestone[];
  documents: {
    pending: MockDocument[];
    in_review: MockDocument[];
    approved: MockDocument[];
    rejected: MockDocument[];
  };
  next_action: { rung: string; label: string; doc_types?: string[] } | null;
};

export function mockVerificationMe(
  overrides: Partial<MockVerificationMe> = {},
): MockVerificationMe {
  return {
    verification_level: 'UNVERIFIED',
    milestones: [],
    documents: { pending: [], in_review: [], approved: [], rejected: [] },
    next_action: { rung: 'BASIC', label: 'Verify your identity' },
    ...overrides,
  };
}

export type MockLadderRung = {
  level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
  state: 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'COMING_SOON';
  label: string;
  next_doc_types?: string[];
  estimated_time?: string;
  completed_at?: string | null;
};

export type MockVerificationLadder = {
  current_level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
  rungs: MockLadderRung[];
};

export function mockVerificationLadder(
  overrides: Partial<MockVerificationLadder> = {},
): MockVerificationLadder {
  return {
    current_level: 'UNVERIFIED',
    rungs: [
      { level: 'UNVERIFIED', state: 'DONE', label: 'Account created' },
      {
        level: 'BASIC',
        state: 'NOT_STARTED',
        label: 'Verify your identity with Stripe',
        estimated_time: 'Usually takes 2–5 minutes',
      },
      {
        level: 'CERTIFIED',
        state: 'NOT_STARTED',
        label: 'Upload a trade certification (CSCS / Gas Safe / NICEIC / FIRAS)',
        next_doc_types: ['CSCS_CARD', 'GAS_SAFE_CERT', 'NICEIC_CERT', 'FIRAS_CERT'],
      },
      {
        level: 'PREMIUM',
        state: 'COMING_SOON',
        label: 'Coming soon — requires 5+ verified reviews',
      },
    ],
    ...overrides,
  };
}

export type MockQueueItem = {
  document: {
    id: string;
    doc_type: string;
    file_url: string;
    status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
    rejection_reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
  };
  uploader: {
    id: string;
    display_name: string;
    role: 'WORKER' | 'EMPLOYER' | 'UNKNOWN';
  };
  assignee: { id: string; display_name: string } | null;
};

export type MockQueueResponse = {
  items: MockQueueItem[];
  total: number;
  page: number;
  limit: number;
};

export function mockQueueItem(
  overrides: Partial<MockQueueItem> & {
    document?: Partial<MockQueueItem['document']>;
    uploader?: Partial<MockQueueItem['uploader']>;
  } = {},
): MockQueueItem {
  return {
    document: {
      id: '101',
      doc_type: 'CSCS_CARD',
      file_url: '/uploads/test.pdf',
      status: 'PENDING',
      rejection_reason: null,
      metadata: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      ...(overrides.document ?? {}),
    },
    uploader: {
      id: '42',
      display_name: 'Mike Builder',
      role: 'WORKER',
      ...(overrides.uploader ?? {}),
    },
    assignee: overrides.assignee === undefined ? null : overrides.assignee,
  };
}

export function mockQueueResponse(
  overrides: Partial<MockQueueResponse> & { items?: MockQueueItem[] } = {},
): MockQueueResponse {
  const items = overrides.items ?? [mockQueueItem()];
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    limit: overrides.limit ?? 50,
  };
}

export type MockProviders = {
  stripe_identity: boolean;
  companies_house: boolean;
};

export function mockProviders(overrides: Partial<MockProviders> = {}): MockProviders {
  return {
    stripe_identity: true,
    companies_house: true,
    ...overrides,
  };
}

// ── TEST-COLLAB-003: Collaborations mock builders ─────────────────
//
// Shapes mirror the production payloads from
// `backend/src/collaboration/collaboration.service.ts` (`collaborationInclude`)
// and `backend/src/escrow/escrow.service.ts`. Override-friendly so a single
// field can be flipped without rebuilding the whole nested tree.

export type MockCollaborationParty = {
  id: string;
  rating_avg: string;
  rating_count: number;
  client_profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    verification_level: string;
    slug: string;
  };
};

export type MockReviewCollaboration = {
  id: string;
  worker_id: string;
  employer_id: string;
  project_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  status?: string;
};

export type MockReview = {
  id: string;
  collaboration_id: string;
  reviewer_role: 'WORKER' | 'EMPLOYER';
  overall_rating: number;
  quality_rating?: number | null;
  reliability_rating?: number | null;
  communication_rating?: number | null;
  payment_rating?: number | null;
  safety_rating?: number | null;
  comment?: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  collaboration?: MockReviewCollaboration;
};

export type MockEscrowTransaction = {
  id: string;
  collaboration_id: string;
  status:
    | 'CREATED'
    | 'DEPOSIT_PENDING'
    | 'HELD'
    | 'RELEASED'
    | 'REFUNDED'
    | 'DISPUTED';
  job_amount: string;
  platform_fee: string;
  referral_commission: string;
  worker_payout: string;
  currency: string;
  deposit_confirmed_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MockCollaboration = {
  id: string;
  worker_id: string;
  employer_id: string;
  initiated_by: 'WORKER' | 'EMPLOYER';
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'REJECTED'
    | 'DISPUTED';
  project_type: string | null;
  site_postcode: string | null;
  agreed_amount: string | null;
  referral_id: string | null;
  job_post_id: string | null;
  flagged: boolean;
  flag_reason: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  worker: MockCollaborationParty;
  employer: MockCollaborationParty;
  reviews: MockReview[];
  escrow_transaction: MockEscrowTransaction | null;
  referral: null;
};

function mockWorkerParty(
  overrides: Partial<MockCollaborationParty> & {
    client_profile?: Partial<MockCollaborationParty['client_profile']>;
  } = {},
): MockCollaborationParty {
  return {
    id: '101',
    rating_avg: '4.8',
    rating_count: 12,
    ...overrides,
    client_profile: {
      id: '101',
      display_name: 'Mike Builder',
      avatar_url: null,
      verification_level: 'BASIC',
      slug: 'mike-builder-abc',
      ...(overrides.client_profile ?? {}),
    },
  };
}

function mockEmployerParty(
  overrides: Partial<MockCollaborationParty> & {
    client_profile?: Partial<MockCollaborationParty['client_profile']>;
  } = {},
): MockCollaborationParty {
  return {
    id: '202',
    rating_avg: '4.6',
    rating_count: 5,
    ...overrides,
    client_profile: {
      id: '202',
      display_name: 'Acme Build',
      avatar_url: null,
      verification_level: 'BASIC',
      slug: 'acme-build-xyz',
      ...(overrides.client_profile ?? {}),
    },
  };
}

export function mockCollaboration(
  overrides: Partial<MockCollaboration> & {
    worker?: Partial<MockCollaborationParty> & {
      client_profile?: Partial<MockCollaborationParty['client_profile']>;
    };
    employer?: Partial<MockCollaborationParty> & {
      client_profile?: Partial<MockCollaborationParty['client_profile']>;
    };
  } = {},
): MockCollaboration {
  const now = new Date().toISOString();
  const status = overrides.status ?? 'PENDING';
  const worker = mockWorkerParty(overrides.worker ?? {});
  const employer = mockEmployerParty(overrides.employer ?? {});
  const { worker: _w, employer: _e, ...rest } = overrides;
  void _w;
  void _e;
  return {
    id: '7000',
    worker_id: worker.id,
    employer_id: employer.id,
    initiated_by: 'EMPLOYER',
    status,
    project_type: 'Kitchen refit',
    site_postcode: 'NW1',
    agreed_amount: '1500.00',
    referral_id: null,
    job_post_id: null,
    flagged: false,
    flag_reason: null,
    confirmed_at:
      ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(status) ? now : null,
    started_at:
      ['IN_PROGRESS', 'COMPLETED'].includes(status) ? now : null,
    ended_at: status === 'COMPLETED' ? now : null,
    created_at: now,
    updated_at: now,
    reviews: [],
    escrow_transaction: null,
    referral: null,
    ...rest,
    worker,
    employer,
  };
}

const ESCROW_DEFAULTS = {
  job_amount: '1000.00',
  platform_fee: '100.00',
  referral_commission: '0.00',
  worker_payout: '900.00',
  currency: 'GBP',
};

export function mockEscrowTransaction(
  overrides: Partial<MockEscrowTransaction> = {},
): MockEscrowTransaction {
  const now = new Date().toISOString();
  const status = overrides.status ?? 'HELD';
  const baseTimestamps = {
    deposit_confirmed_at:
      ['HELD', 'RELEASED', 'REFUNDED', 'DISPUTED'].includes(status) ? now : null,
    released_at: status === 'RELEASED' ? now : null,
    refunded_at: status === 'REFUNDED' ? now : null,
    disputed_at: status === 'DISPUTED' ? now : null,
  };
  return {
    id: '900',
    collaboration_id: '7000',
    status,
    ...ESCROW_DEFAULTS,
    ...baseTimestamps,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export const mockEscrowCreated = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'CREATED', ...overrides });
export const mockEscrowDepositPending = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'DEPOSIT_PENDING', ...overrides });
export const mockEscrowHeld = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'HELD', ...overrides });
export const mockEscrowReleased = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'RELEASED', ...overrides });
export const mockEscrowRefunded = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'REFUNDED', ...overrides });
export const mockEscrowDisputed = (
  overrides: Partial<MockEscrowTransaction> = {},
) => mockEscrowTransaction({ status: 'DISPUTED', ...overrides });

// ── TEST-CHAT-004: Chat mock builders ─────────────────────────────
//
// Shapes mirror the production payloads from
// `backend/src/conversation/conversation.service.ts` (the inbox row,
// `GET /conversations/:id`, and `GET /conversations/:id/messages`) plus
// the new `MessageAttachment` row shipped by the parent feature. Override
// pattern matches the rest of this file.

export type MockMessageAttachment = {
  id: string;
  message_id: string | null;
  uploaded_by_id: string;
  file_url: string | null;
  download_url: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export function mockMessageAttachment(
  overrides: Partial<MockMessageAttachment> = {},
): MockMessageAttachment {
  const id = overrides.id ?? '4001';
  return {
    id,
    message_id: overrides.message_id ?? null,
    uploaded_by_id: overrides.uploaded_by_id ?? '101',
    file_url: overrides.file_url ?? `/uploads/message-attachments/${id}.png`,
    download_url:
      overrides.download_url ?? `/api/message-attachments/${id}/download`,
    original_name: overrides.original_name ?? 'test.png',
    mime_type: overrides.mime_type ?? 'image/png',
    size_bytes: overrides.size_bytes ?? 12_345,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

export type MockChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  attachments: MockMessageAttachment[];
};

export function mockMessage(
  overrides: Partial<MockChatMessage> = {},
): MockChatMessage {
  const now = overrides.created_at ?? new Date().toISOString();
  return {
    id: overrides.id ?? '5001',
    conversation_id: overrides.conversation_id ?? '6001',
    sender_id: overrides.sender_id ?? '101',
    content: overrides.content ?? 'hello',
    message_type: overrides.message_type ?? 'TEXT',
    metadata: overrides.metadata ?? {},
    created_at: now,
    attachments: overrides.attachments ?? [],
  };
}

export type MockOtherParticipant = {
  account_id: string;
  client_profile_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verification_level: string | null;
};

export type MockConversationDetail = {
  id: string;
  collaboration_id: string | null;
  collaboration: {
    id: string;
    status: string;
    worker_id: string;
    employer_id: string;
  } | null;
  participants: Array<{
    account_id: string;
    last_read_at?: string | null;
    account: {
      client_profile?: {
        id?: string;
        display_name?: string | null;
        avatar_url?: string | null;
        verification_level?: string | null;
      } | null;
    };
  }>;
  last_message_at: string | null;
};

export function mockConversation(
  overrides: Partial<MockConversationDetail> = {},
): MockConversationDetail {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? '6001',
    collaboration_id: overrides.collaboration_id ?? null,
    collaboration: overrides.collaboration ?? null,
    participants:
      overrides.participants ?? [
        {
          account_id: '101',
          last_read_at: null,
          account: {
            client_profile: {
              id: '101',
              display_name: 'Mike Builder',
              avatar_url: null,
              verification_level: 'BASIC',
            },
          },
        },
        {
          account_id: '202',
          last_read_at: null,
          account: {
            client_profile: {
              id: '202',
              display_name: 'Acme Build',
              avatar_url: null,
              verification_level: 'BASIC',
            },
          },
        },
      ],
    last_message_at: overrides.last_message_at ?? now,
  };
}

export type MockInboxItem = {
  conversation: {
    id: string;
    collaboration_id: string | null;
    last_message_at: string | null;
    created_at: string;
  };
  collaboration: {
    id: string;
    status: string;
    worker_id: string;
    employer_id: string;
  } | null;
  other_participant: MockOtherParticipant | null;
  last_message: MockChatMessage | null;
  unread_count: number;
};

export function mockInboxItem(
  overrides: Partial<MockInboxItem> = {},
): MockInboxItem {
  const now = overrides.conversation?.last_message_at ?? new Date().toISOString();
  return {
    conversation: {
      id: overrides.conversation?.id ?? '6001',
      collaboration_id: overrides.conversation?.collaboration_id ?? null,
      last_message_at: now,
      created_at: overrides.conversation?.created_at ?? now,
    },
    collaboration: overrides.collaboration ?? null,
    other_participant:
      overrides.other_participant ?? {
        account_id: '202',
        client_profile_id: '202',
        display_name: 'Acme Build',
        avatar_url: null,
        verification_level: 'BASIC',
      },
    last_message:
      overrides.last_message === undefined
        ? mockMessage({ conversation_id: overrides.conversation?.id ?? '6001' })
        : overrides.last_message,
    unread_count: overrides.unread_count ?? 0,
  };
}

// ── TEST-REVIEW-003: Reviews factory shapes ─────────────────────
//
// Match the backend `Review` row + the paginated envelope returned by the
// six existing endpoints plus the new `GET /reviews/unpublished`. Ids
// stringify so component code (which uses `String(review.id)` keys) lines
// up with the bigint serialisation interceptor on the wire. Type
// declarations live alongside `MockCollaboration` above; this block only
// adds the construction helpers.

export function mockReview(
  overrides: Partial<MockReview> & {
    collaboration?: Partial<MockReviewCollaboration>;
  } = {},
): MockReview {
  const now = new Date().toISOString();
  const isPublished = overrides.is_published ?? true;
  const { collaboration: collabOverrides, ...rest } = overrides;
  const collaboration: MockReviewCollaboration = {
    id: '7000',
    worker_id: '300',
    employer_id: '400',
    project_type: 'Kitchen refit',
    started_at: now,
    ended_at: now,
    status: 'COMPLETED',
    ...collabOverrides,
  };
  return {
    id: '500',
    collaboration_id: collaboration.id,
    reviewer_role: 'EMPLOYER',
    overall_rating: 5,
    quality_rating: null,
    reliability_rating: null,
    communication_rating: null,
    payment_rating: null,
    safety_rating: null,
    comment: 'Great work, would hire again.',
    is_published: isPublished,
    published_at: isPublished ? now : null,
    created_at: now,
    ...rest,
    collaboration,
  };
}

export function mockReviewDraft(
  overrides: Partial<MockReview> & {
    collaboration?: Partial<MockReviewCollaboration>;
  } = {},
): MockReview {
  return mockReview({
    is_published: false,
    published_at: null,
    ...overrides,
  });
}

export function mockReviewListResponse(
  items: MockReview[],
  overrides: { total?: number; page?: number; limit?: number } = {},
) {
  const limit = overrides.limit ?? 10;
  const total = overrides.total ?? items.length;
  return {
    items,
    total,
    page: overrides.page ?? 1,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
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
