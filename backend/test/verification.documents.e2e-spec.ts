// TEST-VER-270..271 — document upload integrates the metadata validator.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { minimalPdf } from './util/upload';

describe('TEST-VER-270..271 documents upload — validator e2e', () => {
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

  test('OTHER without metadata.title → 400 INVALID_TITLE / METADATA_REQUIRED', async () => {
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
      .field('doc_type', 'OTHER')
      .attach('file', fixture.buffer, {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(['INVALID_TITLE', 'METADATA_REQUIRED']).toContain(res.body.code);
  });

  test('OTHER happy path persists trimmed title', async () => {
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
      .field('doc_type', 'OTHER')
      .field('metadata', JSON.stringify({ title: '  Plumbing License  ' }))
      .attach('file', fixture.buffer, {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(res.body.metadata).toMatchObject({ title: 'Plumbing License' });
  });

  test('RIGHT_TO_WORK_SHARE_CODE with hyphenated code → 400 INVALID_SHARE_CODE', async () => {
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

  test('HMRC_CIS_DOCUMENT with bad UTR → 400 INVALID_UTR', async () => {
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
        JSON.stringify({ utr: '12345', ni_number: 'AB123456C' }),
      );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UTR');
  });

  test('Share code uppercased on persistence', async () => {
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
    expect(res.body.metadata).toMatchObject({ share_code: 'W12 ABC 345' });
  });
});
