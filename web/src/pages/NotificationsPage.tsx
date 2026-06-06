import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, X } from 'lucide-react';
import { api, parseApiError } from '../api';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';

const LIMIT = 20;

type NotificationRow = {
  id: string | number;
  type: string;
  title: string;
  body: string | null;
  channel: string;
  read_at: string | null;
  created_at?: string;
};

type ListResponse = {
  data: NotificationRow[];
  total: number;
  page: number;
  limit: number;
};

function formatWhen(iso?: string | null): string {
  return formatDateTime(iso, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const { t } = useTranslation('common');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (p: number) => {
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
      });
      const data = await api<ListResponse>(`/notifications?${q.toString()}`);
      setRes(data);
    } catch (e) {
      const parsed = parseApiError(e);
      setError(parsed?.message ?? t('notifications.loadError'));
    }
  }, [t]);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  async function markRead(id: string | number) {
    try {
      await api(`/notifications/${encodeURIComponent(String(id))}/read`, {
        method: 'PATCH',
      });
      await load(page);
    } catch (e) {
      const parsed = parseApiError(e);
      setError(parsed?.message ?? t('notifications.markReadError'));
    }
  }

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      await load(page);
    } catch (e) {
      const parsed = parseApiError(e);
      setError(parsed?.message ?? t('notifications.markAllError'));
    }
  }

  const rows = res?.data ?? [];
  const total = res?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            {t('notifications.title')}
          </h1>
          <p className="text-sm text-fg-muted">
            {t('notifications.subtitle')}
          </p>
        </div>
        {hasUnread ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()}>
            {t('notifications.markAllRead')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('notifications.activity')}</CardTitle>
          <CardDescription>
            {total > 0
              ? t('notifications.count', { count: total })
              : t('notifications.countNone')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {res == null ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              {t('notifications.loading')}
            </p>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={Bell}
                title={t('notifications.emptyTitle')}
                description={t('notifications.emptyDesc')}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border-default">
              {rows.map((n) => (
                <li
                  key={String(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    n.read_at ? '' : 'bg-subtle'
                  }`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-fg-muted">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p>
                    ) : null}
                    {n.created_at ? (
                      <p className="mt-1 text-xs text-fg-muted">
                        {formatWhen(n.created_at)}
                      </p>
                    ) : null}
                  </div>
                  {!n.read_at ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label={t('notifications.markRead')}
                      onClick={() => void markRead(n.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {total > LIMIT ? (
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>
            {t('notifications.pageLine', { page, pages: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('notifications.previous')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('notifications.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
