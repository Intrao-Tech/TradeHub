import { AlertCircle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTimeShort } from './helpers';
import { MessageAttachmentChip } from './MessageAttachmentChip';
import type { ChatMessage, OptimisticMessage } from './types';

type MessageBubbleProps = {
  message: ChatMessage | OptimisticMessage;
  mine: boolean;
  groupedWithPrev: boolean;
  showSeen?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
};

function isOptimistic(m: ChatMessage | OptimisticMessage): m is OptimisticMessage {
  return 'status' in m;
}

/**
 * MessageBubble — bubble + attachment list + optimistic status.
 * `groupedWithPrev` is honoured by suppressing the timestamp blurb when
 * the same sender just spoke within 60 s.
 */
export function MessageBubble({
  message,
  mine,
  groupedWithPrev,
  showSeen,
  onRetry,
  onDiscard,
}: MessageBubbleProps) {
  const optimistic = isOptimistic(message) ? message : null;
  const status = optimistic?.status;
  const failed = status === 'failed';
  const sending = status === 'sending';
  const exhausted = optimistic && optimistic.retry_count >= 3;

  return (
    <div
      data-testid="chat-message"
      className={cn(
        'flex flex-col',
        groupedWithPrev ? 'mt-1' : 'mt-3',
        mine ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1.5 rounded-lg px-3 py-2 text-sm',
          mine
            ? 'bg-primary text-primary-fg'
            : 'bg-subtle text-fg',
          failed ? 'opacity-80 ring-1 ring-danger/60' : '',
        )}
      >
        {message.content ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : null}
        {message.attachments && message.attachments.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {message.attachments.map((att) => (
              <MessageAttachmentChip
                key={String(att.id)}
                attachment={att}
                mine={mine}
              />
            ))}
          </div>
        ) : null}
      </div>

      {!groupedWithPrev || sending || failed || showSeen ? (
        <div
          className={cn(
            'mt-1 flex items-center gap-2 text-xs text-fg-subtle',
            mine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span>{formatTimeShort(message.created_at)}</span>
          {sending ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Sending…
            </span>
          ) : null}
          {failed ? (
            <span className="flex items-center gap-1 text-danger">
              <AlertCircle className="h-3 w-3" />
              Couldn’t send
            </span>
          ) : null}
          {showSeen && status !== 'sending' && status !== 'failed' ? (
            <span>Seen</span>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <div className="mt-1 flex gap-2">
          {!exhausted && onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onRetry}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          ) : null}
          {(exhausted || onDiscard) && onDiscard ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-fg-muted"
              onClick={onDiscard}
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
MessageBubble.displayName = 'MessageBubble';
