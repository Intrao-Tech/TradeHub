// TEST-PROF-073 — avatar upload e2e (PROF-017, PROF-018, BE-PROF-1, BE-PROF-8).
//
// Mirrors the BE-PROF-8 contract: 5 MiB cap, MIME whitelist, 256 px floor.
// Uses the in-memory sharp fixtures from `util/upload.ts` so no binary
// fixtures are committed.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import {
  avatarPngOk,
  avatarPngTooLarge,
  avatarPngTooSmall,
  nonImageZip,
} from './util/upload';

describe('TEST-PROF-073 POST /client-profiles/me/avatar (PROF-017 / PROF-018 / BE-PROF-8)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    // Make sure the uploads directory exists — the static-assets middleware
    // and the disk-storage Multer config both write into ./uploads on the
    // backend cwd.
    await fs.mkdir(join(process.cwd(), 'uploads'), { recursive: true });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('PROF-017 — happy path: 512×512 PNG → /uploads/{uuid}.png + DB row updated', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await avatarPngOk();
    const res = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(201);
    expect(res.body.avatar_url).toMatch(/^\/uploads\/[\w-]+\.png$/);

    const profile = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    expect(profile?.avatar_url).toBe(res.body.avatar_url);
  });

  test('PROF-017 — replace path: re-uploading produces a new url; prior file is best-effort removed', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const first = await avatarPngOk();
    const r1 = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', first.buffer, {
        filename: 'first.png',
        contentType: first.mimetype,
      })
      .expect(201);
    const second = await avatarPngOk();
    const r2 = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', second.buffer, {
        filename: 'second.png',
        contentType: second.mimetype,
      })
      .expect(201);
    expect(r1.body.avatar_url).not.toBe(r2.body.avatar_url);
  });

  test('PROF-018 — < 256×256 dimension floor → 400 IMAGE_TOO_SMALL', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await avatarPngTooSmall();
    const res = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(400);
    expect(res.body.code).toBe('IMAGE_TOO_SMALL');
  });

  test('BE-PROF-8 — `application/zip` rejected by MIME whitelist (INVALID_MIME), no DB write', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const before = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = nonImageZip();
    const res = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.code).toBe('INVALID_MIME');
    const after = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    expect(after?.avatar_url).toBe(before?.avatar_url);
  });

  test('BE-PROF-8 — > 5 MiB PNG trips the size cap, no DB write', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const before = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await avatarPngTooLarge();
    const res = await h
      .request()
      .post('/api/client-profiles/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const after = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    expect(after?.avatar_url).toBe(before?.avatar_url);
  }, 30_000);
});
