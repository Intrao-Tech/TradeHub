import { useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { getToken } from '../../api';

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
}

export function AttachmentList({ attachments, heading }: AttachmentListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  if (!attachments || attachments.length === 0) return null;

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
      // Revoke the URL after the new tab has had a chance to load it.
      // (Some browsers throttle revocation; 60 s is generous and safe.)
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!win) {
        // Pop-up blocked — fall back to forcing a download in this tab.
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
    <section className="space-y-2">
      {heading ? (
        <h3 className="text-sm font-semibold text-fg">{heading}</h3>
      ) : null}
      <ul className="space-y-2">
        {attachments.map((a) => {
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
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
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
