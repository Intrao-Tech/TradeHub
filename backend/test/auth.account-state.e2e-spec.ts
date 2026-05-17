// TEST-AUTH-046 — AccountStateGuard end-to-end against the deny-list and the
// allow-list. Contract: AUTH-015-001.
//
// Strategy: a PENDING worker calls a representative endpoint from each list
// with a valid bearer token. Endpoints in the deny-list return 403
// EMAIL_NOT_VERIFIED before any business logic runs; endpoints in the
// allow-list pass the guard (status code may still be 4xx for unrelated
// reasons like missing body — we only assert the guard does not fire).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveWorker,
  seedPendingEmployer,
  seedPendingWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-AUTH-046 AccountStateGuard end-to-end (AUTH-015-001)', () => {
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

  test('AUTH-015-001 — PENDING employer POSTing /job-posts is denied 403 EMAIL_NOT_VERIFIED', async () => {
    // Use a PENDING EMPLOYER — POST /job-posts has both @Roles("EMPLOYER")
    // and @RequiresVerifiedEmail. The role guard runs first; if we used a
    // worker we'd get a role-related 403 instead of EMAIL_NOT_VERIFIED.
    const seed = await seedPendingEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    const res = await h
      .request()
      .post('/api/job-posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'a job that should not pass the guard' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('AUTH-015-001 — PENDING user POSTing a chat message is denied 403 EMAIL_NOT_VERIFIED', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    // AccountStateGuard + RequiresVerifiedEmail run before the handler, so
    // the conversation id need not exist.
    const res = await h
      .request()
      .post('/api/conversations/1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'x' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('AUTH-015-001 — PENDING user POSTing /collaborations is denied 403 EMAIL_NOT_VERIFIED', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    const res = await h
      .request()
      .post('/api/collaborations')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('AUTH-015-001 — PENDING user can call GET /account/me (allow-list)', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    const res = await h
      .request()
      .get('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.email).toBe(seed.email);
  });

  test('AUTH-015-001 — PENDING user can call POST /auth/verify-email/send (allow-list)', async () => {
    const seed = await seedPendingWorker(h.prisma);
    await h
      .request()
      .post('/api/auth/verify-email/send')
      .send({ email: seed.email })
      .expect(200);
    // Mailbox has a fresh verification email.
    expect(h.mail.latest(seed.email, 'verification')).toBeDefined();
  });

  test('AUTH-015-001 — PENDING user can POST /auth/logout-all (allow-list)', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.revoked).toBe('number');
  });

  test('AUTH-015-001 — ACTIVE user is permitted past the AccountStateGuard on a deny-list endpoint', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'ACTIVE',
    });
    // The chat send route sits behind AccountStateGuard + RequiresVerifiedEmail.
    // Any non-EMAIL_NOT_VERIFIED response proves the guard let an ACTIVE user
    // through (the request then fails later for an unrelated reason).
    const res = await h
      .request()
      .post('/api/conversations/1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'x' })
      .expect((r) => {
        if (r.status === 403 && r.body.code === 'EMAIL_NOT_VERIFIED') {
          throw new Error('AccountStateGuard blocked an ACTIVE user');
        }
      });
    expect(res.body.code).not.toBe('EMAIL_NOT_VERIFIED');
  });
});
