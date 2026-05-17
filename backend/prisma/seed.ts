import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Ref-code alphabet excludes ambiguous chars (0/O/1/I/L). Mirrors
// REFERRAL_CODE_ALPHABET in backend/src/referral/referral.constants.ts.
const REF_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeRefCode(seed: string | number): string {
  // Deterministic from seed so re-running gives same codes per email/id —
  // makes dev login easier ("Mike's code is always the same").
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (n: number) => REF_ALPHA[n % REF_ALPHA.length];
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += pick(h);
    h = (h * 17 + 13) >>> 0;
  }
  out += '-';
  for (let i = 0; i < 4; i++) {
    out += pick(h);
    h = (h * 17 + 13) >>> 0;
  }
  return out;
}

async function main() {
  console.log('Seeding TradeHub database...');

  // ── Specialisations ──────────────────────────────────────────
  const specs = [
    'General Builder', 'Electrician', 'Plumber', 'Carpenter',
    'Plasterer', 'Painter & Decorator', 'Roofer', 'Bricklayer',
    'Tiler', 'Gas Engineer', 'Heating Engineer', 'Landscaper',
    'Scaffolder', 'Demolition', 'Groundworker', 'Steelfixer',
    'Dryliner', 'Flooring Specialist', 'Glazier', 'Locksmith',
  ];

  const specRecords = await Promise.all(
    specs.map((name) =>
      prisma.specialisation.upsert({
        where: { name },
        update: {},
        create: {
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        },
      }),
    ),
  );
  console.log(`  ${specRecords.length} specialisations`);

  // ── Subscription Plans ───────────────────────────────────────
  const plans = [
    { name: 'Free', price_monthly: 0, price_yearly: 0, max_referrals: 3, is_active: false, features: { badge: false, priority_listing: false } },
    { name: 'Professional', price_monthly: 29.99, price_yearly: 299, max_referrals: 20, is_active: false, features: { badge: true, priority_listing: true, analytics: true } },
    { name: 'Enterprise', price_monthly: 79.99, price_yearly: 799, max_referrals: null, is_active: false, features: { badge: true, priority_listing: true, analytics: true, api_access: true } },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plans.indexOf(plan) + 1 },
      update: {},
      create: {
        name: plan.name,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        max_referrals: plan.max_referrals,
        is_active: plan.is_active,
        features: plan.features,
      },
    });
  }
  console.log(`  ${plans.length} subscription plans (all inactive)`);

  // ── PlatformSetting (singleton row, default percentages) ─────
  await prisma.platformSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  console.log('  Platform settings (defaults)');

  // ── Password hash (shared for test accounts) ────────────────
  const hash = await bcrypt.hash('Password123!', 12);

  // ── Admin Account ────────────────────────────────────────────
  // account is a pure auth root — no referral_code (that lives on
  // client_profile, and staff have no client_profile).
  const adminAccount = await prisma.account.upsert({
    where: { email: 'admin@tradehub.co.uk' },
    update: {},
    create: {
      email: 'admin@tradehub.co.uk',
      password_hash: hash,
      phone: '+447000000001',
      phone_verified: true,
      status: 'ACTIVE',
      email_verified_at: new Date(),
      staff_member: {
        create: {
          display_name: 'Platform Admin',
          staff_role: 'ADMIN',
          is_on_duty: true,
        },
      },
    },
  });
  console.log(`  Admin: admin@tradehub.co.uk (id=${adminAccount.id})`);

  // ── Worker Accounts ──────────────────────────────────────────
  // referral_code / referred_by_id / referred_at live on client_profile.
  const workers = [
    { email: 'mike.builder@example.com', name: 'Mike Thompson', city: 'London', postcode: 'SW1', specIdx: [0, 7], yearsExp: 12, rateMin: 200, rateMax: 350, langs: ['en'] },
    { email: 'sarah.sparks@example.com', name: 'Sarah Jenkins', city: 'Manchester', postcode: 'M1', specIdx: [1, 10], yearsExp: 8, rateMin: 250, rateMax: 400, langs: ['en', 'pl'] },
    { email: 'dave.pipes@example.com', name: 'Dave Wilson', city: 'Birmingham', postcode: 'B1', specIdx: [2, 9], yearsExp: 15, rateMin: 220, rateMax: 380, langs: ['en'] },
    { email: 'tom.wood@example.com', name: 'Tom Harris', city: 'Leeds', postcode: 'LS1', specIdx: [3, 5], yearsExp: 6, rateMin: 180, rateMax: 280, langs: ['en', 'uk'] },
    { email: 'emma.tiles@example.com', name: 'Emma Clarke', city: 'Bristol', postcode: 'BS1', specIdx: [8, 5], yearsExp: 10, rateMin: 200, rateMax: 320, langs: ['en'] },
  ];

  const workerAccounts: { id: bigint; name: string; refCode: string }[] = [];

  for (const w of workers) {
    const slug = w.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    const refCode = makeRefCode(w.email);
    const acc = await prisma.account.upsert({
      where: { email: w.email },
      update: {},
      create: {
        email: w.email,
        password_hash: hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        client_profile: {
          create: {
            display_name: w.name,
            slug,
            city: w.city,
            postcode_area: w.postcode,
            verification_level: 'BASIC',
            referral_code: refCode,
            worker_profile: {
              create: {
                years_experience: w.yearsExp,
                day_rate_min: w.rateMin,
                day_rate_max: w.rateMax,
                is_available: true,
              },
            },
          },
        },
      },
    });
    workerAccounts.push({ id: acc.id, name: w.name, refCode });

    for (let i = 0; i < w.specIdx.length; i++) {
      await prisma.workerSpecialisation.upsert({
        where: {
          worker_id_specialisation_id: {
            worker_id: acc.id,
            specialisation_id: specRecords[w.specIdx[i]].id,
          },
        },
        update: {},
        create: {
          worker_id: acc.id,
          specialisation_id: specRecords[w.specIdx[i]].id,
          is_primary: i === 0,
        },
      });
    }

    // Worker languages — ISO 639-1 codes, now a junction table (PROF-055).
    for (const code of w.langs) {
      await prisma.workerLanguage.upsert({
        where: { worker_id_language_code: { worker_id: acc.id, language_code: code } },
        update: {},
        create: { worker_id: acc.id, language_code: code },
      });
    }
    console.log(`  Worker: ${w.email} (id=${acc.id}) ref=${refCode}`);
  }

  // Demo Account-referral: Sarah was referred by Mike at signup.
  // The self-FK lives on client_profile (not account).
  await prisma.clientProfile.update({
    where: { id: workerAccounts[1].id },
    data: {
      referred_by_id: workerAccounts[0].id,
      referred_at: new Date('2025-12-01'),
    },
  });
  console.log(`  Account-ref: Sarah <- referred by Mike (window 12mo)`);

  // ── Employer Accounts ────────────────────────────────────────
  const employers = [
    { email: 'james@acmebuild.co.uk', name: 'James Crawford', company: 'Acme Build Ltd', companyNum: '12345678', teamSize: 25, city: 'London', postcode: 'EC1' },
    { email: 'lisa@homeworks.co.uk', name: 'Lisa Morgan', company: 'HomeWorks Construction', companyNum: '87654321', teamSize: 12, city: 'Manchester', postcode: 'M2' },
    { email: 'rob@quickfix.co.uk', name: 'Rob Patterson', company: 'QuickFix Services', companyNum: '11223344', teamSize: 8, city: 'Birmingham', postcode: 'B2' },
  ];

  const employerAccounts: { id: bigint; name: string; refCode: string }[] = [];

  for (const e of employers) {
    const slug = e.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    const refCode = makeRefCode(e.email);
    const acc = await prisma.account.upsert({
      where: { email: e.email },
      update: {},
      create: {
        email: e.email,
        password_hash: hash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        client_profile: {
          create: {
            display_name: e.name,
            slug,
            city: e.city,
            postcode_area: e.postcode,
            verification_level: 'BASIC',
            referral_code: refCode,
            employer_profile: {
              create: {
                company_name: e.company,
                company_number: e.companyNum,
                team_size: e.teamSize,
              },
            },
          },
        },
      },
    });
    employerAccounts.push({ id: acc.id, name: e.name, refCode });
    console.log(`  Employer: ${e.email} (id=${acc.id}) ref=${refCode}`);
  }

  // ── Portfolio Items (per worker) ─────────────────────────────
  for (const w of workerAccounts) {
    await prisma.portfolioItem.create({
      data: {
        worker_id: w.id,
        item_type: 'EXPERIENCE',
        title: `${w.name} - Previous Employment`,
        description: 'Senior tradesperson role with full project management responsibilities.',
        sort_order: 0,
        experience_detail: {
          create: {
            company_name: 'BuildRight Ltd',
            role: 'Senior Tradesperson',
            start_date: new Date('2018-03-01'),
            end_date: new Date('2023-06-30'),
          },
        },
      },
    });

    const projItem = await prisma.portfolioItem.create({
      data: {
        worker_id: w.id,
        item_type: 'PROJECT',
        title: 'Kitchen Renovation - Kensington',
        description: 'Full kitchen strip-out and rebuild including plumbing and electrics.',
        sort_order: 1,
        project_detail: {
          create: {
            project_type: 'Kitchen Renovation',
            site_postcode: 'W8',
            completed_at: new Date('2024-09-15'),
            project_value: 45000,
          },
        },
      },
    });

    await prisma.portfolioItem.create({
      data: {
        worker_id: w.id,
        item_type: 'CERTIFICATION',
        title: 'CSCS Gold Card',
        description: 'Construction Skills Certification Scheme',
        sort_order: 2,
        verified: true,
        verified_at: new Date(),
        certification_detail: {
          create: {
            cert_type: 'CSCS',
            cert_number: `CSCS-${Math.random().toString().substring(2, 10)}`,
            issuing_body: 'CITB',
            issued_at: new Date('2023-01-15'),
            expires_at: new Date('2028-01-15'),
          },
        },
      },
    });

    await prisma.portfolioMedia.create({
      data: {
        portfolio_item_id: projItem.id,
        media_url: '/uploads/sample-kitchen-before.jpg',
        caption: 'Before renovation',
        sort_order: 0,
      },
    });
    await prisma.portfolioMedia.create({
      data: {
        portfolio_item_id: projItem.id,
        media_url: '/uploads/sample-kitchen-after.jpg',
        caption: 'After renovation',
        sort_order: 1,
      },
    });

    console.log(`  Portfolio items for ${w.name}: experience, project, certification`);
  }

  // ── Collaborations + Contracts ──────────────────────────────
  // Every Collaboration gets a chat thread (post-accept invariant).
  // Pattern:
  //   collab[0] (Mike <-> James)   → Contract #1 ENDED, Contract #2 ACTIVE (demo Hire-again)
  //   collab[1] (Sarah <-> Lisa)   → Contract #1 ENDED  (account-ref payout demo)
  //   collab[2] (Dave <-> Rob)     → Contract #1 ENDED
  //   collab[3] (Tom <-> James)    → no contracts yet — demo "just-accepted, chat-only"
  //   collab[4] (Emma <-> Lisa)    → Contract #1 PROPOSED — demo "employer sent contract, worker to accept"
  // Each ENDED contract gets 2 published reviews + 1 RELEASED milestone + payment rows.

  type CollabSeed = {
    workerIdx: number;
    employerIdx: number;
    contracts: Array<{
      status: 'ENDED' | 'ACTIVE' | 'PROPOSED';
      end_reason?: 'COMPLETED' | 'CANCELED' | 'ABANDONED' | 'DISPUTED_LOST';
      agreed_amount: number;
      project_type: string;
      site_postcode: string;
      initiated_by: 'EMPLOYER' | 'WORKER';
      started_at?: Date;
      ended_at?: Date;
      withReviews?: boolean;
      withEscrow?: boolean;
      // Project ref demo: this contract was the result of a referral.
      project_referrer_account_idx?: number;
      project_referrer_role?: 'WORKER' | 'EMPLOYER';
    }>;
  };

  const collabSeeds: CollabSeed[] = [
    {
      workerIdx: 0, employerIdx: 0,
      contracts: [
        {
          status: 'ENDED', end_reason: 'COMPLETED',
          agreed_amount: 15000, project_type: 'Office refit', site_postcode: 'EC1',
          initiated_by: 'EMPLOYER',
          started_at: new Date('2025-01-15'), ended_at: new Date('2025-03-15'),
          withReviews: true, withEscrow: true,
        },
        {
          status: 'ACTIVE',
          agreed_amount: 8000, project_type: 'Mezzanine fit-out', site_postcode: 'EC2',
          initiated_by: 'EMPLOYER',
          started_at: new Date('2026-04-01'),
        },
      ],
    },
    {
      workerIdx: 1, employerIdx: 1,
      contracts: [
        {
          status: 'ENDED', end_reason: 'COMPLETED',
          agreed_amount: 20000, project_type: 'Renovation', site_postcode: 'M2',
          initiated_by: 'EMPLOYER',
          started_at: new Date('2025-02-15'), ended_at: new Date('2025-04-15'),
          withReviews: true, withEscrow: true,
        },
      ],
    },
    {
      workerIdx: 2, employerIdx: 2,
      contracts: [
        {
          status: 'ENDED', end_reason: 'COMPLETED',
          agreed_amount: 25000, project_type: 'Plumbing fit-out', site_postcode: 'B2',
          initiated_by: 'EMPLOYER',
          started_at: new Date('2025-01-10'), ended_at: new Date('2025-03-30'),
          withReviews: true, withEscrow: true,
          // Demo project ref: Sarah (worker) referred Dave to this job.
          project_referrer_account_idx: 1,
          project_referrer_role: 'WORKER',
        },
      ],
    },
    {
      // Tom <-> James — empty Collaboration. Demo "just accepted, chatting,
      // no contract yet". Employer should click 'New contract' on the page.
      workerIdx: 3, employerIdx: 0,
      contracts: [],
    },
    {
      // Emma <-> Lisa — 1 PROPOSED. Demo "employer just sent a contract,
      // worker needs to Accept on the contract page".
      workerIdx: 4, employerIdx: 1,
      contracts: [
        {
          status: 'PROPOSED',
          agreed_amount: 12000, project_type: 'Loft conversion specialist', site_postcode: 'N1',
          initiated_by: 'EMPLOYER',
        },
      ],
    },
  ];

  type ContractSeedRow = {
    id: bigint;
    collabId: bigint;
    workerId: bigint;
    employerId: bigint;
    isLast: boolean;
    cfg: CollabSeed['contracts'][0];
  };
  const allContracts: ContractSeedRow[] = [];

  for (const cs of collabSeeds) {
    const w = workerAccounts[cs.workerIdx];
    const e = employerAccounts[cs.employerIdx];

    const collab = await prisma.collaboration.create({
      data: {
        worker_id: w.id,
        employer_id: e.id,
        first_contracted_at: cs.contracts.length ? cs.contracts[0].started_at ?? new Date() : null,
      },
    });

    for (let i = 0; i < cs.contracts.length; i++) {
      const cfg = cs.contracts[i];
      const projRefAccount =
        cfg.project_referrer_account_idx != null
          ? workerAccounts[cfg.project_referrer_account_idx]
          : null;

      const contract = await prisma.contract.create({
        data: {
          collaboration_id: collab.id,
          position: i + 1,
          status: cfg.status,
          end_reason: cfg.end_reason ?? null,
          agreed_amount: new Prisma.Decimal(cfg.agreed_amount),
          project_type: cfg.project_type,
          site_postcode: cfg.site_postcode,
          initiated_by: cfg.initiated_by,
          started_at: cfg.started_at ?? null,
          ended_at: cfg.ended_at ?? null,
          // project_referrer_id → client_profile (not account).
          project_referrer_id: projRefAccount?.id ?? null,
          project_referrer_role: cfg.project_referrer_role ?? null,
        },
      });
      allContracts.push({
        id: contract.id,
        collabId: collab.id,
        workerId: collab.worker_id,
        employerId: collab.employer_id,
        isLast: i === cs.contracts.length - 1,
        cfg,
      });
    }

    console.log(`  Collaboration ${w.name} <-> ${e.name}: ${cs.contracts.length} contract(s)`);
  }

  // ── Reviews (per contract) ───────────────────────────────────
  for (const row of allContracts) {
    if (!row.cfg.withReviews) continue;
    await prisma.review.create({
      data: {
        contract_id: row.id,
        reviewer_role: 'EMPLOYER',
        overall_rating: 5,
        quality_rating: 5,
        reliability_rating: 5,
        communication_rating: 4,
        safety_rating: 5,
        comment: 'Excellent work, very professional. Would hire again.',
        is_published: true,
        published_at: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        contract_id: row.id,
        reviewer_role: 'WORKER',
        overall_rating: 5,
        communication_rating: 5,
        payment_rating: 5,
        comment: 'Great employer, clear requirements and prompt payment.',
        is_published: true,
        published_at: new Date(),
      },
    });
  }
  console.log('  Reviews seeded for ENDED contracts');

  // ── Update rating aggregates ─────────────────────────────────
  for (const row of allContracts) {
    if (!row.cfg.withReviews) continue;

    const workerReviews = await prisma.review.findMany({
      where: {
        contract: { collaboration: { worker_id: row.workerId } },
        reviewer_role: 'EMPLOYER',
        is_published: true,
      },
    });
    if (workerReviews.length > 0) {
      const avg = workerReviews.reduce((s, r) => s + r.overall_rating, 0) / workerReviews.length;
      await prisma.workerProfile.update({
        where: { id: row.workerId },
        data: { rating_avg: Math.round(avg * 100) / 100, rating_count: workerReviews.length },
      });
    }

    const employerReviews = await prisma.review.findMany({
      where: {
        contract: { collaboration: { employer_id: row.employerId } },
        reviewer_role: 'WORKER',
        is_published: true,
      },
    });
    if (employerReviews.length > 0) {
      const avg = employerReviews.reduce((s, r) => s + r.overall_rating, 0) / employerReviews.length;
      await prisma.employerProfile.update({
        where: { id: row.employerId },
        data: { rating_avg: Math.round(avg * 100) / 100, rating_count: employerReviews.length },
      });
    }
  }
  console.log('  Rating aggregates updated');

  // ── Escrow milestone + payment ledger per ENDED contract ─────
  // A milestone belongs directly to a contract (no escrow_transaction).
  // A RELEASED milestone has a PAID CHARGE (employer) and a PAID
  // WORKER_PAYOUT (worker) in the `payment` ledger.
  for (const row of allContracts) {
    if (!row.cfg.withEscrow) continue;
    const platform = Number(row.cfg.agreed_amount) * 0.05;
    const workerPayout = Number(row.cfg.agreed_amount) - platform;
    const ts = row.cfg.ended_at ?? new Date();

    const milestone = await prisma.escrowMilestone.create({
      data: {
        contract_id: row.id,
        position: 1,
        title: row.cfg.project_type,
        amount: new Prisma.Decimal(row.cfg.agreed_amount),
        status: 'RELEASED',
        created_by_role: 'EMPLOYER',
        worker_submitted_at: ts,
        employer_approved_at: ts,
        released_at: ts,
        frozen_client_fee_pct: new Prisma.Decimal(5),
        frozen_freelancer_fee_pct: new Prisma.Decimal(10),
        frozen_referral_fee_pct: new Prisma.Decimal(0),
        frozen_worker_payout: new Prisma.Decimal(workerPayout),
        frozen_referral_commission: new Prisma.Decimal(0),
        frozen_platform_fee: new Prisma.Decimal(platform),
      },
    });

    const rnd = () => Math.random().toString(36).substring(2, 8);
    await prisma.payment.create({
      data: {
        milestone_id: milestone.id,
        client_profile_id: row.employerId,
        type: 'CHARGE',
        amount: new Prisma.Decimal(row.cfg.agreed_amount),
        status: 'PAID',
        stripe_id: `pi_seed_${milestone.id}_${rnd()}`,
        settled_at: row.cfg.started_at ?? ts,
      },
    });
    await prisma.payment.create({
      data: {
        milestone_id: milestone.id,
        client_profile_id: row.workerId,
        type: 'WORKER_PAYOUT',
        amount: new Prisma.Decimal(workerPayout),
        status: 'PAID',
        stripe_id: `tr_seed_${milestone.id}_${rnd()}`,
        settled_at: ts,
      },
    });
  }
  console.log('  Escrow milestone (RELEASED) + payment ledger for each ENDED contract');

  // ── Demo project-ref commission held (Sarah → Dave's contract) ──
  // Sarah isn't Stripe-onboarded → the REFERRAL_W2W payment sits PENDING.
  const sarahRefedDaveContract = allContracts.find(
    (r) => r.cfg.project_referrer_account_idx === 1,
  );
  if (sarahRefedDaveContract) {
    const milestone = await prisma.escrowMilestone.findFirst({
      where: { contract_id: sarahRefedDaveContract.id },
    });
    if (milestone) {
      const cut = Number(sarahRefedDaveContract.cfg.agreed_amount) * 0.02;
      await prisma.payment.create({
        data: {
          milestone_id: milestone.id,
          client_profile_id: workerAccounts[1].id, // Sarah
          type: 'REFERRAL_W2W',
          amount: new Prisma.Decimal(cut),
          status: 'PENDING',
        },
      });
      console.log(`  Held project-ref payout: Sarah ← £${cut.toFixed(2)} on Dave's contract`);
    }
  }

  // ── Verification Milestones ──────────────────────────────────
  for (const w of workerAccounts) {
    await prisma.verificationMilestone.create({
      data: {
        client_profile_id: w.id,
        milestone_type: 'IDENTITY_VERIFIED',
        evidence_ref: 'Stripe Identity session_xyz',
        notes: 'ID verified via automated check',
      },
    });
  }
  for (const e of employerAccounts) {
    await prisma.verificationMilestone.create({
      data: {
        client_profile_id: e.id,
        milestone_type: 'COMPANY_HOUSE_VERIFIED',
        evidence_ref: 'Companies House check',
        notes: 'Company registration verified',
      },
    });
  }
  console.log('  Verification milestones created');

  // ── Notifications ────────────────────────────────────────────
  for (const w of workerAccounts) {
    await prisma.notification.create({
      data: {
        account_id: w.id,
        type: 'WELCOME',
        title: 'Welcome to TradeHub!',
        body: 'Your account has been created. Complete your profile to start receiving job offers.',
        channel: 'IN_APP',
      },
    });
  }
  for (const e of employerAccounts) {
    await prisma.notification.create({
      data: {
        account_id: e.id,
        type: 'WELCOME',
        title: 'Welcome to TradeHub!',
        body: 'Your employer account is ready. Start posting jobs and finding skilled tradespeople.',
        channel: 'BOTH',
      },
    });
  }
  console.log('  Welcome notifications sent');

  // ── Audit Log entry ──────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      account_id: adminAccount.id,
      action: 'SEED_EXECUTED',
      entity_type: 'SYSTEM',
      metadata: { seeded_at: new Date().toISOString(), version: '2026-05-11-schema-rework' },
    },
  });
  console.log('  Audit log entry');

  // ── Tags ─────────────────────────────────────────────────────
  const tagNames = [
    'Commercial Wiring',
    'Domestic Rewiring',
    'EV Charger Installation',
    'Underfloor Heating',
    'Loft Conversion',
    'Kitchen Fitting',
    'Bathroom Tiling',
    'Plastering',
    'Scaffolding',
    'Roofing Repair',
    'Gas Boiler Installation',
    'Fire Alarm Systems',
    'CCTV Installation',
    'Damp Proofing',
    'Insulation',
    'Painting & Decorating',
    'Concrete Work',
    'Drainage',
    'Solar Panel Installation',
    'Smart Home Wiring',
  ];

  const tagSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  await prisma.tag.createMany({
    data: tagNames.map((name) => ({ name, slug: tagSlug(name) })),
    skipDuplicates: true,
  });
  const tagRows = await prisma.tag.findMany({ where: { name: { in: tagNames } } });
  const tagIdByName = new Map(tagRows.map((t) => [t.name, t.id]));
  console.log(`  ${tagRows.length} tags`);

  await prisma.workerTag.createMany({
    data: [
      { worker_id: workerAccounts[0].id, tag_id: tagIdByName.get('Commercial Wiring')! },
      { worker_id: workerAccounts[0].id, tag_id: tagIdByName.get('Loft Conversion')! },
      { worker_id: workerAccounts[0].id, tag_id: tagIdByName.get('Kitchen Fitting')! },
      { worker_id: workerAccounts[1].id, tag_id: tagIdByName.get('Domestic Rewiring')! },
      { worker_id: workerAccounts[1].id, tag_id: tagIdByName.get('EV Charger Installation')! },
      { worker_id: workerAccounts[1].id, tag_id: tagIdByName.get('Smart Home Wiring')! },
      { worker_id: workerAccounts[1].id, tag_id: tagIdByName.get('Fire Alarm Systems')! },
      { worker_id: workerAccounts[2].id, tag_id: tagIdByName.get('Gas Boiler Installation')! },
      { worker_id: workerAccounts[2].id, tag_id: tagIdByName.get('Underfloor Heating')! },
      { worker_id: workerAccounts[2].id, tag_id: tagIdByName.get('Drainage')! },
      { worker_id: workerAccounts[3].id, tag_id: tagIdByName.get('Loft Conversion')! },
      { worker_id: workerAccounts[3].id, tag_id: tagIdByName.get('Plastering')! },
      { worker_id: workerAccounts[3].id, tag_id: tagIdByName.get('Painting & Decorating')! },
      { worker_id: workerAccounts[3].id, tag_id: tagIdByName.get('Roofing Repair')! },
      { worker_id: workerAccounts[4].id, tag_id: tagIdByName.get('Bathroom Tiling')! },
      { worker_id: workerAccounts[4].id, tag_id: tagIdByName.get('Kitchen Fitting')! },
      { worker_id: workerAccounts[4].id, tag_id: tagIdByName.get('Plastering')! },
    ],
    skipDuplicates: true,
  });
  console.log('  Worker tags (3-5 per worker)');

  // ── Job posts ────────────────────────────────────────────────
  const jp1 = await prisma.jobPost.create({
    data: {
      employer_id: employerAccounts[0].id,
      title: 'Electrician needed for office refit',
      description: 'Commercial office strip-out and refit; need a qualified electrician for containment, tray, and fit-out.',
      postcode_area: 'EC1',
      pay_type: 'DAY_RATE',
      day_rate_min: new Prisma.Decimal(250),
      day_rate_max: new Prisma.Decimal(350),
      duration_days: 10,
      status: 'OPEN',
      is_urgent: false,
    },
  });
  const jp2 = await prisma.jobPost.create({
    data: {
      employer_id: employerAccounts[0].id,
      title: 'Plumber for new build bathrooms',
      description: 'New build development: first and second fix for multiple bathroom units.',
      postcode_area: 'E14',
      pay_type: 'FIXED_PRICE',
      fixed_price: new Prisma.Decimal(4500),
      duration_days: 15,
      status: 'OPEN',
      is_urgent: false,
    },
  });
  const jp3 = await prisma.jobPost.create({
    data: {
      employer_id: employerAccounts[1].id,
      title: 'Full kitchen renovation',
      description: 'Rip-out, electrics, carpentry and finishing for a high-end residential kitchen.',
      postcode_area: 'SW1',
      pay_type: 'DAY_RATE',
      day_rate_min: new Prisma.Decimal(200),
      day_rate_max: new Prisma.Decimal(280),
      status: 'OPEN',
      is_urgent: true,
    },
  });
  const jp4 = await prisma.jobPost.create({
    data: {
      employer_id: employerAccounts[1].id,
      title: 'Loft conversion specialist',
      description: 'Dormer loft conversion including stairs, insulation, and plastering.',
      postcode_area: 'N1',
      pay_type: 'FIXED_PRICE',
      fixed_price: new Prisma.Decimal(12000),
      duration_days: 30,
      status: 'OPEN',
      is_urgent: false,
    },
  });
  const jp5 = await prisma.jobPost.create({
    data: {
      employer_id: employerAccounts[2].id,
      title: 'Emergency gas boiler repair',
      description: 'Commercial unit: boiler down; need Gas Safe engineer urgently.',
      postcode_area: 'SE1',
      pay_type: 'DAY_RATE',
      day_rate_min: new Prisma.Decimal(300),
      day_rate_max: new Prisma.Decimal(400),
      status: 'OPEN',
      is_urgent: true,
    },
  });

  await prisma.jobPostSpecialisation.createMany({
    data: [
      { job_post_id: jp1.id, specialisation_id: specRecords[1].id },
      { job_post_id: jp2.id, specialisation_id: specRecords[2].id },
      { job_post_id: jp3.id, specialisation_id: specRecords[3].id },
      { job_post_id: jp3.id, specialisation_id: specRecords[1].id },
      { job_post_id: jp4.id, specialisation_id: specRecords[3].id },
      { job_post_id: jp5.id, specialisation_id: specRecords[2].id },
    ],
    skipDuplicates: true,
  });
  await prisma.jobPostTag.createMany({
    data: [
      { job_post_id: jp1.id, tag_id: tagIdByName.get('Commercial Wiring')! },
      { job_post_id: jp2.id, tag_id: tagIdByName.get('Bathroom Tiling')! },
      { job_post_id: jp2.id, tag_id: tagIdByName.get('Underfloor Heating')! },
      { job_post_id: jp3.id, tag_id: tagIdByName.get('Kitchen Fitting')! },
      { job_post_id: jp4.id, tag_id: tagIdByName.get('Loft Conversion')! },
      { job_post_id: jp4.id, tag_id: tagIdByName.get('Plastering')! },
      { job_post_id: jp5.id, tag_id: tagIdByName.get('Gas Boiler Installation')! },
    ],
    skipDuplicates: true,
  });
  console.log('  5 job posts with specialisations and tags');

  // ── Job applications ───────────────────────────────────────────
  await prisma.jobApplication.createMany({
    data: [
      {
        job_post_id: jp1.id,
        worker_id: workerAccounts[0].id,
        initiated_by: 'WORKER',
        status: 'PENDING',
        cover_message: '10 years commercial experience',
      },
      {
        job_post_id: jp1.id,
        worker_id: workerAccounts[1].id,
        initiated_by: 'WORKER',
        status: 'REVIEWED',
      },
      {
        job_post_id: jp2.id,
        worker_id: workerAccounts[2].id,
        initiated_by: 'WORKER',
        status: 'SHORTLISTED',
        cover_message: 'Specialist in bathroom installations',
      },
      {
        job_post_id: jp4.id,
        worker_id: workerAccounts[3].id,
        initiated_by: 'WORKER',
        status: 'ACCEPTED',
        // Demo project-ref attribution: Mike shared this job to Tom.
        // project_referrer_id → client_profile.
        project_referrer_id: workerAccounts[0].id,
        project_referrer_role: 'WORKER',
      },
    ],
    skipDuplicates: true,
  });
  await prisma.jobApplication.createMany({
    data: [
      {
        job_post_id: jp5.id,
        worker_id: workerAccounts[2].id,
        initiated_by: 'EMPLOYER',
        status: 'PENDING',
      },
    ],
    skipDuplicates: true,
  });
  console.log('  Job applications (one project-ref attributed)');

  // ── Conversations & messages (one per Collaboration) ─────────
  // conversation shares its PK with collaboration (conversation.id =
  // collaboration.id) — a strict 1:1, no participant table. message.sender_id
  // is a client_profile id; NULL for SYSTEM messages.
  const allCollabs = await prisma.collaboration.findMany({
    where: {
      OR: [
        { worker_id: workerAccounts[0].id, employer_id: employerAccounts[0].id },
        { worker_id: workerAccounts[1].id, employer_id: employerAccounts[1].id },
        { worker_id: workerAccounts[2].id, employer_id: employerAccounts[2].id },
        { worker_id: workerAccounts[3].id, employer_id: employerAccounts[0].id },
        { worker_id: workerAccounts[4].id, employer_id: employerAccounts[1].id },
      ],
    },
  });

  for (const collab of allCollabs) {
    const conv = await prisma.conversation.create({
      data: { id: collab.id },
    });
    const isTom = collab.worker_id === workerAccounts[3].id;
    const isEmma = collab.worker_id === workerAccounts[4].id;
    const t0 = new Date('2026-04-10T09:55:00.000Z');
    const t1 = new Date('2026-04-10T10:00:00.000Z');
    const t2 = new Date('2026-04-10T10:15:00.000Z');

    // Opening SYSTEM context message (no sender — sender_id NULL).
    await prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: null,
        content: isTom
          ? 'Job accepted: "Loft conversion specialist". Discuss scope here, then create a contract.'
          : isEmma
            ? 'Job accepted: "Loft conversion specialist". A contract has been proposed — open the relationship to view it.'
            : 'Job accepted. Welcome to TradeHub.',
        message_type: 'SYSTEM',
        created_at: t0,
      },
    });

    if (isTom) {
      // Tom's chat-only demo: short chit-chat, no contract yet.
      await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: collab.employer_id,
          content:
            'Hi Tom — thanks for applying. When can you start, and what would you charge for the dormer?',
          message_type: 'TEXT',
          created_at: t1,
        },
      });
      await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: collab.worker_id,
          content: 'Available from next Monday. Send over scope and I\'ll quote.',
          message_type: 'TEXT',
          created_at: t2,
        },
      });
    } else if (!isEmma) {
      await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: collab.employer_id,
          content: 'Welcome aboard. Looking forward to working with you.',
          message_type: 'TEXT',
          created_at: t1,
        },
      });
      await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: collab.worker_id,
          content: 'Thanks — ready to start.',
          message_type: 'TEXT',
          created_at: t2,
        },
      });
    }

    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: t2 },
    });
  }
  console.log('  Conversations + messages (one per Collaboration)');

  console.log('\nSeed completed successfully!');
  console.log('──────────────────────────────────────────');
  console.log('Test credentials (all accounts): Password123!');
  console.log('Admin:     admin@tradehub.co.uk  (only admin; create staff via UI)');
  console.log('Workers:   mike.builder, sarah.sparks, dave.pipes, tom.wood, emma.tiles');
  console.log('Employers: james@acmebuild, lisa@homeworks, rob@quickfix');
  console.log('');
  console.log('Referral demos:');
  console.log('  Account ref: Sarah <- Mike (client_profile.referred_by_id, signed up 2025-12-01)');
  console.log('  Project ref attribution on JobApplication: Tom -> jp4 by Mike');
  console.log('  Project ref attribution on Contract: Dave hired by Rob, referred by Sarah (W2W)');
  console.log('  Held payout: Sarah has a PENDING REFERRAL_W2W payment until she onboards Stripe');
  console.log('');
  console.log('Collaboration demos:');
  console.log('  Mike  <-> James:  ENDED + ACTIVE contracts (Hire-again pattern)');
  console.log('  Sarah <-> Lisa:   1 ENDED contract (account-ref payout demo)');
  console.log('  Dave  <-> Rob:    1 ENDED contract (project-ref by Sarah W2W)');
  console.log('  Tom   <-> James:  CHAT-ONLY, no contracts yet (post-accept state)');
  console.log('  Emma  <-> Lisa:   1 PROPOSED contract (worker should Accept)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
