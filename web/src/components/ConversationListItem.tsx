import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  VerificationBadge,
  verificationFromLevel,
} from './VerificationBadge';
import { activeLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ConversationListItemData = {
  id: string | number;
  other_party_name?: string | null;
  other_party_avatar?: string | null;
  other_party_verification_level?: string | number | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
};

type ConversationListItemProps = {
  conversation: ConversationListItemData;
  active?: boolean;
  onSelect?: (c: ConversationListItemData) => void;
  className?: string;
};

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString(activeLocale(), { weekday: 'short' });
  return d.toLocaleDateString(activeLocale(), { month: 'short', day: 'numeric' });
}

export function ConversationListItem({ conversation, active, onSelect, className }: ConversationListItemProps) {
  const { t } = useTranslation('chat');
  const name = conversation.other_party_name ?? t('inbox.fallbackName');
  const unread = conversation.unread_count ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(conversation) : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors min-h-12',
        active ? 'bg-subtle' : 'hover:bg-subtle',
        className,
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        {conversation.other_party_avatar ? (
          <AvatarImage src={conversation.other_party_avatar} alt={name} />
        ) : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn('truncate text-sm', unread > 0 ? 'font-semibold text-fg' : 'font-medium text-fg')}>
              {name}
            </span>
            <VerificationBadge
              state={verificationFromLevel(
                conversation.other_party_verification_level,
              )}
              className="min-w-0 shrink"
            />
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-fg-subtle">
            {formatTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-xs',
              unread > 0 ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {conversation.last_message_preview ?? t('inbox.noMessages')}
          </p>
          {unread > 0 ? (
            <Badge variant="default" className="h-5 min-w-5 shrink-0 justify-center px-1.5 text-xs">
              {unread > 99 ? '99+' : unread}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}
ConversationListItem.displayName = 'ConversationListItem';
