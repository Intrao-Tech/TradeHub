// TEST-VER-230..235 — verification companies-house e2e (VER-140..145).
//
// `globalThis.fetch` is mocked at the suite boundary; canned fixtures from
// `companies-house-fixtures.ts`. The CH path is gated on
// `COMPANIES_HOUSE_API_KEY` being set; we set it for this suite.

import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveEmployer } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import {
  CH_FIXTURES,
  mockFetchThrows,
  mockNextFetch,
} from './util/companies-house-fixtures';

describe('TEST-VER-230..235 verification companies-house (VER-140..145)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    process.env.COMPANIES_HOUSE_API_KEY = 'test-api-key';
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
    delete process.env.COMPANIES_HOUSE_API_KEY;
  });
  beforeEach(async () => {
    await h.reset();
    jest.restoreAllMocks();
  });

  async function asEmployer(
    opts: {
      companyName?: string;
      companyNumber?: string;
    } = {},
  ) {
    const seed = await seedActiveEmployer(h.prisma, {
      companyName: opts.companyName ?? 'Acme Limited',
    });
    if (opts.companyNumber !== undefined) {
      await h.prisma.employerProfile.update({
        where: { id: seed.id },
        data: { company_number: opts.companyNumber },
      });
    } else {
      await h.prisma.employerProfile.update({
        where: { id: seed.id },
        data: { company_number: '12345678' },
      });
    }
    return {
      seed,
      token: signAccessTokenFor(h, { accountId: seed.id, email: seed.email }),
    };
  }

  describe('TEST-VER-230 happy path — VER-145', () => {
    test('Active match → milestone written + 200', async () => {
      const { seed, token } = await asEmployer();
      mockNextFetch(CH_FIXTURES.activeMatch('12345678', 'Acme Limited'));

      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(res.body).toMatchObject({
        matched: true,
        registry_company_name: 'Acme Limited',
      });
      const milestones = await h.prisma.verificationMilestone.findMany({
        where: { client_profile_id: seed.id },
      });
      expect(
        milestones.some((m) => m.milestone_type === 'COMPANY_HOUSE_VERIFIED'),
      ).toBe(true);
    });
  });

  describe('TEST-VER-231 not found — VER-141', () => {
    test('Registry 404 → 404 COMPANIES_HOUSE_NOT_FOUND, no milestone', async () => {
      const { seed, token } = await asEmployer();
      mockNextFetch(CH_FIXTURES.notFound());
      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMPANIES_HOUSE_NOT_FOUND');

      const milestones = await h.prisma.verificationMilestone.findMany({
        where: {
          client_profile_id: seed.id,
          milestone_type: 'COMPANY_HOUSE_VERIFIED',
        },
      });
      expect(milestones).toHaveLength(0);
    });
  });

  describe('TEST-VER-232 inactive → 400 (VER-142; FU-VER-2 resolved)', () => {
    test('Dissolved company → 400 COMPANIES_HOUSE_MISMATCH', async () => {
      const { token } = await asEmployer();
      mockNextFetch(CH_FIXTURES.dissolved('12345678', 'Acme Limited'));
      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COMPANIES_HOUSE_MISMATCH');
    });
  });

  describe('TEST-VER-233 name mismatch — VER-142', () => {
    test('Name diff → 400 COMPANIES_HOUSE_MISMATCH', async () => {
      const { token } = await asEmployer({ companyName: 'FooBar Builders' });
      mockNextFetch(
        CH_FIXTURES.activeNameMismatch('12345678', 'Acme Holdings'),
      );
      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COMPANIES_HOUSE_MISMATCH');
    });
  });

  describe('TEST-VER-234 upstream error — VER-143', () => {
    test('Registry 500 → 503 COMPANIES_HOUSE_UPSTREAM', async () => {
      const { token } = await asEmployer();
      mockNextFetch(CH_FIXTURES.serverError());
      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('COMPANIES_HOUSE_UPSTREAM');
    });

    test('Network error → 503 COMPANIES_HOUSE_UPSTREAM', async () => {
      const { token } = await asEmployer();
      mockFetchThrows();
      const res = await h
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('COMPANIES_HOUSE_UPSTREAM');
    });
  });

  describe('TEST-VER-235 not configured — VER-140', () => {
    test('When COMPANIES_HOUSE_API_KEY env is empty → 503 COMPANIES_HOUSE_NOT_CONFIGURED', async () => {
      // Spin up a separate harness with the env var cleared.
      delete process.env.COMPANIES_HOUSE_API_KEY;
      const offHarness = await createTestApp();
      const seed = await seedActiveEmployer(offHarness.prisma);
      await offHarness.prisma.employerProfile.update({
        where: { id: seed.id },
        data: { company_number: '12345678' },
      });
      const token = signAccessTokenFor(offHarness, {
        accountId: seed.id,
        email: seed.email,
      });
      const res = await offHarness
        .request()
        .post('/api/verification/employer/companies-house-verify')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('COMPANIES_HOUSE_NOT_CONFIGURED');
      await offHarness.close();
      // Restore for any subsequent tests.
      process.env.COMPANIES_HOUSE_API_KEY = 'test-api-key';
    });
  });
});
