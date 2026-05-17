// E2E tests for the JobAttachment feature (8C — single-table exclusive arc).
//
// `job_attachment` is one table. Its owner is an exclusive arc: exactly one
// of job_post_id / job_application_id is set — every attachment belongs to a
// job post XOR a job application. Enforced by the DB CHECK
// `job_attachment_one_owner` plus a code-level guard. There is no
// `uploaded_by_id` column and no orphan stage: a file is uploaded straight
// onto an existing job post or application, so who uploaded it is simply the
// owner of that parent (job_post.employer_id / job_application.worker_id).
//
// Scope:
//   - Upload onto a job post → row with job_post_id set, download_url shape
//   - Upload onto an application → row with job_application_id set
//   - MIME rejection (zip → INVALID_MIME)
//   - Upload onto a post you don't own → 403; missing parent → 404
//   - Per-parent ceiling (11th upload → 429 ATTACHMENT_LIMIT)
//   - Read shape: GET /job-posts/:id includes attachments
//   - Application-attachment download authz: worker OK, post owner OK,
//     third-party employer 403, anonymous 403
//   - Public download for job-post attachments
//   - DELETE: owner OK, others 403
//   - DB CHECK job_attachment_one_owner rejects an unparented row

import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { seedActiveEmployer, seedActiveWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';
import { minimalPdf, nonImageZip } from './util/upload';

describe('Job attachments e2e (ATT-NNN)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    await fs.mkdir(join(process.cwd(), 'uploads', 'job-attachments'), {
      recursive: true,
    });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  // ── helpers ──────────────────────────────────────────────────────────

  type AttachmentBody = {
    id: string;
    download_url: string;
    job_post_id: string | null;
    job_application_id: string | null;
    original_name: string;
  };

  async function createJobPost(token: string): Promise<{ id: string }> {
    const res = await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Kitchen fit',
        pay_type: 'DAY_RATE',
        day_rate_min: 250,
        day_rate_max: 320,
      })
      .expect(201);
    return res.body as { id: string };
  }

  async function applyToJob(
    token: string,
    jobPostId: string,
  ): Promise<{ id: string }> {
    const res = await h
      .request()
      .post(`/api/job-applications/jobs/${jobPostId}/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cover_message: 'I have 10 years of experience.' })
      .expect(201);
    return res.body as { id: string };
  }

  function uploadToJobPost(
    token: string,
    jobPostId: string,
    expectStatus = 201,
  ) {
    const fixture = minimalPdf();
    return h
      .request()
      .post(`/api/job-posts/${jobPostId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(expectStatus);
  }

  function uploadToApplication(
    token: string,
    applicationId: string,
    expectStatus = 201,
  ) {
    const fixture = minimalPdf();
    return h
      .request()
      .post(`/api/job-applications/${applicationId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(expectStatus);
  }

  // ── tests ────────────────────────────────────────────────────────────

  test('ATT-010 — upload onto a job post → row with job_post_id set, job_application_id null', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const post = await createJobPost(token);
    const body = (await uploadToJobPost(token, post.id)).body as AttachmentBody;

    expect(body.id).toMatch(/^\d+$/);
    // job_attachment serialises ids as strings; the job-posts API returns
    // numeric ids — normalise both sides before comparing.
    expect(String(body.job_post_id)).toBe(String(post.id));
    expect(body.job_application_id).toBeNull();
    expect(body.download_url).toBe(`/api/job-attachments/${body.id}/download`);
  });

  test('ATT-011 — upload onto an application → row with job_application_id set, job_post_id null', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const post = await createJobPost(employerToken);
    const application = await applyToJob(workerToken, post.id);
    const body = (await uploadToApplication(workerToken, application.id))
      .body as AttachmentBody;

    expect(String(body.job_application_id)).toBe(String(application.id));
    expect(body.job_post_id).toBeNull();
  });

  test('ATT-012 — non-allowlisted MIME rejected with INVALID_MIME', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const post = await createJobPost(token);
    const evil = nonImageZip();
    const res = await h
      .request()
      .post(`/api/job-posts/${post.id}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', evil.buffer, {
        filename: evil.filename,
        contentType: evil.mimetype,
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_MIME');
  });

  test('ATT-043 — upload onto a post you do not own → 403; missing post → 404', async () => {
    const employerA = await seedActiveEmployer(h.prisma);
    const employerB = await seedActiveEmployer(h.prisma);
    const tokenA = signAccessTokenFor(h, {
      accountId: employerA.id,
      email: employerA.email,
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: employerB.id,
      email: employerB.email,
    });
    const post = await createJobPost(tokenA);

    // B cannot upload onto A's post.
    await uploadToJobPost(tokenB, post.id, 403);
    // A uploading onto a non-existent post → 404.
    await uploadToJobPost(tokenA, '99999999', 404);
  });

  test('ATT-013 — per-parent ceiling: the 11th attachment on a post → 429 ATTACHMENT_LIMIT', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const post = await createJobPost(token);

    // Fast path: insert 10 attachment rows directly (each correctly parented).
    for (let i = 0; i < 10; i += 1) {
      await h.prisma.jobAttachment.create({
        data: {
          job_post_id: BigInt(post.id),
          file_url: `/uploads/job-attachments/${crypto.randomUUID()}.pdf`,
          original_name: `${i}.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
      });
    }

    const res = await uploadToJobPost(token, post.id, 429);
    expect(res.body.code).toBe('ATTACHMENT_LIMIT');
  });

  test('ATT-020 — job-post attachment download is public', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const post = await createJobPost(token);
    const att = (await uploadToJobPost(token, post.id)).body as AttachmentBody;

    // Anonymous download works for job-post attachments.
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .expect(200);
  });

  test('ATT-040 — GET /job-posts/:id includes the attachment', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const post = await createJobPost(token);
    const att = (await uploadToJobPost(token, post.id)).body as AttachmentBody;

    const fetched = await h
      .request()
      .get(`/api/job-posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(fetched.body.attachments)).toBe(true);
    expect(fetched.body.attachments).toHaveLength(1);
    expect(String(fetched.body.attachments[0].id)).toBe(att.id);
  });

  test('ATT-042 — application-attachment download authz: worker OK, post owner OK, third-party 403, anon 403', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const otherEmployer = await seedActiveEmployer(h.prisma);
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const otherEmployerToken = signAccessTokenFor(h, {
      accountId: otherEmployer.id,
      email: otherEmployer.email,
    });

    const post = await createJobPost(employerToken);
    const application = await applyToJob(workerToken, post.id);
    const att = (await uploadToApplication(workerToken, application.id))
      .body as AttachmentBody;

    // Worker (applicant) — OK
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);
    // Owning employer — OK
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .set('Authorization', `Bearer ${employerToken}`)
      .expect(200);
    // Third-party employer — 403
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .set('Authorization', `Bearer ${otherEmployerToken}`)
      .expect(403);
    // Anonymous — 403
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .expect(403);
  });

  test('ATT-030 — DELETE: owner OK (204), non-owner 403', async () => {
    const employerA = await seedActiveEmployer(h.prisma);
    const employerB = await seedActiveEmployer(h.prisma);
    const tokenA = signAccessTokenFor(h, {
      accountId: employerA.id,
      email: employerA.email,
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: employerB.id,
      email: employerB.email,
    });
    const post = await createJobPost(tokenA);
    const att = (await uploadToJobPost(tokenA, post.id)).body as AttachmentBody;

    // B cannot delete A's attachment.
    await h
      .request()
      .delete(`/api/job-attachments/${att.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    // A can.
    await h
      .request()
      .delete(`/api/job-attachments/${att.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  test('ATT-050 — DB CHECK job_attachment_one_owner rejects an unparented row', async () => {
    // A row with neither parent violates `num_nonnulls(...) = 1`.
    await expect(
      h.prisma.jobAttachment.create({
        data: {
          file_url: `/uploads/job-attachments/${crypto.randomUUID()}.pdf`,
          original_name: 'orphan.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
      }),
    ).rejects.toThrow();
  });
});
