import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { getToken } from '../../api';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export interface ReadAttachment {
  id: string | number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

interface AttachmentListProps {
  attachments: ReadAttachment[] | undefined;
  heading?: string;
  /**
   * Render image attachments as inline thumbnails (Upwork-style gallery).
   * Only safe for contexts where attachments are public — job-post
   * attachments. Application attachments require auth and will 403 from a
   * naked <img> tag, so leave this off there.
   */
  previewImages?: boolean;
}

export function AttachmentList({
  attachments,
  heading,
  previewImages,
}: AttachmentListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [lightbox, setLightbox] = useState<ReadAttachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = previewImages
    ? attachments.filter((a) => a.mime_type.startsWith('image/'))
    : [];
  const files = previewImages
    ? attachments.filter((a) => !a.mime_type.startsWith('image/'))
    : attachments;

  async function open(att: ReadAttachment) {
    const sid = String(att.id);
    setPendingId(sid);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/job-attachments/${att.id}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("You don't have access to this attachment.");
        }
        if (res.status === 404) {
          throw new Error('This attachment is no longer available.');
        }
        throw new Error('Could not open attachment.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(
        new Blob([blob], { type: att.mime_type }),
      );
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = att.original_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open attachment.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3">
      {heading ? (
        <h3 className="text-sm font-semibold text-fg">{heading}</h3>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((a) => {
            const src = `${API_BASE}/job-attachments/${a.id}/download`;
            return (
              <li key={`img-${String(a.id)}`}>
                <button
                  type="button"
                  onClick={() => setLightbox(a)}
                  className="group block w-full overflow-hidden rounded-md border border-border-default bg-bg-subtle text-left transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Preview ${a.original_name}`}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-bg-muted">
                    <img
                      src={src}
                      alt={a.original_name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
                    <span className="min-w-0 truncate text-fg" title={a.original_name}>
                      {a.original_name}
                    </span>
                    <span className="shrink-0 text-fg-muted">
                      {formatSize(a.size_bytes)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((a) => {
            const sid = String(a.id);
            const loading = pendingId === sid;
            return (
              <li key={sid}>
                <button
                  type="button"
                  onClick={() => void open(a)}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
                >
                  <Icon mime={a.mime_type} />
                  <span className="min-w-0 flex-1 truncate" title={a.original_name}>
                    {a.original_name}
                  </span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {loading ? 'Opening…' : formatSize(a.size_bytes)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={lightbox != null}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      >
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-5">
          {lightbox ? (
            <>
              <DialogTitle className="truncate pr-8 text-base">
                {lightbox.original_name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Attachment preview
              </DialogDescription>
              <div className="flex items-center justify-center overflow-hidden rounded-md bg-bg-muted">
                <img
                  src={`${API_BASE}/job-attachments/${lightbox.id}/download`}
                  alt={lightbox.original_name}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
                <span>{formatSize(lightbox.size_bytes)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void open(lightbox)}
                  disabled={pendingId === String(lightbox.id)}
                >
                  <Download className="h-4 w-4" />
                  {pendingId === String(lightbox.id) ? 'Opening…' : 'Download'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
AttachmentList.displayName = 'AttachmentList';

function Icon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) {
    return <ImageIcon className="h-4 w-4 shrink-0 text-fg-muted" />;
  }
  if (mime === 'application/pdf') {
    return <FileText className="h-4 w-4 shrink-0 text-fg-muted" />;
  }
  return <Paperclip className="h-4 w-4 shrink-0 text-fg-muted" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
