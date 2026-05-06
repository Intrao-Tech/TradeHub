// TEST-VER-250..253 — verification reads e2e (/me, /levels/:id, /ladder/:id,
// /providers). Covers VER-053 / 060 / 061 + the public-flag projection.

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedAdmin,
  seedDeactivatedWorker,
  seedMilestone,
  seedDocumentForReview,
  seedVerifiedWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-VER-250..253 verification reads (VER-053 / VER-060 / VER-061)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  describe('TEST-VER-250 GET /verification/me', () => {
    test('VER-053 — returns grouped documents shape + level + next_action', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      // Seed one doc in each status.
      await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'CSCS_CARD',
        status: 'PENDING',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'INSURANCE',
        status: 'IN_REVIEW',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'GAS_SAFE_CERT',
        status: 'REJECTED',
        rejectionReason: 'Photo too blurry to read',
      });

      const res = await h
        .request()
        .get('/api/verification/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.verification_level).toBe('UNVERIFIED');
      expect(res.body.documents.pending).toHaveLength(1);
      expect(res.body.documents.in_review).toHaveLength(1);
      expect(res.body.documents.approved).toHaveLength(1);
      expect(res.body.documents.rejected).toHaveLength(1);
      expect(res.body.documents.rejected[0].rejection_reason).toBe(
        'Photo too blurry to read',
      );
      expect(res.body.next_action).toMatchObject({ rung: 'BASIC' });
    });

    test('Auth required → 401', async () => {
      await h.request().get('/api/verification/me').expect(401);
    });
  });

  describe('TEST-VER-251 GET /verification/levels/:id (public)', () => {
    test('VER-060 — public read returns 200 + flags shape', async () => {
      const seed = await seedVerifiedWorker(h.prisma);
      const res = await h
        .request()
        .get(`/api/verification/levels/${seed.id}`)
        .expect(200);

      expect(res.body.verification_level).toBe('BASIC');
      expect(res.body.flags.identity_verified).toBe(true);
      expect(res.body.flags.insurance_approved).toBe(false);
      expect(res.body.flags.certification_doc_types).toEqual([]);
    });

    test('VER-060a — deactivated account → 404', async () => {
      const seed = await seedDeactivatedWorker(h.prisma);
      await h.request().get(`/api/verification/levels/${seed.id}`).expect(404);
    });

    test('VER-060 — certification_doc_types includes only APPROVED cert docs', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const approvedCert = await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
      });
      const rejectedCert = await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'GAS_SAFE_CERT',
        status: 'REJECTED',
      });
      // Milestone points at the approved doc only.
      await seedMilestone(h.prisma, {
        clientProfileId: seed.id,
        type: 'CERTIFICATION_APPROVED',
        evidenceRef: String(approvedCert.id),
      });
      await seedMilestone(h.prisma, {
        clientProfileId: seed.id,
        type: 'CERTIFICATION_APPROVED',
        evidenceRef: String(rejectedCert.id),
      });

      const res = await h
        .request()
        .get(`/api/verification/levels/${seed.id}`)
        .expect(200);
      expect(res.body.flags.certification_doc_types).toEqual(['CSCS_CARD']);
    });

    test('TEST-VER-152 — response does not leak metadata, doc IDs, or staff actor IDs', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const cert = await seedDocumentForReview(h.prisma, {
        ownerId: seed.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
        metadata: { certificate_number: 'SECRET12345' },
      });
      await seedMilestone(h.prisma, {
        clientProfileId: seed.id,
        type: 'CERTIFICATION_APPROVED',
        evidenceRef: String(cert.id),
      });
      const res = await h
        .request()
        .get(`/api/verification/levels/${seed.id}`)
        .expect(200);
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain('SECRET12345');
      expect(serialised).not.toContain('staff_member_id');
      expect(serialised).not.toContain('"metadata"');
    });
  });

  describe('TEST-VER-252 GET /verification/ladder/:id', () => {
    test('VER-061 — owner gets 200 with rungs', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .get(`/api/verification/ladder/${seed.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.current_level).toBe('UNVERIFIED');
      expect(res.body.rungs).toHaveLength(4);
    });

    test('VER-061 — non-staff non-owner → 403 FORBIDDEN', async () => {
      const ownerSeed = await seedActiveWorker(h.prisma);
      const otherSeed = await seedActiveWorker(h.prisma);
      const otherToken = signAccessTokenFor(h, {
        accountId: otherSeed.id,
        email: otherSeed.email,
      });

      const res = await h
        .request()
        .get(`/api/verification/ladder/${ownerSeed.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('VER-061 — staff can access any ladder', async () => {
      const ownerSeed = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const adminToken = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });

      await h
        .request()
        .get(`/api/verification/ladder/${ownerSeed.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('TEST-VER-253 GET /verification/providers', () => {
    test('Returns both flags as booleans reflecting STRIPE_SECRET_KEY + COMPANIES_HOUSE_API_KEY', async () => {
      const res = await h
        .request()
        .get('/api/verification/providers')
        .expect(200);
      expect(typeof res.body.stripe_identity).toBe('boolean');
      expect(typeof res.body.companies_house).toBe('boolean');
      expect(res.body.stripe_identity).toBe(
        Boolean(process.env.STRIPE_SECRET_KEY),
      );
      expect(res.body.companies_house).toBe(
        Boolean(process.env.COMPANIES_HOUSE_API_KEY),
      );
    });
  });
});
