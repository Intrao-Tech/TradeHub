// TEST-COLLAB-130..133 — NewCollaborationSheet (COLLAB-030..033).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { collaborationErrorBody } from '@/test/handlers/collaborations';
import { NewCollaborationSheet } from './NewCollaborationSheet';

const API = 'http://localhost:8081/api';

function setup(role: 'WORKER' | 'EMPLOYER', onCreated = vi.fn()) {
  return {
    onCreated,
    ...renderWithRouter(
      <NewCollaborationSheet
        open
        onOpenChange={() => {}}
        role={role}
        onCreated={onCreated}
      />,
    ),
  };
}

describe('TEST-COLLAB-130 role-aware fields — COLLAB-030', () => {
  test('TEST-COLLAB-130 / COLLAB-030 — worker context shows Employer ID, hides Worker ID', () => {
    setup('WORKER');
    expect(screen.getByLabelText(/employer id/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^worker id$/i)).toBeNull();
    expect(screen.getByLabelText(/project type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/site postcode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/agreed amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/referral id/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-130 / COLLAB-030 — employer context shows Worker ID, hides Employer ID', () => {
    setup('EMPLOYER');
    expect(screen.getByLabelText(/^worker id$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^employer id$/i)).toBeNull();
  });
});

describe('TEST-COLLAB-131 validation — COLLAB-031', () => {
  test('TEST-COLLAB-131 / COLLAB-031 — empty counterparty id keeps submit disabled', () => {
    setup('WORKER');
    expect(
      screen.getByRole('button', { name: /create collaboration/i }),
    ).toBeDisabled();
  });

  test('TEST-COLLAB-131 / COLLAB-031 — non-positive id keeps submit disabled', async () => {
    const user = userEvent.setup();
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '0');
    expect(
      screen.getByRole('button', { name: /create collaboration/i }),
    ).toBeDisabled();
  });

  test('TEST-COLLAB-131 / COLLAB-031 — agreed_amount with > 2 dp shows field error', async () => {
    const user = userEvent.setup();
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '5');
    await user.type(screen.getByLabelText(/agreed amount/i), '10.123');
    expect(
      screen.getByText(/up to 2 decimal places/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create collaboration/i }),
    ).toBeDisabled();
  });

  test('TEST-COLLAB-131 / COLLAB-031 — negative agreed_amount shows field error', async () => {
    const user = userEvent.setup();
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '5');
    await user.type(screen.getByLabelText(/agreed amount/i), '-5');
    expect(
      screen.getByText(/non-negative number/i),
    ).toBeInTheDocument();
  });

  test('TEST-COLLAB-131 / COLLAB-031 — invalid postcode shows field error and blocks submit', async () => {
    const user = userEvent.setup();
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '5');
    await user.type(screen.getByLabelText(/site postcode/i), '12345-bad');
    expect(
      screen.getByText(/UK postcode area/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create collaboration/i }),
    ).toBeDisabled();
  });

  test('TEST-COLLAB-131 / COLLAB-031 — postcode is normalised to upper-case + trimmed on submit', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/collaborations`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: '8001' }, { status: 201 });
      }),
    );
    const onCreated = vi.fn();
    setup('WORKER', onCreated);
    await user.type(screen.getByLabelText(/employer id/i), '5');
    await user.type(screen.getByLabelText(/site postcode/i), '  nw1  ');
    await user.click(
      screen.getByRole('button', { name: /create collaboration/i }),
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.site_postcode).toBe('NW1');
  });
});

describe('TEST-COLLAB-132 happy path — COLLAB-032', () => {
  test('TEST-COLLAB-132 / COLLAB-032 — worker context posts employer_id only and fires onCreated', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/collaborations`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: '8001' }, { status: 201 });
      }),
    );
    const onCreated = vi.fn();
    setup('WORKER', onCreated);
    await user.type(screen.getByLabelText(/employer id/i), '7');
    await user.type(screen.getByLabelText(/agreed amount/i), '1500');
    await user.click(
      screen.getByRole('button', { name: /create collaboration/i }),
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({
      employer_id: 7,
      agreed_amount: 1500,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: '8001' }));
  });

  test('TEST-COLLAB-132 / COLLAB-032 — employer context posts worker_id only', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/collaborations`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: '8001' }, { status: 201 });
      }),
    );
    setup('EMPLOYER');
    await user.type(screen.getByLabelText(/^worker id$/i), '12');
    await user.click(
      screen.getByRole('button', { name: /create collaboration/i }),
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({ worker_id: 12 });
  });
});

describe('TEST-COLLAB-133 error mapping — COLLAB-032', () => {
  test('TEST-COLLAB-133 / COLLAB-032 — backend 400 surfaces parseApiError message inline', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/collaborations`, () =>
        collaborationErrorBody(
          'BAD_REQUEST',
          400,
          "worker_id and employer_id must differ",
        ),
      ),
    );
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '7');
    await user.click(
      screen.getByRole('button', { name: /create collaboration/i }),
    );
    expect(
      await screen.findByText(/worker_id and employer_id must differ/i),
    ).toBeInTheDocument();
  });

  test('TEST-COLLAB-133 / COLLAB-032 — backend 403 EMAIL_NOT_VERIFIED surfaces inline message via parseApiError', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/collaborations`, () =>
        collaborationErrorBody(
          'EMAIL_NOT_VERIFIED',
          403,
          'Verify your email to start a collaboration',
        ),
      ),
    );
    setup('WORKER');
    await user.type(screen.getByLabelText(/employer id/i), '7');
    await user.click(
      screen.getByRole('button', { name: /create collaboration/i }),
    );
    expect(
      await screen.findByText(/Verify your email to start a collaboration/i),
    ).toBeInTheDocument();
  });
});
