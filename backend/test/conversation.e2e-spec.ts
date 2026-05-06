// TEST-CHAT-070..077 — Conversation REST e2e suite.
//
// Drives the conversation REST surface end-to-end against the Postgres
// Testcontainer harness. Covers participant access control, AccountState
// guard on send paths, REST rate limit, pagination cursor semantics,
// and the new attachment upload + binding paths (CHAT-040 / CHAT-041).
// WS coverage lives in `chat.gateway.e2e-spec.ts`.

import {
  seedActiveWorker,
  seedConversation,
  seedDeactivatedWorker,
  seedMessage,
  seedPendingWorker,
} from './util/factories';
import { bearer, signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';
import { minimalPdf, nonImageZip } from './util/upload';
import {
  clearMessageAttachmentDir,
  ensureMessageAttachmentDir,
} from './util/storage-stub';

describe('TEST-CHAT-070 happy-path direct conversation REST (CHAT-030 / CHAT-050 / CHAT-070)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    await ensureMessageAttachmentDir();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await clearMessageAttachmentDir();
  });

  test('TEST-CHAT-070 / CHAT-030 — start → list → fetch messages → mark read → unread-count clears', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const tb = signAccessTokenFor(h, { accountId: b.id, email: b.email });

    const created = await h
      .request()
      .post('/api/conversations')
      .set(...bearer(ta))
      .send({ recipient_id: Number(b.id), message: 'hello b' })
      .expect(201);
    const conversationId = created.body.id;
    expect(conversationId).toBeDefined();

    // A's inbox sees the row with B as the other participant.
    const inboxA = await h
      .request()
      .get('/api/conversations')
      .set(...bearer(ta))
      .expect(200);
    expect(inboxA.body.items).toHaveLength(1);
    expect(String(inboxA.body.items[0].other_participant.account_id)).toBe(
      String(b.id),
    );

    // B sees the row from the other side, with unread = 1.
    const inboxB = await h
      .request()
      .get('/api/conversations')
      .set(...bearer(tb))
      .expect(200);
    expect(inboxB.body.items[0].unread_count).toBe(1);

    const messages = await h
      .request()
      .get(`/api/conversations/${conversationId}/messages`)
      .set(...bearer(ta))
      .expect(200);
    expect(messages.body.items).toHaveLength(1);
    expect(messages.body.items[0].content).toBe('hello b');

    await h
      .request()
      .patch(`/api/conversations/${conversationId}/read`)
      .set(...bearer(tb))
      .expect(200);
    const unreadAfter = await h
      .request()
      .get('/api/conversations/unread-count')
      .set(...bearer(tb))
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
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const c = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
      lastMessageAt: new Date(),
    });
    await seedMessage(h.prisma, {
      conversationId: conv.id,
      senderId: a.id,
      content: 'private',
    });
    const tc = signAccessTokenFor(h, { accountId: c.id, email: c.email });
    await h
      .request()
      .get(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(tc))
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

  test('TEST-CHAT-072 / CHAT-081 — PENDING_EMAIL_VERIFICATION → 403 EMAIL_NOT_VERIFIED on POST /conversations', async () => {
    const pending = await seedPendingWorker(h.prisma);
    const recipient = await seedActiveWorker(h.prisma);
    const t = signAccessTokenFor(h, {
      accountId: pending.id,
      email: pending.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post('/api/conversations')
      .set(...bearer(t))
      .send({ recipient_id: Number(recipient.id), message: 'x' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('TEST-CHAT-072 / CHAT-081 — DEACTIVATED → blocked on POST /:id/messages (401 or 403)', async () => {
    const deactivated = await seedDeactivatedWorker(h.prisma);
    const peer = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [deactivated.id, peer.id],
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
      .post(`/api/conversations/${conv.id}/messages`)
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
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    for (let i = 0; i < 10; i++) {
      await h
        .request()
        .post(`/api/conversations/${conv.id}/messages`)
        .set(...bearer(ta))
        .send({ content: `m${i}` })
        .expect(201);
    }
    await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
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
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const t1 = new Date('2026-04-01T00:00:00Z');
    const t2 = new Date('2026-04-02T00:00:00Z');
    const t3 = new Date('2026-04-03T00:00:00Z');
    await seedMessage(h.prisma, {
      conversationId: conv.id,
      senderId: a.id,
      content: 'first',
      createdAt: t1,
    });
    await seedMessage(h.prisma, {
      conversationId: conv.id,
      senderId: a.id,
      content: 'second',
      createdAt: t2,
    });
    await seedMessage(h.prisma, {
      conversationId: conv.id,
      senderId: a.id,
      content: 'third',
      createdAt: t3,
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const res = await h
      .request()
      .get(`/api/conversations/${conv.id}/messages`)
      .query({ before: t3.toISOString() })
      .set(...bearer(ta))
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    const contents = res.body.items.map((m: { content: string }) => m.content);
    expect(contents.sort()).toEqual(['first', 'second'].sort());
  });

  test('TEST-CHAT-074 — page-based fallback works alongside cursor', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    for (let i = 0; i < 5; i++) {
      await seedMessage(h.prisma, {
        conversationId: conv.id,
        senderId: a.id,
        content: `m${i}`,
      });
    }
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const page1 = await h
      .request()
      .get(`/api/conversations/${conv.id}/messages`)
      .query({ page: 1, limit: 2 })
      .set(...bearer(ta))
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(5);
  });
});

describe('TEST-CHAT-075 attachment upload validation (CHAT-040)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    await ensureMessageAttachmentDir();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await clearMessageAttachmentDir();
  });

  test('TEST-CHAT-075 / CHAT-040 — valid PDF persists row with message_id null', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const fixture = minimalPdf();
    const res = await h
      .request()
      .post(`/api/conversations/${conv.id}/attachments`)
      .set(...bearer(ta))
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(201);
    expect(res.body.id).toMatch(/^\d+$/);
    expect(res.body.message_id).toBeNull();
    const row = await h.prisma.messageAttachment.findUnique({
      where: { id: BigInt(res.body.id) },
    });
    expect(row?.message_id).toBeNull();
  });

  test('TEST-CHAT-075 / CHAT-040 — application/zip → 400 INVALID_MIME_TYPE', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const evil = nonImageZip();
    const res = await h
      .request()
      .post(`/api/conversations/${conv.id}/attachments`)
      .set(...bearer(ta))
      .attach('file', evil.buffer, {
        filename: evil.filename,
        contentType: evil.mimetype,
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_MIME_TYPE');
  });
});

describe('TEST-CHAT-076 / TEST-CHAT-077 attachment binding + retrieval (CHAT-041 / CHAT-043)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
    await ensureMessageAttachmentDir();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await clearMessageAttachmentDir();
  });

  async function uploadOne(token: string, conversationId: bigint) {
    const fixture = minimalPdf();
    const res = await h
      .request()
      .post(`/api/conversations/${conversationId}/attachments`)
      .set(...bearer(token))
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      })
      .expect(201);
    return res.body as { id: string };
  }

  test('TEST-CHAT-076 / CHAT-041 — owner sends with attachment_ids → 201 + message_id wired', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const att = await uploadOne(ta, conv.id);

    await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .send({ content: 'see attached', attachment_ids: [Number(att.id)] })
      .expect(201);
    const wired = await h.prisma.messageAttachment.findUnique({
      where: { id: BigInt(att.id) },
    });
    expect(wired?.message_id).not.toBeNull();
  });

  test('TEST-CHAT-076 / CHAT-041 — sending an attachment owned by another participant → 403 NOT_OWNER', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const tb = signAccessTokenFor(h, { accountId: b.id, email: b.email });
    const attB = await uploadOne(tb, conv.id);
    const res = await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .send({ content: 'hijack', attachment_ids: [Number(attB.id)] })
      .expect(403);
    expect(res.body.code).toBe('NOT_OWNER');
  });

  test('TEST-CHAT-076 / CHAT-041 — already-used attachment_id → 403 NOT_OWNER (already wired)', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const att = await uploadOne(ta, conv.id);
    await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .send({ content: 'first', attachment_ids: [Number(att.id)] })
      .expect(201);
    await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .send({ content: 'reuse?', attachment_ids: [Number(att.id)] })
      .expect(403);
  });

  test('TEST-CHAT-077 / CHAT-043 — GET /:id/messages eager-includes attachments[]', async () => {
    const a = await seedActiveWorker(h.prisma);
    const b = await seedActiveWorker(h.prisma);
    const conv = await seedConversation(h.prisma, {
      participantAccountIds: [a.id, b.id],
    });
    const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
    const att = await uploadOne(ta, conv.id);
    await h
      .request()
      .post(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .send({ content: 'with file', attachment_ids: [Number(att.id)] })
      .expect(201);
    const list = await h
      .request()
      .get(`/api/conversations/${conv.id}/messages`)
      .set(...bearer(ta))
      .expect(200);
    const withAtt = list.body.items.find(
      (m: { attachments: unknown[] }) =>
        Array.isArray(m.attachments) && m.attachments.length > 0,
    );
    expect(withAtt).toBeDefined();
    expect(withAtt.attachments[0].mime_type).toBe('application/pdf');
  });
});
