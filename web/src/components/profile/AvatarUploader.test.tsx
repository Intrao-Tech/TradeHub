// TEST-PROF-104 — AvatarUploader (PROF-016 / PROF-019).
//
// The uploader has three behaviours we want regression-guarded:
//   1. validateFile() rejects oversize / wrong-MIME with friendly copy
//      (PROF-016 client-side checks).
//   2. drop-zone is keyboard-reachable (Tab → Enter opens the picker).
//   3. `aria-live` region is present so screen readers announce upload state
//      (PROF-019).
//
// Cropping itself uses `react-easy-crop` + `<canvas>`, neither of which
// jsdom implements faithfully. Cropping happy-path assertions live in the
// Playwright suite (TEST-PROF-140 / E2E-1).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent } from '@testing-library/react';
import { renderWithProfile, screen, userEvent } from '@/test/render';
import { server } from '@/test/msw-server';
import { AvatarUploader } from './AvatarUploader';

const API = 'http://localhost:8081/api';

describe('TEST-PROF-104 AvatarUploader (PROF-016 / PROF-019)', () => {
  test('PROF-016 — wrong MIME (PDF) surfaces friendly copy and never opens the cropper', async () => {
    const onChanged = vi.fn();
    renderWithProfile(
      <AvatarUploader avatarUrl={null} fallback="MB" onChanged={onChanged} />,
    );
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['pdf-bytes'], 'doc.pdf', {
      type: 'application/pdf',
    });
    // userEvent.upload() respects the accept= attribute and silently drops
    // non-matching files; fireEvent.change bypasses that filter to actually
    // exercise the component's own validateFile() error path.
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /JPEG, PNG, or WebP/i,
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('PROF-016 — oversize file (> 5 MiB) surfaces friendly copy', async () => {
    const onChanged = vi.fn();
    renderWithProfile(
      <AvatarUploader avatarUrl={null} fallback="MB" onChanged={onChanged} />,
    );
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
  });

  test('PROF-019 — drop zone is keyboard reachable (role=button + tabindex) and Enter triggers the file picker', async () => {
    const onChanged = vi.fn();
    renderWithProfile(
      <AvatarUploader avatarUrl={null} fallback="MB" onChanged={onChanged} />,
    );
    const dropZone = screen.getByRole('button', {
      name: /drop a photo here/i,
    });
    expect(dropZone).toHaveAttribute('tabindex', '0');
    // Wire up a click spy on the hidden file input — the drop zone delegates.
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    dropZone.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();
  });

  test('PROF-019 — `aria-live` polite region exists for screen-reader status announcements', () => {
    renderWithProfile(
      <AvatarUploader avatarUrl={null} fallback="MB" onChanged={vi.fn()} />,
    );
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
  });

  test('PROF-016 — Remove button absent when no avatar present, present when one is', () => {
    const { rerender } = renderWithProfile(
      <AvatarUploader avatarUrl={null} fallback="MB" onChanged={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
    rerender(
      <AvatarUploader
        avatarUrl="/uploads/x.png"
        fallback="MB"
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  test('PROF-016 — Remove calls PATCH /client-profiles/me with avatar_url=""', async () => {
    let calledWith: { avatar_url?: string } | null = null;
    server.use(
      http.patch(`${API}/client-profiles/me`, async ({ request }) => {
        calledWith = (await request.json()) as { avatar_url?: string };
        return HttpResponse.json({ id: '1', avatar_url: null });
      }),
    );
    const onChanged = vi.fn().mockResolvedValue(undefined);
    renderWithProfile(
      <AvatarUploader
        avatarUrl="/uploads/x.png"
        fallback="MB"
        onChanged={onChanged}
      />,
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: /remove/i }),
    );
    // Wait microtask for the PATCH to land.
    await new Promise((r) => setTimeout(r, 30));
    expect(calledWith).toEqual({ avatar_url: '' });
    expect(onChanged).toHaveBeenCalled();
  });
});
