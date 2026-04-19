import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
};

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function StarRating({ value, onChange, max = 5, size = 'md', className, label }: StarRatingProps) {
  const readOnly = !onChange;
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={label ?? `Rating ${value} of ${max}`}
    >
      {stars.map((n) => {
        const filled = n <= value;
        if (readOnly) {
          return (
            <Star
              key={n}
              className={cn(SIZES[size], filled ? 'fill-warning text-warning' : 'text-fg-subtle')}
              aria-hidden
            />
          );
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onChange(n)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-xs transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <Star
              className={cn(SIZES[size], filled ? 'fill-warning text-warning' : 'text-fg-subtle')}
            />
          </button>
        );
      })}
    </div>
  );
}
StarRating.displayName = 'StarRating';
