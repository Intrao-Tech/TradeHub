import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { api, parseApiError } from '@/api';
import { IS_STAFF_HOST } from '@/lib/host';
import { formatRelative } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationsUnread } from './useNotificationsUnread';

type NotificationRow = {
  id: string | number;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at?: string;
};

type ListResponse = {
  data: NotificationRow[];
  total: number;
  page: number;
  limit: number;
};

/**
 * Upwork-style bell button + popover list of recent notifications.
 *
 * Replaces the standalone /notifications page. Loads the latest 10 on open,
 * supports per-row dismiss (mark-read) and a "Mark all read" footer.
 */
export function NotificationsBell() {
  const { t } = useTranslation('common');
  const { unread, refetch } = useNotificationsUnread();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState('');

  async function loadList() {
    setError('');
    try {
      // Bell popover surfaces only unread — full history lives on /notifications.
      const res = await api<ListResponse>(
        '/notifications?page=1&limit=10&unread_only=true',
      );
      setRows(res.data ?? []);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('notifications.loadError'));
    }
  }

  async function markRead(id: string | number) {
    try {
      await api(`/notifications/${encodeURIComponent(String(id))}/read`, {
        method: 'PATCH',
      });
      await loadList();
      refetch();
    } catch {
      /* non-fatal */
    }
  }

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      await loadList();
      refetch();
    } catch {
      /* non-fatal */
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void loadList();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0
              ? t('notifications.unreadAria', { count: unread })
              : t('notifications.bellAria')
          }
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-fg">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        {unread > 0 ? (
          <>
            <div className="flex items-center justify-end px-3 py-2">
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-primary hover:underline"
              >
                {t('notifications.markAllRead')}
              </button>
            </div>
            <DropdownMenuSeparator className="m-0" />
          </>
        ) : null}
        {error ? (
          <p className="px-3 py-4 text-xs text-danger">{error}</p>
        ) : rows == null ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            {t('notifications.loading')}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            {t('notifications.caughtUp')}
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((n) => (
              <li
                key={String(n.id)}
                className={`flex items-start gap-2 border-b border-border-default px-3 py-2 last:border-b-0 ${
                  n.read_at ? '' : 'bg-subtle'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {n.title}
                  </p>
                  {n.body ? (
                    <p className="line-clamp-2 text-xs text-fg-muted">
                      {n.body}
                    </p>
                  ) : null}
                  {n.created_at ? (
                    <p className="mt-0.5 text-[10px] text-fg-muted">
                      {formatRelative(n.created_at, t)}
                    </p>
                  ) : null}
                </div>
                {!n.read_at ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label={t('notifications.markRead')}
                    onClick={() => void markRead(n.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <DropdownMenuSeparator className="m-0" />
        <NavLink
          to={IS_STAFF_HOST ? '/admin?tab=notifications' : '/notifications'}
          onClick={() => setOpen(false)}
          className="block px-3 py-2 text-center text-sm font-medium text-primary hover:bg-subtle"
        >
          {t('notifications.seeAll')}
        </NavLink>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
