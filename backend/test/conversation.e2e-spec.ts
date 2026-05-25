// TEST-CHAT-070..074 — Conversation REST e2e suite.
//
// Drives the conversation REST surface against the Postgres Testcontainer
// harness. Post-2026-05 a conversation is a strict 1:1 with a collaboration
// (shared PK) — there is no `POST /conversations` start endpoint and no
// participant table. Tests seed a collaboration + its conversation, then
// exercise inbox / messages / read-state / send. WS coverage lives in
// `chat.gateway.e2e-spec.ts`.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedConversation,
  seedDeactivatedWorker,
  seedMessage,
  seedPendingWorker,
} from './util/factories';
import { bearer, signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

/**
 * Seed a worker↔employer collaboration plus its conversation (shared PK).
 * Returns the two parties and the conversation id (== collaboration id).
 */
async function seedCollabConvo(h: TestHarness) {
  const worker = await seedActiveWorker(h.prisma);
  const employer = await seedActiveEmployer(h.prisma);
  const collab = await h.prisma.collaboration.create({
    data: { worker_id: worker.id, employer_id: employer.id },
  });
  await seedConversation(h.prisma, {
    participantAccountIds: [worker.id, employer.id],
    collaborationId: collab.id,
    lastMessageAt: new Date(),
  });
  return { worker, employer, conversationId: collab.id };
}

describe('TEST-CHAT-070 happy-path conversation REST (CHAT-030 / CHAT-050 / CHAT-070)', () => {
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

  test('TEST-CHAT-070 / CHAT-030 — send → inbox unread → fetch messages → mark read → unread clears', async () => {
    const { worker, employer, conversationId } = await seedCollabConvo(h);
    const tw = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const te = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    // Worker sends a message through the REST send endpoint.
    await h
      .request()
      .post(`/api/conversations/${conversationId}/messages`)
      .set(...bearer(tw))
      .send({ content: 'hello employer' })
      .expect(201);

    // Worker's inbox shows the employer as the other party.
    const inboxW = await h
      .request()
      .get('/api/conversations')
      .set(...bearer(tw))
      .expect(200);
    expect(inboxW.body.items).toHaveLength(1);
    expect(String(inboxW.body.items[0].other_participant.account_id)).toBe(
      String(employer.id),
    );

    // Employer's inbox shows unread = 1 (hasn't opened the thread yet).
    const inboxE = await h
      .request()
      .get('/api/conversations')
      .set(...bearer(te))
      .expect(200);
    expect(inboxE.body.items[0].unread_count).toBe(1);

    // Employer fetches the messages.
    const messages = await h
      .request()
      .get(`/api/conversations/${conversationId}/messages`)
      .set(...bearer(te))
      .expect(200);
    expect(
      messages.body.items.some(
        (m: { content: string }) => m.content === 'hello employer',
      ),
    ).toBe(true);

    // Mark read → unread total clears.
    await h
      .request()
      .patch(`/api/conversations/${conversationId}/read`)
      .set(...bearer(te))
      .expect(200);
    const unreadAfter = await h
      .request()
      .get('/api/conversations/unread-count')
      .set(...bearer(te))
      .expect(200);
    expect(unreadAfter.body.total).toBe(0);
  });
});

describe('TEST-CHAT-071 non-participant access (CHAT-020 REST mirror)', () => {
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

  test('TEST-CHAT-071 — non-participant GET /:id/messages → 403', async () => {
    const { worker, conversationId } = await seedCollabConvo(h);
    await seedMessage(h.prisma, {
      conversationId,
      senderId: worker.id,
      content: 'private',
    });
    const outsider = await seedActiveWorker(h.prisma);
    const to = signAccessTokenFor(h, {
      accountId: outsider.id,
      email: outsider.email,
    });
    await h
      .request()
      .get(`/api/conversations/${conversationId}/messages`)
      .set(...bearer(to))
      .expect(403);
  });
});

describe('TEST-CHAT-072 AccountStateGuard on send paths (CHAT-022 / CHAT-081)', () => {
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

  test('TEST-CHAT-072 / CHAT-081 — PENDING_EMAIL_VERIFICATION → 403 EMAIL_NOT_VERIFIED on POST /:id/messages', async () => {
    const pending = await seedPendingWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await h.prisma.collaboration.create({
      data: { worker_id: pending.id, employer_id: employer.id },
    });
    await seedConversation(h.prisma, {
      participantAccountIds: [pending.id, employer.id],
      collaborationId: collab.id,
    });
    const t = signAccessTokenFor(h, {
      accountId: pending.id,
      email: pending.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post(`/api/conversations/${collab.id}/messages`)
      .set(...bearer(t))
      .send({ content: 'x' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('TEST-CHAT-072 / CHAT-081 — DEACTIVATED → blocked on POST /:id/messages (401 or 403)', async () => {
    const deactivated = await seedDeactivatedWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await h.prisma.collaboration.create({
      data: { worker_id: deactivated.id, employer_id: employer.id },
    });
    await seedConversation(h.prisma, {
      participantAccountIds: [deactivated.id, employer.id],
      collaborationId: collab.id,
    });
    const t = signAccessTokenFor(h, {
      accountId: deactivated.id,
      email: deactivated.email,
      verificationState: 'DEACTIVATED',
    });
    // Either JwtAuthGuard rejects the deactivated-vs claim (401) or
    // AccountStateGuard does (403). Both are blocking outcomes.
    const res = await h
      .request()
      .post(`/api/conversations/${collab.id}/messages`)
      .set(...bearer(t))
      .send({ content: 'x' });
    expect([401, 403]).toContain(res.status);
  });
});

describe('TEST-CHAT-073 REST rate limit (CHAT-021)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    // Boot with the real ThrottlerGuard so @Throttle on POST /:id/messages
    // is exercised. Other suites use the noop throttler.
    h = await createTestApp({ enableThrottler: true });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-CHAT-073 / CHAT-021 — 11th message in 10 s → 429', async () => {
    const { worker, conversationId } = await seedCollabConvo(h);
    const tw = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    for (let i = 0; i < 10; i++) {
      await h
        .request()
        .post(`/api/conversations/${conversationId}/messages`)
        .set(...bearer(tw))
        .send({ content: `m${i}` })
        .expect(201);
    }
    await h
      .request()
      .post(`/api/conversations/${conversationId}/messages`)
      .set(...bearer(tw))
      .send({ content: 'over' })
      .expect(429);
  });
});

describe('TEST-CHAT-074 pagination cursor (CHAT-061 Q4)', () => {
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

  test('TEST-CHAT-074 — `before` returns only messages strictly older than cursor', async () => {
    const { worker, conversationId } = await seedCollabConvo(h);
    const t1 = new Date('2026-04-01T00:00:00Z');
    const t2 = new Date('2026-04-02T00:00:00Z');
    const t3 = new Date('2026-04-03T00:00:00Z');
    await seedMessage(h.prisma, {
      conversationId,
      senderId: worker.id,
      content: 'first',
      createdAt: t1,
    });
    await seedMessage(h.prisma, {
      conversationId,
      senderId: worker.id,
      content: 'second',
      createdAt: t2,
    });
    await seedMessage(h.prisma, {
      conversationId,
      senderId: worker.id,
      content: 'third',
      createdAt: t3,
    });
    const tw = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .get(`/api/conversations/${conversationId}/messages`)
      .query({ before: t3.toISOString() })
      .set(...bearer(tw))
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    const contents = res.body.items.map((m: { content: string }) => m.content);
    expect(contents.sort()).toEqual(['first', 'second'].sort());
  });

  test('TEST-CHAT-074 — page-based fallback works alongside cursor', async () => {
    const { worker, conversationId } = await seedCollabConvo(h);
    for (let i = 0; i < 5; i++) {
      await seedMessage(h.prisma, {
        conversationId,
        senderId: worker.id,
        content: `m${i}`,
      });
    }
    const tw = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const page1 = await h
      .request()
      .get(`/api/conversations/${conversationId}/messages`)
      .query({ page: 1, limit: 2 })
      .set(...bearer(tw))
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(5);
  });
});
