// TEST-AUTH-130 / TEST-AUTH-132: typed factories for Account / StaffMember /
// RefreshToken. Helpers that commit (`seed*`) write the row through Prisma;
// helpers without `seed` build object literals only (used by unit specs that
// run against a deep-mocked Prisma).
//
// Passwords used here are deliberately distinct from the production seed
// (`Password123!`) so a leaked test secret cannot match a real seed account.

import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { generateReferralCode } from '../../src/referral/referral.constants';

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
    referral_code: generateReferralCode(),
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
          referral_code: generateReferralCode(),
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
          referral_code: generateReferralCode(),
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
          referral_code: generateReferralCode(),
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
          referral_code: generateReferralCode(),
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
          referral_code: generateReferralCode(),
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
    data: data as Parameters<
      typeof prisma.verificationMilestone.create
    >[0]['data'],
  });
  return { id: m.id };
}

// ── TEST-COLLAB-002: Collaborations factory extensions ────────────
//
// `seedCollaboration` and `seedEscrowTransaction` commit through Prisma so
// the e2e specs can drive the lifecycle endpoints against real rows. The
// include shape mirrors `collaborationInclude` in
// `backend/src/collaboration/collaboration.service.ts` so callers can read
// the same payload the controller would return.

const collaborationInclude = {
  worker: { include: { client_profile: true } },
  employer: { include: { client_profile: true } },
  contracts: { orderBy: { position: 'asc' } },
  conversation: { select: { id: true } },
} as const;

export type SeedCollaborationOpts = {
  workerId: bigint;
  employerId: bigint;
  initiatedBy?: 'WORKER' | 'EMPLOYER';
  status?:
    | 'PENDING'
    | 'CONFIRMED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'REJECTED'
    | 'DISPUTED';
  projectType?: string | null;
  sitePostcode?: string | null;
  agreedAmount?: number | string | null;
  referralId?: bigint | null;
  jobPostId?: bigint | null;
  flagged?: boolean;
  flagReason?: string | null;
  confirmedAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
};

/**
 * Seeds a collaboration row with the include shape the controller returns.
 * Auto-populates the relevant lifecycle timestamps based on `status` so a
 * caller asking for `status: 'IN_PROGRESS'` gets a row with `confirmed_at`
 * and `started_at` set, mirroring how `updateStatus` would have produced it.
 */
export async function seedCollaboration(
  prisma: PrismaService,
  opts: SeedCollaborationOpts,
) {
  // Prisma typings imported but not used here post-refactor; collab is now
  // relationship-only and lifecycle fields moved to Contract.
  const status = opts.status ?? 'PENDING';
  const now = new Date();
  const confirmedAt =
    opts.confirmedAt ??
    (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(status) ? now : null);
  const startedAt =
    opts.startedAt ??
    (['IN_PROGRESS', 'COMPLETED'].includes(status) ? now : null);
  const endedAt = opts.endedAt ?? (status === 'COMPLETED' ? now : null);

  // Post-CR-003 refactor: Collaboration is relationship-only. The lifecycle
  // fields (status, agreed_amount, etc) live on Contract now. Tests that
  // need contract-level state should call seedContract() against the
  // returned collab id.
  void status;
  void confirmedAt;
  void startedAt;
  void endedAt;
  return prisma.collaboration.create({
    data: {
      worker_id: opts.workerId,
      employer_id: opts.employerId,
      first_contracted_at: opts.confirmedAt ?? opts.startedAt ?? null,
    },
    include: collaborationInclude,
  });
}

export type SeedEscrowOpts = {
  /** @deprecated post-CR-006 — use contractId instead. Resolves to first contract. */
  collaborationId?: bigint;
  contractId?: bigint;
  status?:
    | 'CREATED'
    | 'DEPOSIT_PENDING'
    | 'HELD'
    | 'RELEASED'
    | 'REFUNDED'
    | 'DISPUTED';
  jobAmount?: number | string;
  platformFee?: number | string;
  referralCommission?: number | string;
  workerPayout?: number | string;
  currency?: string;
  depositConfirmedAt?: Date | null;
  releasedAt?: Date | null;
  refundedAt?: Date | null;
  disputedAt?: Date | null;
};

/**
 * Minimal escrow seed for tests-escrow/ harness use only.
 */
export async function seedEscrowTransaction(
  prisma: PrismaService,
  opts: SeedEscrowOpts,
) {
  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  const status = opts.status ?? 'HELD';
  const jobAmount = new Prisma.Decimal(opts.jobAmount ?? 1000);
  const platformFee = new Prisma.Decimal(opts.platformFee ?? 100);
  const referralCommission = new Prisma.Decimal(opts.referralCommission ?? 0);
  const workerPayout = new Prisma.Decimal(
    opts.workerPayout ??
      Number(jobAmount) - Number(platformFee) - Number(referralCommission),
  );

  let contractId = opts.contractId;
  if (!contractId && opts.collaborationId) {
    const c = await prisma.contract.findFirst({
      where: { collaboration_id: opts.collaborationId },
      orderBy: { position: 'asc' },
    });
    if (!c) {
      throw new Error(
        'seedEscrowTransaction: no contract under collaboration; pass contractId or seed a contract first',
      );
    }
    contractId = c.id;
  }
  if (!contractId) {
    throw new Error('seedEscrowTransaction: contractId is required');
  }

  // Post-2026-05 there is no `escrow_transaction` table — the escrow of a
  // contract is its milestones. Seed a single milestone instead, mapping the
  // legacy escrow status onto the milestone state machine.
  void platformFee;
  void referralCommission;
  void workerPayout;
  const STATUS_MAP: Record<string, string> = {
    CREATED: 'PENDING',
    DEPOSIT_PENDING: 'PENDING',
    HELD: 'FUNDED',
    RELEASED: 'RELEASED',
    REFUNDED: 'REFUNDED',
    DISPUTED: 'DISPUTED',
  };
  return prisma.escrowMilestone.create({
    data: {
      contract_id: contractId,
      position: 1,
      title: 'Seed milestone',
      amount: jobAmount,
      status: STATUS_MAP[status] ?? 'FUNDED',
      released_at:
        opts.releasedAt ?? (status === 'RELEASED' ? new Date() : null),
      refunded_at:
        opts.refundedAt ?? (status === 'REFUNDED' ? new Date() : null),
      disputed_at:
        opts.disputedAt ?? (status === 'DISPUTED' ? new Date() : null),
    },
  });
}

// ── TEST-REVIEW-002: Reviews factory extension ───────────────────
//
// `seedReview` commits through Prisma so the review e2e specs can exercise
// the listing / publish endpoints against real rows. When `isPublished:
// true`, mirrors the recalculation the production `publish()` path runs
// (`backend/src/review/review.service.ts:171-234`) by updating the affected
// `WorkerProfile.rating_avg / rating_count` or `EmployerProfile.*`. Mirrors
// the math so the seed step does not depend on importing the service.

export type SeedReviewOpts = {
  collaborationId: bigint;
  reviewerRole: 'WORKER' | 'EMPLOYER';
  overallRating?: number;
  qualityRating?: number | null;
  reliabilityRating?: number | null;
  communicationRating?: number | null;
  paymentRating?: number | null;
  safetyRating?: number | null;
  comment?: string | null;
  isPublished?: boolean;
  publishedAt?: Date | null;
  createdAt?: Date | null;
};

/**
 * Find-or-create an ENDED contract under a collaboration. Post-CR-008 a
 * review is scoped to a Contract and can only exist for an ENDED one.
 */
export async function seedEndedContract(
  prisma: PrismaService,
  opts: { collaborationId: bigint },
) {
  const existing = await prisma.contract.findFirst({
    where: { collaboration_id: opts.collaborationId, status: 'ENDED' },
    orderBy: { position: 'desc' },
  });
  if (existing) return existing;
  const last = await prisma.contract.findFirst({
    where: { collaboration_id: opts.collaborationId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return prisma.contract.create({
    data: {
      collaboration_id: opts.collaborationId,
      position: (last?.position ?? 0) + 1,
      status: 'ENDED',
      end_reason: 'COMPLETED',
      initiated_by: 'EMPLOYER',
      started_at: new Date(),
      ended_at: new Date(),
    },
  });
}

export async function seedReview(prisma: PrismaService, opts: SeedReviewOpts) {
  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  const isPublished = opts.isPublished ?? false;
  const publishedAt = opts.publishedAt ?? (isPublished ? new Date() : null);

  // Reviews hang off a Contract now — ensure an ENDED contract exists.
  const contract = await seedEndedContract(prisma, {
    collaborationId: opts.collaborationId,
  });

  const data: Record<string, unknown> = {
    contract_id: contract.id,
    reviewer_role: opts.reviewerRole,
    overall_rating: opts.overallRating ?? 5,
    quality_rating: opts.qualityRating ?? null,
    reliability_rating: opts.reliabilityRating ?? null,
    communication_rating: opts.communicationRating ?? null,
    payment_rating: opts.paymentRating ?? null,
    safety_rating: opts.safetyRating ?? null,
    comment: opts.comment ?? null,
    is_published: isPublished,
    published_at: publishedAt,
  };
  if (opts.createdAt) data.created_at = opts.createdAt;

  const review = await prisma.review.create({
    data: data as Parameters<typeof prisma.review.create>[0]['data'],
  });

  if (isPublished) {
    // Mirror `recalculateRatings()` so the seeded rating aggregates match
    // what production would produce after a `publish()` call.
    const collab = await prisma.collaboration.findUniqueOrThrow({
      where: { id: opts.collaborationId },
    });
    if (opts.reviewerRole === 'EMPLOYER') {
      const workerId = collab.worker_id;
      const [agg, count] = await Promise.all([
        prisma.review.aggregate({
          where: {
            is_published: true,
            reviewer_role: 'EMPLOYER',
            contract: { collaboration: { worker_id: workerId } },
          },
          _avg: { overall_rating: true },
        }),
        prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'EMPLOYER',
            contract: { collaboration: { worker_id: workerId } },
          },
        }),
      ]);
      await prisma.workerProfile.update({
        where: { id: workerId },
        data: {
          rating_avg: new Prisma.Decimal(agg._avg?.overall_rating ?? 0),
          rating_count: count,
        },
      });
    } else {
      const employerId = collab.employer_id;
      const [agg, count] = await Promise.all([
        prisma.review.aggregate({
          where: {
            is_published: true,
            reviewer_role: 'WORKER',
            contract: { collaboration: { employer_id: employerId } },
          },
          _avg: { overall_rating: true },
        }),
        prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'WORKER',
            contract: { collaboration: { employer_id: employerId } },
          },
        }),
      ]);
      await prisma.employerProfile.update({
        where: { id: employerId },
        data: {
          rating_avg: new Prisma.Decimal(agg._avg?.overall_rating ?? 0),
          rating_count: count,
        },
      });
    }
  }

  return review;
}

// ── TEST-CHAT-003: Chat factory extensions ────────────────────────
//
// `seedConversation` / `seedMessage` / `seedMessageAttachment` commit
// through Prisma so the e2e specs can drive the conversation REST + WS
// surface against real rows. Names mirror the factory naming used by
// the Profiles / Jobs / Collaborations specs.

export type SeedConversationOpts = {
  /** Two accounts for direct / collab-bound chat. Group chat is out of scope. */
  participantAccountIds: bigint[];
  collaborationId?: bigint | null;
  lastMessageAt?: Date | null;
};

export async function seedConversation(
  prisma: PrismaService,
  opts: SeedConversationOpts,
) {
  if (opts.participantAccountIds.length !== 2) {
    throw new Error(
      'seedConversation: exactly two participants required (group chat is out of scope)',
    );
  }
  // Post-2026-05 a conversation is a strict 1:1 with a collaboration and
  // shares its primary key — there is no participant table. The caller must
  // supply the collaboration id; the participants are its worker + employer.
  if (opts.collaborationId == null) {
    throw new Error(
      'seedConversation: collaborationId is required (conversation shares the collaboration PK)',
    );
  }
  return prisma.conversation.create({
    data: {
      id: opts.collaborationId,
      last_message_at: opts.lastMessageAt ?? null,
    },
  });
}

export type SeedMessageOpts = {
  conversationId: bigint;
  senderId: bigint;
  content?: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
};

export async function seedMessage(
  prisma: PrismaService,
  opts: SeedMessageOpts,
) {
  const { Prisma } =
    require('@prisma/client') as typeof import('@prisma/client');
  const data: Record<string, unknown> = {
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    content: opts.content ?? 'hi',
    message_type: opts.messageType ?? 'TEXT',
    metadata:
      opts.metadata != null
        ? (opts.metadata as Prisma.InputJsonValue)
        : (Prisma.JsonNull as unknown),
  };
  if (opts.createdAt) data.created_at = opts.createdAt;
  return prisma.message.create({
    data: data as Parameters<typeof prisma.message.create>[0]['data'],
  });
}

export type SeedFileMessageOpts = {
  conversationId: bigint;
  /** ClientProfile.id == Account.id by the shared-PK pattern. */
  senderId: bigint;
  fileUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  originalName?: string;
  content?: string;
};

/**
 * Seeds a FILE message. Post-2026-05 the `message_attachment` table was
 * dropped — a file message carries its file columns inline on the message.
 */
export async function seedFileMessage(
  prisma: PrismaService,
  opts: SeedFileMessageOpts,
) {
  return prisma.message.create({
    data: {
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      message_type: 'FILE',
      content: opts.content ?? null,
      file_url:
        opts.fileUrl ??
        `/uploads/message-files/seed-${crypto
          .randomBytes(3)
          .toString('hex')}.png`,
      mime_type: opts.mimeType ?? 'image/png',
      size_bytes: opts.sizeBytes ?? 12_345,
      original_name: opts.originalName ?? 'seed-attachment.png',
    },
  });
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
          referral_code: generateReferralCode(),
          worker_profile: { create: {} },
        },
      },
    },
  });
  return { id: account.id, email: account.email, googleId };
}
