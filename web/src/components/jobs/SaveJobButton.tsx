import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type SaveJobButtonProps = {
  jobId: string | number;
  initialSaved: boolean;
  // Notifies the parent after a successful toggle. Useful for screens that
  // need to drop the row from a list (e.g. the Saved tab) when it is unsaved.
  onChange?: (saved: boolean) => void;
  // 'icon' renders a circular icon-only button (used on cards). 'pill' renders
  // a wider button with text — used on the job-detail sidebar.
  variant?: 'icon' | 'pill';
  className?: string;
};

export function SaveJobButton({
  jobId,
  initialSaved,
  onChange,
  variant = 'icon',
  className,
}: SaveJobButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function toggle(event: React.MouseEvent) {
    // Stop propagation so clicks on the icon inside a clickable card do not
    // also fire the card's onSelect handler.
    event.stopPropagation();
    if (pending) return;

    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      if (next) {
        await api(`/saved-jobs/${jobId}`, { method: 'POST' });
      } else {
        await api(`/saved-jobs/${jobId}`, { method: 'DELETE' });
      }
      onChange?.(next);
    } catch (err) {
      // Roll the optimistic toggle back so the icon matches server truth.
      setSaved(!next);
      toast.error(parseApiError(err)?.message ?? 'Could not update saved job');
    } finally {
      setPending(false);
    }
  }

  const label = saved ? 'Unsave job' : 'Save job';

  if (variant === 'pill') {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        className={cn('w-full', className)}
      >
        <Bookmark
          className={cn('h-4 w-4', saved && 'fill-current text-primary')}
        />
        {saved ? 'Saved' : 'Save job'}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={cn(
        'h-9 w-9 shrink-0 rounded-full',
        saved && 'text-primary hover:text-primary',
        className,
      )}
    >
      <Bookmark
        className={cn('h-5 w-5', saved && 'fill-current')}
        aria-hidden="true"
      />
    </Button>
  );
}
SaveJobButton.displayName = 'SaveJobButton';
