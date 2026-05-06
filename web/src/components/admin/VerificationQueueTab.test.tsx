// TEST-VER-300..307 — VerificationQueueTab component tests.
//
// MSW v2 handlers from `web/src/test/handlers/verification.ts` provide the
// default queue + review responses; per-test overrides via `server.use`.

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  renderWithRouter,
  screen,
  userEvent,
  waitFor,
  fireEvent,
} from '@/test/render';
import { server } from '@/test/msw-server';
import { mockQueueItem, mockQueueResponse } from '@/test/factories';
import { VerificationQueueTab } from './VerificationQueueTab';

const API = 'http://localhost:8081/api';

function withAuthStorage() {
  // VerificationQueueTab issues `api()` calls that may require auth headers.
  // Pin a token in localStorage so the helper attaches it.
  localStorage.setItem('access_token', 'test');
  localStorage.setItem('refresh_token', 'test');
}

describe('TEST-VER-300 VerificationQueueTab initial load — VER-070', () => {
  test('mounts and calls GET /verification/queue with default filters', async () => {
    withAuthStorage();
    let calledWith: URL | null = null;
    server.use(
      http.get(`${API}/verification/queue`, ({ request }) => {
        calledWith = new URL(request.url);
        return HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '1', doc_type: 'CSCS_CARD' },
                uploader: { id: '42', display_name: 'Mike Builder', role: 'WORKER' },
              }),
            ],
            total: 1,
          }),
        );
      }),
    );

    renderWithRouter(<VerificationQueueTab />);
    await waitFor(() => expect(calledWith).not.toBeNull());
    expect(calledWith!.searchParams.get('status')).toBe('PENDING,IN_REVIEW');
    expect(calledWith!.searchParams.get('assignment')).toBe('all');
    expect(calledWith!.searchParams.get('limit')).toBe('50');

    expect(await screen.findByText('Mike Builder')).toBeInTheDocument();
    expect(screen.getByText('CSCS_CARD')).toBeInTheDocument();
  });
});

describe('TEST-VER-301 filter binding', () => {
  test('Refresh button refetches the queue', async () => {
    withAuthStorage();
    let callCount = 0;
    server.use(
      http.get(`${API}/verification/queue`, () => {
        callCount += 1;
        return HttpResponse.json(mockQueueResponse({ items: [] }));
      }),
    );
    renderWithRouter(<VerificationQueueTab />);
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));

    const refresh = screen.getByRole('button', { name: /Refresh/i });
    await userEvent.setup().click(refresh);
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2));
  });
});

describe('TEST-VER-302 Approve happy path — VER-072', () => {
  test('Click Approve → POST review with decision=APPROVE → refetch', async () => {
    withAuthStorage();
    let approveBody: { decision?: string; reason?: string } | null = null;
    let queueCalls = 0;
    server.use(
      http.get(`${API}/verification/queue`, () => {
        queueCalls += 1;
        return HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '5', doc_type: 'CSCS_CARD' },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        );
      }),
      http.post(
        `${API}/verification/documents/:id/review`,
        async ({ request, params }) => {
          approveBody = (await request.json()) as typeof approveBody;
          return HttpResponse.json({
            document: {
              id: String(params.id),
              status: 'APPROVED',
            },
            level_changed: null,
            milestones_written: [],
          });
        },
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('CSCS_CARD');

    const approveBtn = screen.getByRole('button', { name: /^Approve$/ });
    await userEvent.setup().click(approveBtn);
    await waitFor(() => expect(approveBody).not.toBeNull());
    expect(approveBody!.decision).toBe('APPROVE');
    expect(queueCalls).toBeGreaterThanOrEqual(2); // initial + after-approve refetch
  });
});

describe('TEST-VER-303 Reject flow — VER-073', () => {
  test('Reject opens textarea, Confirm disabled when reason <10 chars, succeeds on valid', async () => {
    withAuthStorage();
    let rejectBody: { decision?: string; reason?: string } | null = null;
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '5', doc_type: 'CSCS_CARD' },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        ),
      ),
      http.post(
        `${API}/verification/documents/:id/review`,
        async ({ request }) => {
          rejectBody = (await request.json()) as typeof rejectBody;
          return HttpResponse.json({
            document: { id: '5', status: 'REJECTED' },
            level_changed: null,
            milestones_written: [],
          });
        },
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('CSCS_CARD');

    const rejectBtn = screen.getByRole('button', { name: /^Reject$/ });
    await userEvent.setup().click(rejectBtn);

    const textarea = await screen.findByLabelText(/Rejection reason/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm reject/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'short' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(textarea, {
      target: { value: 'Card photo too blurry — re-upload sharper image please.' },
    });
    expect(confirmBtn).not.toBeDisabled();

    await userEvent.setup().click(confirmBtn);
    await waitFor(() => expect(rejectBody).not.toBeNull());
    expect(rejectBody!.decision).toBe('REJECT');
    expect(rejectBody!.reason!.length).toBeGreaterThanOrEqual(10);
  });

  test('Server returns 400 REJECTION_REASON_REQUIRED → user sees the parsed error', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '5' },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        ),
      ),
      http.post(`${API}/verification/documents/:id/review`, () =>
        HttpResponse.json(
          {
            code: 'REJECTION_REASON_REQUIRED',
            message: 'Rejection requires a reason of at least 10 characters.',
            statusCode: 400,
          },
          { status: 400 },
        ),
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('CSCS_CARD');

    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Reject$/ }));
    const textarea = await screen.findByLabelText(/Rejection reason/i);
    await u.type(textarea, 'this should fail per stub above');
    await u.click(screen.getByRole('button', { name: /Confirm reject/i }));

    expect(
      await screen.findByText(
        /Rejection requires a reason of at least 10 characters/i,
      ),
    ).toBeInTheDocument();
  });
});

describe('TEST-VER-304 Claim button — VER-072', () => {
  test('Claim visible only when assignee == null', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '1' },
                assignee: null,
              }),
              mockQueueItem({
                document: { id: '2', doc_type: 'INSURANCE' },
                uploader: {
                  id: '99',
                  display_name: 'Other Worker',
                  role: 'WORKER',
                },
                assignee: { id: '7', display_name: 'Mod B' },
              }),
            ],
          }),
        ),
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('INSURANCE');

    const claimButtons = screen.getAllByRole('button', { name: /Claim/i });
    expect(claimButtons).toHaveLength(1);
  });

  test('Click → POST claim → refetch', async () => {
    withAuthStorage();
    let claimCalls = 0;
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [mockQueueItem({ document: { id: '1' }, assignee: null })],
          }),
        ),
      ),
      http.post(`${API}/verification/documents/:id/claim`, () => {
        claimCalls += 1;
        return HttpResponse.json({ ok: true, assigned_to: '1' });
      }),
    );

    renderWithRouter(<VerificationQueueTab />);
    const claim = await screen.findByRole('button', { name: /Claim/i });
    await userEvent.setup().click(claim);
    await waitFor(() => expect(claimCalls).toBe(1));
  });

  test('Server 400 ALREADY_ASSIGNED → message shown', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [mockQueueItem({ document: { id: '1' }, assignee: null })],
          }),
        ),
      ),
      http.post(`${API}/verification/documents/:id/claim`, () =>
        HttpResponse.json(
          {
            code: 'ALREADY_ASSIGNED',
            message: 'This document is already assigned to another staff member.',
            statusCode: 400,
          },
          { status: 400 },
        ),
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    const claim = await screen.findByRole('button', { name: /Claim/i });
    await userEvent.setup().click(claim);
    expect(
      await screen.findByText(/already assigned to another staff member/i),
    ).toBeInTheDocument();
  });
});

describe('TEST-VER-305 terminal docs disable Approve/Reject — VER-072', () => {
  test('APPROVED row → Approve and Reject buttons disabled', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '1', status: 'APPROVED' },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        ),
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('CSCS_CARD');
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject$/ })).toBeDisabled();
  });
});

describe('TEST-VER-306 OTHER doc-type label — VER-092', () => {
  test('Row carries the metadata.title suffix', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: {
                  id: '1',
                  doc_type: 'OTHER',
                  metadata: { title: 'Bond certificate' },
                },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        ),
      ),
    );

    renderWithRouter(<VerificationQueueTab />);
    expect(await screen.findByText(/Bond certificate/)).toBeInTheDocument();
  });
});

describe('TEST-VER-307 no <pre> JSON dumps — guardrail', () => {
  test('No <pre> element with stringified JSON anywhere in the rendered tree', async () => {
    withAuthStorage();
    server.use(
      http.get(`${API}/verification/queue`, () =>
        HttpResponse.json(
          mockQueueResponse({
            items: [
              mockQueueItem({
                document: { id: '1' },
                assignee: { id: '1', display_name: 'Mod' },
              }),
            ],
          }),
        ),
      ),
    );

    const { container } = renderWithRouter(<VerificationQueueTab />);
    await screen.findByText('CSCS_CARD');
    const pres = container.querySelectorAll('pre');
    expect(pres).toHaveLength(0);
  });
});
