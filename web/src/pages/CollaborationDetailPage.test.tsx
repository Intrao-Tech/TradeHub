// TEST-COLLAB-110..119 — CollaborationDetailPage (COLLAB-002, COLLAB-020..026).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, userEvent, waitFor, within } from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockClientProfile,
  mockCollaboration,
  mockEmployerProfile,
  mockEscrowDisputed,
  mockEscrowHeld,
  mockEscrowRefunded,
  mockEscrowReleased,
  mockEscrowTransaction,
  mockWorkerProfile,
  type MockEscrowTransaction,
  type MockReview,
} from '@/test/factories';
import { collaborationErrorBody } from '@/test/handlers/collaborations';
import CollaborationDetailPage from './CollaborationDetailPage';

const API = 'http://localhost:8081/api';
const MY_ID = '1';

function withRoute() {
  return (
    <Routes>
      <Route
        path="/collaborations/:id"
        element={<CollaborationDetailPage />}
      />
      <Route
        path="/collaborations"
        element={<div>COLLAB-LIST-FALLBACK</div>}
      />
      <Route path="/inbox" element={<div>INBOX-FALLBACK</div>} />
      <Route path="/escrow/:id" element={<div>ESCROW-FALLBACK</div>} />
    </Routes>
  );
}

async function asWorker() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: mockClientProfile({
      id: MY_ID,
      worker_profile: mockWorkerProfile({ id: MY_ID }),
      employer_profile: null,
    }),
  });
}

async function asEmployer() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: mockClientProfile({
      id: MY_ID,
      worker_profile: null,
      employer_profile: mockEmployerProfile({ id: MY_ID }),
    }),
  });
}

async function asStaff() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: null,
    staff_member: { id: MY_ID, staff_role: 'ADMIN' },
  });
}

function withCollaboration(
  overrides: Parameters<typeof mockCollaboration>[0] = {},
) {
  const collab = mockCollaboration({
    id: '42',
    worker_id: MY_ID,
    employer_id: '900',
    initiated_by: 'EMPLOYER',
    ...overrides,
  });
  server.use(
    http.get(`${API}/collaborations/42`, () => HttpResponse.json(collab)),
  );
  return collab;
}

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-110 — route renders, parties present
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-110 — COLLAB-002 / COLLAB-020 route + header', () => {
  test('TEST-COLLAB-110 — header renders status pill, agreed amount, project type, postcode, both party chips', async () => {
    withCollaboration({
      status: 'CONFIRMED',
      project_type: 'Kitchen refit',
      site_postcode: 'NW1',
      agreed_amount: '1500.00',
    });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/Confirmed/i).length).toBeGreaterThan(0);
    // Agreed amount renders as GBP-formatted
    expect(screen.getByText(/£1,500/i)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen refit/i)).toBeInTheDocument();
    expect(screen.getByText(/NW1/)).toBeInTheDocument();
    expect(screen.getByText(/Mike Builder/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Build/)).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-111 — action-bar legality matrix
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-111 — COLLAB-021 action-bar legality matrix', () => {
  test('TEST-COLLAB-111 / COLLAB-021 — PENDING + responder shows Confirm + Reject + Flag dispute', async () => {
    // Worker is responder when employer initiated.
    withCollaboration({ status: 'PENDING', initiated_by: 'EMPLOYER' });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /flag dispute/i }),
    ).toBeInTheDocument();
    // Other transitions should not appear
    expect(screen.queryByRole('button', { name: /start work/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark complete/i })).toBeNull();
  });

  test('TEST-COLLAB-111 / COLLAB-021 — PENDING + initiator shows only Flag dispute (no Confirm/Reject)', async () => {
    // Worker initiated → worker is initiator. The detail page hides
    // transitions but keeps Flag dispute available.
    withCollaboration({ status: 'PENDING', initiated_by: 'WORKER' });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /flag dispute/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
    expect(screen.getByText(/Waiting on the other party/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-111 / COLLAB-021 — CONFIRMED shows Start work + Flag dispute', async () => {
    withCollaboration({ status: 'CONFIRMED' });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /start work/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /flag dispute/i }),
    ).toBeInTheDocument();
  });

  test('TEST-COLLAB-111 / COLLAB-021 — IN_PROGRESS shows Mark complete + Flag dispute', async () => {
    withCollaboration({ status: 'IN_PROGRESS' });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /mark complete/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /flag dispute/i }),
    ).toBeInTheDocument();
  });

  test.each(['COMPLETED', 'REJECTED'] as const)(
    'TEST-COLLAB-111 / COLLAB-021 — terminal %s shows no transition + no Flag dispute',
    async (status) => {
      withCollaboration({ status });
      const account = await asWorker();
      renderWithProfile(withRoute(), { route: '/collaborations/42', account });
      await waitFor(() =>
        expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
      );
      expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /start work/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /mark complete/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /flag dispute/i })).toBeNull();
    },
  );

  test('TEST-COLLAB-111 / COLLAB-051 — staff (non-party) sees disabled lifecycle button + working flag', async () => {
    withCollaboration({ status: 'PENDING' });
    const account = await asStaff();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /lifecycle actions disabled/i }),
      ).toBeDisabled(),
    );
    const tooltip = screen
      .getByRole('button', { name: /lifecycle actions disabled/i })
      .getAttribute('title');
    expect(tooltip ?? '').toMatch(/staff cannot transition/i);
    // Flag dispute still works for staff per COLLAB-051.
    expect(
      screen.getByRole('button', { name: /flag dispute/i }),
    ).toBeEnabled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-112 — action-bar mutation
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-112 — COLLAB-021 mutation surface', () => {
  test('TEST-COLLAB-112 / COLLAB-021 — clicking Confirm posts CONFIRMED then refetches', async () => {
    let captured: { status?: string } | null = null;
    let getCalls = 0;
    server.use(
      http.get(`${API}/collaborations/42`, () => {
        getCalls += 1;
        return HttpResponse.json(
          mockCollaboration({
            id: '42',
            worker_id: MY_ID,
            employer_id: '900',
            status: 'PENDING',
            initiated_by: 'EMPLOYER',
          }),
        );
      }),
      http.patch(`${API}/collaborations/42/status`, async ({ request }) => {
        captured = (await request.json()) as { status: string };
        return HttpResponse.json({ id: '42' });
      }),
    );
    const user = userEvent.setup();
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    const btn = await screen.findByRole('button', { name: /^confirm$/i });
    await user.click(btn);
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.status).toBe('CONFIRMED');
    await waitFor(() => expect(getCalls).toBeGreaterThanOrEqual(2));
  });

  test('TEST-COLLAB-112 / COLLAB-021 — backend error surfaces parseApiError text inline (no raw error.message)', async () => {
    server.use(
      http.get(`${API}/collaborations/42`, () =>
        HttpResponse.json(
          mockCollaboration({
            id: '42',
            worker_id: MY_ID,
            employer_id: '900',
            status: 'PENDING',
            initiated_by: 'EMPLOYER',
          }),
        ),
      ),
      http.patch(`${API}/collaborations/42/status`, () =>
        collaborationErrorBody(
          'STATUS_UNCHANGED',
          400,
          'Status is already CONFIRMED',
        ),
      ),
    );
    const user = userEvent.setup();
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    const btn = await screen.findByRole('button', { name: /^confirm$/i });
    await user.click(btn);
    expect(
      await screen.findByText(/Status is already CONFIRMED/i),
    ).toBeInTheDocument();
    // Belt-and-braces: no raw JSON.stringify body should appear on the page.
    expect(screen.queryByText(/STATUS_UNCHANGED.*statusCode/)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-113 — escrow summary card read-only states
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-113 — COLLAB-022 escrow summary read-only', () => {
  test('TEST-COLLAB-113 / COLLAB-022 — null escrow renders "No escrow yet" and a footer link to /escrow/:id', async () => {
    withCollaboration({ status: 'CONFIRMED', escrow_transaction: null });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    expect(await screen.findByText(/no escrow yet/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /manage payment/i });
    expect(link).toHaveAttribute('href', '/escrow/42');
  });

  test.each([
    ['HELD', mockEscrowHeld()],
    ['RELEASED', mockEscrowReleased()],
    ['REFUNDED', mockEscrowRefunded()],
    ['DISPUTED', mockEscrowDisputed()],
  ] as const)(
    'TEST-COLLAB-113 / COLLAB-022 — %s renders status pill + amount table + footer link',
    async (label, escrow: MockEscrowTransaction) => {
      withCollaboration({
        status: 'IN_PROGRESS',
        escrow_transaction: { ...escrow, id: '900', collaboration_id: '42' },
      });
      const account = await asWorker();
      renderWithProfile(withRoute(), {
        route: '/collaborations/42',
        account,
      });
      await waitFor(() =>
        expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
      );
      // status badge label is rendered
      const expectedLabel =
        label === 'HELD'
          ? /Held/i
          : label === 'RELEASED'
            ? /Released/i
            : label === 'REFUNDED'
              ? /Refunded/i
              : /Disputed/i;
      expect(screen.getAllByText(expectedLabel).length).toBeGreaterThan(0);
      // Amount table rows
      expect(screen.getByText(/Job amount/i)).toBeInTheDocument();
      expect(screen.getByText(/Platform fee/i)).toBeInTheDocument();
      expect(screen.getByText(/Worker payout/i)).toBeInTheDocument();
      expect(screen.getByText(/Referral commission/i)).toBeInTheDocument();
      // Footer link to /escrow/:id (prefer escrow.id when present)
      expect(
        screen.getByRole('link', { name: /manage payment/i }),
      ).toHaveAttribute('href', '/escrow/900');
    },
  );

  test('TEST-COLLAB-113 / COLLAB-022 — no Create-escrow / Fund / Confirm-deposit / Release / Refund button anywhere', async () => {
    withCollaboration({
      status: 'IN_PROGRESS',
      escrow_transaction: mockEscrowTransaction({
        id: '900',
        collaboration_id: '42',
      }),
    });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /create escrow/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /fund/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /confirm deposit/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /^release$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^refund$/i })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-114 — chat summary card existence
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-114 — COLLAB-023 chat summary card', () => {
  test('TEST-COLLAB-114 / COLLAB-023 — no linked thread → Conversation card with placeholder /inbox link', async () => {
    withCollaboration({ status: 'CONFIRMED' });
    // Default conversations handler returns an empty inbox.
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/Conversation/i)).toBeInTheDocument(),
    );
    const link = screen.getByRole('link', { name: /open inbox/i });
    expect(link).toHaveAttribute('href', '/inbox');
  });

  test('TEST-COLLAB-114 / CHAT-013 — linked thread → "Open chat" deep-links to /inbox/<conversationId>', async () => {
    withCollaboration({ status: 'CONFIRMED' });
    server.use(
      http.get(`${API}/conversations`, () =>
        HttpResponse.json({
          items: [
            {
              conversation: {
                id: '7777',
                collaboration_id: '42',
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
              collaboration: {
                id: '42',
                status: 'CONFIRMED',
                worker_id: MY_ID,
                employer_id: '900',
              },
              other_participant: {
                account_id: '900',
                client_profile_id: '900',
                display_name: 'Acme Build',
                avatar_url: null,
                verification_level: 'BASIC',
              },
              last_message: null,
              unread_count: 4,
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    const link = await screen.findByRole('link', { name: /open chat/i });
    expect(link).toHaveAttribute('href', '/inbox/7777');
    // Per-collab unread badge surfaces.
    expect(screen.getByText(/4 unread/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-114 / COLLAB-023 — no <textarea> anywhere on the page (chat owns message composition)', async () => {
    withCollaboration({ status: 'CONFIRMED' });
    const account = await asWorker();
    const { container } = renderWithProfile(withRoute(), {
      route: '/collaborations/42',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/Conversation/i)).toBeInTheDocument(),
    );
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-115 — reviews summary
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-115 — COLLAB-024 reviews summary', () => {
  function makeReview(
    role: 'WORKER' | 'EMPLOYER',
    isPublished: boolean,
  ): MockReview {
    return {
      id: role === 'WORKER' ? '5001' : '5002',
      collaboration_id: '42',
      reviewer_role: role,
      overall_rating: 5,
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    };
  }

  test('TEST-COLLAB-115 / COLLAB-024 — empty reviews → "No reviews yet"', async () => {
    withCollaboration({ reviews: [] });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    expect(await screen.findByText(/no reviews yet/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-115 / COLLAB-024 — published worker review labelled Published; missing employer side labelled Not submitted', async () => {
    withCollaboration({ reviews: [makeReview('WORKER', true)] });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/worker review/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
    expect(screen.getByText(/Not submitted/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-115 / COLLAB-024 — mixed published / draft reviews label both correctly', async () => {
    withCollaboration({
      reviews: [
        makeReview('WORKER', true),
        makeReview('EMPLOYER', false),
      ],
    });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/Published/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  });

  test('TEST-COLLAB-115 / COLLAB-024 — no Write-review CTA in this feature', async () => {
    withCollaboration({});
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /write a review/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('link', { name: /write a review/i }),
    ).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-116 — flag history strip
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-116 — COLLAB-025 flag history strip', () => {
  test('TEST-COLLAB-116 / COLLAB-025 — flagged + reason renders the reason verbatim', async () => {
    withCollaboration({
      flagged: true,
      flag_reason: 'PAYMENT_LATE: cheque is two weeks late',
    });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    expect(
      await screen.findByText(/cheque is two weeks late/i),
    ).toBeInTheDocument();
  });

  test('TEST-COLLAB-116 / COLLAB-025 — flagged + null reason → "Flagged — no reason recorded"', async () => {
    withCollaboration({ flagged: true, flag_reason: null });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    expect(
      await screen.findByText(/no reason recorded/i),
    ).toBeInTheDocument();
  });

  test('TEST-COLLAB-116 / COLLAB-025 — flagged=false hides the strip', async () => {
    withCollaboration({ flagged: false, flag_reason: null });
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    await waitFor(() =>
      expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no reason recorded/i)).toBeNull();
    expect(
      screen.queryByText(/flagged for staff review/i),
    ).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-117 — audit timeline
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-117 — COLLAB-026 audit timeline', () => {
  test('TEST-COLLAB-117 / COLLAB-026 — null timestamps are skipped, populated ones render in order', async () => {
    const created = '2026-01-01T10:00:00.000Z';
    const confirmed = '2026-01-02T10:00:00.000Z';
    const started = '2026-01-03T10:00:00.000Z';
    withCollaboration({
      status: 'IN_PROGRESS',
      created_at: created,
      confirmed_at: confirmed,
      started_at: started,
      ended_at: null,
    });
    const account = await asEmployer();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    const timelineHeading = await screen.findByText(/^Timeline$/);
    // The Timeline card is the closest ancestor containing the heading.
    const timelineCard = timelineHeading.closest('.rounded-lg, [class*="rounded"]');
    expect(timelineCard).not.toBeNull();
    const within$ = within(timelineCard as HTMLElement);
    expect(within$.getByText(/^Created$/)).toBeInTheDocument();
    expect(within$.getByText(/^Confirmed$/)).toBeInTheDocument();
    expect(within$.getByText(/^Started$/)).toBeInTheDocument();
    expect(within$.queryByText(/^Ended$/)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-118 — 404 surface
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-118 — 404 surface', () => {
  test('TEST-COLLAB-118 — 404 renders EmptyState with back-link to /collaborations', async () => {
    server.use(
      http.get(`${API}/collaborations/42`, () =>
        collaborationErrorBody('NOT_FOUND', 404, 'Collaboration not found'),
      ),
    );
    const account = await asWorker();
    renderWithProfile(withRoute(), { route: '/collaborations/42', account });
    expect(
      await screen.findByText(/Collaboration not found/i),
    ).toBeInTheDocument();
    const backLinks = screen.getAllByRole('link', { name: /back to collaborations/i });
    for (const link of backLinks) {
      expect(link).toHaveAttribute('href', '/collaborations');
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-119 — no JSON dump on detail
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-119 — COLLAB-001 zero JSON dumps on the detail page', () => {
  test('TEST-COLLAB-119 / COLLAB-001 — no <pre> with stringified JSON; no "JSON" copy', async () => {
    withCollaboration({ status: 'CONFIRMED' });
    const account = await asWorker();
    const { container } = renderWithProfile(withRoute(), {
      route: '/collaborations/42',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/Collaboration #42/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/JSON/i)).toBeNull();
    expect(container.querySelectorAll('pre')).toHaveLength(0);
  });
});
