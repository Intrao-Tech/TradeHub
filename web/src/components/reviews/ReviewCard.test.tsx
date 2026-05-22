// TEST-REVIEW-140..145 — <ReviewCard> (REVIEW-021).
//
// Locks the review card shape: header / ratings / comment / footer +
// link-or-not behaviour.

import { describe, expect, test, vi } from 'vitest';
import { renderWithRouter, screen, within } from '@/test/render';
import { mockReview, mockReviewDraft } from '@/test/factories';
import { ReviewCard } from './ReviewCard';

describe('TEST-REVIEW-140 — REVIEW-021 header row', () => {
  test('TEST-REVIEW-140 / REVIEW-021 — EMPLOYER reviewer renders "From an employer" + <time>; no Published badge for the public state', () => {
    const review = mockReview({
      reviewer_role: 'EMPLOYER',
      published_at: '2026-04-15T12:00:00Z',
      is_published: true,
    });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/from an employer/i)).toBeInTheDocument();
    // Public reviews don't surface a "Published" badge — every card on a
    // public profile is published by definition, so the badge is noise.
    expect(screen.queryByText(/^published$/i)).toBeNull();
    expect(document.querySelector('time')).not.toBeNull();
  });

  test('TEST-REVIEW-140 / REVIEW-021 — WORKER reviewer renders "From a worker"', () => {
    const review = mockReview({ reviewer_role: 'WORKER' });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/from a worker/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-141 — REVIEW-021 rating block (overall + sub-ratings)', () => {
  test('TEST-REVIEW-141 / REVIEW-021 — overall rating shows numeric label "<n> / 5"', () => {
    const review = mockReview({ overall_rating: 4 });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/4 \/ 5/)).toBeInTheDocument();
  });

  test('TEST-REVIEW-141 / REVIEW-021 — sub-ratings render with labels; null sub-ratings render the em-dash fallback', () => {
    const review = mockReview({
      quality_rating: 5,
      reliability_rating: null,
      communication_rating: null,
      payment_rating: null,
      safety_rating: null,
    });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/Quality/)).toBeInTheDocument();
    expect(screen.getByText(/Reliability/)).toBeInTheDocument();
    expect(screen.getByText(/Communication/)).toBeInTheDocument();
    expect(screen.getByText(/Payment/)).toBeInTheDocument();
    expect(screen.getByText(/Safety/)).toBeInTheDocument();
    // Four em-dashes for the four null sub-ratings.
    expect(screen.getAllByText('—').length).toBe(4);
  });

  test('TEST-REVIEW-141 / REVIEW-021 — review with all five sub-ratings null + no comment renders without crash', () => {
    const review = mockReview({
      quality_rating: null,
      reliability_rating: null,
      communication_rating: null,
      payment_rating: null,
      safety_rating: null,
      comment: null,
    });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getAllByText('—').length).toBe(5);
    expect(screen.getByText(/no comment/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-142 — REVIEW-021 comment rendering (escaped, no Markdown)', () => {
  test('TEST-REVIEW-142 / REVIEW-021 — HTML in the comment is rendered as text, not parsed', () => {
    const review = mockReview({
      comment: '<script>alert("xss")</script> Visit <b>www.evil.com</b>',
    });
    const { container } = renderWithRouter(<ReviewCard review={review} />);
    expect(
      screen.getByText(/<script>alert\("xss"\)<\/script>/),
    ).toBeInTheDocument();
    // No actual <script> or <b> elements injected.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  test('TEST-REVIEW-142 / REVIEW-021 — empty comment renders the "No comment" italic fallback', () => {
    const review = mockReview({ comment: null });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/no comment/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-143 — REVIEW-021 footer (project_type + dates)', () => {
  test('TEST-REVIEW-143 / REVIEW-021 — both dates → "<start> – <end>"', () => {
    const review = mockReview({
      collaboration: {
        id: '7000',
        worker_id: '300',
        employer_id: '400',
        project_type: 'Bathroom refit',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-02-01T00:00:00Z',
      },
    });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/Project: Bathroom refit/)).toBeInTheDocument();
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  test('TEST-REVIEW-143 / REVIEW-021 — start only → "Started <date>"', () => {
    const review = mockReview({
      collaboration: {
        id: '7000',
        worker_id: '300',
        employer_id: '400',
        project_type: null,
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
      },
    });
    renderWithRouter(<ReviewCard review={review} />);
    expect(screen.getByText(/^Started /)).toBeInTheDocument();
  });

  test('TEST-REVIEW-143 / REVIEW-021 — collaboration data missing entirely → no footer crash (Edge Case: deleted Collaboration)', () => {
    const review = mockReview();
    delete (review as Partial<typeof review>).collaboration;
    renderWithRouter(<ReviewCard review={review} />);
    // Card still renders the rest.
    expect(screen.getByText(/from an employer/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-144 — REVIEW-021 click-to-open-dialog wrapper', () => {
  test('TEST-REVIEW-144 / REVIEW-031 — onClick wraps card in a button that fires on click', async () => {
    const review = mockReview({ id: '551' });
    const onClick = vi.fn();
    const { container } = renderWithRouter(
      <ReviewCard review={review} onClick={onClick} />,
    );
    // No permalink anchor — we replaced /reviews/:id with an in-page dialog.
    expect(container.querySelector('a[href="/reviews/551"]')).toBeNull();
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.setup().click(btn as HTMLButtonElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('TEST-REVIEW-144 / REVIEW-031 — omitting onClick renders a plain card (no button wrapper)', () => {
    const review = mockReview({ id: '551' });
    const { container } = renderWithRouter(<ReviewCard review={review} />);
    expect(container.querySelector('a[href="/reviews/551"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('TEST-REVIEW-145 — REVIEW-021 Draft-only badge', () => {
  test('TEST-REVIEW-145 / REVIEW-021 — is_published:false renders "Draft" badge', () => {
    const review = mockReviewDraft();
    renderWithRouter(<ReviewCard review={review} />);
    const badges = screen.getAllByText(/draft/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  test('TEST-REVIEW-145 / REVIEW-021 — is_published:true renders no status badge', () => {
    const review = mockReview({ is_published: true });
    const { container } = renderWithRouter(<ReviewCard review={review} />);
    expect(within(container).queryByText(/^published$/i)).toBeNull();
    expect(within(container).queryByText(/^draft$/i)).toBeNull();
  });
});
