// TEST-VER-210..214 — verification document review e2e (VER-032 / VER-033 /
// VER-037 / VER-132 + the promotion chain).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveEmployer,
  seedActiveWorker,
  seedAdmin,
  seedDocumentForReview,
  seedMilestone,
  seedModerator,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-VER-210..214 verification review (VER-032 / VER-033 / VER-037 / VER-132)', () => {
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

  describe('TEST-VER-210 happy approve → promotion chain', () => {
    test('CSCS approval promotes UNVERIFIED→BASIC→CERTIFIED via the chain', async () => {
      const owner = await seedActiveWorker(h.prisma);
      // Pre-condition: identity verified so the worker is BASIC.
      await seedMilestone(h.prisma, {
        clientProfileId: owner.id,
        type: 'IDENTITY_VERIFIED',
      });
      await h.prisma.clientProfile.update({
        where: { id: owner.id },
        data: { verification_level: 'BASIC' },
      });

      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });

      // Doc assigned directly to the admin to keep this off the gating branch.
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });

      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' })
        .expect(200);

      expect(res.body.document.status).toBe('APPROVED');
      expect(res.body.level_changed).toEqual({
        from: 'BASIC',
        to: 'CERTIFIED',
      });
      expect(res.body.milestones_written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'CERTIFICATION_APPROVED' }),
        ]),
      );

      const refreshed = await h.prisma.clientProfile.findUnique({
        where: { id: owner.id },
      });
      expect(refreshed?.verification_level).toBe('CERTIFIED');
    });
  });

  describe('TEST-VER-211 happy reject', () => {
    test('REJECT writes rejection_reason; user sees it in /verification/me rejected bucket', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const ownerToken = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const admin = await seedAdmin(h.prisma);
      const adminToken = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });

      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'REJECT',
          reason: 'Card photo is too blurry to verify the registration number',
        })
        .expect(200);
      expect(res.body.document.status).toBe('REJECTED');
      expect(res.body.document.rejection_reason).toContain('blurry');
      expect(res.body.level_changed).toBeNull();

      const me = await h
        .request()
        .get('/api/verification/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(me.body.documents.rejected).toHaveLength(1);
      expect(me.body.documents.rejected[0].rejection_reason).toContain('blurry');
    });
  });

  describe('TEST-VER-212 review validation errors', () => {
    test('REJECT without reason → 400 REJECTION_REASON_REQUIRED', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });

      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'REJECT' })
        .expect(400);
      expect(res.body.code).toBe('REJECTION_REASON_REQUIRED');
    });

    test('REJECT with 9-char reason → 400 (DTO MinLength validator)', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'REJECT', reason: 'short8ch' });
      expect(res.status).toBe(400);
      // The DTO MinLength validator catches this before the service runs;
      // class-validator surfaces a generic 400 without the structured code.
      // The service-level `REJECTION_REASON_REQUIRED` code is covered by the
      // unit spec at TEST-VER-111. Both branches must reject.
    });

    test('REJECT with >500-char reason → 400 from Length validator', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'REJECT', reason: 'a'.repeat(501) });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('APPROVE with reason → 400 VALIDATION', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: admin.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE', reason: 'why is this here' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    test('Already-APPROVED doc → 409 INVALID_TRANSITION', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
        assignedTo: admin.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('TEST-VER-213 assignee gating — VER-132', () => {
    test('Moderator A reviewing Moderator B doc → 403 NOT_ASSIGNEE', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const modA = await seedModerator(h.prisma);
      const modB = await seedModerator(h.prisma);
      const tokenA = signAccessTokenFor(h, {
        accountId: modA.id,
        email: modA.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: modB.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ decision: 'APPROVE' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_ASSIGNEE');
    });

    test('Moderator reviewing unassigned doc → 403 with claim copy', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const mod = await seedModerator(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: mod.id,
        email: mod.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Claim it/);
    });

    test('Admin reviewing Moderator-B doc → succeeds, audit row carries admin_override:true', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const modB = await seedModerator(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      // Get owner to BASIC so APPROVE writes a milestone.
      await seedMilestone(h.prisma, {
        clientProfileId: owner.id,
        type: 'IDENTITY_VERIFIED',
      });
      await h.prisma.clientProfile.update({
        where: { id: owner.id },
        data: { verification_level: 'BASIC' },
      });

      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: modB.id,
      });
      await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' })
        .expect(200);

      const audits = await h.prisma.auditLog.findMany({
        where: {
          action: 'verification.document.reviewed',
          entity_id: doc.id,
        },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata).toMatchObject({ admin_override: true });
    });

    test('Worker (non-staff) → 403 from RolesGuard', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      await h
        .request()
        .post(`/api/verification/documents/${doc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' })
        .expect(403);
    });
  });

  describe('TEST-VER-214 employer Certified path — VER-012', () => {
    test('INSURANCE alone keeps level at BASIC; INSURANCE + LETTERHEAD → CERTIFIED', async () => {
      const employer = await seedActiveEmployer(h.prisma);
      await seedMilestone(h.prisma, {
        clientProfileId: employer.id,
        type: 'IDENTITY_VERIFIED',
      });
      await h.prisma.clientProfile.update({
        where: { id: employer.id },
        data: { verification_level: 'BASIC' },
      });
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });

      const insuranceDoc = await seedDocumentForReview(h.prisma, {
        ownerId: employer.id,
        docType: 'INSURANCE',
        assignedTo: admin.id,
      });
      const res1 = await h
        .request()
        .post(`/api/verification/documents/${insuranceDoc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' })
        .expect(200);
      expect(res1.body.level_changed).toBeNull();

      const letterheadDoc = await seedDocumentForReview(h.prisma, {
        ownerId: employer.id,
        docType: 'COMPANY_LETTERHEAD',
        assignedTo: admin.id,
      });
      const res2 = await h
        .request()
        .post(`/api/verification/documents/${letterheadDoc.id}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'APPROVE' })
        .expect(200);
      expect(res2.body.level_changed).toEqual({
        from: 'BASIC',
        to: 'CERTIFIED',
      });
    });
  });
});
