// TEST-JOBS-088 — `GET /specialisations` and `GET /tags` are public,
// non-empty after staff seeds them, and respect the `JOBS-022` consumer
// contract (the chip-multiselect catalog source).

import { createTestApp, type TestHarness } from './util/test-app';
import { seedSpecialisation, seedTag } from './util/factories';

describe('TEST-JOBS-088 catalogs are public + non-empty', () => {
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

  test('JOBS-022 — GET /specialisations returns the catalog without auth', async () => {
    await seedSpecialisation(h.prisma, 'Plumbing');
    await seedSpecialisation(h.prisma, 'Electrical');

    const res = await h.request().get('/api/specialisations').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Plumbing', 'Electrical']));
    // ordered asc
    expect([...names].sort()).toEqual(names);
  });

  test('JOBS-022 — GET /tags returns the catalog without auth', async () => {
    await seedTag(h.prisma, 'Loft Conversion');
    await seedTag(h.prisma, 'Kitchen Fitting');

    const res = await h.request().get('/api/tags').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('JOBS-025 — staff-only mutation: anonymous POST /specialisations → 401', async () => {
    await h
      .request()
      .post('/api/specialisations')
      .send({ name: 'Sneaky' })
      .expect(401);
  });
});
