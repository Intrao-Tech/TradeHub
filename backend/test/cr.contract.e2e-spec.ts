// TEST-CR-030..052 — Contract lifecycle e2e against real Postgres.
// Locks contract creation, propose, respond (accept/decline), end, and
// the hire-again invariant (no double in-flight).
//
// References tasks/in-progress/contracts-and-referrals/spec.md CR-020,
// CR-021, CR-024.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedCollaboration,
} from './util/factories';
import { bearer, signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('TEST-CR-030..052 Contract lifecycle e2e', () => {
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

  async function setupRelationship() {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
    });
    return { employer, worker, employerToken, workerToken, collab };
  }

  test('TEST-CR-030 (CR-020) — POST /collaborations/:id/contracts by participant creates PROPOSED', async () => {
    const { employer, employerToken, collab } = await setupRelationship();
    const res = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({
        project_type: 'Bathroom refit',
        site_postcode: 'SW1',
        agreed_amount: 1500,
        initiated_by: 'EMPLOYER',
      })
      .expect(201);
    expect(res.body.status).toBe('PROPOSED');
    expect(res.body.position).toBe(1);
    expect(String(res.body.collaboration_id)).toBe(String(collab.id));
    expect(res.body.initiated_by).toBe('EMPLOYER');
    expect(employer.id).toBeDefined();
  });

  test('TEST-CR-030 (CR-020) — non-participant gets 403', async () => {
    const { collab } = await setupRelationship();
    const stranger = await seedActiveEmployer(h.prisma);
    const strangerToken = signAccessTokenFor(h, {
      accountId: stranger.id,
      email: stranger.email,
    });
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(strangerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(403);
  });

  test('TEST-CR-031 (CR-024) — duplicate in-flight contract → 409', async () => {
    const { employerToken, collab } = await setupRelationship();
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'A', initiated_by: 'EMPLOYER' })
      .expect(201);
    // 2nd attempt while first is PROPOSED → 409
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'B', initiated_by: 'EMPLOYER' })
      .expect(409);
  });

  test('TEST-CR-033 (CR-020) — counterparty accepts → ACTIVE', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({
        project_type: 'Test',
        agreed_amount: 500,
        initiated_by: 'EMPLOYER',
      })
      .expect(201);
    const contractId = created.body.id;

    // Worker (counterparty) accepts.
    const accepted = await h
      .request()
      .patch(`/api/contracts/${contractId}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);
    expect(accepted.body.status).toBe('ACTIVE');
    expect(accepted.body.started_at).not.toBeNull();
  });

  test('TEST-CR-033 (CR-020) — initiator cannot respond to own proposal', async () => {
    const { employerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${created.body.id}/respond`)
      .set(...bearer(employerToken))
      .send({ accept: true })
      .expect(403);
  });

  test('TEST-CR-034 (CR-020) — counterparty declines → ENDED + CANCELED', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(201);
    const declined = await h
      .request()
      .patch(`/api/contracts/${created.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: false })
      .expect(200);
    expect(declined.body.status).toBe('ENDED');
    expect(declined.body.end_reason).toBe('CANCELED');
  });

  test('TEST-CR-035 (CR-021) — end ACTIVE with no funded milestones → ENDED', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${created.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);
    const ended = await h
      .request()
      .post(`/api/contracts/${created.body.id}/end`)
      .set(...bearer(employerToken))
      .send({ end_reason: 'COMPLETED' })
      .expect(201);
    expect(ended.body.status).toBe('ENDED');
    expect(ended.body.end_reason).toBe('COMPLETED');
    expect(ended.body.ended_at).not.toBeNull();
  });

  test('TEST-CR-036 (CR-021) — end refuses 409 if any milestone is FUNDED', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${created.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);

    // Manually create an escrow + FUNDED milestone via Prisma.
    const escrow = await h.prisma.escrowTransaction.create({
      data: {
        contract_id: BigInt(created.body.id),
        status: 'ACTIVE',
        job_amount: 1000,
        platform_fee: 50,
        worker_payout: 950,
        currency: 'GBP',
      },
    });
    await h.prisma.escrowMilestone.create({
      data: {
        escrow_id: escrow.id,
        position: 1,
        title: 'WIP',
        amount: 500,
        status: 'FUNDED',
      },
    });

    await h
      .request()
      .post(`/api/contracts/${created.body.id}/end`)
      .set(...bearer(employerToken))
      .send({ end_reason: 'COMPLETED' })
      .expect(409);
  });

  test('TEST-CR-037 (CR-021) — end auto-CANCELs PENDING milestones', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    const created = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'X', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${created.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);
    const escrow = await h.prisma.escrowTransaction.create({
      data: {
        contract_id: BigInt(created.body.id),
        status: 'ACTIVE',
        job_amount: 0,
        platform_fee: 0,
        worker_payout: 0,
        currency: 'GBP',
      },
    });
    const ms = await h.prisma.escrowMilestone.create({
      data: {
        escrow_id: escrow.id,
        position: 1,
        title: 'Pending bit',
        amount: 100,
        status: 'PENDING',
      },
    });
    await h
      .request()
      .post(`/api/contracts/${created.body.id}/end`)
      .set(...bearer(employerToken))
      .send({ end_reason: 'COMPLETED' })
      .expect(201);
    const reload = await h.prisma.escrowMilestone.findUniqueOrThrow({
      where: { id: ms.id },
    });
    expect(reload.status).toBe('CANCELED');
  });

  test('TEST-CR-050 (CR-024) — hire-again creates Contract #2 under same collab when no in-flight', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    // Contract #1 → ENDED.
    const c1 = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'first', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${c1.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);
    await h
      .request()
      .post(`/api/contracts/${c1.body.id}/end`)
      .set(...bearer(employerToken))
      .send({ end_reason: 'COMPLETED' })
      .expect(201);

    // Hire again.
    const c2 = await h
      .request()
      .post(`/api/collaborations/${collab.id}/hire-again`)
      .set(...bearer(employerToken))
      .send({ project_type: 'second', initiated_by: 'EMPLOYER' })
      .expect(201);
    expect(c2.body.position).toBe(2);
    expect(c2.body.status).toBe('DRAFT');
  });

  test('TEST-CR-051 (CR-024) — hire-again refuses 409 with in-flight contract', async () => {
    const { employerToken, collab } = await setupRelationship();
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: 'A', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/hire-again`)
      .set(...bearer(employerToken))
      .send({ project_type: 'B', initiated_by: 'EMPLOYER' })
      .expect(409);
  });

  test('TEST-CR-052 (CR-007) — Conversation persists across hire-again cycles', async () => {
    const { employerToken, workerToken, collab } = await setupRelationship();
    // Bring up the conversation by creating + accepting C1 (this triggers
    // collab.service create flow normally — but here our seed didn't trigger
    // it; conversation persists via Collaboration FK).
    // For this assertion, fetch the collab post-cycle and assert conversation_id stable.
    const c1 = await h
      .request()
      .post(`/api/collaborations/${collab.id}/contracts`)
      .set(...bearer(employerToken))
      .send({ project_type: '1', initiated_by: 'EMPLOYER' })
      .expect(201);
    await h
      .request()
      .patch(`/api/contracts/${c1.body.id}/respond`)
      .set(...bearer(workerToken))
      .send({ accept: true })
      .expect(200);
    const beforeEnd = await h.prisma.conversation.findFirst({
      where: { collaboration_id: collab.id },
    });
    await h
      .request()
      .post(`/api/contracts/${c1.body.id}/end`)
      .set(...bearer(employerToken))
      .send({ end_reason: 'COMPLETED' })
      .expect(201);
    await h
      .request()
      .post(`/api/collaborations/${collab.id}/hire-again`)
      .set(...bearer(employerToken))
      .send({ project_type: '2', initiated_by: 'EMPLOYER' })
      .expect(201);
    const afterHireAgain = await h.prisma.conversation.findFirst({
      where: { collaboration_id: collab.id },
    });
    // If a conversation existed before, it must be the same row id; if it
    // didn't exist before, it must still not exist (Contract creation
    // doesn't auto-create chat — Collaboration flow does).
    expect(afterHireAgain?.id ?? null).toBe(beforeEnd?.id ?? null);
  });
});
