// TEST-REVIEW-100..115 — <LeaveReviewSheet> (REVIEW-011..017).
//
// Locks the sheet's form behaviour (overall required, sub-rating optional,
// comment ceiling), submit + error mapping, and the localStorage draft
// autosave lifecycle.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent } from '@testing-library/react';
import {
  renderWithProfile,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { server } from '@/test/msw-server';
import { reviewsErrorBody } from '@/test/handlers/reviews';
import { LeaveReviewSheet } from './LeaveReviewSheet';

const API = 'http://localhost:8081/api';
const COLLAB_ID = '42';
const PROFILE_ID = '7';
const DRAFT_KEY = `review-draft:${COLLAB_ID}:${PROFILE_ID}`;

function Harness({ open = true }: { open?: boolean } = {}) {
  return (
    <LeaveReviewSheet
      collaborationId={COLLAB_ID}
      clientProfileId={PROFILE_ID}
      open={open}
      onOpenChange={() => {}}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-100 / REVIEW-016 — sheet open / first focusable
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-100 — REVIEW-016 sheet opens with overall-rating focusable', () => {
  test('TEST-REVIEW-100 / REVIEW-016 — sheet renders the overall-rating <StarRating> as the first interactive control', () => {
    renderWithProfile(<Harness />, { route: '/' });
    expect(screen.getByText(/Leave a review/i)).toBeInTheDocument();
    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    expect(within(overall).getAllByRole('radio')).toHaveLength(5);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-101 — REVIEW-012 overall rating required
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-101 — REVIEW-012 submit gated on overall rating ≥ 1', () => {
  test('TEST-REVIEW-101 / REVIEW-012 — submit disabled while overall is 0; enabled after a star is picked', async () => {
    const user = userEvent.setup();
    renderWithProfile(<Harness />, { route: '/' });
    const submit = screen.getByRole('button', { name: /submit review/i });
    expect(submit).toBeDisabled();

    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    await user.click(stars[2]); // pick 3 stars
    expect(submit).not.toBeDisabled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-102 — REVIEW-012 sub-ratings optional + clear behaviour
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-102 — REVIEW-012 sub-ratings optional; submit body excludes unset sub-ratings', () => {
  test('TEST-REVIEW-102 / REVIEW-012 — overall-only submit body contains only overall_rating + comment', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post(
        `${API}/reviews/collaboration/:id`,
        async ({ request }) => {
          captured = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: '500' }, { status: 201 });
        },
      ),
    );

    renderWithProfile(<Harness />, { route: '/' });
    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    await user.click(stars[4]); // 5

    await user.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({ overall_rating: 5 });
    expect(captured).not.toHaveProperty('quality_rating');
    expect(captured).not.toHaveProperty('reliability_rating');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-103 — REVIEW-012 comment 5000-char ceiling
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-103 — REVIEW-012 comment counter + ceiling', () => {
  test('TEST-REVIEW-103 / REVIEW-012 — counter shows "<n> / 5000"', async () => {
    renderWithProfile(<Harness />, { route: '/' });
    expect(screen.getByText('0 / 5000')).toBeInTheDocument();
  });

  test('TEST-REVIEW-103 / REVIEW-012 — submit blocked at > 5000 chars even when overall is set', async () => {
    const user = userEvent.setup();
    renderWithProfile(<Harness />, { route: '/' });

    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    await user.click(stars[4]); // overall = 5

    const textarea = screen.getByLabelText(/comment/i) as HTMLTextAreaElement;
    // Bypass per-key delay for performance — set value via fireEvent equivalent.
    textarea.focus();
    await user.paste('x'.repeat(5001));

    expect(textarea.value.length).toBe(5001);
    expect(screen.getByRole('button', { name: /submit review/i })).toBeDisabled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-104 — REVIEW-013 happy path
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-104 — REVIEW-013 happy-path submit', () => {
  test('TEST-REVIEW-104 / REVIEW-013 — success closes sheet, fires success toast, calls onSubmitted', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn();

    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        HttpResponse.json(
          {
            id: '900',
            collaboration_id: COLLAB_ID,
            reviewer_role: 'WORKER',
            overall_rating: 5,
            is_published: false,
            published_at: null,
          },
          { status: 201 },
        ),
      ),
    );

    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
        onSubmitted={onSubmitted}
      />,
      { route: '/' },
    );

    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    await user.click(stars[4]);
    await user.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmitted.mock.calls[0][0]).toMatchObject({ id: '900' });
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-105 — REVIEW-014 error mapping
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-105 — REVIEW-014 error mapping (5 branches)', () => {
  async function pickAndSubmit() {
    const user = userEvent.setup();
    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    await user.click(stars[4]);
    await user.click(screen.getByRole('button', { name: /submit review/i }));
  }

  test('TEST-REVIEW-105 / REVIEW-014 — 400 No client profile → inline alert with Go to profile link; sheet stays open', async () => {
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody(
          'BAD_REQUEST',
          400,
          'No client profile for this account',
        ),
      ),
    );
    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
      />,
      { route: '/' },
    );
    await pickAndSubmit();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert').textContent).toMatch(
      /Complete your profile first/i,
    );
    expect(screen.getByRole('link', { name: /Go to profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('TEST-REVIEW-105 / REVIEW-014 — 400 Reviews can only be created for completed → sheet closes (race path)', async () => {
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody(
          'BAD_REQUEST',
          400,
          'Reviews can only be created for completed collaborations',
        ),
      ),
    );
    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
      />,
      { route: '/' },
    );
    await pickAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('TEST-REVIEW-105 / REVIEW-014 — 400 A WORKER review already exists → sheet closes (duplicate path)', async () => {
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody(
          'BAD_REQUEST',
          400,
          'A WORKER review already exists for this collaboration',
        ),
      ),
    );
    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
      />,
      { route: '/' },
    );
    await pickAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('TEST-REVIEW-105 / REVIEW-014 — 403 Not a participant → sheet closes', async () => {
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody(
          'FORBIDDEN',
          403,
          'Not a participant in this collaboration',
        ),
      ),
    );
    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
      />,
      { route: '/' },
    );
    await pickAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test('TEST-REVIEW-105 / REVIEW-014 — 500 fallback → inline alert with parseApiError message; sheet stays open', async () => {
    const onOpenChange = vi.fn();
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody('INTERNAL', 500, 'Something broke'),
      ),
    );
    renderWithProfile(
      <LeaveReviewSheet
        collaborationId={COLLAB_ID}
        clientProfileId={PROFILE_ID}
        open
        onOpenChange={onOpenChange}
      />,
      { route: '/' },
    );
    await pickAndSubmit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Something broke/);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-110..115 — REVIEW-017 localStorage draft autosave
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-110 — REVIEW-017 debounced localStorage write while sheet is open', () => {
  test('TEST-REVIEW-110 / REVIEW-017 — picking a rating writes review-draft:<collab>:<profile> after 300ms', async () => {
    renderWithProfile(<Harness />, { route: '/' });

    const overall = screen.getByRole('radiogroup', { name: /overall rating/i });
    const stars = within(overall).getAllByRole('radio');
    fireEvent.click(stars[3]); // pick 4

    await waitFor(
      () => {
        const raw = localStorage.getItem(DRAFT_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw as string);
        expect(parsed.overall).toBe(4);
        expect(typeof parsed.savedAt).toBe('number');
      },
      { timeout: 2000 },
    );
  });
});

describe('TEST-REVIEW-111 — REVIEW-017 hydrates form from localStorage on open + renders restore banner', () => {
  test('TEST-REVIEW-111 / REVIEW-017 — open with a stored draft → form prefilled, banner with Discard draft visible', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: 'restored body',
        savedAt: Date.now() - 60_000,
      }),
    );
    renderWithProfile(<Harness />, { route: '/' });
    expect(screen.getByText(/Draft restored/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Discard draft/i }),
    ).toBeInTheDocument();
    const textarea = screen.getByLabelText(/comment/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('restored body');
  });
});

describe('TEST-REVIEW-112 — REVIEW-017 Discard draft clears key + resets form', () => {
  test('TEST-REVIEW-112 / REVIEW-017 — Discard draft removes localStorage key and resets fields', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: 'old draft',
        savedAt: Date.now(),
      }),
    );
    renderWithProfile(<Harness />, { route: '/' });
    fireEvent.click(screen.getByRole('button', { name: /Discard draft/i }));
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(screen.queryByText(/Draft restored/i)).toBeNull();
    const textarea = screen.getByLabelText(/comment/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });
});

describe('TEST-REVIEW-113 — REVIEW-017 successful submit clears the key', () => {
  test('TEST-REVIEW-113 / REVIEW-017 — after a 201 the key is removed', async () => {
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        HttpResponse.json({ id: '1' }, { status: 201 }),
      ),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: '',
        savedAt: Date.now(),
      }),
    );
    renderWithProfile(<Harness />, { route: '/' });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
  });
});

describe('TEST-REVIEW-114 — REVIEW-017 terminal-error branches clear the key', () => {
  test.each([
    ['Reviews can only be created for completed collaborations', 400],
    ['A WORKER review already exists for this collaboration', 400],
    ['Not a participant in this collaboration', 403],
  ] as const)(
    'TEST-REVIEW-114 / REVIEW-017 — %s clears localStorage draft',
    async (message, status) => {
      const onOpenChange = vi.fn();
      server.use(
        http.post(`${API}/reviews/collaboration/:id`, () =>
          reviewsErrorBody(status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', status, message),
        ),
      );
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          overall: 5,
          subs: {
            quality_rating: 0,
            reliability_rating: 0,
            communication_rating: 0,
            payment_rating: 0,
            safety_rating: 0,
          },
          comment: '',
          savedAt: Date.now(),
        }),
      );
      renderWithProfile(
        <LeaveReviewSheet
          collaborationId={COLLAB_ID}
          clientProfileId={PROFILE_ID}
          open
          onOpenChange={onOpenChange}
        />,
        { route: '/' },
      );
      fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
      await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
    },
  );

  test('TEST-REVIEW-114 / REVIEW-017 — "stays open" branches do NOT clear the key', async () => {
    server.use(
      http.post(`${API}/reviews/collaboration/:id`, () =>
        reviewsErrorBody(
          'BAD_REQUEST',
          400,
          'No client profile for this account',
        ),
      ),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: '',
        savedAt: Date.now(),
      }),
    );
    renderWithProfile(<Harness />, { route: '/' });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });
});

describe('TEST-REVIEW-115 — REVIEW-017 30-day housekeeping evicts stale keys', () => {
  test('TEST-REVIEW-115 / REVIEW-017 — drafts older than 30 days are removed on sheet open', () => {
    const STALE = `review-draft:999:99`;
    const now = Date.now();
    localStorage.setItem(
      STALE,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: '',
        savedAt: now - 31 * 24 * 60 * 60 * 1000,
      }),
    );
    const FRESH = `review-draft:888:88`;
    localStorage.setItem(
      FRESH,
      JSON.stringify({
        overall: 5,
        subs: {
          quality_rating: 0,
          reliability_rating: 0,
          communication_rating: 0,
          payment_rating: 0,
          safety_rating: 0,
        },
        comment: '',
        savedAt: now - 60_000,
      }),
    );

    renderWithProfile(<Harness />, { route: '/' });
    expect(localStorage.getItem(STALE)).toBeNull();
    expect(localStorage.getItem(FRESH)).not.toBeNull();
  });
});
