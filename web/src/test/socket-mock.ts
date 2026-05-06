// TEST-CHAT-006 — thin in-memory socket mock for frontend unit tests.
//
// The chat surface obtains a Socket.IO connection through the
// `useChatSocket()` hook in `web/src/components/chat/useChatSocket.ts`.
// This file replaces that hook with a deterministic in-memory shim so
// tests can:
//   - assert the contract surface (`new_message`, `message_read`,
//     `typing:start` / `typing:stop`, `conversation_created`, `error`)
//   - simulate inbound events via `__triggerEvent(name, payload)`
//   - inspect outbound emits via `mock.emitted`
//
// The full Socket.IO transport is out of scope for unit tests — real WS
// behaviour is exercised at the Playwright layer (TEST-CHAT-220 / 222 /
// 240) and the backend WS e2e layer.

import { vi } from 'vitest';

export type SocketHandler = (payload: unknown) => void;

/** A deterministic stand-in for a `socket.io-client` Socket. */
export class MockSocket {
  connected = true;
  listeners = new Map<string, Set<SocketHandler>>();
  emitted: Array<{ event: string; payload: unknown }> = [];

  emit = vi.fn((event: string, payload: unknown): boolean => {
    this.emitted.push({ event, payload });
    return true;
  });

  on(event: string, handler: SocketHandler): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return this;
  }

  off(event: string, handler?: SocketHandler): this {
    const set = this.listeners.get(event);
    if (!set) return this;
    if (handler) set.delete(handler);
    else set.clear();
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  disconnect(): this {
    this.connected = false;
    this.__triggerEvent('disconnect', 'io client disconnect');
    return this;
  }

  /** Test-only — fire a payload at every handler bound to `event`. */
  __triggerEvent(event: string, payload: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        // Surface listener errors immediately so a bad subscription
        // doesn't silently swallow assertions in the test.
        // eslint-disable-next-line no-console
        console.error(`[socket-mock] '${event}' handler threw:`, err);
      }
    }
  }

  /** Drop everything — used by `restoreSocketMock`. */
  __reset(): void {
    this.connected = true;
    this.emitted = [];
    this.emit.mockClear();
    this.listeners.clear();
  }
}

/**
 * The `useChatSocket()` shape — must match the production hook so
 * `vi.mock(...)` can swap one for the other transparently.
 */
export type MockChatSocketHook = {
  socket: MockSocket;
  connected: boolean;
  emit: (event: string, payload: unknown) => boolean;
  on: <T = unknown>(event: string, handler: (payload: T) => void) => () => void;
};

let active: MockSocket | null = null;

/** Get the active mock socket so tests can fire events / inspect emits. */
export function getMockSocket(): MockSocket {
  if (!active) active = new MockSocket();
  return active;
}

/** Fresh mock for `beforeEach`. Returns the new socket. */
export function installSocketMock(): MockSocket {
  active = new MockSocket();
  return active;
}

/** Tear down for `afterEach`. */
export function restoreSocketMock(): void {
  if (active) active.__reset();
  active = null;
}

/**
 * Module-scoped factory used by the production hook stub. Each call to
 * `useChatSocket()` reads the current active mock — tests can swap it
 * mid-render by calling `installSocketMock()` again.
 */
export function makeMockChatSocketHook(): MockChatSocketHook {
  const socket = getMockSocket();
  return {
    get socket() {
      return socket;
    },
    get connected() {
      return socket.connected;
    },
    emit: (event, payload) => {
      if (!socket.connected) return false;
      socket.emit(event, payload);
      return true;
    },
    on: <T,>(event: string, handler: (payload: T) => void) => {
      const wrapped = (p: unknown) => handler(p as T);
      socket.on(event, wrapped);
      return () => socket.off(event, wrapped);
    },
  };
}
