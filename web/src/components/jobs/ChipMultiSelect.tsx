import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ChipOption = {
  id: number;
  name: string;
};

type ChipMultiSelectProps = {
  options: ChipOption[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  ariaLabel: string;
  loading?: boolean;
  maxSelectedHint?: number;
  id?: string;
  className?: string;
};

export function ChipMultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder = 'Search…',
  emptyText = 'No options match.',
  disabled = false,
  ariaLabel,
  loading = false,
  maxSelectedHint,
  id,
  className,
}: ChipMultiSelectProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedOptions = useMemo(
    () => selectedIds.map((id) => options.find((o) => o.id === id)).filter(Boolean) as ChipOption[],
    [selectedIds, options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = useCallback(
    (id: number) => {
      if (selectedSet.has(id)) {
        onChange(selectedIds.filter((s) => s !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [selectedSet, selectedIds, onChange],
  );

  const removeChip = useCallback(
    (id: number) => {
      onChange(selectedIds.filter((s) => s !== id));
    },
    [selectedIds, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && query === '' && selectedIds.length > 0) {
      e.preventDefault();
      removeChip(selectedIds[selectedIds.length - 1]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        toggle(filtered[activeIndex].id);
        setQuery('');
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
  };

  const overLimit =
    maxSelectedHint != null && selectedIds.length >= maxSelectedHint;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-raised px-2 py-1.5 text-sm',
          'focus-within:border-border-strong focus-within:ring-2 focus-within:ring-ring',
          disabled && 'opacity-50 pointer-events-none',
        )}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
      >
        {selectedOptions.map((opt) => (
          <span
            key={opt.id}
            className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-fg"
          >
            {opt.name}
            <button
              type="button"
              aria-label={`Remove ${opt.name}`}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(opt.id);
              }}
              className="rounded-full p-0.5 hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          placeholder={selectedOptions.length === 0 ? placeholder : ''}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {overLimit ? (
        <p className="mt-1 text-xs text-fg-muted">
          Pick up to {maxSelectedHint} for best results.
        </p>
      ) : null}

      {open && !disabled ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-default bg-raised shadow-lg"
          role="listbox"
          id={listId}
          aria-multiselectable="true"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-fg-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-muted">{emptyText}</p>
          ) : (
            <ul className="py-1">
              {filtered.map((opt, idx) => {
                const isSelected = selectedSet.has(opt.id);
                const isActive = idx === activeIndex;
                return (
                  <li
                    key={opt.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggle(opt.id);
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-fg',
                      isActive && 'bg-subtle',
                      isSelected && 'font-medium',
                    )}
                  >
                    <span>{opt.name}</span>
                    {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
ChipMultiSelect.displayName = 'ChipMultiSelect';
