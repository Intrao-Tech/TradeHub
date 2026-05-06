import {
  forwardRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fileBytesPretty, validateAttachmentFile } from './helpers';
import type { AttachmentDraft } from './types';

const MAX_LINES = 8;
const LINE_HEIGHT_PX = 20;

export type ComposerHandle = {
  focus: () => void;
};

type ComposerProps = {
  value: string;
  attachments: AttachmentDraft[];
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (clientId: string) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
};

/**
 * Composer (CHAT-062..064) — auto-resize textarea, Enter/Shift+Enter,
 * paperclip + drag-drop attachments, typing-event seam.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  function Composer(props, ref) {
    const {
      value,
      attachments,
      disabled,
      disabledReason,
      placeholder,
      onChange,
      onSubmit,
      onAddFiles,
      onRemoveAttachment,
      onTypingStart,
      onTypingStop,
    } = props;

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const typingStartTimer = useRef<number | null>(null);
    const typingStopTimer = useRef<number | null>(null);
    const typingActive = useRef(false);
    const [dragOver, setDragOver] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    // Auto-resize textarea up to MAX_LINES.
    useEffect(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.style.height = '0px';
      const max = MAX_LINES * LINE_HEIGHT_PX + 16;
      t.style.height = `${Math.min(t.scrollHeight, max)}px`;
    }, [value]);

    function fireTypingStop() {
      if (!typingActive.current) return;
      typingActive.current = false;
      onTypingStop?.();
    }

    function scheduleTypingStop() {
      if (typingStopTimer.current != null) {
        window.clearTimeout(typingStopTimer.current);
      }
      typingStopTimer.current = window.setTimeout(fireTypingStop, 3000);
    }

    function scheduleTypingStart() {
      if (typingStartTimer.current != null) return;
      typingStartTimer.current = window.setTimeout(() => {
        typingStartTimer.current = null;
        typingActive.current = true;
        onTypingStart?.();
        scheduleTypingStop();
      }, 300);
    }

    useEffect(() => {
      return () => {
        if (typingStartTimer.current != null) window.clearTimeout(typingStartTimer.current);
        if (typingStopTimer.current != null) window.clearTimeout(typingStopTimer.current);
        fireTypingStop();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
      onChange(e.target.value);
      if (disabled) return;
      if (typingActive.current) {
        scheduleTypingStop();
      } else {
        scheduleTypingStart();
      }
    }

    function handleBlur() {
      if (typingStartTimer.current != null) {
        window.clearTimeout(typingStartTimer.current);
        typingStartTimer.current = null;
      }
      fireTypingStop();
    }

    function trySubmit() {
      if (disabled) return;
      const trimmed = value.trim();
      if (!trimmed && attachments.filter((a) => a.status === 'ready').length === 0) {
        return;
      }
      if (attachments.some((a) => a.status === 'uploading')) return;
      if (typingStartTimer.current != null) {
        window.clearTimeout(typingStartTimer.current);
        typingStartTimer.current = null;
      }
      fireTypingStop();
      onSubmit();
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        trySubmit();
      }
    }

    function pickFiles(filesLike: FileList | File[] | null) {
      if (!filesLike) return;
      const files = Array.from(filesLike);
      if (files.length === 0) return;
      onAddFiles(files);
    }

    function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
      if (!e.clipboardData?.files?.length) return;
      pickFiles(e.clipboardData.files);
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragOver(false);
      pickFiles(e.dataTransfer.files);
    }

    const sendDisabled =
      disabled ||
      (value.trim().length === 0 &&
        attachments.filter((a) => a.status === 'ready').length === 0) ||
      attachments.some((a) => a.status === 'uploading');

    return (
      <div
        data-testid="chat-composer"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col gap-2 border-t border-border-default bg-raised p-3',
          dragOver ? 'ring-2 ring-ring' : '',
        )}
      >
        {disabled && disabledReason ? (
          <div
            role="status"
            className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning"
          >
            {disabledReason}
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.client_id}
                data-testid="composer-attachment-chip"
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border-default bg-page px-2 py-1 text-xs',
                  a.status === 'failed' ? 'border-danger/40 text-danger' : 'text-fg',
                )}
              >
                {a.status === 'uploading' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="h-3 w-3" />
                )}
                <span className="max-w-[160px] truncate">{a.original_name}</span>
                <span className="text-fg-muted">{fileBytesPretty(a.size_bytes)}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  aria-label="Remove attachment"
                  onClick={() => onRemoveAttachment(a.client_id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              pickFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Attach a file"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={value}
            placeholder={placeholder ?? 'Write a message…'}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            disabled={disabled}
            rows={1}
            data-testid="chat-composer-textarea"
            className="max-h-[176px] min-h-[44px] flex-1 resize-none py-2"
            aria-label="Message"
          />
          <Button
            type="button"
            disabled={sendDisabled}
            onClick={trySubmit}
            data-testid="chat-composer-send"
            aria-label="Send message"
            size="icon"
            className="md:size-default md:px-4"
          >
            <Send className="h-4 w-4" />
            <span className="hidden md:inline">Send</span>
          </Button>
        </div>
      </div>
    );
  },
);

Composer.displayName = 'Composer';

/**
 * Public seam for tests + helpers exporting the validation logic.
 */
export { validateAttachmentFile };
