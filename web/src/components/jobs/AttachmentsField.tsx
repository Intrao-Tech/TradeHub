import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AttachedFile } from './attachmentValue';

const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface AttachmentsFieldProps {
  value: AttachedFile[];
  onChange: (next: AttachedFile[]) => void;
  helperText: string;
  disabled?: boolean;
}

export function AttachmentsField({
  value,
  onChange,
  helperText,
  disabled,
}: AttachmentsFieldProps) {
  const { t } = useTranslation(['jobs', 'validation']);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const helperId = useId();

  // Error rows are transient UI only — they don't count toward the cap.
  const atLimit = value.filter((r) => r.kind !== 'error').length >= MAX_FILES;

  function openPicker() {
    if (disabled || atLimit) return;
    inputRef.current?.click();
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    let working: AttachedFile[] = value;
    const slotsLeft = Math.max(
      0,
      MAX_FILES - working.filter((r) => r.kind !== 'error').length,
    );
    const accepted = picked.slice(0, slotsLeft);
    const overflow = picked.length - accepted.length;

    for (const file of accepted) {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!ALLOWED_MIMES.has(file.type)) {
        working = [
          ...working,
          {
            kind: 'error',
            tempId,
            name: file.name,
            message: t('validation:file.invalidType'),
          },
        ];
        continue;
      }
      if (file.size > MAX_BYTES) {
        working = [
          ...working,
          {
            kind: 'error',
            tempId,
            name: file.name,
            message: t('validation:file.tooLarge', { maxMb: 25 }),
          },
        ];
        continue;
      }
      working = [
        ...working,
        { kind: 'pending', tempId, file, name: file.name, size: file.size },
      ];
    }

    if (overflow > 0) {
      working = [
        ...working,
        {
          kind: 'error',
          tempId: `overflow-${Date.now()}`,
          name: t('attachments.notAdded', { count: overflow }),
          message: t('validation:file.tooMany', { count: MAX_FILES }),
        },
      ];
    }

    onChange(working);
  }

  function removeRow(row: AttachedFile) {
    if (row.kind === 'saved') {
      onChange(value.filter((r) => !(r.kind === 'saved' && r.id === row.id)));
    } else {
      onChange(
        value.filter((r) => r.kind === 'saved' || r.tempId !== row.tempId),
      );
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={helperId}
      className="space-y-3"
    >
      <h3 id={headingId} className="text-base font-semibold text-fg">
        {t('attachments.title')}
      </h3>
      <p id={helperId} className="text-sm text-fg-muted">
        {helperText}
      </p>
      <p className="text-xs text-fg-muted">
        {t('attachments.limitHint', { count: MAX_FILES, maxMb: 25 })}
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFiles}
        aria-hidden="true"
        tabIndex={-1}
      />

      <Button
        type="button"
        variant="outline"
        onClick={openPicker}
        disabled={disabled || atLimit}
        className="gap-2"
      >
        <Paperclip className="h-4 w-4" />
        {t('attachments.attach')}
      </Button>

      {atLimit ? (
        <p className="text-xs text-fg-muted" role="status">
          {t('attachments.limitReached')}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="space-y-2" aria-label={t('attachments.listAria')}>
          {value.map((row) => (
            <AttachmentRow
              key={
                row.kind === 'saved' ? `saved-${row.id}` : `tmp-${row.tempId}`
              }
              row={row}
              onRemove={() => removeRow(row)}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
AttachmentsField.displayName = 'AttachmentsField';

function AttachmentRow({
  row,
  onRemove,
  disabled,
}: {
  row: AttachedFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('jobs');
  const isError = row.kind === 'error';
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border px-3 py-2',
        isError
          ? 'border-danger/40 bg-danger-subtle'
          : 'border-border bg-bg-subtle',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Paperclip
          className={cn(
            'h-4 w-4 shrink-0',
            isError ? 'text-danger' : 'text-fg-muted',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg" title={row.name}>
            {row.name}
          </p>
          {row.kind === 'error' ? (
            <p className="text-xs text-danger" role="alert">
              {row.message}
            </p>
          ) : (
            <p className="text-xs text-fg-muted">{formatSize(row.size)}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('attachments.removeAria', { name: row.name })}
        disabled={disabled}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
