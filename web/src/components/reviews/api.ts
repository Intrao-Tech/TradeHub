import { api } from '@/api';

export type ReviewerRole = 'WORKER' | 'EMPLOYER';

export type ReviewCollaboration = {
  id: string | number;
  worker_id?: string | number;
  employer_id?: string | number;
  project_type?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string;
  agreed_amount?: string | number | null;
};

export type Review = {
  id: string | number;
  collaboration_id: string | number;
  reviewer_role: ReviewerRole;
  overall_rating: number;
  quality_rating?: number | null;
  reliability_rating?: number | null;
  communication_rating?: number | null;
  payment_rating?: number | null;
  safety_rating?: number | null;
  comment?: string | null;
  is_published: boolean;
  published_at?: string | null;
  created_at?: string | null;
  collaboration?: ReviewCollaboration;
};

export type ReviewListResponse = {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CreateReviewBody = {
  overall_rating: number;
  quality_rating?: number;
  reliability_rating?: number;
  communication_rating?: number;
  payment_rating?: number;
  safety_rating?: number;
  comment?: string;
};

export function createReview(
  collaborationId: string | number,
  body: CreateReviewBody,
): Promise<Review> {
  return api<Review>(`/reviews/collaboration/${collaborationId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * All reviews (published + the caller's own pending drafts) across every
 * contract under a collaboration. Backend guards on participation, so this is
 * only callable by the worker or employer in the relationship. Used to detect
 * whether the current user has already left a review for their side.
 */
export function getReviewsByCollaboration(
  collaborationId: string | number,
): Promise<Review[]> {
  return api<Review[]>(`/reviews/collaboration/${collaborationId}`);
}

export function getReviewsByWorker(
  workerId: string | number,
  page = 1,
  limit = 10,
): Promise<ReviewListResponse> {
  return api<ReviewListResponse>(
    `/reviews/worker/${workerId}?page=${page}&limit=${limit}`,
  );
}

export function getReviewsByEmployer(
  employerId: string | number,
  page = 1,
  limit = 10,
): Promise<ReviewListResponse> {
  return api<ReviewListResponse>(
    `/reviews/employer/${employerId}?page=${page}&limit=${limit}`,
  );
}

export function getReviewById(id: string | number): Promise<Review> {
  return api<Review>(`/reviews/${id}`);
}

export function getUnpublishedReviews(
  page = 1,
  limit = 20,
): Promise<ReviewListResponse> {
  return api<ReviewListResponse>(
    `/reviews/unpublished?page=${page}&limit=${limit}`,
  );
}

export function publishReview(id: string | number): Promise<Review> {
  return api<Review>(`/reviews/${id}/publish`, { method: 'PATCH' });
}
