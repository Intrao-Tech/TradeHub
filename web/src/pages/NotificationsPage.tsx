import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const LIMIT = 20;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

type NotificationRow = {
  id: string | number;
  type: string;
  title: string;
  body: string | null;
  channel: string;
  read_at: string | null;
};

type ListResponse = {
  data: NotificationRow[];
  total: number;
  page: number;
  limit: number;
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [listRes, setListRes] = useState<ListResponse | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [listErr, setListErr] = useState('');
  const [countErr, setCountErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const loadList = useCallback(async (p: number) => {
    setListErr('');
    try {
      const q = new URLSearchParams();
      q.set('page', String(p));
      q.set('limit', String(LIMIT));
      const data = await api<ListResponse>(`/notifications?${q.toString()}`);
      setListRes(data);
    } catch (e) {
      setListErr(errMsg(e));
    }
  }, []);

  const loadUnread = useCallback(async () => {
    setCountErr('');
    try {
      const n = await api<number>('/notifications/unread-count');
      setUnreadCount(typeof n === 'number' ? n : Number(n));
    } catch (e) {
      setCountErr(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void loadList(page);
    void loadUnread();
  }, [page, loadList, loadUnread]);

  async function markRead(id: string | number) {
    const key = String(id);
    setRowErr((prev) => ({ ...prev, [key]: '' }));
    setActionErr('');
    try {
      await api(`/notifications/${encodeURIComponent(key)}/read`, {
        method: 'PATCH',
      });
      await loadList(page);
      await loadUnread();
    } catch (e) {
      setRowErr((prev) => ({ ...prev, [key]: errMsg(e) }));
    }
  }

  async function markAllRead() {
    setActionErr('');
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      await loadList(page);
      await loadUnread();
    } catch (e) {
      setActionErr(errMsg(e));
    }
  }

  const total = listRes?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / LIMIT));
  const items = listRes?.data ?? [];

  return (
    <div>
      <h1>Notifications</h1>

      {listErr ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{listErr}</div>
      ) : null}
      {countErr ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{countErr}</div>
      ) : null}
      {actionErr ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{actionErr}</div>
      ) : null}

      <p>
        Unread count:{' '}
        {unreadCount === null ? '…' : unreadCount}
      </p>
      <pre style={{ marginBottom: 16, overflow: 'auto' }}>
        {JSON.stringify(unreadCount, null, 2)}
      </pre>

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => void markAllRead()}>
          Mark All Read
        </button>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span>
          Page {page} of {lastPage} (total {total})
        </span>
        <button
          type="button"
          disabled={page >= lastPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((n) => (
          <li
            key={String(n.id)}
            style={{
              border: '1px solid #ddd',
              padding: 12,
              marginBottom: 12,
              borderRadius: 6,
            }}
          >
            <div>
              <strong>id</strong> {String(n.id)} · <strong>type</strong> {n.type}{' '}
              · <strong>channel</strong> {n.channel} ·{' '}
              <strong>read_at</strong> {n.read_at ?? 'null (unread)'}
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>{n.title}</strong>
            </div>
            {n.body ? <div style={{ marginTop: 4 }}>{n.body}</div> : null}
            {n.read_at == null ? (
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => void markRead(n.id)}
              >
                Mark Read
              </button>
            ) : null}
            {rowErr[String(n.id)] ? (
              <div style={{ color: 'red', marginTop: 8 }}>
                {rowErr[String(n.id)]}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 16 }}>Raw list response</h2>
      <pre style={{ overflow: 'auto' }}>
        {JSON.stringify(listRes, null, 2)}
      </pre>
    </div>
  );
}
