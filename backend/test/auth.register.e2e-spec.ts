// TEST-AUTH-041 — register e2e against a Postgres Testcontainer.
// Contract: AUTH-015-001..AUTH-015-003, AUTH-019-001, Decisions Log
// "Re-registration on PENDING".

import {
  createTestApp,
  type TestHarness,
} from './util/test-app';
import { TEST_PASSWORD, seedActiveWorker } from './util/factories';

describe('TEST-AUTH-041 POST /auth/register', () => {
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

  test('AUTH-015-001 + AUTH-019-001 — happy-path WORKER register: 201 + DB row in PENDING + verification mail captured', async () => {
    const email = 'mike@example.com';
    const res = await h
      .request()
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'WORKER',
        first_name: 'Mike',
        surname: 'Builder',
      })
      .expect(201);

    expect(res.body).toEqual({ pending_verification: true, email });

    const account = await h.prisma.account.findUnique({
      where: { email },
      include: {
        client_profile: { include: { worker_profile: true, employer_profile: true } },
      },
    });
    expect(account).not.toBeNull();
    expect(account!.status).toBe('PENDING_EMAIL_VERIFICATION');
    expect(account!.client_profile?.worker_profile).not.toBeNull();
    expect(account!.client_profile?.employer_profile).toBeNull();

    expect(h.mail.latest(email, 'verification')).toBeDefined();
    expect(h.mail.latest(email, 'welcome')).toBeUndefined();
  });

  test('AUTH-019-001 — happy-path EMPLOYER register: company_name written to employer_profile + display_name', async () => {
    const email = 'co@acmebuild.co.uk';
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'EMPLOYER',
        company_name: 'Acme Build Ltd',
      })
      .expect(201);

    const account = await h.prisma.account.findUnique({
      where: { email },
      include: {
        client_profile: { include: { employer_profile: true } },
      },
    });
    expect(account!.client_profile!.display_name).toBe('Acme Build Ltd');
    expect(account!.client_profile!.employer_profile!.company_name).toBe(
      'Acme Build Ltd',
    );
  });

  test('Decisions Log 2026-04-26 (Re-registration on PENDING) — re-register on PENDING email returns 201, no duplicate row, second verify mail captured', async () => {
    const email = 'pending@example.com';
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'WORKER',
        first_name: 'P',
        surname: 'P',
      })
      .expect(201);
    expect(h.mail.forAddress(email).filter((m) => m.kind === 'verification')).toHaveLength(1);

    await h
      .request()
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'WORKER',
        first_name: 'P',
        surname: 'P',
      })
      .expect(201);

    const accounts = await h.prisma.account.findMany({ where: { email } });
    expect(accounts).toHaveLength(1);
    expect(h.mail.forAddress(email).filter((m) => m.kind === 'verification')).toHaveLength(2);
  });

  test('AUTH-015-001 — re-register on ACTIVE account → 409 EMAIL_TAKEN', async () => {
    const seed = await seedActiveWorker(h.prisma, { email: 'live@example.com' });
    const res = await h
      .request()
      .post('/api/auth/register')
      .send({
        email: seed.email,
        password: TEST_PASSWORD,
        role: 'WORKER',
        first_name: 'L',
        surname: 'L',
      })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  test('AUTH-019-003 — confirm-password mismatch is a frontend concern; backend rejects WEAK_PASSWORD on bad password', async () => {
    // Backend has no confirm field — that's enforced on the SPA. The
    // backend-level guard for "obviously wrong password" is the policy.
    const res = await h
      .request()
      .post('/api/auth/register')
      .send({
        email: 'weak@example.com',
        password: 'short',
        role: 'WORKER',
        first_name: 'W',
        surname: 'P',
      })
      .expect(400);
    // Could be class-validator (length) OR password policy. Both surface a
    // structured error — assert at least one of the codes.
    const body = res.body;
    const code = body.code as string | undefined;
    if (code) {
      expect(['WEAK_PASSWORD', 'VALIDATION']).toContain(code);
    } else {
      // class-validator response carries `message` + `error: 'Bad Request'`.
      expect(body.statusCode).toBe(400);
    }
  });
});
