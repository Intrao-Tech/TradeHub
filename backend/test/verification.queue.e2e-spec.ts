// TEST-VER-260..262 — verification queue e2e (VER-035 / VER-036 / VER-070 /
// VER-074 / VER-130 / VER-131).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedAdmin,
  seedDocumentForReview,
  seedModerator,
  seedOnDutyStaff,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-VER-260..262 verification queue (VER-035..036, VER-130..131)', () => {
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

  async function asAdmin() {
    const seed = await seedAdmin(h.prisma);
    return {
      seed,
      token: signAccessTokenFor(h, { accountId: seed.id, email: seed.email }),
    };
  }

  async function asModerator() {
    const seed = await seedModerator(h.prisma);
    return {
      seed,
      token: signAccessTokenFor(h, { accountId: seed.id, email: seed.email }),
    };
  }

  describe('TEST-VER-260 GET /verification/queue scoping — VER-130', () => {
    test('VER-130 — moderator with no assignment returns only their assigned docs', async () => {
      const { seed: mod, token } = await asModerator();
      const owner = await seedActiveWorker(h.prisma);
      // Doc assigned to this moderator.
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        assignedTo: mod.id,
      });
      // Doc assigned to nobody (should NOT appear).
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'INSURANCE',
      });

      const res = await h
        .request()
        .get('/api/verification/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].assignee.id).toBe(String(mod.id));
    });

    test('VER-130 — moderator passing assignment=all → 403 FORBIDDEN', async () => {
      const { token } = await asModerator();
      const res = await h
        .request()
        .get('/api/verification/queue?assignment=all')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('VER-130 — assignment=unassigned returns only unassigned docs', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      const mod = await seedOnDutyStaff(h.prisma);
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'INSURANCE',
        assignedTo: mod.staffId,
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });

      const res = await h
        .request()
        .get('/api/verification/queue?assignment=unassigned')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].assignee).toBeNull();
    });

    test('VER-130 — admin default returns all docs', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'INSURANCE',
      });

      const res = await h
        .request()
        .get('/api/verification/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items.length).toBe(2);
    });

    test('Worker (non-staff) → 403 from RolesGuard', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      await h
        .request()
        .get('/api/verification/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('TEST-VER-261 filters + sort + pagination — VER-070', () => {
    test('status=APPROVED returns only approved', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        status: 'PENDING',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        status: 'APPROVED',
      });

      const res = await h
        .request()
        .get('/api/verification/queue?status=APPROVED')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].document.status).toBe('APPROVED');
    });

    test('doc_type filter narrows by type', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'INSURANCE',
      });

      const res = await h
        .request()
        .get('/api/verification/queue?doc_type=CSCS_CARD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].document.doc_type).toBe('CSCS_CARD');
    });

    test('Pagination page/limit clamps results', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      for (let i = 0; i < 3; i += 1) {
        await seedDocumentForReview(h.prisma, {
          ownerId: owner.id,
          docType: 'CSCS_CARD',
        });
      }
      const res = await h
        .request()
        .get('/api/verification/queue?limit=2&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
    });
  });

  describe('TEST-VER-262 GET /verification/queue/:id', () => {
    test('Doc found → returns uploader.verification_level + history (excluding self)', async () => {
      const { token } = await asAdmin();
      const owner = await seedActiveWorker(h.prisma);
      // Older same-doc-type submission (history)
      await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
        status: 'REJECTED',
        rejectionReason: 'Earlier blurry attempt rejected for clarity',
      });
      // The current row.
      const target = await seedDocumentForReview(h.prisma, {
        ownerId: owner.id,
        docType: 'CSCS_CARD',
      });

      const res = await h
        .request()
        .get(`/api/verification/queue/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.uploader).toMatchObject({
        verification_level: 'UNVERIFIED',
      });
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0].status).toBe('REJECTED');
    });

    test('Doc not found → 404', async () => {
      const { token } = await asAdmin();
      const res = await h
        .request()
        .get('/api/verification/queue/9999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
    });
  });
});
