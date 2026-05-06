// TEST-COLLAB-140..144 — FlagCollaborationDialog (COLLAB-040..043).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { collaborationErrorBody } from '@/test/handlers/collaborations';
import { FlagCollaborationDialog } from './FlagCollaborationDialog';

const API = 'http://localhost:8081/api';

function setupOpen() {
  return renderWithRouter(
    <FlagCollaborationDialog
      open
      onOpenChange={() => {}}
      collaborationId="42"
    />,
  );
}

async function openCategoryMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByLabelText(/reason category/i);
  await user.click(trigger);
}

describe('TEST-COLLAB-140 FlagCollaborationDialog category list — COLLAB-040', () => {
  test('TEST-COLLAB-140 / COLLAB-040 — exactly 8 preset categories render', async () => {
    const user = userEvent.setup();
    setupOpen();
    await openCategoryMenu(user);
    const options = await screen.findAllByRole('option');
    // Regression assertion against silent additions / removals.
    expect(options).toHaveLength(8);
  });

  test('TEST-COLLAB-140 / COLLAB-040 — every code from the spec is present (and only those)', async () => {
    const user = userEvent.setup();
    setupOpen();
    await openCategoryMenu(user);
    const expectedLabels = [
      /Payment is overdue/i,
      /The other party refuses to pay/i,
      /Work quality is unacceptable/i,
      /Work was not completed as agreed/i,
      /Site safety/i,
      /misrepresented themselves/i,
      /Abusive/i,
      /Something else/i,
    ];
    for (const re of expectedLabels) {
      expect(await screen.findByRole('option', { name: re })).toBeInTheDocument();
    }
  });
});

describe('TEST-COLLAB-141 OTHER rule — COLLAB-041', () => {
  test('TEST-COLLAB-141 / COLLAB-041 — picking OTHER without ≥10 chars detail keeps submit disabled', async () => {
    const user = userEvent.setup();
    setupOpen();
    await openCategoryMenu(user);
    await user.click(screen.getByRole('option', { name: /Something else/i }));

    const submit = screen.getByRole('button', { name: /submit flag/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/detail/i), 'short');
    expect(submit).toBeDisabled();
  });

  test('TEST-COLLAB-141 / COLLAB-041 — OTHER with ≥10 chars detail enables submit', async () => {
    const user = userEvent.setup();
    setupOpen();
    await openCategoryMenu(user);
    await user.click(screen.getByRole('option', { name: /Something else/i }));
    await user.type(
      screen.getByLabelText(/detail/i),
      'Significant detail that exceeds the threshold',
    );
    expect(screen.getByRole('button', { name: /submit flag/i })).toBeEnabled();
  });
});

describe('TEST-COLLAB-142 submitted reason format — COLLAB-040', () => {
  test('TEST-COLLAB-142 / COLLAB-040 — category + detail submits "<CATEGORY>: <detail>"', async () => {
    const user = userEvent.setup();
    let captured: { reason?: string } | null = null;
    server.use(
      http.post(`${API}/collaborations/42/flag`, async ({ request }) => {
        captured = (await request.json()) as { reason: string };
        return HttpResponse.json({ id: '42' });
      }),
    );
    setupOpen();
    await openCategoryMenu(user);
    await user.click(screen.getByRole('option', { name: /Payment is overdue/i }));
    await user.type(
      screen.getByLabelText(/detail/i),
      'cheque is two weeks late',
    );
    await user.click(screen.getByRole('button', { name: /submit flag/i }));

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.reason).toBe('PAYMENT_LATE: cheque is two weeks late');
  });

  test('TEST-COLLAB-142 / COLLAB-040 — category-only (non-OTHER, no detail) submits "<CATEGORY>"', async () => {
    const user = userEvent.setup();
    let captured: { reason?: string } | null = null;
    server.use(
      http.post(`${API}/collaborations/42/flag`, async ({ request }) => {
        captured = (await request.json()) as { reason: string };
        return HttpResponse.json({ id: '42' });
      }),
    );
    setupOpen();
    await openCategoryMenu(user);
    await user.click(
      screen.getByRole('option', { name: /Site safety/i }),
    );
    await user.click(screen.getByRole('button', { name: /submit flag/i }));

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.reason).toBe('SAFETY_CONCERN');
  });
});

describe('TEST-COLLAB-143 submit success — COLLAB-042', () => {
  test('TEST-COLLAB-143 / COLLAB-042 — calls flag endpoint, fires onFlagged + onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onFlagged = vi.fn();
    renderWithRouter(
      <FlagCollaborationDialog
        open
        onOpenChange={onOpenChange}
        collaborationId="42"
        onFlagged={onFlagged}
      />,
    );
    await openCategoryMenu(user);
    await user.click(
      screen.getByRole('option', { name: /Work quality is unacceptable/i }),
    );
    await user.click(screen.getByRole('button', { name: /submit flag/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onFlagged).toHaveBeenCalled();
  });
});

describe('TEST-COLLAB-144 submit error — COLLAB-042', () => {
  test('TEST-COLLAB-144 / COLLAB-042 — 403 surfaces parseApiError message inline; dialog stays open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/collaborations/42/flag`, () =>
        collaborationErrorBody('FORBIDDEN', 403, 'Only participants or staff can flag'),
      ),
    );
    renderWithRouter(
      <FlagCollaborationDialog
        open
        onOpenChange={onOpenChange}
        collaborationId="42"
      />,
    );
    await openCategoryMenu(user);
    await user.click(
      screen.getByRole('option', { name: /Abusive/i }),
    );
    await user.click(screen.getByRole('button', { name: /submit flag/i }));
    expect(
      await screen.findByText(/Only participants or staff can flag/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
