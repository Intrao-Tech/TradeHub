import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

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

  // ── Password hash (shared for test accounts) ────────────────
  const hash = await bcrypt.hash('Password123!', 12);

  // ── Admin Account ────────────────────────────────────────────
  const adminAccount = await prisma.account.upsert({
    where: { email: 'admin@tradehub.co.uk' },
    update: {},
    create: {
      email: 'admin@tradehub.co.uk',
      password_hash: hash,
      phone: '+447000000001',
      phone_verified: true,
      status: 'ACTIVE',
      staff_member: {
        create: { display_name: 'Platform Admin', staff_role: 'ADMIN' },
      },
    },
  });
  console.log(`  Admin: admin@tradehub.co.uk (id=${adminAccount.id})`);

  // ── Moderator Account ────────────────────────────────────────
  const modAccount = await prisma.account.upsert({
    where: { email: 'moderator@tradehub.co.uk' },
    update: {},
    create: {
      email: 'moderator@tradehub.co.uk',
      password_hash: hash,
      phone: '+447000000002',
      phone_verified: true,
      status: 'ACTIVE',
      staff_member: {
        create: { display_name: 'Jane Moderator', staff_role: 'MODERATOR' },
      },
    },
  });
  console.log(`  Moderator: moderator@tradehub.co.uk (id=${modAccount.id})`);

  // ── Worker Accounts ──────────────────────────────────────────
  const workers = [
    { email: 'mike.builder@example.com', name: 'Mike Thompson', city: 'London', postcode: 'SW1', specIdx: [0, 7], yearsExp: 12, rateMin: 200, rateMax: 350 },
    { email: 'sarah.sparks@example.com', name: 'Sarah Jenkins', city: 'Manchester', postcode: 'M1', specIdx: [1, 10], yearsExp: 8, rateMin: 250, rateMax: 400 },
    { email: 'dave.pipes@example.com', name: 'Dave Wilson', city: 'Birmingham', postcode: 'B1', specIdx: [2, 9], yearsExp: 15, rateMin: 220, rateMax: 380 },
    { email: 'tom.wood@example.com', name: 'Tom Harris', city: 'Leeds', postcode: 'LS1', specIdx: [3, 5], yearsExp: 6, rateMin: 180, rateMax: 280 },
    { email: 'emma.tiles@example.com', name: 'Emma Clarke', city: 'Bristol', postcode: 'BS1', specIdx: [8, 5], yearsExp: 10, rateMin: 200, rateMax: 320 },
  ];

  const workerAccounts: { id: bigint; name: string }[] = [];

  for (const w of workers) {
    const slug = w.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    const acc = await prisma.account.upsert({
      where: { email: w.email },
      update: {},
      create: {
        email: w.email,
        password_hash: hash,
        status: 'ACTIVE',
        client_profile: {
          create: {
            display_name: w.name,
            slug,
            city: w.city,
            postcode_area: w.postcode,
            verification_level: 'IDENTITY_VERIFIED',
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
    workerAccounts.push({ id: acc.id, name: w.name });

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
    console.log(`  Worker: ${w.email} (id=${acc.id})`);
  }

  // ── Employer Accounts ────────────────────────────────────────
  const employers = [
    { email: 'james@acmebuild.co.uk', name: 'James Crawford', company: 'Acme Build Ltd', companyNum: '12345678', teamSize: 25, city: 'London', postcode: 'EC1' },
    { email: 'lisa@homeworks.co.uk', name: 'Lisa Morgan', company: 'HomeWorks Construction', companyNum: '87654321', teamSize: 12, city: 'Manchester', postcode: 'M2' },
    { email: 'rob@quickfix.co.uk', name: 'Rob Patterson', company: 'QuickFix Services', companyNum: '11223344', teamSize: 8, city: 'Birmingham', postcode: 'B2' },
  ];

  const employerAccounts: { id: bigint; name: string }[] = [];

  for (const e of employers) {
    const slug = e.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    const acc = await prisma.account.upsert({
      where: { email: e.email },
      update: {},
      create: {
        email: e.email,
        password_hash: hash,
        status: 'ACTIVE',
        client_profile: {
          create: {
            display_name: e.name,
            slug,
            city: e.city,
            postcode_area: e.postcode,
            verification_level: 'COMPANY_VERIFIED',
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
    employerAccounts.push({ id: acc.id, name: e.name });
    console.log(`  Employer: ${e.email} (id=${acc.id})`);
  }

  // ── Portfolio Items ──────────────────────────────────────────
  for (const w of workerAccounts) {
    const expItem = await prisma.portfolioItem.create({
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
        verified_by: 'PLATFORM',
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

  // ── Collaborations ───────────────────────────────────────────
  const collabs: { id: bigint; workerId: bigint; employerId: bigint }[] = [];

  for (let i = 0; i < Math.min(workerAccounts.length, employerAccounts.length); i++) {
    const collab = await prisma.collaboration.create({
      data: {
        worker_id: workerAccounts[i].id,
        employer_id: employerAccounts[i].id,
        initiated_by: 'EMPLOYER',
        status: 'COMPLETED',
        project_type: 'Renovation',
        site_postcode: 'SW1',
        agreed_amount: 15000 + i * 5000,
        started_at: new Date('2025-01-15'),
        ended_at: new Date('2025-03-15'),
        confirmed_at: new Date('2025-01-10'),
      },
    });
    collabs.push({ id: collab.id, workerId: workerAccounts[i].id, employerId: employerAccounts[i].id });
    console.log(`  Collaboration: ${workerAccounts[i].name} <-> ${employerAccounts[i].name} (COMPLETED)`);
  }

  // ── One pending collaboration ────────────────────────────────
  if (workerAccounts.length > 3 && employerAccounts.length > 0) {
    await prisma.collaboration.create({
      data: {
        worker_id: workerAccounts[3].id,
        employer_id: employerAccounts[0].id,
        initiated_by: 'WORKER',
        status: 'PENDING',
        project_type: 'Bathroom Fit-Out',
        site_postcode: 'LS2',
        agreed_amount: 8000,
      },
    });
    console.log('  Collaboration: pending (Tom Harris -> Acme Build)');
  }

  // ── Reviews ──────────────────────────────────────────────────
  for (const c of collabs) {
    await prisma.review.create({
      data: {
        collaboration_id: c.id,
        reviewer_role: 'EMPLOYER',
        overall_rating: 4 + Math.round(Math.random()),
        quality_rating: 4,
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
        collaboration_id: c.id,
        reviewer_role: 'WORKER',
        overall_rating: 4 + Math.round(Math.random()),
        communication_rating: 5,
        payment_rating: 5,
        comment: 'Great employer, clear requirements and prompt payment.',
        is_published: true,
        published_at: new Date(),
      },
    });
    console.log('  Reviews: 2 published reviews for collaboration');
  }

  // ── Update rating aggregates ─────────────────────────────────
  for (const c of collabs) {
    const workerReviews = await prisma.review.findMany({
      where: {
        collaboration: { worker_id: c.workerId },
        reviewer_role: 'EMPLOYER',
        is_published: true,
      },
    });

    if (workerReviews.length > 0) {
      const avg = workerReviews.reduce((sum, r) => sum + r.overall_rating, 0) / workerReviews.length;
      await prisma.workerProfile.update({
        where: { id: c.workerId },
        data: { rating_avg: Math.round(avg * 100) / 100, rating_count: workerReviews.length },
      });
    }

    const employerReviews = await prisma.review.findMany({
      where: {
        collaboration: { employer_id: c.employerId },
        reviewer_role: 'WORKER',
        is_published: true,
      },
    });

    if (employerReviews.length > 0) {
      const avg = employerReviews.reduce((sum, r) => sum + r.overall_rating, 0) / employerReviews.length;
      await prisma.employerProfile.update({
        where: { id: c.employerId },
        data: { rating_avg: Math.round(avg * 100) / 100, rating_count: employerReviews.length },
      });
    }
  }
  console.log('  Rating aggregates updated');

  // ── Referrals ────────────────────────────────────────────────
  if (workerAccounts.length > 0 && employerAccounts.length > 1) {
    const referral = await prisma.referral.create({
      data: {
        referrer_id: employerAccounts[1].id,
        status: 'OPEN',
        title: 'Experienced Plumber Needed - Manchester Office Refit',
        description: 'Looking for a qualified plumber for a commercial office bathroom refit. Must have Gas Safe registration.',
        project_type: 'Commercial Plumbing',
        postcode_area: 'M1',
        estimated_value: 12000,
        commission_pct: 5,
        platform_fee_pct: 2,
        client_name: 'Northern Properties Ltd',
        client_phone: '+447911555123',
        client_email: 'projects@northernprops.co.uk',
      },
    });

    await prisma.referralOffer.create({
      data: {
        referral_id: referral.id,
        recipient_id: workerAccounts[2].id,
        status: 'PENDING',
        message: 'Hi Dave, I think you would be perfect for this job given your plumbing experience.',
      },
    });
    console.log('  Referral + offer created');
  }

  // ── Escrow Transaction ───────────────────────────────────────
  if (collabs.length > 0) {
    await prisma.escrowTransaction.create({
      data: {
        collaboration_id: collabs[0].id,
        status: 'RELEASED',
        job_amount: 15000,
        platform_fee: 300,
        referral_commission: 0,
        worker_payout: 14700,
        currency: 'GBP',
        stripe_payment_intent_id: 'pi_test_' + Math.random().toString(36).substring(2, 14),
        stripe_charge_id: 'ch_test_' + Math.random().toString(36).substring(2, 14),
        stripe_transfer_id: 'tr_test_' + Math.random().toString(36).substring(2, 14),
        deposit_confirmed_at: new Date('2025-01-12'),
        released_at: new Date('2025-03-16'),
      },
    });
    console.log('  Escrow transaction (RELEASED) for first collaboration');
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
        milestone_type: 'COMPANY_VERIFIED',
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

  // ── Audit Log entries ────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      account_id: adminAccount.id,
      action: 'SEED_EXECUTED',
      entity_type: 'SYSTEM',
      metadata: { seeded_at: new Date().toISOString(), version: 'v7' },
    },
  });
  console.log('  Audit log entry');

  console.log('\nSeed completed successfully!');
  console.log('──────────────────────────────────────────');
  console.log('Test credentials (all accounts): Password123!');
  console.log('Admin:     admin@tradehub.co.uk');
  console.log('Moderator: moderator@tradehub.co.uk');
  console.log('Workers:   mike.builder@example.com, sarah.sparks@example.com,');
  console.log('           dave.pipes@example.com, tom.wood@example.com, emma.tiles@example.com');
  console.log('Employers: james@acmebuild.co.uk, lisa@homeworks.co.uk, rob@quickfix.co.uk');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
