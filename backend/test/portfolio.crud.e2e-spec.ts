// TEST-PROF-074 — portfolio CRUD e2e (PROF-020 / PROF-021 / PROF-022).

import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker, seedActiveEmployer } from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-074 portfolio CRUD (PROF-020, PROF-021, PROF-022)', () => {
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

  test('PROF-021 — worker creates + edits an EXPERIENCE item via the experience-discriminator endpoint', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const create = await h
      .request()
      .post('/api/portfolio/experience')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lead chippy at AcmeBuild', role: 'Lead carpenter' })
      .expect(201);

    const id = create.body.id;
    expect(create.body.item_type).toBe('EXPERIENCE');

    await h
      .request()
      .patch(`/api/portfolio/${id}/experience`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'Site lead' })
      .expect(200);

    // PROJECT-discriminator endpoint should reject — wrong item type.
    await h
      .request()
      .patch(`/api/portfolio/${id}/project`)
      .set('Authorization', `Bearer ${token}`)
      .send({ project_type: 'Loft' })
      .expect(403);
  });

  test('PROF-021 — worker creates + edits a PROJECT item, common-field PATCH /:id covers title/desc/sort_order', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const create = await h
      .request()
      .post('/api/portfolio/project')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Loft conversion', project_type: 'Conversion' })
      .expect(201);
    const id = create.body.id;

    await h
      .request()
      .patch(`/api/portfolio/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Two-bed loft conversion', sort_order: 5 })
      .expect(200);
  });

  test('PROF-021 — worker creates + edits a CERTIFICATION item via /:id/certification', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const create = await h
      .request()
      .post('/api/portfolio/certification')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'CSCS card', cert_type: 'CSCS' })
      .expect(201);
    const id = create.body.id;

    await h
      .request()
      .patch(`/api/portfolio/${id}/certification`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cert_number: '12345-CSCS' })
      .expect(200);
  });

  test('PROF-021 — wrong worker cannot edit another worker\'s item (403 ForbiddenException)', async () => {
    const owner = await seedActiveWorker(h.prisma);
    const ownerToken = signAccessTokenFor(h, {
      accountId: owner.id,
      email: owner.email,
    });
    const create = await h
      .request()
      .post('/api/portfolio/project')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owner item' })
      .expect(201);
    const id = create.body.id;

    const other = await seedActiveWorker(h.prisma);
    const otherToken = signAccessTokenFor(h, {
      accountId: other.id,
      email: other.email,
    });
    await h
      .request()
      .patch(`/api/portfolio/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'evil rewrite' })
      .expect(403);
  });

  test('PROF-021 — employer cannot create portfolio items (RolesGuard rejects)', async () => {
    const seed = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    await h
      .request()
      .post('/api/portfolio/project')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Should not work' })
      .expect(403);
  });

  test('PROF-020 — DELETE /portfolio/:id removes the item (cascade clears subtype)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const create = await h
      .request()
      .post('/api/portfolio/project')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Soon-deleted' })
      .expect(201);
    const id = create.body.id;
    await h
      .request()
      .delete(`/api/portfolio/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const remaining = await h.prisma.portfolioItem.findUnique({
      where: { id: BigInt(id) },
    });
    expect(remaining).toBeNull();
  });
});
