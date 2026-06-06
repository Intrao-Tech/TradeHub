import {
  forwardRef,
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const MAX_LINES = 8;
const LINE_HEIGHT_PX = 20;

export type ComposerHandle = {
  focus: () => void;
};

type ComposerProps = {
  value: string;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
};

/**
 * Composer (CHAT-062..064) — auto-resize textarea, Enter/Shift+Enter, and a
 * typing-event seam. Text-only: the message_attachment table was dropped, so
 * file sharing in chat is not wired up.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  function Composer(props, ref) {
    const { t } = useTranslation('chat');
    const {
      value,
      disabled,
      disabledReason,
      placeholder,
      onChange,
      onSubmit,
      onTypingStart,
      onTypingStop,
    } = props;

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const typingStartTimer = useRef<number | null>(null);
    const typingStopTimer = useRef<number | null>(null);
    const typingActive = useRef(false);

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
        if (typingStartTimer.current != null)
          window.clearTimeout(typingStartTimer.current);
        if (typingStopTimer.current != null)
          window.clearTimeout(typingStopTimer.current);
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
      if (value.trim().length === 0) return;
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

    const sendDisabled = disabled || value.trim().length === 0;

    return (
      <div
        data-testid="chat-composer"
        className={cn(
          'flex flex-col gap-2 border-t border-border-default bg-raised p-3',
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

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={value}
            placeholder={placeholder ?? t('composer.placeholder')}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={disabled}
            rows={1}
            data-testid="chat-composer-textarea"
            className="max-h-[176px] min-h-[44px] flex-1 resize-none py-2"
            aria-label={t('composer.messageAria')}
          />
          <Button
            type="button"
            disabled={sendDisabled}
            onClick={trySubmit}
            data-testid="chat-composer-send"
            aria-label={t('composer.sendAria')}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  },
);

Composer.displayName = 'Composer';
