import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '@/api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

/**
 * Module-level singleton — one Socket.IO connection per browser tab so the
 * AppShell unread badge, the inbox, and the open thread all share one
 * stream. Reconnects on auth-changed (token rotated) by tearing the
 * connection down and letting the next consumer create it.
 */
let socket: Socket | null = null;
let connectedListeners = new Set<(connected: boolean) => void>();
let connected = false;

function notifyConnected() {
  for (const cb of connectedListeners) cb(connected);
}

function ensureSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) return socket;
  const wsBase = API.replace(/\/api\/?$/, '');
  socket = io(`${wsBase}/chat`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  socket.on('connect', () => {
    connected = true;
    notifyConnected();
  });
  socket.on('disconnect', () => {
    connected = false;
    notifyConnected();
  });
  return socket;
}

function teardownSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  connected = false;
  notifyConnected();
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth-changed', teardownSocket);
}

export type ChatSocket = {
  socket: Socket | null;
  connected: boolean;
  emit: (event: string, payload: unknown) => boolean;
  on: <T = unknown>(event: string, handler: (payload: T) => void) => () => void;
};

/**
 * `useChatSocket` exposes the singleton socket plus a connection flag. The
 * implementation is intentionally tiny so it can be swapped for a fake in
 * tests.
 */
export function useChatSocket(): ChatSocket {
  const [isConnected, setIsConnected] = useState<boolean>(connected);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const cb = (c: boolean) => setIsConnected(c);
    connectedListeners.add(cb);
    const s = ensureSocket();
    ref.current = s;
    setIsConnected(connected || Boolean(s?.connected));
    return () => {
      connectedListeners.delete(cb);
    };
  }, []);

  return {
    get socket() {
      return ref.current ?? socket;
    },
    connected: isConnected,
    emit: (event, payload) => {
      const s = ref.current ?? socket;
      if (!s || !s.connected) return false;
      s.emit(event, payload);
      return true;
    },
    on: (event, handler) => {
      const s = ref.current ?? socket;
      if (!s) return () => {};
      const wrapped = (p: unknown) => handler(p as never);
      s.on(event, wrapped);
      return () => {
        s.off(event, wrapped);
      };
    },
  };
}

/** Test seam — used by the e2e harness to inject a stub. */
export function __resetChatSocketForTests() {
  teardownSocket();
  connectedListeners = new Set();
}
