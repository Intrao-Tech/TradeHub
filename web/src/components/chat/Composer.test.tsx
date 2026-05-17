// TEST-CHAT-113 / 116 / 140 / 142..143 — Composer component-level tests.
//
// Covers Enter/Shift+Enter behaviour, send-button gating, the typing
// indicator emit (300 ms debounce + 3 s stop / blur / send), and the
// auth-disabled banner. The Composer is text-only post-2026-05 — the
// message_attachment table was dropped, so there is no attachment UI.

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
import { Composer } from './Composer';

type Handlers = {
  onSubmit: Mock;
  onTypingStart: Mock;
  onTypingStop: Mock;
};

function Harness({
  initialValue = '',
  disabled = false,
  disabledReason,
  handlers,
}: {
  initialValue?: string;
  disabled?: boolean;
  disabledReason?: string;
  handlers: Handlers;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Composer
      value={value}
      disabled={disabled}
      disabledReason={disabledReason}
      onChange={setValue}
      onSubmit={() => handlers.onSubmit(value)}
      onTypingStart={handlers.onTypingStart}
      onTypingStop={handlers.onTypingStop}
    />
  );
}

let h: Handlers;

beforeEach(() => {
  h = {
    onSubmit: vi.fn(),
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
// TEST-CHAT-140 — send-button enable / disable (CHAT-062)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-140 Composer send-button gating', () => {
  test('TEST-CHAT-140 — send disabled when the composer is empty', () => {
    renderWithProfile(<Harness handlers={h} />);
    expect(screen.getByTestId('chat-composer-send')).toBeDisabled();
  });

  test('TEST-CHAT-140 — send enabled once there is text', () => {
    renderWithProfile(<Harness handlers={h} />);
    fireEvent.change(screen.getByTestId('chat-composer-textarea'), {
      target: { value: 'hi' },
    });
    expect(screen.getByTestId('chat-composer-send')).toBeEnabled();
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
