import type { MessageAttachment } from '@prisma/client';

export type SerialisedMessageAttachment = {
  id: string;
  message_id: string | null;
  uploaded_by_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
  download_url: string;
};

export function serialiseMessageAttachment(
  row: MessageAttachment,
): SerialisedMessageAttachment {
  return {
    id: row.id.toString(),
    message_id: row.message_id != null ? row.message_id.toString() : null,
    uploaded_by_id: row.uploaded_by_id.toString(),
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    download_url: `/api/message-attachments/${row.id.toString()}/download`,
  };
}
