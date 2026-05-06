// TEST-VER-220..225 — verification document assignment e2e
// (VER-125..128, VER-137).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedAdmin,
  seedDocumentForReview,
  seedModerator,
  seedOnDutyStaff,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { minimalPdf } from './util/upload';

describe('TEST-VER-220..225 verification assignment (VER-125..128, VER-137)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    await fs.mkdir(join(process.cwd(), 'uploads'), { recursive: true });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  describe('TEST-VER-220 upload-time auto-assign — VER-126', () => {
    test('one on-duty active staff → upload sets assigned_to', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const mod = await seedOnDutyStaff(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const fixture = minimalPdf();

      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'CSCS_CARD')
        .attach('file', fixture.buffer, {
          filename: fixture.filename,
          contentType: fixture.mimetype,
        })
        .expect(201);
      expect(res.body.assigned_to).toBe(String(mod.staffId));

      const audits = await h.prisma.auditLog.findMany({
        where: {
          action: 'verification.document.assigned',
          entity_id: BigInt(res.body.id),
        },
      });
      expect(audits[0].metadata).toMatchObject({
        from: null,
        reason: 'auto',
      });
    });

    test('two on-duty staff with different load → newest upload goes to lower-load staff', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const heavy = await seedOnDutyStaff(h.prisma, { assignedDocCount: 2 });
      const light = await seedOnDutyStaff(h.prisma, { assignedDocCount: 0 });
      const token = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const fixture = minimalPdf();
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'CSCS_CARD')
        .attach('file', fixture.buffer, {
          filename: fixture.filename,
          contentType: fixture.mimetype,
        })
        .expect(201);
      expect(res.body.assigned_to).toBe(String(light.staffId));
      expect(res.body.assigned_to).not.toBe(String(heavy.staffId));
    });

    test('no on-duty staff → upload assigned_to is null', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const fixture = minimalPdf();
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'CSCS_CARD')
        .attach('file', fixture.buffer, {
          filename: fixture.filename,
          contentType: fixture.mimetype,
        })
        .expect(201);
      expect(res.body.assigned_to).toBeNull();
    });
  });

  describe('TEST-VER-221 POST /verification/documents/:id/claim — VER-137', () => {
    test('Unassigned doc → 200 + audit reason claim', async () => {
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
        .post(`/api/verification/documents/${doc.id}/claim`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({ ok: true, assigned_to: String(mod.id) });
    });

    test('Already-assigned-to-someone-else → 409 ALREADY_ASSIGNED (VER-137; FU-VER-1 resolved 2026-05-06)', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const modA = await seedModerator(h.prisma);
      const modB = await seedModerator(h.prisma);
      const tokenB = signAccessTokenFor(h, {
        accountId: modB.id,
        email: modB.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: modA.id,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/claim`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_ASSIGNED');
    });

    test('Doc not found → 404 DOCUMENT_NOT_FOUND', async () => {
      const mod = await seedModerator(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: mod.id,
        email: mod.email,
      });
      const res = await h
        .request()
        .post('/api/verification/documents/999999/claim')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('Race: two parallel claims → exactly one succeeds (200), other 400', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const modA = await seedModerator(h.prisma);
      const modB = await seedModerator(h.prisma);
      const tokenA = signAccessTokenFor(h, {
        accountId: modA.id,
        email: modA.email,
      });
      const tokenB = signAccessTokenFor(h, {
        accountId: modB.id,
        email: modB.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });

      const [resA, resB] = await Promise.all([
        h
          .request()
          .post(`/api/verification/documents/${doc.id}/claim`)
          .set('Authorization', `Bearer ${tokenA}`),
        h
          .request()
          .post(`/api/verification/documents/${doc.id}/claim`)
          .set('Authorization', `Bearer ${tokenB}`),
      ]);
      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  describe('TEST-VER-222 POST /verification/documents/:id/assign (admin only)', () => {
    test('Admin assigns to on-duty staff → 200 + audit reason admin_reassign', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const target = await seedOnDutyStaff(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });

      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ staff_member_id: String(target.staffId) })
        .expect(200);
      expect(res.body.assigned_to).toBe(String(target.staffId));
    });

    test('Admin assigns to off-duty staff → 400 STAFF_OFF_DUTY', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const target = await seedOnDutyStaff(h.prisma, { isOnDuty: false });
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ staff_member_id: String(target.staffId) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STAFF_OFF_DUTY');
    });

    test('Admin assigns to non-existent staff id → 400 STAFF_NOT_FOUND', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ staff_member_id: '99999' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STAFF_NOT_FOUND');
    });

    test('Admin clears assignment with staff_member_id null → 200', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const target = await seedOnDutyStaff(h.prisma);
      const admin = await seedAdmin(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const doc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: target.staffId,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${doc.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ staff_member_id: null })
        .expect(200);
      expect(res.body.assigned_to).toBeNull();
    });

    test('Moderator hitting endpoint → 403 from RolesGuard(ADMIN)', async () => {
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
      await h
        .request()
        .post(`/api/verification/documents/${doc.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ staff_member_id: String(mod.id) })
        .expect(403);
    });
  });

  describe('TEST-VER-223 duty-off reassignment — VER-127', () => {
    test('Staff with open docs toggles off-duty → docs reassigned, audit duty_off rows fire', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const goingOff = await seedOnDutyStaff(h.prisma);
      // Replace the auto-seeded preassigned docs (none here since assignedDocCount default is 0)
      // by uploading two docs assigned to goingOff.
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: goingOff.staffId,
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'INSURANCE',
        assignedTo: goingOff.staffId,
      });

      const offToken = signAccessTokenFor(h, {
        accountId: goingOff.id,
        email: goingOff.email,
      });
      const res = await h
        .request()
        .post('/api/staff/me/duty')
        .set('Authorization', `Bearer ${offToken}`)
        .send({ on_duty: false })
        .expect(201);
      expect(res.body).toMatchObject({ is_on_duty: false });

      // Both docs should now have assigned_to=null (only on-duty staff was the
      // one going off, so they fall to the unassigned bucket).
      const docs = await h.prisma.document.findMany({
        where: { client_profile_id: owner.id },
      });
      expect(docs.every((d) => d.assigned_to == null)).toBe(true);
    });

    test('Toggling ON → no reassignment count', async () => {
      const seed = await seedOnDutyStaff(h.prisma, { isOnDuty: false });
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/staff/me/duty')
        .set('Authorization', `Bearer ${token}`)
        .send({ on_duty: true })
        .expect(201);
      expect(res.body.is_on_duty).toBe(true);
    });
  });

  describe('TEST-VER-225 terminal docs not reassigned — VER-127', () => {
    test('APPROVED docs stay assigned when staff goes off-duty', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const goingOff = await seedOnDutyStaff(h.prisma);
      const approvedDoc = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
        assignedTo: goingOff.staffId,
      });

      const offToken = signAccessTokenFor(h, {
        accountId: goingOff.id,
        email: goingOff.email,
      });
      await h
        .request()
        .post('/api/staff/me/duty')
        .set('Authorization', `Bearer ${offToken}`)
        .send({ on_duty: false })
        .expect(201);

      const refreshed = await h.prisma.document.findUnique({
        where: { id: approvedDoc.id },
      });
      expect(refreshed?.assigned_to).toBe(goingOff.staffId);
    });
  });
});
