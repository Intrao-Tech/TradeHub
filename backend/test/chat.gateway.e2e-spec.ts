// TEST-CHAT-080..088 — WS gateway e2e suite (drives the real /chat namespace).
//
// Boots a single Nest app via beforeAll/afterAll and reuses it across tests
// (truncate-between-tests via h.reset). Drives the gateway via the new
// `socket.io-client` harness in `backend/test/util/ws-client.ts` — real
// handshake, real rooms, real adapter (in-memory mode).

import type { Socket } from 'socket.io-client';
import { ChatGateway } from '../src/conversation/chat.gateway';
import {
  seedActiveEmployer,
  seedActiveWorker,
  seedCollaboration,
  seedConversation,
  seedDeactivatedWorker,
  seedMessage,
  seedPendingWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';
import {
  assertNoEvent,
  connectChatClient,
  disconnectAll,
  waitForDisconnect,
  waitForEvent,
} from './util/ws-client';

describe('TEST-CHAT-080..088 ChatGateway WS e2e', () => {
  let h: TestHarness;
  const clients: Socket[] = [];

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    disconnectAll(clients);
    await h.close();
  });
  beforeEach(async () => {
    disconnectAll(clients.splice(0));
    await h.reset();
  });

  // ── TEST-CHAT-080 — Handshake state guard ──────────────────────────
  describe('TEST-CHAT-080 handshake (CHAT-022)', () => {
    test('TEST-CHAT-080 / CHAT-022 — no token → server disconnects post-connect', async () => {
      const c = await connectChatClient({
        harness: h,
        accountId: 0n,
        token: '',
        waitForConnect: false,
        timeoutMs: 1500,
      });
      clients.push(c);
      try {
        await waitForDisconnect(c, 2000);
      } catch {
        // ok if it never connected
      }
      expect(c.connected).toBe(false);
    });

    test('TEST-CHAT-080 / CHAT-022 — invalid token → server disconnects post-connect', async () => {
      const c = await connectChatClient({
        harness: h,
        accountId: 0n,
        token: 'not.a.real.jwt',
        waitForConnect: false,
        timeoutMs: 1500,
      });
      clients.push(c);
      try {
        await waitForDisconnect(c, 2000);
      } catch {
        // ok
      }
      expect(c.connected).toBe(false);
    });

    test('TEST-CHAT-080 / CHAT-022 — DEACTIVATED account → connects then immediately disconnected', async () => {
      const acc = await seedDeactivatedWorker(h.prisma);
      const c = await connectChatClient({
        harness: h,
        accountId: acc.id,
        email: acc.email,
        waitForConnect: false,
      });
      clients.push(c);
      // Either connect_error or a post-connect disconnect — both prove the
      // socket cannot transact. We assert no `connect` lingers.
      try {
        await waitForDisconnect(c, 2000);
      } catch {
        // If we never connected at all, that's also a pass — the server
        // refused the handshake outright.
      }
      expect(c.connected).toBe(false);
    });

    test('TEST-CHAT-080 / CHAT-022 — PENDING email account → disconnect', async () => {
      const acc = await seedPendingWorker(h.prisma);
      const c = await connectChatClient({
        harness: h,
        accountId: acc.id,
        email: acc.email,
        waitForConnect: false,
      });
      clients.push(c);
      try {
        await waitForDisconnect(c, 2000);
      } catch {
        // ok
      }
      expect(c.connected).toBe(false);
    });

    test('TEST-CHAT-080 / CHAT-022 — verified-active account → connects + auto-joins existing rooms', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const c = await connectChatClient({
        harness: h,
        accountId: a.id,
        email: a.email,
      });
      clients.push(c);
      expect(c.connected).toBe(true);
      // Trigger an emit to the conversation room and assert A receives it
      // (proves auto-join from the handshake).
      await seedMessage(h.prisma, {
        conversationId: conv.id,
        senderId: b.id,
        content: 'hi from b',
      });
      // Use the gateway's emit helper (we can call it through the running Nest app).
      const gw = h.app.get(ChatGateway);
      const got = waitForEvent<{ conversation_id: string }>(c, 'new_message');
      gw.emitNewMessage(conv.id, { id: 1, content: 'broadcast' });
      const payload = await got;
      expect(payload.conversation_id).toBe(String(conv.id));
    });
  });

  // ── TEST-CHAT-081 — join_conversation participant check ────────────
  describe('TEST-CHAT-081 join_conversation (CHAT-020)', () => {
    test('TEST-CHAT-081 / CHAT-020 — non-participant emit join_conversation → silent rejection (no error event, no new_message)', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const c = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });

      const sockC = await connectChatClient({
        harness: h,
        accountId: c.id,
        email: c.email,
      });
      clients.push(sockC);
      // C is NOT a participant — the join_conversation should be ignored.
      sockC.emit('join_conversation', { conversation_id: String(conv.id) });
      // Emit a new_message to the room and assert C does not receive it.
      const gw = h.app.get(ChatGateway);
      // Give the join_conversation handler time to run.
      await new Promise((r) => setTimeout(r, 200));
      gw.emitNewMessage(conv.id, { id: 99, content: 'leak?' });
      await assertNoEvent(sockC, 'new_message', 600);
      await assertNoEvent(sockC, 'error', 200);
    });

    test('TEST-CHAT-081 / CHAT-020 — participant emit join_conversation → joins room, receives new_message', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockA = await connectChatClient({
        harness: h,
        accountId: a.id,
        email: a.email,
      });
      clients.push(sockA);
      sockA.emit('join_conversation', { conversation_id: String(conv.id) });
      await new Promise((r) => setTimeout(r, 100));
      const gw = h.app.get(ChatGateway);
      const got = waitForEvent<{ conversation_id: string }>(sockA, 'new_message');
      gw.emitNewMessage(conv.id, { id: 1, content: 'hi' });
      const payload = await got;
      expect(payload.conversation_id).toBe(String(conv.id));
    });
  });

  // ── TEST-CHAT-082 / 083 / 084 — send_message ────────────────────────
  describe('TEST-CHAT-082 send_message happy path (CHAT-030)', () => {
    test('TEST-CHAT-082 — A sends → B receives new_message with the same client_id', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockA = await connectChatClient({
        harness: h,
        accountId: a.id,
        email: a.email,
      });
      const sockB = await connectChatClient({
        harness: h,
        accountId: b.id,
        email: b.email,
      });
      clients.push(sockA, sockB);
      const got = waitForEvent<{ metadata?: { client_id?: string } }>(
        sockB,
        'new_message',
      );
      sockA.emit('send_message', {
        conversation_id: String(conv.id),
        content: 'hello',
        client_id: 'opt-1',
      });
      const payload = await got;
      expect(payload.metadata?.client_id).toBe('opt-1');
    });
  });

  describe('TEST-CHAT-083 send_message rate limit (CHAT-021)', () => {
    test('TEST-CHAT-083 — 11th in 10 s → error{ RATE_LIMITED } and B does not receive it', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockA = await connectChatClient({
        harness: h,
        accountId: a.id,
        email: a.email,
      });
      const sockB = await connectChatClient({
        harness: h,
        accountId: b.id,
        email: b.email,
      });
      clients.push(sockA, sockB);
      let received = 0;
      sockB.on('new_message', () => {
        received += 1;
      });
      for (let i = 0; i < 10; i++) {
        sockA.emit('send_message', {
          conversation_id: String(conv.id),
          content: `m${i}`,
        });
      }
      // Wait for those 10 to flush and persist.
      await new Promise((r) => setTimeout(r, 1500));
      const errored = waitForEvent<{ code: string }>(sockA, 'error');
      sockA.emit('send_message', {
        conversation_id: String(conv.id),
        content: 'over',
      });
      const err = await errored;
      expect(err.code).toBe('RATE_LIMITED');
      // B should still only have the 10 we just sent (give the 11th a beat
      // to confirm it never arrives).
      await new Promise((r) => setTimeout(r, 400));
      expect(received).toBeLessThanOrEqual(10);
    });
  });

  describe('TEST-CHAT-084 send_message non-participant (CHAT-020 send-side)', () => {
    test('TEST-CHAT-084 — outsider emits send_message → server emits error', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const c = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockC = await connectChatClient({
        harness: h,
        accountId: c.id,
        email: c.email,
      });
      clients.push(sockC);
      // Give handleConnection's async setup time to land before emitting.
      await new Promise((r) => setTimeout(r, 250));
      const errored = waitForEvent<{ code: string }>(sockC, 'error');
      sockC.emit('send_message', {
        conversation_id: String(conv.id),
        content: 'leak',
      });
      const err = await errored;
      // Either a forbidden bubble-up from the service or a generic
      // SEND_FAILED — both prove the outsider's emit was rejected.
      expect(['FORBIDDEN', 'SEND_FAILED', 'UNAUTHENTICATED']).toContain(
        err.code,
      );
    });
  });

  // ── TEST-CHAT-085 — typing:start / typing:stop ──────────────────────
  describe('TEST-CHAT-085 typing events (CHAT-031)', () => {
    test('TEST-CHAT-085 / CHAT-031 — A typing → B receives typing:start with A account_id; A does not receive its own', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockA = await connectChatClient({
        harness: h,
        accountId: a.id,
        email: a.email,
      });
      const sockB = await connectChatClient({
        harness: h,
        accountId: b.id,
        email: b.email,
      });
      clients.push(sockA, sockB);
      // Make sure both auto-joined; safe-emit join.
      sockA.emit('join_conversation', { conversation_id: String(conv.id) });
      sockB.emit('join_conversation', { conversation_id: String(conv.id) });
      await new Promise((r) => setTimeout(r, 150));

      const aSelfHandler = jest.fn();
      sockA.on('typing:start', aSelfHandler);
      const got = waitForEvent<{ account_id: string }>(sockB, 'typing:start');
      sockA.emit('typing:start', { conversation_id: String(conv.id) });
      const evt = await got;
      expect(evt.account_id).toBe(String(a.id));
      // A does NOT receive its own typing:start.
      await new Promise((r) => setTimeout(r, 200));
      expect(aSelfHandler).not.toHaveBeenCalled();
    });

    test('TEST-CHAT-085 / CHAT-031 — non-participant typing:start → silent (B receives nothing)', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const c = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockB = await connectChatClient({
        harness: h,
        accountId: b.id,
        email: b.email,
      });
      const sockC = await connectChatClient({
        harness: h,
        accountId: c.id,
        email: c.email,
      });
      clients.push(sockB, sockC);
      sockC.emit('typing:start', { conversation_id: String(conv.id) });
      await assertNoEvent(sockB, 'typing:start', 500);
    });
  });

  // ── TEST-CHAT-086 — auto-create on confirm (CHAT-010..013) ─────────
  describe('TEST-CHAT-086 auto-create on collab confirm (CHAT-010..013)', () => {
    test('TEST-CHAT-086 — PATCH /collaborations/:id/status CONFIRMED → conversation_created on both sockets', async () => {
      const worker = await seedActiveWorker(h.prisma);
      const employer = await seedActiveEmployer(h.prisma);
      const collab = await seedCollaboration(h.prisma, {
        workerId: worker.id,
        employerId: employer.id,
        initiatedBy: 'EMPLOYER',
        status: 'PENDING',
      });
      const tWorker = signAccessTokenFor(h, {
        accountId: worker.id,
        email: worker.email,
      });

      const sockWorker = await connectChatClient({
        harness: h,
        accountId: worker.id,
        email: worker.email,
      });
      const sockEmployer = await connectChatClient({
        harness: h,
        accountId: employer.id,
        email: employer.email,
      });
      clients.push(sockWorker, sockEmployer);

      const onWorker = waitForEvent<{ conversation_id: string }>(
        sockWorker,
        'conversation_created',
      );
      const onEmployer = waitForEvent<{ conversation_id: string }>(
        sockEmployer,
        'conversation_created',
      );

      await h
        .request()
        .patch(`/api/collaborations/${collab.id}/status`)
        .set('Authorization', `Bearer ${tWorker}`)
        .send({ status: 'CONFIRMED' })
        .expect(200);

      const [pw, pe] = await Promise.all([onWorker, onEmployer]);
      expect(pw.conversation_id).toBe(pe.conversation_id);

      // System welcome message exists.
      const conv = await h.prisma.conversation.findFirst({
        where: { collaboration_id: collab.id },
      });
      expect(conv).not.toBeNull();
      const messages = await h.prisma.message.findMany({
        where: { conversation_id: conv!.id },
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].message_type).toBe('SYSTEM');
    });
  });

  // ── TEST-CHAT-088 — message_read broadcast ─────────────────────────
  describe('TEST-CHAT-088 message_read broadcast (CHAT-032)', () => {
    test('TEST-CHAT-088 — REST PATCH /:id/read fires message_read to the room', async () => {
      const a = await seedActiveWorker(h.prisma);
      const b = await seedActiveWorker(h.prisma);
      const conv = await seedConversation(h.prisma, {
        participantAccountIds: [a.id, b.id],
      });
      const sockB = await connectChatClient({
        harness: h,
        accountId: b.id,
        email: b.email,
      });
      clients.push(sockB);
      const ta = signAccessTokenFor(h, { accountId: a.id, email: a.email });
      const got = waitForEvent<{
        conversation_id: string;
        account_id: string;
      }>(sockB, 'message_read');
      await h
        .request()
        .patch(`/api/conversations/${conv.id}/read`)
        .set('Authorization', `Bearer ${ta}`)
        .expect(200);
      const evt = await got;
      expect(evt.conversation_id).toBe(String(conv.id));
      expect(evt.account_id).toBe(String(a.id));
    });
  });
});
