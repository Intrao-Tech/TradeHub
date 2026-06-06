import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranslateFn } from '@/i18n/types';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { ApiError, api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { ConversationListItem } from '@/components/ConversationListItem';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatSocket } from '@/components/chat/useChatSocket';
import { ConversationPanel } from '@/components/chat/ConversationPanel';
import type {
  ChatMessage,
  InboxItem,
  InboxResponse,
} from '@/components/chat/types';
import { cn } from '@/lib/utils';

function previewLine(
  message: ChatMessage | null,
  t: TranslateFn,
): string | null {
  if (!message) return null;
  if (message.content && message.content.trim().length > 0) {
    return message.content;
  }
  // A file message carries its file inline now.
  if (message.file_url) {
    return message.original_name
      ? t('inbox.sentFileNamed', { name: message.original_name })
      : t('inbox.sentFile');
  }
  return null;
}

export default function InboxPage() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams<{
    conversationId?: string;
  }>();
  const { account } = useAccountMe();
  const { on, connected } = useChatSocket();

  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api<InboxResponse>(
        '/conversations?page=1&limit=50',
      );
      setInbox(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(null);
      } else {
        setError(parseApiError(err)?.message ?? t('inbox.loadError'));
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handleFocus = () => void load();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const off1 = on('new_message', () => void load());
    const off2 = on('message_read', () => void load());
    const off3 = on('conversation_created', () => void load());
    return () => {
      off1();
      off2();
      off3();
    };
  }, [connected, on]);

  const items = inbox?.items ?? [];
  const selectedId = routeConversationId ?? null;
  const selectedRow = useMemo(
    () => items.find((row) => String(row.conversation.id) === selectedId) ?? null,
    [items, selectedId],
  );

  function openConversation(id: string | number) {
    navigate(`/inbox/${String(id)}`);
  }

  function backToList() {
    navigate('/inbox');
  }

  const myAccountId = account?.id != null ? String(account.id) : null;

  return (
    <div
      data-testid="inbox-page"
      className="flex h-[calc(100vh-7rem)] flex-col gap-3"
    >
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t('inbox.title')}</h1>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[320px_1fr]">
        <aside
          data-testid="inbox-list"
          className={cn(
            'flex min-h-0 flex-col overflow-hidden rounded-md border border-border-default bg-raised',
            selectedId ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="border-b border-border-default px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('inbox.conversations')}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={MessageSquare}
                  title={t('inbox.noConversationsTitle')}
                  description={t('inbox.noConversationsDesc')}
                />
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((row) => (
                  <li key={String(row.conversation.id)}>
                    <InboxRow
                      row={row}
                      active={String(row.conversation.id) === selectedId}
                      onSelect={() => openConversation(row.conversation.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section
          className={cn(
            'min-h-0 overflow-hidden rounded-md border border-border-default bg-raised',
            selectedId ? 'flex' : 'hidden lg:flex',
            'flex-col',
          )}
        >
          {selectedId ? (
            <ConversationPanel
              key={selectedId}
              conversationId={selectedId}
              myAccountId={myAccountId}
              inboxRow={selectedRow}
              onBack={backToList}
              onConversationGone={backToList}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={MessageSquare}
                title={t('inbox.selectTitle')}
                description={t('inbox.selectDesc')}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type InboxRowProps = {
  row: InboxItem;
  active: boolean;
  onSelect: () => void;
};

function InboxRow({ row, active, onSelect }: InboxRowProps) {
  const { t } = useTranslation('chat');
  const name =
    row.other_participant?.display_name ??
    (row.other_participant?.account_id != null
      ? t('inbox.accountName', { id: String(row.other_participant.account_id) })
      : t('inbox.fallbackName'));
  const lastIso =
    row.conversation.last_message_at ?? row.last_message?.created_at ?? null;

  return (
    <div className="space-y-1">
      <ConversationListItem
        conversation={{
          id: row.conversation.id,
          other_party_name: name,
          other_party_avatar: row.other_participant?.avatar_url ?? null,
          other_party_verification_level:
            row.other_participant?.verification_level ?? null,
          last_message_preview: previewLine(row.last_message ?? null, t),
          last_message_at: lastIso,
          unread_count: row.unread_count,
        }}
        active={active}
        onSelect={onSelect}
      />
    </div>
  );
}

type ConversationPanelHeaderProps = {
  onBack?: () => void;
};

export function MobileBackButton({ onBack }: ConversationPanelHeaderProps) {
  const { t } = useTranslation('chat');
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="lg:hidden"
      aria-label={t('inbox.backToInbox')}
      onClick={onBack}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
