// TEST-PROF-078 — right-to-work e2e (PROF-052, PROF-053).
//
// Verification owns the `RIGHT_TO_WORK_SHARE_CODE` / `RIGHT_TO_WORK_DOCUMENT`
// enum values and the share-code metadata column.  Until that ships,
// PROF-053 fallback says we accept submissions as `OTHER` documents.  Both
// happy paths stay `.skip` (TEST-PROF-201) until Verification merges the
// enum extension; the fallback test below is live and asserts that an
// `OTHER`-typed upload still works.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { minimalPdf } from './util/upload';

describe('TEST-PROF-078 right-to-work submission (PROF-052, PROF-053 fallback)', () => {
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

  test('PROF-053 fallback — share-code submission still works as a generic OTHER document while Verification is unsealed', async () => {
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
        filename: 'rtw.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
  });

  test.skip(
    'PROF-052 share-code path — TODO: persist `metadata = { share_code, dob }` once Verification ships RIGHT_TO_WORK_SHARE_CODE doc_type. ' +
      'Citation: tasks/in-progress/profiles/spec.md PROF-053; tests-profiles spec TEST-PROF-201.',
    async () => {
      // empty
    },
  );

  test.skip(
    'PROF-052 document path — TODO: doc_type=RIGHT_TO_WORK_DOCUMENT once Verification ships the enum extension.',
    async () => {
      // empty
    },
  );
});
