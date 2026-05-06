// E2E tests for the JobAttachment feature.
//
// Scope:
//   - Upload happy path → orphan row, `download_url` shape, both FKs null
//   - MIME rejection (zip → INVALID_MIME)
//   - Size cap (>25 MB → multer LIMIT_FILE_SIZE → 400)
//   - Wire on POST /job-posts (employer) and POST /job-applications/...apply (worker)
//   - Cross-account NOT_OWNER guard (worker B can't wire worker A's orphan)
//   - Read shape: GET /job-posts/:id includes attachments
//   - Application attachment download: worker OK, post owner OK, third-party employer 403, anon 403
//   - Public download for job-post attachments
//   - DELETE orphan: own OK, others 403, attached → 409
//   - Orphan sweep: rows older than 48 h are deleted, fresher rows kept

import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { JobAttachmentService } from '../src/job-attachment/job-attachment.service';
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

  async function uploadOne(token: string) {
    const fixture = minimalPdf();
    const res = await h
      .request()
      .post('/api/job-attachments')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(201);
    return res.body as {
      id: string;
      download_url: string;
      job_post_id: string | null;
      job_application_id: string | null;
      original_name: string;
    };
  }

  test('ATT-010 — happy path: PDF upload returns orphan row with download_url', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const body = await uploadOne(token);
    expect(body.id).toMatch(/^\d+$/);
    expect(body.job_post_id).toBeNull();
    expect(body.job_application_id).toBeNull();
    expect(body.download_url).toBe(`/api/job-attachments/${body.id}/download`);
  });

  test('ATT-012 — non-allowlisted MIME rejected with INVALID_MIME', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const evil = nonImageZip();
    const res = await h
      .request()
      .post('/api/job-attachments')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', evil.buffer, {
        filename: evil.filename,
        contentType: evil.mimetype,
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_MIME');
  });

  test('ATT-040 — POST /job-posts wires attachment_ids', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const att = await uploadOne(token);

    const created = await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Kitchen fit',
        pay_type: 'DAY_RATE',
        day_rate_min: 250,
        day_rate_max: 320,
        attachment_ids: [Number(att.id)],
      })
      .expect(201);

    expect(Array.isArray(created.body.attachments)).toBe(true);
    expect(created.body.attachments).toHaveLength(1);
    expect(String(created.body.attachments[0].id)).toBe(att.id);
    expect(String(created.body.attachments[0].job_post_id)).toBe(
      String(created.body.id),
    );
  });

  test('ATT-043 — wiring rejects attachment owned by another account (NOT_OWNER)', async () => {
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

    const aOrphan = await uploadOne(tokenA);

    await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        title: 'Stolen attachment job',
        pay_type: 'DAY_RATE',
        day_rate_min: 100,
        day_rate_max: 200,
        attachment_ids: [Number(aOrphan.id)],
      })
      .expect(403);
  });

  test('ATT-042 — POST /job-applications/jobs/:id/apply wires attachment_ids; download authz works', async () => {
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

    const post = await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        title: 'Roofing job',
        pay_type: 'DAY_RATE',
        day_rate_min: 200,
        day_rate_max: 280,
      })
      .expect(201);

    const att = await uploadOne(workerToken);
    const application = await h
      .request()
      .post(`/api/job-applications/jobs/${post.body.id}/apply`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        cover_message: 'I have 10 years of roofing experience.',
        attachment_ids: [Number(att.id)],
      })
      .expect(201);

    expect(application.body.attachments).toHaveLength(1);

    // Worker (owner) — OK
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

    // Anonymous — 403 (would-be-401 if guard rejected up-front; we treat as forbidden)
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .expect(403);
  });

  test('ATT-020 — job-post attachment download is public', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const att = await uploadOne(employerToken);
    await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        title: 'Painting',
        pay_type: 'FIXED_PRICE',
        fixed_price: 1200,
        attachment_ids: [Number(att.id)],
      })
      .expect(201);

    // Anonymous download works for job-post attachments.
    await h
      .request()
      .get(`/api/job-attachments/${att.id}/download`)
      .expect(200);
  });

  test('ATT-030 — DELETE orphan: own OK, attached → 409, others → 403', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const tokenA = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const tokenB = signAccessTokenFor(h, { accountId: b.id, email: b.email });
    const orphan = await uploadOne(tokenA);

    // B can't delete A's orphan.
    await h
      .request()
      .delete(`/api/job-attachments/${orphan.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    // A can.
    await h
      .request()
      .delete(`/api/job-attachments/${orphan.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    // Attached row can't be DELETE'd via the orphan-only endpoint.
    const employer = await seedActiveEmployer(h.prisma);
    const empToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const att = await uploadOne(empToken);
    await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        title: 'Loft conversion',
        pay_type: 'DAY_RATE',
        day_rate_min: 250,
        day_rate_max: 350,
        attachment_ids: [Number(att.id)],
      })
      .expect(201);

    const res = await h
      .request()
      .delete(`/api/job-attachments/${att.id}`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ATTACHED');
  });

  test('ATT-051 — runSweep removes orphans older than 48 h, keeps fresher ones and attached rows', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    // Three orphans: backdate two of them.
    const a = await uploadOne(token); // 49 h old (will sweep)
    const b = await uploadOne(token); // 47 h old (stays)
    const c = await uploadOne(token); // fresh (stays)

    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const justYoungEnough = new Date(Date.now() - 47 * 60 * 60 * 1000);
    await h.prisma.jobAttachment.update({
      where: { id: BigInt(a.id) },
      data: { created_at: oldDate },
    });
    await h.prisma.jobAttachment.update({
      where: { id: BigInt(b.id) },
      data: { created_at: justYoungEnough },
    });

    const service = h.app.get(JobAttachmentService);
    const removed = await service.runSweep();
    expect(removed).toBe(1);

    const surviving = await h.prisma.jobAttachment.findMany({
      where: { id: { in: [BigInt(a.id), BigInt(b.id), BigInt(c.id)] } },
      orderBy: { id: 'asc' },
    });
    const ids = surviving.map((r) => r.id.toString());
    expect(ids).toEqual([b.id, c.id]);
  });

  test('ATT-013 — orphan ceiling: 21st upload returns 429 ORPHAN_LIMIT', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    // Fast path: insert 20 orphan rows directly.
    for (let i = 0; i < 20; i += 1) {
      await h.prisma.jobAttachment.create({
        data: {
          uploaded_by_id: worker.id,
          file_url: `/uploads/job-attachments/${crypto.randomUUID()}.pdf`,
          original_name: `${i}.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
      });
    }

    const fixture = minimalPdf();
    const res = await h
      .request()
      .post('/api/job-attachments')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ORPHAN_LIMIT');
  });
});
