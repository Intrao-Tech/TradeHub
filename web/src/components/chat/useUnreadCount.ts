import { useEffect, useState } from 'react';
import { ApiError, api, getToken } from '@/api';
import { useChatSocket } from './useChatSocket';

type UnreadResponse = { total: number };

/**
 * `useUnreadCount` (CHAT-070) — total unread across all conversations,
 * with a live update channel: re-fetches on window focus, on auth changes,
 * and on every `new_message` / `message_read` WS event.
 */
export function useUnreadCount(): { total: number; refetch: () => void } {
  const [total, setTotal] = useState<number>(0);
  const { on, connected } = useChatSocket();

  async function load() {
    if (!getToken()) {
      setTotal(0);
      return;
    }
    try {
      const data = await api<UnreadResponse>('/conversations/unread-count');
      setTotal(typeof data?.total === 'number' ? data.total : 0);
    } catch (err) {
      // Treat 401 / no-account as zero. Other errors silently retry on next event.
      if (err instanceof ApiError && err.status === 401) setTotal(0);
    }
  }

  useEffect(() => {
    void load();
    const handleFocus = () => void load();
    const handleAuth = () => void load();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('auth-changed', handleAuth);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('auth-changed', handleAuth);
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    const offNew = on('new_message', () => void load());
    const offRead = on('message_read', () => void load());
    const offCreated = on('conversation_created', () => void load());
    return () => {
      offNew();
      offRead();
      offCreated();
    };
  }, [connected, on]);

  return { total, refetch: () => void load() };
}
