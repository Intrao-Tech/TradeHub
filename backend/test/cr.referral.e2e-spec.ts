// TEST-CR-060..066 — Referral attribution e2e.
//
// Post-2026-05 rework: the `/r/:code` link is a pure URL flow (no cookies —
// the code rides in `?ref=` to the register page). Project-ref clicks are
// recorded server-side via the auth-required `POST /referral/intent`
// (a `referral_intent` row), replacing the old cookie `track-click`.
// Signup attribution lands on `client_profile` (shared PK with account).

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedJobPost,
} from './util/factories';
import { signAccessTokenFor, bearer } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('TEST-CR-060..066 Referral attribution e2e', () => {
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

  test('TEST-CR-060 (CR-032) — GET /r/:code with a valid code redirects to register?ref=', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const referrerCode = (
      await h.prisma.clientProfile.findUniqueOrThrow({
        where: { id: referrer.id },
      })
    ).referral_code;

    const res = await h.request().get(`/api/r/${referrerCode}`).expect(302);
    // Pure URL flow — the code rides in the redirect query string, no cookie.
    expect(res.headers.location).toContain('/register?ref=');
    expect(res.headers.location).toContain(referrerCode);
  });

  test('TEST-CR-061 (CR-032) — malformed code → redirect with no ref param', async () => {
    // `zzz` fails REFERRAL_CODE_REGEX → bounce to the site root, no ?ref=.
    const res = await h.request().get('/api/r/zzz').expect(302);
    expect(res.headers.location ?? '').not.toContain('ref=');
  });

  test('TEST-CR-062 (CR-035) — POST /referral/intent rejects an unknown target', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const actor = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.clientProfile.findUniqueOrThrow({
        where: { id: referrer.id },
      })
    ).referral_code;
    const token = signAccessTokenFor(h, {
      accountId: actor.id,
      email: actor.email,
    });
    await h
      .request()
      .post('/api/referral/intent')
      .set(...bearer(token))
      .send({ code, target_id: 999999, target_role: 'WORKER' })
      .expect(400);
  });

  test('TEST-CR-062 (CR-035) — POST /referral/intent bad role → 400', async () => {
    const actor = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: actor.id,
      email: actor.email,
    });
    await h
      .request()
      .post('/api/referral/intent')
      .set(...bearer(token))
      .send({ code: 'AAAA-AAAA', target_id: 1, target_role: 'INVALID' })
      .expect(400);
  });

  test('TEST-CR-062 (CR-035) — POST /referral/intent without a token → 401', async () => {
    // The intent endpoint is auth-required — anonymous traffic is ignored.
    await h
      .request()
      .post('/api/referral/intent')
      .send({ code: 'AAAA-AAAA', target_id: 1, target_role: 'WORKER' })
      .expect(401);
  });

  test('TEST-CR-063 (CR-035) — valid intent records the row + returns referrer name + target', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const actor = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.clientProfile.findUniqueOrThrow({
        where: { id: referrer.id },
      })
    ).referral_code;
    const employer = await seedActiveEmployer(h.prisma);
    const job = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: actor.id,
      email: actor.email,
    });

    const res = await h
      .request()
      .post('/api/referral/intent')
      .set(...bearer(token))
      .send({ code, target_id: Number(job.id), target_role: 'WORKER' })
      .expect(201);
    expect(res.body.recorded).toBe(true);
    expect(res.body.referrer_display_name).toBeTruthy();
    expect(res.body.target.type).toBe('JOB');

    // The intent is persisted server-side keyed by (actor, target job post).
    const intent = await h.prisma.referralIntent.findFirst({
      where: { actor_id: actor.id, target_job_post_id: job.id },
    });
    expect(intent).not.toBeNull();
    expect(intent?.referrer_id).toBe(referrer.id);
  });

  test('TEST-CR-064 (CR-036) — register with referred_by_code sets referred_by_id', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.clientProfile.findUniqueOrThrow({
        where: { id: referrer.id },
      })
    ).referral_code;
    const newEmail = `cr-064+${Date.now()}@test.local`;
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email: newEmail,
        password: 'StrongPass1!aZ#',
        role: 'WORKER',
        first_name: 'X',
        surname: 'Y',
        referred_by_code: code,
      })
      .expect(201);
    const acc = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
    });
    // Referral attribution lives on client_profile (shared PK with account).
    const created = await h.prisma.clientProfile.findUniqueOrThrow({
      where: { id: acc.id },
    });
    expect(created.referred_by_id).toBe(referrer.id);
    expect(created.referred_at).toBeInstanceOf(Date);
  });

  test('TEST-CR-064 (CR-036) — register without code → referred_by_id NULL', async () => {
    const newEmail = `cr-064b+${Date.now()}@test.local`;
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email: newEmail,
        password: 'StrongPass1!aZ#',
        role: 'WORKER',
        first_name: 'X',
        surname: 'Y',
      })
      .expect(201);
    const acc = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
    });
    const created = await h.prisma.clientProfile.findUniqueOrThrow({
      where: { id: acc.id },
    });
    expect(created.referred_by_id).toBeNull();
    expect(created.referred_at).toBeNull();
  });

  test('TEST-CR-065 (CR-100) — invalid code at signup is silent (referred_by_id stays NULL)', async () => {
    const newEmail = `cr-065+${Date.now()}@test.local`;
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email: newEmail,
        password: 'StrongPass1!aZ#',
        role: 'WORKER',
        first_name: 'X',
        surname: 'Y',
        referred_by_code: 'NONE-NONE',
      })
      .expect(201);
    const acc = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
    });
    const created = await h.prisma.clientProfile.findUniqueOrThrow({
      where: { id: acc.id },
    });
    expect(created.referred_by_id).toBeNull();
  });
});
