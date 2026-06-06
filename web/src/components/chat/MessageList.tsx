import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildRenderedRows, translateSystemMessage } from './helpers';
import { MessageBubble } from './MessageBubble';
import { SystemMessagePill } from './SystemMessagePill';
import type {
  ChatMessage,
  OptimisticMessage,
} from './types';

type MessageListProps = {
  messages: Array<ChatMessage | OptimisticMessage>;
  myAccountId: string | number | null;
  otherLastReadAt: string | null;
  onRetry?: (clientId: string) => void;
  onDiscard?: (clientId: string) => void;
  onLoadOlder?: () => void;
  hasMoreOlder?: boolean;
};

const STICK_TO_BOTTOM_THRESHOLD_PX = 100;

/**
 * Virtualised message list with day separators, optimistic statuses, and
 * a "New messages ↓" pill when the user has scrolled away from the latest.
 */
export function MessageList({
  messages,
  myAccountId,
  otherLastReadAt,
  onRetry,
  onDiscard,
  onLoadOlder,
  hasMoreOlder,
}: MessageListProps) {
  const { t } = useTranslation('chat');
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const [unseenBelow, setUnseenBelow] = useState(false);

  const rows = useMemo(
    () => buildRenderedRows(messages, myAccountId, t),
    [messages, myAccountId, t],
  );

  const lastMyMessageIndex = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.kind === 'message' && r.mine && (r.message as OptimisticMessage).status !== 'sending') {
        return i;
      }
    }
    return -1;
  }, [rows]);

  const otherLastReadMs = useMemo(() => {
    if (!otherLastReadAt) return null;
    const t = new Date(otherLastReadAt).getTime();
    return Number.isNaN(t) ? null : t;
  }, [otherLastReadAt]);

  const virtualiser = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index].kind === 'day' ? 32 : 64),
    overscan: 8,
  });

  // Stick-to-bottom: when new messages arrive AND the user was already
  // pinned to the bottom (within threshold), scroll to the new last row.
  // Otherwise, surface the "New messages ↓" pill.
  useLayoutEffect(() => {
    if (rows.length === 0) return;
    if (stuckToBottom) {
      virtualiser.scrollToIndex(rows.length - 1, { align: 'end' });
      setUnseenBelow(false);
    } else {
      setUnseenBelow(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const stuck = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
      setStuckToBottom(stuck);
      if (stuck) setUnseenBelow(false);

      // CHAT-061 — load older messages when within 200 px of the top.
      if (hasMoreOlder && onLoadOlder && el.scrollTop <= 200) {
        onLoadOlder();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMoreOlder, onLoadOlder]);

  const items = virtualiser.getVirtualItems();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={parentRef}
        data-testid="chat-message-list"
        className="flex-1 overflow-y-auto px-4"
      >
        <div
          style={{
            height: `${virtualiser.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {items.map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={row.key}
                ref={virtualiser.measureElement}
                data-index={vi.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {row.kind === 'day' ? (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full border border-border-default bg-raised px-3 py-1 text-xs font-medium text-fg-muted">
                      {row.label}
                    </span>
                  </div>
                ) : row.message.message_type === 'SYSTEM' ? (
                  <SystemMessagePill>
                    {translateSystemMessage(row.message.content ?? '', t)}
                  </SystemMessagePill>
                ) : (
                  <MessageBubble
                    message={row.message}
                    mine={row.mine}
                    groupedWithPrev={row.groupedWithPrev}
                    showSeen={
                      row.mine &&
                      vi.index === lastMyMessageIndex &&
                      otherLastReadMs != null &&
                      row.message.created_at != null &&
                      otherLastReadMs >= new Date(row.message.created_at).getTime()
                    }
                    onRetry={
                      'client_id' in row.message && onRetry
                        ? () => onRetry((row.message as OptimisticMessage).client_id)
                        : undefined
                    }
                    onDiscard={
                      'client_id' in row.message && onDiscard
                        ? () =>
                            onDiscard((row.message as OptimisticMessage).client_id)
                        : undefined
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unseenBelow ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2 shadow-md',
          )}
          onClick={() => {
            virtualiser.scrollToIndex(rows.length - 1, { align: 'end' });
            setUnseenBelow(false);
            setStuckToBottom(true);
          }}
        >
          <ChevronDown className="h-3 w-3" />
          {t('list.newMessages')}
        </Button>
      ) : null}
    </div>
  );
}
MessageList.displayName = 'MessageList';
