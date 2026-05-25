// Value model + pure transforms for <AttachmentsField>. Kept separate from the
// component file so AttachmentsField.tsx exports only its component (clean
// React fast-refresh). Network calls live in attachmentApi.ts.

/**
 * A row in <AttachmentsField>. Uploads are parent-first: a file cannot be
 * sent until the job post / application it belongs to exists, so the field
 * only holds files locally. The owning form uploads `pending` files (and
 * deletes removed `saved` ones) after it has saved the parent.
 */
export type AttachedFile =
  | {
      // Already stored on the server (edit mode — the parent already exists).
      kind: 'saved';
      id: number;
      name: string;
      size: number;
      mime: string;
    }
  | {
      // Picked locally, not yet uploaded — the form uploads it on submit.
      kind: 'pending';
      tempId: string;
      file: File;
      name: string;
      size: number;
    }
  | {
      // Client-side validation failure (bad type / too big / over the cap).
      kind: 'error';
      tempId: string;
      name: string;
      message: string;
    };

/** New files picked but not yet uploaded — the form sends these on submit. */
export function pendingFilesFromValue(value: AttachedFile[]): File[] {
  return value
    .filter(
      (r): r is Extract<AttachedFile, { kind: 'pending' }> =>
        r.kind === 'pending',
    )
    .map((r) => r.file);
}

/** Ids of attachments already on the server that the user kept. */
export function savedIdsFromValue(value: AttachedFile[]): number[] {
  return value
    .filter(
      (r): r is Extract<AttachedFile, { kind: 'saved' }> => r.kind === 'saved',
    )
    .map((r) => r.id);
}

/** Convert server-returned attachments into `saved` rows (edit-mode prefill). */
export function valueFromReadAttachments(
  attachments: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>,
): AttachedFile[] {
  return attachments.map((a) => ({
    kind: 'saved' as const,
    id: typeof a.id === 'string' ? Number(a.id) : a.id,
    name: a.original_name,
    size: a.size_bytes,
    mime: a.mime_type,
  }));
}
