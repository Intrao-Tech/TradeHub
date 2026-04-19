import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-default bg-raised px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-fg-muted">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
EmptyState.displayName = 'EmptyState';
