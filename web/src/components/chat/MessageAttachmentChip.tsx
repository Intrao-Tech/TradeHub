import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { fileBytesPretty, isImageMime } from './helpers';
import type { ChatMessageAttachment } from './types';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

function downloadHref(att: ChatMessageAttachment): string {
  if (att.download_url) {
    return att.download_url.startsWith('http')
      ? att.download_url
      : `${API.replace(/\/api\/?$/, '')}${att.download_url}`;
  }
  return `${API}/message-attachments/${String(att.id)}/download`;
}

/**
 * Inline attachment representation rendered inside a message bubble.
 * Image attachments show a thumbnail (linking to the download URL); other
 * attachments fall back to a metadata chip.
 */
export function MessageAttachmentChip({
  attachment,
  mine,
}: {
  attachment: ChatMessageAttachment;
  mine: boolean;
}) {
  const href = downloadHref(attachment);
  const meta = `${fileBytesPretty(attachment.size_bytes)} · ${attachment.mime_type}`;

  if (isImageMime(attachment.mime_type)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block max-w-xs overflow-hidden rounded-md border border-border-default bg-raised"
      >
        <img
          src={href}
          alt={attachment.original_name}
          className="block max-h-64 w-auto object-contain"
          loading="lazy"
        />
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-fg-muted">
          <ImageIcon className="h-3 w-3" />
          <span className="truncate">{attachment.original_name}</span>
          <span className="ml-auto shrink-0">{fileBytesPretty(attachment.size_bytes)}</span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        mine
          ? 'flex max-w-xs items-center gap-2 rounded-md border border-primary/40 bg-primary-fg/10 px-3 py-2 text-xs text-primary-fg hover:bg-primary-fg/20'
          : 'flex max-w-xs items-center gap-2 rounded-md border border-border-default bg-raised px-3 py-2 text-xs text-fg hover:bg-subtle'
      }
    >
      <FileText className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{attachment.original_name}</p>
        <p className={mine ? 'text-primary-fg/80' : 'text-fg-muted'}>{meta}</p>
      </div>
      <Download className="h-3 w-3 shrink-0" />
    </a>
  );
}
MessageAttachmentChip.displayName = 'MessageAttachmentChip';
