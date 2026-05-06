// TEST-CHAT-002 — first WS test harness in the repo. Connects a real
// `socket.io-client` to the booted Nest app's `/chat` namespace with a JWT
// in the handshake. No mock-socket fakes — drives the real gateway end-to-
// end so the `join_conversation` participant check, the rate limiter, and
// the handshake state guard are exercised against the production code.
//
// Reused by every future feature that emits or consumes WS events
// (escrow status push, push notifications, …) — keep API minimal.

import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { signAccessTokenFor } from './auth-helpers';
import type { TestHarness } from './test-app';

export type ConnectChatClientOpts = {
  /** Booted Nest app. The HTTP server is reused as the WS host. */
  app?: INestApplication;
  /** Test harness — preferred over `app`/`harness` separately. */
  harness?: TestHarness;
  /** Account id the JWT is signed for. */
  accountId: bigint;
  /** Email claim. Defaults to `<accountId>@test.local`. */
  email?: string;
  /** Provide a pre-signed token (skips JWT signing). */
  token?: string;
  /** Override the gateway namespace (defaults to `/chat`). */
  namespace?: string;
  /**
   * Wait for `connect` event before resolving. Defaults to true. Set to
   * false when you expect the handshake to be rejected.
   */
  waitForConnect?: boolean;
  /** Connect timeout in ms. Default 4000. */
  timeoutMs?: number;
};

/**
 * Resolve the address the booted Nest app's HTTP server is listening on.
 * Nest's `app.init()` does NOT start an HTTP listener — `app.listen(0)` is
 * called by the harness via `getHttpServer().listen(0)`.
 */
async function ensureListening(app: INestApplication): Promise<string> {
  const server = app.getHttpServer() as import('http').Server;
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

/**
 * Connect a Socket.IO client to the booted gateway's `/chat` namespace
 * using a JWT signed for `accountId`.
 */
export async function connectChatClient(
  opts: ConnectChatClientOpts,
): Promise<Socket> {
  const harness = opts.harness;
  const app = opts.app ?? harness?.app;
  if (!app) {
    throw new Error('connectChatClient: app or harness is required');
  }
  const namespace = opts.namespace ?? '/chat';
  const baseUrl = await ensureListening(app);
  const token =
    opts.token ??
    (harness
      ? signAccessTokenFor(harness, {
          accountId: opts.accountId,
          email: opts.email ?? `${opts.accountId.toString()}@test.local`,
        })
      : (() => {
          throw new Error(
            'connectChatClient: pass `harness` so a JWT can be signed (or `token`)',
          );
        })());

  const socket = io(`${baseUrl}${namespace}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: opts.timeoutMs ?? 4000,
  });

  if (opts.waitForConnect === false) {
    return socket;
  }

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      socket.removeAllListeners('connect');
      socket.removeAllListeners('connect_error');
      reject(new Error(`socket.io-client connect timeout after ${opts.timeoutMs ?? 4000}ms`));
    }, opts.timeoutMs ?? 4000);
    socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(t);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  return socket;
}

/**
 * Wait once for a named event with a payload. Times out after `ms`.
 */
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  ms = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`waitForEvent('${event}') timed out after ${ms}ms`));
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(t);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/**
 * Resolve once the socket emits `disconnect` (e.g., a rejected handshake).
 */
export function waitForDisconnect(
  socket: Socket,
  ms = 2000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (socket.disconnected) {
      resolve('already');
      return;
    }
    const t = setTimeout(() => {
      socket.off('disconnect', handler);
      reject(new Error(`waitForDisconnect timed out after ${ms}ms`));
    }, ms);
    const handler = (reason: string) => {
      clearTimeout(t);
      socket.off('disconnect', handler);
      resolve(reason);
    };
    socket.on('disconnect', handler);
  });
}

/**
 * Assert a named event does NOT arrive within `ms`. Used to verify the
 * silent-rejection contract on `join_conversation` (CHAT-020).
 */
export async function assertNoEvent(
  socket: Socket,
  event: string,
  ms: number,
): Promise<void> {
  let received: unknown = null;
  const handler = (p: unknown) => {
    received = p;
  };
  socket.on(event, handler);
  await new Promise((r) => setTimeout(r, ms));
  socket.off(event, handler);
  if (received !== null) {
    throw new Error(
      `assertNoEvent: unexpected '${event}' payload: ${JSON.stringify(received)}`,
    );
  }
}

/** Disconnect every client passed in. Used in `afterEach` cleanup. */
export function disconnectAll(clients: Array<Socket | null | undefined>) {
  for (const c of clients) {
    if (!c) continue;
    try {
      c.removeAllListeners();
      if (c.connected) c.disconnect();
    } catch {
      // best-effort
    }
  }
}
