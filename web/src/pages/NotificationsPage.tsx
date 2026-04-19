import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Notifications</h1>
          <p className="text-sm text-fg-muted">
            Unread:{' '}
            {unreadCount === null ? (
              <span className="text-fg-subtle">…</span>
            ) : (
              <Badge variant={unreadCount > 0 ? 'warning' : 'outline'}>{unreadCount}</Badge>
            )}
          </p>
        </div>
        <Button type="button" onClick={() => void markAllRead()} variant="outline">
          Mark all read
        </Button>
      </div>

      {listErr ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listErr}
        </div>
      ) : null}
      {countErr ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {countErr}
        </div>
      ) : null}
      {actionErr ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionErr}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <CardDescription>
            Page {page} of {lastPage} · total {total}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="You're all caught up."
            />
          ) : (
            <ul className="divide-y divide-border-default">
              {items.map((n) => {
                const isUnread = n.read_at == null;
                return (
                  <li
                    key={String(n.id)}
                    className={
                      'flex flex-col gap-2 px-3 py-4 sm:flex-row sm:items-start sm:justify-between ' +
                      (isUnread ? 'bg-subtle rounded-md' : '')
                    }
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{n.title}</span>
                        {isUnread ? <Badge variant="warning">Unread</Badge> : null}
                        <Badge variant="outline">{n.type}</Badge>
                        <Badge variant="outline">{n.channel}</Badge>
                      </div>
                      {n.body ? (
                        <p className="text-sm text-fg-muted">{n.body}</p>
                      ) : null}
                      <p className="text-xs text-fg-subtle">
                        id {String(n.id)} · {n.read_at ?? 'unread'}
                      </p>
                      {rowErr[String(n.id)] ? (
                        <p className="text-xs text-danger">{rowErr[String(n.id)]}</p>
                      ) : null}
                    </div>
                    {isUnread ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void markRead(n.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-fg-muted">
              Page {page} of {lastPage}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw list response</CardTitle>
          <CardDescription>Debug view</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {JSON.stringify(listRes, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
