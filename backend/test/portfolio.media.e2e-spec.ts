// TEST-PROF-075 — portfolio media e2e (PROF-023..PROF-025, BE-PROF-2, BE-PROF-8).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, type TestHarness } from './util/test-app';
import { seedWorkerWithPortfolio } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import {
  avatarPngOk, // 512×512 PNG, valid for portfolio media too
  mediaPngTooLarge,
  nonImageZip,
} from './util/upload';

describe('TEST-PROF-075 portfolio media (PROF-023..PROF-025, BE-PROF-8)', () => {
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

  test('PROF-024 — POST /portfolio/:id/media/upload creates a PortfolioMedia row', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await avatarPngOk();
    const res = await h
      .request()
      .post(`/api/portfolio/${seed.portfolioItemId}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'Wide shot')
      .attach('file', fixture.buffer, {
        filename: 'wide.png',
        contentType: fixture.mimetype,
      })
      .expect(201);
    expect(res.body.media_url).toMatch(/^\/uploads\/[\w-]+\.png$/);
    expect(res.body.caption).toBe('Wide shot');
  });

  test('PROF-023 — POST /portfolio/:id/media (URL-only programmatic path) still works', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const res = await h
      .request()
      .post(`/api/portfolio/${seed.portfolioItemId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        media_url: 'https://example.com/photo.jpg',
        caption: 'External',
      })
      .expect(201);
    // Service returns the parent item including media[].
    expect(res.body.portfolio_media?.length).toBeGreaterThanOrEqual(1);
  });

  test('PROF-025 — DELETE /portfolio/media/:mediaId removes the row', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await avatarPngOk();
    const upload = await h
      .request()
      .post(`/api/portfolio/${seed.portfolioItemId}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: 'shot.png',
        contentType: fixture.mimetype,
      })
      .expect(201);
    const mediaId = upload.body.id;
    await h
      .request()
      .delete(`/api/portfolio/media/${mediaId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const after = await h.prisma.portfolioMedia.findUnique({
      where: { id: BigInt(mediaId) },
    });
    expect(after).toBeNull();
  });

  test('BE-PROF-8 — non-image MIME rejected with INVALID_MIME', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = nonImageZip();
    const res = await h
      .request()
      .post(`/api/portfolio/${seed.portfolioItemId}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.code).toBe('INVALID_MIME');
  });

  test('BE-PROF-8 — > 10 MiB image trips the size cap', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const fixture = await mediaPngTooLarge();
    const res = await h
      .request()
      .post(`/api/portfolio/${seed.portfolioItemId}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fixture.buffer, {
        filename: 'big.png',
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  }, 30_000);

  test.skip(
    'PROF-023 — TODO: 21st media item rejected by server-side cap (PROF-023). ' +
      'Today the service has no count enforcement; ' +
      'see tasks/in-progress/profiles/followups.md "PROF-023".',
    async () => {
      // intentionally empty
    },
  );
});
