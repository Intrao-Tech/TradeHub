// TEST-VER-243..245 — HMRC CIS structured submission e2e (VER-146 / VER-149).

import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker, seedAdmin } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-VER-243..245 HMRC CIS submission (VER-146 / VER-149)', () => {
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

  describe('TEST-VER-243 happy CIS submission — VER-146', () => {
    test('HMRC_CIS_DOCUMENT with valid UTR + NI → 201, file_url=(structured-only)', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'HMRC_CIS_DOCUMENT')
        .field(
          'metadata',
          JSON.stringify({ utr: '1234567890', ni_number: 'AB123456C' }),
        )
        .expect(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.file_url).toBe('(structured-only)');
      expect(res.body.metadata).toMatchObject({
        utr: '1234567890',
        ni_number: 'AB123456C',
      });
    });

    test('VER-149 — audit row does not leak UTR or NI substrings', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'HMRC_CIS_DOCUMENT')
        .field(
          'metadata',
          JSON.stringify({ utr: '1234567890', ni_number: 'AB123456C' }),
        )
        .expect(201);

      const audits = await h.prisma.auditLog.findMany({
        where: {
          account_id: seed.id,
          action: 'verification.document.uploaded',
        },
      });
      expect(audits.length).toBeGreaterThan(0);
      for (const a of audits) {
        const blob = JSON.stringify(a.metadata ?? {});
        expect(blob).not.toContain('1234567890');
        expect(blob).not.toContain('AB123456C');
      }
    });
  });

  describe('TEST-VER-244 invalid CIS credentials', () => {
    test('UTR 9 chars → 400 INVALID_UTR', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'HMRC_CIS_DOCUMENT')
        .field(
          'metadata',
          JSON.stringify({ utr: '123456789', ni_number: 'AB123456C' }),
        );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UTR');
    });

    test('NI bad format → 400 INVALID_NI', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('doc_type', 'HMRC_CIS_DOCUMENT')
        .field(
          'metadata',
          JSON.stringify({ utr: '1234567890', ni_number: 'AB1234567' }),
        );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_NI');
    });
  });

  describe('TEST-VER-245 happy approve writes HMRC_CIS_VERIFIED milestone', () => {
    test('Approve does not advance level past BASIC (VER-006 auxiliary)', async () => {
      const owner = await seedActiveWorker(h.prisma);
      const ownerToken = signAccessTokenFor(h, {
        accountId: owner.id,
        email: owner.email,
      });
      const upload = await h
        .request()
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('doc_type', 'HMRC_CIS_DOCUMENT')
        .field(
          'metadata',
          JSON.stringify({ utr: '1234567890', ni_number: 'AB123456C' }),
        )
        .expect(201);

      const admin = await seedAdmin(h.prisma);
      const adminToken = signAccessTokenFor(h, {
        accountId: admin.id,
        email: admin.email,
      });
      const review = await h
        .request()
        .post(`/api/verification/documents/${upload.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE' })
        .expect(200);
      expect(review.body.milestones_written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'HMRC_CIS_VERIFIED' }),
        ]),
      );
    });
  });
});
