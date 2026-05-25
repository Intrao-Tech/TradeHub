import type { ReactNode } from 'react';

/**
 * Centred grey pill used for `message_type === 'SYSTEM'` rows (CHAT-051) —
 * not part of the sender bubble flow.
 */
export function SystemMessagePill({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full bg-subtle px-3 py-1 text-xs font-medium text-fg-muted">
        {children}
      </span>
    </div>
  );
}
SystemMessagePill.displayName = 'SystemMessagePill';
