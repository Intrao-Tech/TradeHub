import { useEffect, useState } from 'react';
import { ApiError, api, getToken } from '@/api';

type UnreadResponse = number | { total: number };

/**
 * Polls `/notifications/unread-count` on mount, on window focus, and on
 * auth-changed. No WebSocket channel for notifications today — `refetch` is
 * exposed so callers (e.g. the bell dropdown) can refresh after mark-read.
 */
export function useNotificationsUnread(): {
  unread: number;
  refetch: () => void;
} {
  const [unread, setUnread] = useState<number>(0);

  async function load() {
    if (!getToken()) {
      setUnread(0);
      return;
    }
    try {
      const data = await api<UnreadResponse>('/notifications/unread-count');
      const n =
        typeof data === 'number'
          ? data
          : typeof data?.total === 'number'
            ? data.total
            : 0;
      setUnread(n);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUnread(0);
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

  return { unread, refetch: () => void load() };
}
