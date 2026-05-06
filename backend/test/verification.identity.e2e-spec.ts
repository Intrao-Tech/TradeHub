// TEST-VER-200..201 — Stripe Identity endpoints e2e (VER-021 / VER-022 /
// VER-027). Stripe is unmocked at the harness level; without
// STRIPE_SECRET_KEY set, the controller returns 503 STRIPE_NOT_CONFIGURED
// — that's the path we lock here. Webhook fixture replays (TEST-VER-202..203)
// require a Stripe stub helper (TEST-VER-005) and are owned by the
// verification.service unit spec at TEST-VER-143..147.

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedPendingWorker,
  seedVerifiedWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-VER-200..201 verification identity endpoints', () => {
  let h: TestHarness;
  let originalStripeKey: string | undefined;

  beforeAll(async () => {
    originalStripeKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
    if (originalStripeKey != null) {
      process.env.STRIPE_SECRET_KEY = originalStripeKey;
    }
  });
  beforeEach(async () => {
    await h.reset();
  });

  describe('TEST-VER-200 POST /verification/identity/start', () => {
    test('Stripe unconfigured → 503 STRIPE_NOT_CONFIGURED', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/verification/identity/start')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('STRIPE_NOT_CONFIGURED');
    });

    test.skip('PENDING_EMAIL_VERIFICATION account → 403 from AccountStateGuard — needs Stripe stub harness (TEST-VER-005). With Stripe unconfigured, the 503 short-circuits this branch.', async () => {
      const seed = await seedPendingWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
        verificationState: 'PENDING_EMAIL_VERIFICATION',
      });
      const res = await h
        .request()
        .post('/api/verification/identity/start')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    test.skip('BASIC user → 409 ALREADY_VERIFIED — needs Stripe stub harness (TEST-VER-005)', async () => {
      const seed = await seedVerifiedWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .post('/api/verification/identity/start')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_VERIFIED');
    });
  });

  describe('TEST-VER-201 GET /verification/identity/status', () => {
    test('Never-started + Stripe unconfigured → { session_id: null, status: null }', async () => {
      const seed = await seedActiveWorker(h.prisma);
      const token = signAccessTokenFor(h, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await h
        .request()
        .get('/api/verification/identity/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ session_id: null, status: null });
    });
  });
});
