// TEST-PROF-070 — client-profile e2e (PROF-010, PROF-011, AccountStateGuard
// exemption per Auth contract §3).

import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker, seedPendingWorker } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-070 PATCH /client-profiles/me (PROF-011, AccountStateGuard exemption)', () => {
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

  test('PROF-011 — PENDING_EMAIL_VERIFICATION worker can patch own client profile (Auth contract §3)', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    const res = await h
      .request()
      .patch('/api/client-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        display_name: 'Updated Name',
        city: 'Camden',
        postcode_area: 'NW1',
      })
      .expect(200);

    expect(res.body.display_name).toBe('Updated Name');
    expect(res.body.city).toBe('Camden');
    expect(res.body.postcode_area).toBe('NW1');
    expect(res.body.code).not.toBe('EMAIL_NOT_VERIFIED');
  });

  test('PROF-011 — ACTIVE worker can patch own client profile and the change is visible on /account/me', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'ACTIVE',
    });

    await h
      .request()
      .patch('/api/client-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bio: 'Friendly chippy with 8 years experience.',
        city: 'Hackney',
      })
      .expect(200);

    const me = await h
      .request()
      .get('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.client_profile.bio).toBe(
      'Friendly chippy with 8 years experience.',
    );
    expect(me.body.client_profile.city).toBe('Hackney');
  });

  test('PROF-011 — slug is not re-issued on update (regression guard)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const before = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    await h
      .request()
      .patch('/api/client-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ display_name: 'Totally Different Name' })
      .expect(200);
    const after = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    expect(after?.slug).toBe(before?.slug);
  });
});
