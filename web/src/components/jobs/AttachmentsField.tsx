import { useId, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { ApiError, getToken, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type AttachedFile =
  | {
      kind: 'uploading';
      tempId: string;
      name: string;
      size: number;
    }
  | {
      kind: 'uploaded';
      id: number;
      name: string;
      size: number;
      mime: string;
    }
  | {
      kind: 'error';
      tempId: string;
      name: string;
      message: string;
    };

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
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const helperId = useId();
  const [browseDisabled, setBrowseDisabled] = useState(false);

  const atLimit = value.length >= MAX_FILES;

  function openPicker() {
    if (disabled || atLimit) return;
    inputRef.current?.click();
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    setBrowseDisabled(true);
    try {
      let working: AttachedFile[] = value;
      const slotsLeft = Math.max(0, MAX_FILES - working.length);
      const accepted = picked.slice(0, slotsLeft);
      const overflow = picked.length - accepted.length;

      const queued: { tempId: string; file: File; localRow: AttachedFile }[] =
        [];

      for (const file of accepted) {
        const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (!ALLOWED_MIMES.has(file.type)) {
          working = [
            ...working,
            {
              kind: 'error',
              tempId,
              name: file.name,
              message: 'Use a PDF, JPEG, PNG, or WebP file.',
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
              message: 'Files must be under 25 MB.',
            },
          ];
          continue;
        }
        const localRow: AttachedFile = {
          kind: 'uploading',
          tempId,
          name: file.name,
          size: file.size,
        };
        working = [...working, localRow];
        queued.push({ tempId, file, localRow });
      }

      if (overflow > 0) {
        const tempId = `overflow-${Date.now()}`;
        working = [
          ...working,
          {
            kind: 'error',
            tempId,
            name: `${overflow} file${overflow === 1 ? '' : 's'} not added`,
            message: `Up to ${MAX_FILES} files.`,
          },
        ];
      }

      onChange(working);

      for (const { tempId, file } of queued) {
        try {
          const uploaded = await uploadOne(file);
          working = working.map((row) =>
            row.kind === 'uploading' && row.tempId === tempId
              ? {
                  kind: 'uploaded',
                  id: Number(uploaded.id),
                  name: uploaded.original_name,
                  size: uploaded.size_bytes,
                  mime: uploaded.mime_type,
                }
              : row,
          );
          onChange(working);
        } catch (err) {
          const parsed = parseApiError(err);
          const message =
            parsed?.code === 'INVALID_MIME'
              ? 'Use a PDF, JPEG, PNG, or WebP file.'
              : parsed?.code === 'ORPHAN_LIMIT'
                ? 'Submit or remove some uploads before adding more.'
                : parsed?.message ?? 'Upload failed.';
          working = working.map((row) =>
            row.kind === 'uploading' && row.tempId === tempId
              ? { kind: 'error', tempId, name: row.name, message }
              : row,
          );
          onChange(working);
        }
      }
    } finally {
      setBrowseDisabled(false);
    }
  }

  async function removeRow(row: AttachedFile) {
    if (row.kind === 'uploaded') {
      try {
        await fetch(`${API_BASE}/job-attachments/${row.id}`, {
          method: 'DELETE',
          headers: getToken()
            ? { Authorization: `Bearer ${getToken()}` }
            : undefined,
        });
      } catch {
        /* best-effort delete; cron will sweep regardless */
      }
      onChange(value.filter((r) => !(r.kind === 'uploaded' && r.id === row.id)));
      return;
    }
    if (row.kind === 'error' || row.kind === 'uploading') {
      onChange(
        value.filter((r) =>
          r.kind === 'uploaded' ? true : r.tempId !== row.tempId,
        ),
      );
    }
  }

  const showRemovedHint =
    !disabled &&
    !atLimit &&
    value.filter((r) => r.kind === 'uploaded').length > 0;

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={helperId}
      className="space-y-3"
    >
      <h3
        id={headingId}
        className="text-base font-semibold text-fg"
      >
        Attachments
      </h3>
      <p id={helperId} className="text-sm text-fg-muted">
        {helperText}
      </p>
      <p className="text-xs text-fg-muted">
        Up to {MAX_FILES} files (max 25 MB each)
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
        disabled={disabled || atLimit || browseDisabled}
        className="gap-2"
      >
        <Paperclip className="h-4 w-4" />
        Attach files
      </Button>

      {atLimit ? (
        <p className="text-xs text-fg-muted" role="status">
          Limit reached — remove a file to add another.
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="space-y-2" aria-label="Attached files">
          {value.map((row) => (
            <AttachmentRow
              key={
                row.kind === 'uploaded'
                  ? `uploaded-${row.id}`
                  : `tmp-${row.tempId}`
              }
              row={row}
              onRemove={() => removeRow(row)}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}

      {showRemovedHint ? null : null}
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
  const isError = row.kind === 'error';
  const isUploading = row.kind === 'uploading';
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
          {isError ? (
            <p className="text-xs text-danger" role="alert">
              {row.message}
            </p>
          ) : (
            <p className="text-xs text-fg-muted">
              {isUploading ? 'Uploading…' : formatSize(row.size)}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.name}`}
        disabled={disabled || isUploading}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

async function uploadOne(file: File): Promise<{
  id: string | number;
  original_name: string;
  size_bytes: number;
  mime_type: string;
}> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/job-attachments`, {
    method: 'POST',
    body: form,
    headers: getToken()
      ? { Authorization: `Bearer ${getToken()}` }
      : undefined,
  });
  if (!res.ok) {
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = { message: res.statusText };
    }
    throw new ApiError(res.status, body);
  }
  return res.json();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function attachmentIdsFromValue(value: AttachedFile[]): number[] {
  return value
    .filter((r): r is Extract<AttachedFile, { kind: 'uploaded' }> => r.kind === 'uploaded')
    .map((r) => r.id);
}

export function valueFromReadAttachments(
  attachments: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>,
): AttachedFile[] {
  return attachments.map((a) => ({
    kind: 'uploaded' as const,
    id: typeof a.id === 'string' ? Number(a.id) : a.id,
    name: a.original_name,
    size: a.size_bytes,
    mime: a.mime_type,
  }));
}
