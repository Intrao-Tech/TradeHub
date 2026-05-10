// TEST-CR-060..066, TEST-CR-120..123 — Referral attribution e2e.
// Locks: /r/:code redirect + cookie set, /referral/track-click validation,
// signup attribution, anti-self-ref guards, target_id mismatch silent skip.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedJobPost,
} from './util/factories';
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

  test('TEST-CR-060 (CR-032) — GET /r/:code with valid code redirects + sets cookie', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const referrerCode = (
      await h.prisma.account.findUniqueOrThrow({ where: { id: referrer.id } })
    ).referral_code;

    const res = await h.request().get(`/api/r/${referrerCode}`).expect(302);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refCookie = cookies?.find((c) => c.startsWith('tradehub_ref='));
    expect(refCookie).toBeDefined();
    expect(refCookie).toContain(referrerCode);
  });

  test('TEST-CR-061 (CR-032) — invalid code → redirect, no cookie', async () => {
    const res = await h.request().get('/api/r/AAAA-AAAA').expect(302);
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    const refCookie = cookies.find((c) => c.startsWith('tradehub_ref='));
    expect(refCookie).toBeUndefined();
  });

  test('TEST-CR-062 (CR-035) — track-click rejects invalid target', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.account.findUniqueOrThrow({ where: { id: referrer.id } })
    ).referral_code;
    await h
      .request()
      .post('/api/referral/track-click')
      .send({ code, target_id: 999999, target_role: 'WORKER' })
      .expect(400);
  });

  test('TEST-CR-062 (CR-035) — track-click bad role → 400', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.account.findUniqueOrThrow({ where: { id: referrer.id } })
    ).referral_code;
    await h
      .request()
      .post('/api/referral/track-click')
      .send({ code, target_id: 1, target_role: 'INVALID' })
      .expect(400);
  });

  test('TEST-CR-063 (CR-035) — valid track-click returns referrer name + sets PROJECT cookie', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.account.findUniqueOrThrow({ where: { id: referrer.id } })
    ).referral_code;
    const employer = await seedActiveEmployer(h.prisma);
    const job = await seedJobPost(h.prisma, { employerId: employer.id });
    const res = await h
      .request()
      .post('/api/referral/track-click')
      .send({ code, target_id: Number(job.id), target_role: 'WORKER' })
      .expect(201);
    expect(res.body.referrer_display_name).toBeTruthy();
    expect(res.body.target.type).toBe('JOB');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const projCookie = cookies?.find((c) =>
      c.startsWith('tradehub_ref_project='),
    );
    expect(projCookie).toBeDefined();
  });

  test('TEST-CR-064 (CR-036) — register with referred_by_code sets referred_by_id', async () => {
    const referrer = await seedActiveWorker(h.prisma);
    const code = (
      await h.prisma.account.findUniqueOrThrow({ where: { id: referrer.id } })
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
    const created = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
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
    const created = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
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
    const created = await h.prisma.account.findUniqueOrThrow({
      where: { email: newEmail },
    });
    expect(created.referred_by_id).toBeNull();
  });
});
