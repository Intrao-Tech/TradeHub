import { cn } from '@/lib/utils';

/**
 * TypingIndicator — three pulsing dots in a subtle pill, rendered above
 * the composer (CHAT-064). Visibility is controlled by the parent.
 */
export function TypingIndicator({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      data-testid="typing-indicator"
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs text-fg-muted',
        className,
      )}
    >
      <span className="font-medium text-fg">{name}</span>
      <span aria-hidden className="inline-flex items-center gap-1">
        <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted [animation-delay:0ms]" />
        <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted [animation-delay:150ms]" />
        <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted [animation-delay:300ms]" />
      </span>
      <span>is typing…</span>
    </div>
  );
}
TypingIndicator.displayName = 'TypingIndicator';
