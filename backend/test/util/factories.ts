// TEST-AUTH-130 / TEST-AUTH-132: typed factories for Account / StaffMember /
// RefreshToken. Helpers that commit (`seed*`) write the row through Prisma;
// helpers without `seed` build object literals only (used by unit specs that
// run against a deep-mocked Prisma).
//
// Passwords used here are deliberately distinct from the production seed
// (`Password123!`) so a leaked test secret cannot match a real seed account.

import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service';

export const TEST_PASSWORD = 'TestPass1!aZ#';
export const TEST_PASSWORD_ALT = 'AltTestPass2@bY';
export const TEST_BCRYPT_ROUNDS = 4; // keep tests fast

export type AccountStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'ACTIVE'
  | 'DEACTIVATED';

export type Role = 'WORKER' | 'EMPLOYER';

let counter = 0;
function nextId(): bigint {
  counter += 1;
  return BigInt(counter);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}+${crypto.randomBytes(4).toString('hex')}@test.local`;
}

// ── Object-shape factories (no DB writes) ────────────────────────

export function makeAccount(
  overrides: {
    id?: bigint;
    email?: string;
    status?: AccountStatus;
    password_hash?: string | null;
    google_id?: string | null;
    email_verified_at?: Date | null;
    last_login_at?: Date | null;
    phone?: string | null;
  } = {},
) {
  const id = overrides.id ?? nextId();
  return {
    id,
    email: overrides.email ?? uniqueEmail('user'),
    password_hash: overrides.password_hash ?? 'bcrypt$placeholder',
    google_id: overrides.google_id ?? null,
    phone: overrides.phone ?? null,
    phone_verified: false,
    status: overrides.status ?? 'ACTIVE',
    email_verified_at:
      overrides.email_verified_at ??
      (overrides.status === 'PENDING_EMAIL_VERIFICATION' ? null : new Date()),
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: overrides.last_login_at ?? null,
  };
}

export function makeStaff(
  overrides: {
    id?: bigint;
    display_name?: string;
    staff_role?: 'ADMIN' | 'MODERATOR';
    invite_expires_at?: Date | null;
  } = {},
) {
  return {
    id: overrides.id ?? nextId(),
    display_name: overrides.display_name ?? 'Test Staff',
    staff_role: overrides.staff_role ?? 'ADMIN',
    invite_expires_at: overrides.invite_expires_at ?? null,
    created_at: new Date(),
  };
}

export function makeRefreshToken(overrides: {
  id?: bigint;
  account_id: bigint;
  token?: string;
  expires_at?: Date;
}) {
  return {
    id: overrides.id ?? nextId(),
    account_id: overrides.account_id,
    token:
      overrides.token ?? `refresh_${crypto.randomBytes(8).toString('hex')}`,
    expires_at:
      overrides.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
  };
}

// ── DB-committing helpers (used by *.e2e-spec.ts) ────────────────

export type SeededAccount = {
  id: bigint;
  email: string;
  password: string;
  status: AccountStatus;
  isWorker: boolean;
  isEmployer: boolean;
  isStaff: boolean;
};

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
}

function slug(displayName: string): string {
  return `${displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function seedActiveWorker(
  prisma: PrismaService,
  overrides: {
    email?: string;
    password?: string;
    displayName?: string;
  } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('worker');
  const password = overrides.password ?? TEST_PASSWORD;
  const displayName = overrides.displayName ?? 'Test Worker';
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'ACTIVE',
      email_verified_at: new Date(),
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          worker_profile: { create: {} },
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'ACTIVE',
    isWorker: true,
    isEmployer: false,
    isStaff: false,
  };
}

export async function seedActiveEmployer(
  prisma: PrismaService,
  overrides: {
    email?: string;
    password?: string;
    displayName?: string;
    companyName?: string;
  } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('employer');
  const password = overrides.password ?? TEST_PASSWORD;
  const displayName =
    overrides.displayName ?? overrides.companyName ?? 'Test Co';
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'ACTIVE',
      email_verified_at: new Date(),
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          employer_profile: {
            create: { company_name: overrides.companyName ?? displayName },
          },
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'ACTIVE',
    isWorker: false,
    isEmployer: true,
    isStaff: false,
  };
}

export async function seedPendingWorker(
  prisma: PrismaService,
  overrides: { email?: string; password?: string } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('pending-worker');
  const password = overrides.password ?? TEST_PASSWORD;
  const displayName = 'Pending Worker';
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'PENDING_EMAIL_VERIFICATION',
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          worker_profile: { create: {} },
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'PENDING_EMAIL_VERIFICATION',
    isWorker: true,
    isEmployer: false,
    isStaff: false,
  };
}

export async function seedPendingEmployer(
  prisma: PrismaService,
  overrides: { email?: string; password?: string } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('pending-employer');
  const password = overrides.password ?? TEST_PASSWORD;
  const displayName = 'Pending Employer Co';
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'PENDING_EMAIL_VERIFICATION',
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          employer_profile: { create: { company_name: displayName } },
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'PENDING_EMAIL_VERIFICATION',
    isWorker: false,
    isEmployer: true,
    isStaff: false,
  };
}

export async function seedDeactivatedWorker(
  prisma: PrismaService,
): Promise<SeededAccount> {
  const email = uniqueEmail('deactivated-worker');
  const password = TEST_PASSWORD;
  const displayName = 'Deactivated Worker';
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'DEACTIVATED',
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          worker_profile: { create: {} },
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'DEACTIVATED',
    isWorker: true,
    isEmployer: false,
    isStaff: false,
  };
}

export async function seedAdmin(
  prisma: PrismaService,
  overrides: {
    email?: string;
    password?: string;
    displayName?: string;
    inviteExpiresAt?: Date | null;
    lastLoginAt?: Date | null;
  } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('admin');
  const password = overrides.password ?? TEST_PASSWORD;
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'ACTIVE',
      email_verified_at: new Date(),
      last_login_at: overrides.lastLoginAt ?? new Date(),
      staff_member: {
        create: {
          display_name: overrides.displayName ?? 'Test Admin',
          staff_role: 'ADMIN',
          invite_expires_at: overrides.inviteExpiresAt ?? null,
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'ACTIVE',
    isWorker: false,
    isEmployer: false,
    isStaff: true,
  };
}

export async function seedModerator(
  prisma: PrismaService,
  overrides: { email?: string; password?: string } = {},
): Promise<SeededAccount> {
  const email = overrides.email ?? uniqueEmail('mod');
  const password = overrides.password ?? TEST_PASSWORD;
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(password),
      status: 'ACTIVE',
      email_verified_at: new Date(),
      last_login_at: new Date(),
      staff_member: {
        create: {
          display_name: 'Test Mod',
          staff_role: 'MODERATOR',
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password,
    status: 'ACTIVE',
    isWorker: false,
    isEmployer: false,
    isStaff: true,
  };
}

/**
 * Seeds a never-signed-in staff member with an active 24h invite. Used by
 * staff-lifecycle tests for AUTH-018-002 / AUTH-018-007.
 */
export async function seedFreshStaffInvite(
  prisma: PrismaService,
  overrides: {
    email?: string;
    initialPassword?: string;
    expiresInMs?: number;
    role?: 'ADMIN' | 'MODERATOR';
  } = {},
): Promise<SeededAccount & { initialPassword: string; inviteExpiresAt: Date }> {
  const email = overrides.email ?? uniqueEmail('staff-invite');
  const initialPassword = overrides.initialPassword ?? TEST_PASSWORD;
  const inviteExpiresAt = new Date(
    Date.now() + (overrides.expiresInMs ?? 24 * 60 * 60 * 1000),
  );
  const account = await prisma.account.create({
    data: {
      email,
      password_hash: await hash(initialPassword),
      status: 'ACTIVE',
      email_verified_at: new Date(),
      // last_login_at deliberately null — invite has not been used.
      staff_member: {
        create: {
          display_name: 'Fresh Staff',
          staff_role: overrides.role ?? 'MODERATOR',
          invite_expires_at: inviteExpiresAt,
        },
      },
    },
  });
  return {
    id: account.id,
    email: account.email,
    password: initialPassword,
    initialPassword,
    inviteExpiresAt,
    status: 'ACTIVE',
    isWorker: false,
    isEmployer: false,
    isStaff: true,
  };
}

// ── TEST-PROF-160: Profiles factory extensions ───────────────────
//
// Each helper commits the rows the e2e specs need and returns the IDs the
// tests will assert against.  Names follow the spec:
//   - seedWorkerWithPortfolio
//   - seedWorkerWithApprovedDocuments
//   - seedEmployer
//   - seedDeactivatedAccount
// plus a Prisma-direct `approveDocument()` helper required by the
// Decisions Log 2026-05-03 row (Open Question (b)) — until Verification
// ships its admin endpoint, the Profiles e2e tests flip a doc to APPROVED
// directly.

export type SeededWorkerWithPortfolio = SeededAccount & {
  workerId: bigint;
  portfolioItemId: bigint;
};

export async function seedWorkerWithPortfolio(
  prisma: PrismaService,
  overrides: { itemType?: 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION' } = {},
): Promise<SeededWorkerWithPortfolio> {
  const account = await seedActiveWorker(prisma);
  const item = await prisma.portfolioItem.create({
    data: {
      worker_id: account.id,
      item_type: overrides.itemType ?? 'PROJECT',
      title: 'Loft conversion',
      description: 'Two-bed loft, full electrics + plumbing.',
    },
  });
  if (item.item_type === 'PROJECT') {
    await prisma.projectDetail.create({
      data: { id: item.id, project_type: 'Conversion' },
    });
  } else if (item.item_type === 'EXPERIENCE') {
    await prisma.experienceDetail.create({
      data: { id: item.id, role: 'Lead carpenter' },
    });
  } else if (item.item_type === 'CERTIFICATION') {
    await prisma.certificationDetail.create({
      data: { id: item.id, cert_type: 'CSCS' },
    });
  }
  return { ...account, workerId: account.id, portfolioItemId: item.id };
}

export type SeededWorkerWithDocs = SeededAccount & {
  documentIds: bigint[];
};

export async function seedWorkerWithApprovedDocuments(
  prisma: PrismaService,
  count = 1,
): Promise<SeededWorkerWithDocs> {
  const account = await seedActiveWorker(prisma);
  const ids: bigint[] = [];
  for (let i = 0; i < count; i += 1) {
    const doc = await prisma.document.create({
      data: {
        client_profile_id: account.id,
        doc_type: 'CSCS_CARD',
        file_url: `/uploads/seed-${account.id}-${i}.pdf`,
        status: 'APPROVED',
        reviewed_at: new Date(),
      },
    });
    ids.push(doc.id);
  }
  return { ...account, documentIds: ids };
}

export async function seedEmployer(
  prisma: PrismaService,
  overrides: { companyName?: string } = {},
): Promise<SeededAccount> {
  return seedActiveEmployer(prisma, overrides);
}

export async function seedDeactivatedAccount(
  prisma: PrismaService,
): Promise<SeededAccount> {
  return seedDeactivatedWorker(prisma);
}

/**
 * Prisma-direct admin helper: flip a document straight to APPROVED.  Used by
 * the Profiles e2e suite for E2E-1 / E2E-2 where the user needs to see the
 * downstream verification effect of an approval but Verification's staff
 * admin endpoint isn't sealed yet (Decisions Log 2026-05-03 row 2).
 *
 * IMPORTANT: this bypasses Verification's promotion engine.  Tests must
 * assert only the *Profiles-side surface* — they must not assume ladder
 * promotion has fired as a side effect.
 */
export async function approveDocumentDirect(
  prisma: PrismaService,
  documentId: bigint,
): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'APPROVED', reviewed_at: new Date() },
  });
}

// ── TEST-JOBS-002: Jobs & Applications factory extensions ──────────
//
// `seedJobPost` / `seedJobApplication` commit through Prisma and return the
// row with the same `include` shape the production service returns. The
// catalog helpers (`seedSpecialisation` / `seedTag`) use upserts on the
// auto-generated slug so e2e specs can opt into a deterministic catalog
// without colliding with the dev seed (which `seed.ts` populates the same
// way) when both run against a freshly migrated container.

const jobPostInclude = {
  employer: { include: { client_profile: true } },
  specialisations: { include: { specialisation: true } },
  tags: { include: { tag: true } },
  _count: { select: { applications: true } },
} as const;

const jobApplicationInclude = {
  job_post: { include: { employer: { include: { client_profile: true } } } },
  worker_profile: { include: { client_profile: true } },
} as const;

function specSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function seedSpecialisation(
  prisma: PrismaService,
  name: string,
): Promise<{ id: number; name: string; slug: string }> {
  const slug = specSlug(name);
  const row = await prisma.specialisation.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
  return { id: row.id, name: row.name, slug: row.slug };
}

export async function seedTag(
  prisma: PrismaService,
  name: string,
): Promise<{ id: number; name: string; slug: string }> {
  const slug = specSlug(name);
  const row = await prisma.tag.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
  return { id: row.id, name: row.name, slug: row.slug };
}

export type SeedJobPostOpts = {
  employerId: bigint;
  title?: string;
  description?: string | null;
  status?: 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED';
  isUrgent?: boolean;
  payType?: 'DAY_RATE' | 'FIXED_PRICE';
  dayRateMin?: number | null;
  dayRateMax?: number | null;
  fixedPrice?: number | null;
  postcodeArea?: string | null;
  siteAddress?: string | null;
  durationDays?: number | null;
  startDate?: Date | null;
  expiresAt?: Date | null;
  specialisationIds?: number[];
  tagIds?: number[];
};

export async function seedJobPost(
  prisma: PrismaService,
  opts: SeedJobPostOpts,
) {
  const payType = opts.payType ?? 'DAY_RATE';
  // Lazy require to avoid a hard import on `@prisma/client` at module load,
  // matching the pattern used elsewhere in this file.

  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  return prisma.jobPost.create({
    data: {
      employer_id: opts.employerId,
      title: opts.title ?? 'Test job',
      description: opts.description ?? null,
      postcode_area: opts.postcodeArea ?? null,
      site_address: opts.siteAddress ?? null,
      pay_type: payType,
      day_rate_min:
        opts.dayRateMin != null ? new Prisma.Decimal(opts.dayRateMin) : null,
      day_rate_max:
        opts.dayRateMax != null ? new Prisma.Decimal(opts.dayRateMax) : null,
      fixed_price:
        opts.fixedPrice != null ? new Prisma.Decimal(opts.fixedPrice) : null,
      duration_days: opts.durationDays ?? null,
      start_date: opts.startDate ?? null,
      status: opts.status ?? 'OPEN',
      is_urgent: opts.isUrgent ?? false,
      expires_at: opts.expiresAt ?? null,
      specialisations: {
        create:
          opts.specialisationIds?.map((id) => ({ specialisation_id: id })) ??
          [],
      },
      tags: {
        create: opts.tagIds?.map((id) => ({ tag_id: id })) ?? [],
      },
    },
    include: jobPostInclude,
  });
}

export type SeedJobApplicationOpts = {
  jobPostId: bigint;
  workerId: bigint;
  initiatedBy?: 'WORKER' | 'EMPLOYER';
  status?:
    | 'PENDING'
    | 'REVIEWED'
    | 'SHORTLISTED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'WITHDRAWN';
  coverMessage?: string | null;
  proposedRate?: number | null;
};

export async function seedJobApplication(
  prisma: PrismaService,
  opts: SeedJobApplicationOpts,
) {
  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  // Upsert on the unique pair so callers can use this idempotently in
  // re-apply tests without dealing with the constraint at this layer.
  return prisma.jobApplication.upsert({
    where: {
      job_post_id_worker_id: {
        job_post_id: opts.jobPostId,
        worker_id: opts.workerId,
      },
    },
    update: {
      status: opts.status ?? 'PENDING',
      cover_message: opts.coverMessage ?? null,
      proposed_rate:
        opts.proposedRate != null
          ? new Prisma.Decimal(opts.proposedRate)
          : null,
    },
    create: {
      job_post_id: opts.jobPostId,
      worker_id: opts.workerId,
      initiated_by: opts.initiatedBy ?? 'WORKER',
      status: opts.status ?? 'PENDING',
      cover_message: opts.coverMessage ?? null,
      proposed_rate:
        opts.proposedRate != null
          ? new Prisma.Decimal(opts.proposedRate)
          : null,
    },
    include: jobApplicationInclude,
  });
}

// ── TEST-VER-002: Verification factory extensions ─────────────────
//
// `seedVerifiedWorker` / `seedVerifiedEmployer` commit a worker/employer
// already at BASIC with the IDENTITY_VERIFIED milestone seeded so e2e specs
// can skip the Stripe round-trip. `seedDocumentForReview` and
// `seedOnDutyStaff` cover the staff-decision and assignment surfaces.
// `seedMilestone` is the "bypass-the-engine" helper for read-projection
// tests — it writes the milestone directly so we can assert
// `getPublicLevel` flag mapping without re-running the promotion chain.

export async function seedVerifiedWorker(
  prisma: PrismaService,
  overrides: { email?: string; password?: string; displayName?: string } = {},
): Promise<SeededAccount & { milestoneId: bigint }> {
  const account = await seedActiveWorker(prisma, overrides);
  await prisma.clientProfile.update({
    where: { id: account.id },
    data: { verification_level: 'BASIC' },
  });
  const milestone = await prisma.verificationMilestone.create({
    data: {
      client_profile_id: account.id,
      milestone_type: 'IDENTITY_VERIFIED',
      evidence_ref: `vs_seed_${crypto.randomBytes(4).toString('hex')}`,
    },
  });
  return { ...account, milestoneId: milestone.id };
}

export async function seedVerifiedEmployer(
  prisma: PrismaService,
  overrides: {
    email?: string;
    password?: string;
    displayName?: string;
    companyName?: string;
    companyNumber?: string;
  } = {},
): Promise<SeededAccount & { milestoneId: bigint }> {
  const account = await seedActiveEmployer(prisma, {
    email: overrides.email,
    password: overrides.password,
    displayName: overrides.displayName,
    companyName: overrides.companyName ?? 'Acme Limited',
  });
  await prisma.clientProfile.update({
    where: { id: account.id },
    data: { verification_level: 'BASIC' },
  });
  await prisma.employerProfile.update({
    where: { id: account.id },
    data: {
      company_name: overrides.companyName ?? 'Acme Limited',
      company_number: overrides.companyNumber ?? '12345678',
    },
  });
  const milestone = await prisma.verificationMilestone.create({
    data: {
      client_profile_id: account.id,
      milestone_type: 'IDENTITY_VERIFIED',
      evidence_ref: `vs_seed_${crypto.randomBytes(4).toString('hex')}`,
    },
  });
  return { ...account, milestoneId: milestone.id };
}

export type SeedDocumentOpts = {
  ownerId: bigint;
  docType: string;
  status?: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  assignedTo?: bigint | null;
  metadata?: Record<string, unknown> | null;
  rejectionReason?: string | null;
  fileUrl?: string;
};

export async function seedDocumentForReview(
  prisma: PrismaService,
  opts: SeedDocumentOpts,
): Promise<{ id: bigint; doc_type: string; status: string }> {
  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  const doc = await prisma.document.create({
    data: {
      client_profile: { connect: { id: opts.ownerId } },
      doc_type: opts.docType,
      file_url:
        opts.fileUrl ??
        `/uploads/seed-${opts.ownerId}-${crypto.randomBytes(3).toString('hex')}.pdf`,
      status: opts.status ?? 'PENDING',
      ...(opts.assignedTo != null
        ? { assignee: { connect: { id: opts.assignedTo } } }
        : {}),
      ...(opts.rejectionReason != null
        ? { rejection_reason: opts.rejectionReason }
        : {}),
      metadata:
        opts.metadata != null
          ? (opts.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    },
  });
  return { id: doc.id, doc_type: doc.doc_type, status: doc.status };
}

export async function seedOnDutyStaff(
  prisma: PrismaService,
  opts: {
    role?: 'ADMIN' | 'MODERATOR';
    isOnDuty?: boolean;
    assignedDocCount?: number;
    email?: string;
    password?: string;
    displayName?: string;
  } = {},
): Promise<SeededAccount & { staffId: bigint }> {
  const role = opts.role ?? 'MODERATOR';
  const seed =
    role === 'ADMIN'
      ? await seedAdmin(prisma, {
          email: opts.email,
          password: opts.password,
          displayName: opts.displayName,
        })
      : await seedModerator(prisma, {
          email: opts.email,
          password: opts.password,
        });

  await prisma.staffMember.update({
    where: { id: seed.id },
    data: { is_on_duty: opts.isOnDuty ?? true },
  });

  if (opts.assignedDocCount) {
    // Create N owner accounts to host the assigned documents — they need
    // ClientProfiles to satisfy the FK on document.client_profile_id.
    for (let i = 0; i < opts.assignedDocCount; i += 1) {
      const owner = await seedActiveWorker(prisma);
      await prisma.document.create({
        data: {
          client_profile_id: owner.id,
          doc_type: 'CSCS_CARD',
          file_url: `/uploads/preassigned-${seed.id}-${i}.pdf`,
          status: 'PENDING',
          assigned_to: seed.id,
        },
      });
    }
  }

  return { ...seed, staffId: seed.id };
}

export async function seedMilestone(
  prisma: PrismaService,
  opts: {
    clientProfileId: bigint;
    type: string;
    evidenceRef?: string | null;
    staffMemberId?: bigint | null;
    notes?: string | null;
  },
): Promise<{ id: bigint }> {
  const data: Record<string, unknown> = {
    client_profile_id: opts.clientProfileId,
    milestone_type: opts.type,
  };
  if (opts.evidenceRef != null) data.evidence_ref = opts.evidenceRef;
  if (opts.notes != null) data.notes = opts.notes;
  if (opts.staffMemberId != null) data.staff_member_id = opts.staffMemberId;
  const m = await prisma.verificationMilestone.create({
    data: data as Parameters<typeof prisma.verificationMilestone.create>[0]['data'],
  });
  return { id: m.id };
}

/** For unit tests of the Google flow — Google-only account, no password set. */
export async function seedGoogleOnlyAccount(
  prisma: PrismaService,
  overrides: { email?: string; googleId?: string } = {},
): Promise<{ id: bigint; email: string; googleId: string }> {
  const email = overrides.email ?? uniqueEmail('google');
  const googleId =
    overrides.googleId ?? `gid_${crypto.randomBytes(6).toString('hex')}`;
  const displayName = 'Google User';
  const account = await prisma.account.create({
    data: {
      email,
      google_id: googleId,
      status: 'ACTIVE',
      email_verified_at: new Date(),
      client_profile: {
        create: {
          display_name: displayName,
          slug: slug(displayName),
          worker_profile: { create: {} },
        },
      },
    },
  });
  return { id: account.id, email: account.email, googleId };
}
