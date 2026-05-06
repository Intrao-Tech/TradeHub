// TEST-CHAT-113 / 114 / 116 / 140..143 — Composer component-level tests.
//
// Covers Enter/Shift+Enter behaviour, attachment validation, typing
// indicator emit (300 ms debounce + 3 s stop / blur / send), and
// auth-disabled states. Drives the Composer in isolation against a
// stubbed `onSubmit` / `onAddFiles` / `onTypingStart`/`onTypingStop`.

import {
  describe,
  expect,
  test,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { useState } from 'react';
import { renderWithProfile, screen, fireEvent, act } from '@/test/render';
import userEvent from '@testing-library/user-event';
import { Composer } from './Composer';
import type { AttachmentDraft } from './types';

type Handlers = {
  onSubmit: Mock;
  onAddFiles: Mock;
  onTypingStart: Mock;
  onTypingStop: Mock;
};

function Harness({
  initialValue = '',
  attachments = [],
  disabled = false,
  disabledReason,
  handlers,
}: {
  initialValue?: string;
  attachments?: AttachmentDraft[];
  disabled?: boolean;
  disabledReason?: string;
  handlers: Handlers;
}) {
  const [value, setValue] = useState(initialValue);
  const [atts, setAtts] = useState<AttachmentDraft[]>(attachments);
  return (
    <Composer
      value={value}
      attachments={atts}
      disabled={disabled}
      disabledReason={disabledReason}
      onChange={setValue}
      onSubmit={() => handlers.onSubmit(value, atts)}
      onAddFiles={(files) => handlers.onAddFiles(files)}
      onRemoveAttachment={(id) =>
        setAtts((prev) => prev.filter((a) => a.client_id !== id))
      }
      onTypingStart={handlers.onTypingStart}
      onTypingStop={handlers.onTypingStop}
    />
  );
}

let h: Handlers;

beforeEach(() => {
  h = {
    onSubmit: vi.fn(),
    onAddFiles: vi.fn(),
    onTypingStart: vi.fn(),
    onTypingStop: vi.fn(),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-113 — Enter / Shift+Enter (CHAT-062)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-113 Composer Enter / Shift+Enter (CHAT-062)', () => {
  test('TEST-CHAT-113 — Enter sends; Shift+Enter does not', () => {
    renderWithProfile(<Harness handlers={h} />);
    const ta = screen.getByTestId('chat-composer-textarea');
    fireEvent.change(ta, { target: { value: 'hello' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(h.onSubmit).toHaveBeenCalledTimes(1);
    expect(h.onSubmit.mock.calls[0][0]).toBe('hello');
    h.onSubmit.mockClear();
    // Shift+Enter does not submit.
    fireEvent.change(ta, { target: { value: 'line1' } });
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(h.onSubmit).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-140 / 141 — send-button enable / disable (CHAT-062)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-140 / 141 Composer send-button gating', () => {
  test('TEST-CHAT-140 — send disabled when composer empty AND no attachments', () => {
    renderWithProfile(<Harness handlers={h} />);
    const send = screen.getByTestId('chat-composer-send');
    expect(send).toBeDisabled();
  });

  test('TEST-CHAT-141 — send enabled with a ready attachment even with empty text', () => {
    const att: AttachmentDraft = {
      client_id: 'cid',
      status: 'ready',
      attachment_id: '1',
      file: new File(['x'], 'x.png', { type: 'image/png' }),
      mime_type: 'image/png',
      original_name: 'x.png',
      size_bytes: 100,
    };
    renderWithProfile(<Harness handlers={h} attachments={[att]} />);
    const send = screen.getByTestId('chat-composer-send');
    expect(send).toBeEnabled();
  });

  test('TEST-CHAT-140 — send remains disabled while an attachment is uploading', () => {
    const att: AttachmentDraft = {
      client_id: 'cid',
      status: 'uploading',
      file: new File(['x'], 'x.png', { type: 'image/png' }),
      mime_type: 'image/png',
      original_name: 'x.png',
      size_bytes: 100,
    };
    renderWithProfile(<Harness handlers={h} attachments={[att]} />);
    const send = screen.getByTestId('chat-composer-send');
    expect(send).toBeDisabled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-142 / 143 — disabled banner (CHAT-081)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-142 / 143 Composer auth-disabled banner (CHAT-081)', () => {
  test('TEST-CHAT-142 — disabled + reason renders the banner; send button disabled', () => {
    renderWithProfile(
      <Harness
        handlers={h}
        disabled
        disabledReason="Verify your email to send."
      />,
    );
    expect(screen.getByText(/Verify your email to send/i)).toBeInTheDocument();
    expect(screen.getByTestId('chat-composer-send')).toBeDisabled();
    expect(screen.getByTestId('chat-composer-textarea')).toBeDisabled();
  });

  test('TEST-CHAT-143 — disabled with ACCOUNT_NOT_ACTIVE-style reason renders banner copy', () => {
    renderWithProfile(
      <Harness handlers={h} disabled disabledReason="Account is suspended." />,
    );
    expect(screen.getByText(/Account is suspended/i)).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-114 — attachment add (CHAT-062)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-114 Composer attachments (CHAT-062)', () => {
  test('TEST-CHAT-114 — paperclip click opens hidden file input; selecting a file calls onAddFiles', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProfile(<Harness handlers={h} />);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.className).toContain('hidden');
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await user.upload(fileInput, file);
    expect(h.onAddFiles).toHaveBeenCalledTimes(1);
    const arg = h.onAddFiles.mock.calls[0][0] as File[];
    expect(arg[0].name).toBe('x.png');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-116 — typing emit (CHAT-064)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-116 Composer typing-event emit (CHAT-064)', () => {
  test('TEST-CHAT-116 — keypress + 300 ms debounce → exactly one typing:start', () => {
    vi.useFakeTimers();
    renderWithProfile(<Harness handlers={h} />);
    const ta = screen.getByTestId('chat-composer-textarea');
    fireEvent.change(ta, { target: { value: 'h' } });
    expect(h.onTypingStart).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(h.onTypingStart).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-116 — 3 s of inactivity → typing:stop', () => {
    vi.useFakeTimers();
    renderWithProfile(<Harness handlers={h} />);
    const ta = screen.getByTestId('chat-composer-textarea');
    fireEvent.change(ta, { target: { value: 'h' } });
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(h.onTypingStart).toHaveBeenCalledTimes(1);
    expect(h.onTypingStop).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(h.onTypingStop).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-116 — Enter-to-send fires typing:stop before submit', () => {
    vi.useFakeTimers();
    renderWithProfile(<Harness handlers={h} />);
    const ta = screen.getByTestId('chat-composer-textarea');
    fireEvent.change(ta, { target: { value: 'h' } });
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(h.onTypingStart).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(h.onTypingStop).toHaveBeenCalled();
    expect(h.onSubmit).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-116 — blur fires typing:stop', () => {
    vi.useFakeTimers();
    renderWithProfile(<Harness handlers={h} />);
    const ta = screen.getByTestId('chat-composer-textarea');
    fireEvent.change(ta, { target: { value: 'h' } });
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(h.onTypingStart).toHaveBeenCalledTimes(1);
    fireEvent.blur(ta);
    expect(h.onTypingStop).toHaveBeenCalled();
  });
});
