import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { getToken } from '../../api';
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

async function fetchBlob(href: string, mimeType: string): Promise<string> {
  const token = getToken();
  const res = await fetch(href, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("You don't have access to this attachment.");
    if (res.status === 404) throw new Error('This attachment is no longer available.');
    throw new Error('Could not open attachment.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

/**
 * Inline attachment representation rendered inside a message bubble.
 * The download endpoint is JWT-gated, so we fetch the bytes with the
 * Authorization header and surface them via a blob URL — both for the
 * inline preview and for the click-to-open action.
 */
export function MessageAttachmentChip({
  attachment,
  mine,
}: {
  attachment: ChatMessageAttachment;
  mine: boolean;
}) {
  const href = downloadHref(attachment);
  const isImage = isImageMime(attachment.mime_type);
  const meta = `${fileBytesPretty(attachment.size_bytes)} · ${attachment.mime_type}`;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>('');
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await fetchBlob(href, attachment.mime_type);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load image.');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [href, isImage, attachment.mime_type]);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    if (pending) return;
    setError('');

    if (isImage && previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setPending(true);
    try {
      const url = await fetchBlob(href, attachment.mime_type);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.original_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open attachment.');
    } finally {
      setPending(false);
    }
  }

  if (isImage) {
    return (
      <div className="space-y-1">
        <a
          href={previewUrl ?? href}
          onClick={open}
          target="_blank"
          rel="noreferrer"
          className="block max-w-xs overflow-hidden rounded-md border border-border-default bg-raised"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={attachment.original_name}
              className="block max-h-64 w-auto object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center text-xs text-fg-muted">
              {error || 'Loading…'}
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-fg-muted">
            <ImageIcon className="h-3 w-3" />
            <span className="truncate">{attachment.original_name}</span>
            <span className="ml-auto shrink-0">{fileBytesPretty(attachment.size_bytes)}</span>
          </div>
        </a>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <a
        href={href}
        onClick={open}
        target="_blank"
        rel="noreferrer"
        aria-busy={pending}
        className={
          mine
            ? 'flex max-w-xs items-center gap-2 rounded-md border border-primary/40 bg-primary-fg/10 px-3 py-2 text-xs text-primary-fg hover:bg-primary-fg/20'
            : 'flex max-w-xs items-center gap-2 rounded-md border border-border-default bg-raised px-3 py-2 text-xs text-fg hover:bg-subtle'
        }
      >
        <FileText className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{attachment.original_name}</p>
          <p className={mine ? 'text-primary-fg/80' : 'text-fg-muted'}>
            {pending ? 'Opening…' : meta}
          </p>
        </div>
        <Download className="h-3 w-3 shrink-0" />
      </a>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
MessageAttachmentChip.displayName = 'MessageAttachmentChip';
