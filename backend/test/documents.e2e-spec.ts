// TEST-PROF-077 — documents e2e (PROF-028 / PROF-029 / PROF-030 / BE-PROF-8).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import { approveDocumentDirect, seedActiveWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { mediaPngTooLarge, minimalPdf, nonImageZip } from './util/upload';

describe('TEST-PROF-077 documents (PROF-028, PROF-029, PROF-030)', () => {
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

  test('PROF-029 — happy path: upload PDF → row in PENDING with /uploads/{uuid}.pdf', async () => {
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
      .field('doc_type', 'CSCS_CARD')
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.doc_type).toBe('CSCS_CARD');
    expect(res.body.file_url).toMatch(/^\/uploads\/[\w-]+\.pdf$/);
  });

  test("PROF-028 — GET /documents/me lists the caller's documents", async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = minimalPdf();
    await h
      .request()
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'INSURANCE')
      .attach('file', fixture.buffer, {
        filename: 'insurance.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const list = await h
      .request()
      .get('/api/documents/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBe(1);
    expect(list.body[0].doc_type).toBe('INSURANCE');
  });

  test('BE-PROF-8 — application/zip rejected with INVALID_MIME', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = nonImageZip();
    const res = await h
      .request()
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'OTHER')
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.code).toBe('INVALID_MIME');
  });

  test('BE-PROF-8 — > 10 MiB upload trips the size cap', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await mediaPngTooLarge();
    const res = await h
      .request()
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'OTHER')
      .attach('file', fixture.buffer, {
        filename: 'big.png',
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  }, 30_000);

  test('PROF-030 — only PENDING documents may be deleted by owner; APPROVED returns 400', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = minimalPdf();
    const upload = await h
      .request()
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'CSCS_CARD')
      .attach('file', fixture.buffer, {
        filename: 'cscs.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const id = upload.body.id;
    // Pending → can delete
    await h
      .request()
      .delete(`/api/documents/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Re-upload, then approve via test-only Prisma seam, then expect 400 on delete.
    const upload2 = await h
      .request()
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('doc_type', 'CSCS_CARD')
      .attach('file', fixture.buffer, {
        filename: 'cscs2.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await approveDocumentDirect(h.prisma, BigInt(upload2.body.id));
    await h
      .request()
      .delete(`/api/documents/${upload2.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
