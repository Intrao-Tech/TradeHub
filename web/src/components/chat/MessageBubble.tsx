import { AlertCircle, FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fileBytesPretty, formatTimeShort } from './helpers';
import type { ChatMessage, OptimisticMessage } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';
const ATTACHMENT_HOST = API_BASE.replace(/\/api\/?$/, '');

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
        {message.file_url ? (
          <a
            href={`${ATTACHMENT_HOST}${message.file_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex max-w-xs items-center gap-2 rounded-md border px-3 py-2 text-xs',
              mine
                ? 'border-primary-fg/30 bg-primary-fg/10 text-primary-fg hover:bg-primary-fg/20'
                : 'border-border-default bg-raised text-fg hover:bg-subtle',
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {message.original_name ?? 'Attachment'}
            </span>
            {message.size_bytes != null ? (
              <span className={mine ? 'text-primary-fg/80' : 'text-fg-muted'}>
                {fileBytesPretty(message.size_bytes)}
              </span>
            ) : null}
          </a>
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
