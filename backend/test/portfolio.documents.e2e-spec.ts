// TEST-PROF-076 — portfolio document linkage e2e (PROF-026).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  approveDocumentDirect,
  seedActiveWorker,
  seedWorkerWithApprovedDocuments,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-076 portfolio ↔ document linkage (PROF-026)', () => {
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

  test('PROF-026 — link an APPROVED document to a CERTIFICATION item, then unlink', async () => {
    const seed = await seedWorkerWithApprovedDocuments(h.prisma, 1);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const cert = await h
      .request()
      .post('/api/portfolio/certification')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'CSCS', cert_type: 'CSCS' })
      .expect(201);
    const portfolioItemId = cert.body.id as string;
    const documentId = seed.documentIds[0].toString();

    const link = await h
      .request()
      .post(`/api/portfolio/${portfolioItemId}/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const docs = link.body.portfolio_item_documents as Array<{
      document_id: string;
    }>;
    expect(docs.some((d) => d.document_id.toString() === documentId)).toBe(
      true,
    );

    const unlink = await h
      .request()
      .delete(`/api/portfolio/${portfolioItemId}/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const docsAfter = unlink.body.portfolio_item_documents as Array<unknown>;
    expect(docsAfter.length).toBe(0);
  });

  test("PROF-026 — cross-user link is rejected with 403 (someone else's document)", async () => {
    const owner = await seedWorkerWithApprovedDocuments(h.prisma, 1);
    const otherWorker = await seedActiveWorker(h.prisma);
    const otherToken = signAccessTokenFor(h, {
      accountId: otherWorker.id,
      email: otherWorker.email,
    });
    const cert = await h
      .request()
      .post('/api/portfolio/certification')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'CSCS', cert_type: 'CSCS' })
      .expect(201);
    await h
      .request()
      .post(
        `/api/portfolio/${cert.body.id}/documents/${owner.documentIds[0].toString()}`,
      )
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  test('PROF-026 — direct admin helper flips a doc to APPROVED so it can be linked (Decisions Log 2026-05-03 row 2)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    // Create a PENDING document directly (simulating an upload that's awaiting review)
    const doc = await h.prisma.document.create({
      data: {
        client_profile_id: seed.id,
        doc_type: 'CSCS_CARD',
        file_url: '/uploads/seed.pdf',
        status: 'PENDING',
      },
    });

    // Profiles e2e bypasses Verification's promotion engine (test-only seam).
    await approveDocumentDirect(h.prisma, doc.id);

    const cert = await h
      .request()
      .post('/api/portfolio/certification')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'CSCS', cert_type: 'CSCS' })
      .expect(201);
    await h
      .request()
      .post(`/api/portfolio/${cert.body.id}/documents/${doc.id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });
});
