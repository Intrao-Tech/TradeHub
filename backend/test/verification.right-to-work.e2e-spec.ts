// TEST-VER-240..242 — Right-to-Work upload + approval e2e (VER-040 / VER-043 /
// VER-092). Replaces the stale `right-to-work.e2e-spec.ts` (TEST-VER-012).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedAdmin,
  seedMilestone,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { minimalPdf } from './util/upload';

describe('TEST-VER-240..242 right-to-work submission (VER-040 / VER-043 / VER-092)', () => {
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

  describe('TEST-VER-240 share-code path — VER-092', () => {
    test('Happy path: W12 ABC 345 → 201, persisted normalised', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const fixture = minimalPdf();
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'RIGHT_TO_WORK_SHARE_CODE')
        .field('metadata', JSON.stringify({ share_code: 'w12 abc 345' }))
        .attach('file', fixture.buffer, {
          filename: 'rtw.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.metadata).toMatchObject({ share_code: 'W12 ABC 345' });
    });

    test('Approve RTW share-code → RIGHT_TO_WORK_VERIFIED milestone written but level NOT advancing past BASIC (VER-043 auxiliary)', async () => {
      const owner = await seedActiveWorker(h.prisma);
      // Owner already at BASIC via seeded identity milestone.
      await seedMilestone(h.prisma, {
        clientProfileId: owner.id,
        type: 'IDENTITY_VERIFIED',
      });
      await h.prisma.clientProfile.update({
        where: { id: owner.id },
        data: { verification_level: 'BASIC' },
      });
      const ownerToken = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const fixture = minimalPdf();
      const upload = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('doc_type', 'RIGHT_TO_WORK_SHARE_CODE')
        .field('metadata', JSON.stringify({ share_code: 'W12 ABC 345' }))
        .attach('file', fixture.buffer, {
          filename: 'rtw.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const admin = await seedAdmin(h.prisma);
      const adminToken = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      // Admin overrides the assignee gate — auto-assigned to no one (no on-duty staff).
      const review = await h
        .request()
        .post(`/api/verification/documents/${upload.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE' })
        .expect(200);
      expect(review.body.milestones_written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'RIGHT_TO_WORK_VERIFIED' }),
        ]),
      );
      expect(review.body.level_changed).toBeNull();

      const refreshed = await h.prisma.clientProfile.findUnique({
        where: { id: owner.id },
      });
      expect(refreshed?.verification_level).toBe('BASIC');
    });
  });

  describe('TEST-VER-241 invalid share code', () => {
    test('Hyphenated share code → 400 INVALID_SHARE_CODE', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const fixture = minimalPdf();
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'RIGHT_TO_WORK_SHARE_CODE')
        .field('metadata', JSON.stringify({ share_code: 'W12-ABC-345' }))
        .attach('file', fixture.buffer, {
          filename: 'rtw.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SHARE_CODE');
    });
  });

  describe('TEST-VER-242 RIGHT_TO_WORK_DOCUMENT path', () => {
    test('Document upload with empty metadata → 201; staff approve writes RIGHT_TO_WORK_VERIFIED milestone', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const ownerToken = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const fixture = minimalPdf();
      const upload = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('doc_type', 'RIGHT_TO_WORK_DOCUMENT')
        .attach('file', fixture.buffer, {
          filename: 'rtw.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const admin = await seedAdmin(h.prisma);
      const adminToken = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const res = await h
        .request()
        .post(`/api/verification/documents/${upload.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE' })
        .expect(200);
      expect(res.body.milestones_written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'RIGHT_TO_WORK_VERIFIED' }),
        ]),
      );
    });
  });
});
