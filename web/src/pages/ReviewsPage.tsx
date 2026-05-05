import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/StarRating';
import { EmptyState } from '@/components/EmptyState';
import { MessageSquare } from 'lucide-react';

type ReviewRow = {
  overall_rating?: number;
  quality_rating?: number | null;
  reliability_rating?: number | null;
  communication_rating?: number | null;
  payment_rating?: number | null;
  safety_rating?: number | null;
  comment?: string | null;
  reviewer_role?: string;
  is_published?: boolean;
};

type ReviewListResponse = {
  items: ReviewRow[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
};

type OptionalRatingKey =
  | 'quality_rating'
  | 'reliability_rating'
  | 'communication_rating'
  | 'payment_rating'
  | 'safety_rating';

const OPTIONAL_LABELS: Record<OptionalRatingKey, string> = {
  quality_rating: 'Quality',
  reliability_rating: 'Reliability',
  communication_rating: 'Communication',
  payment_rating: 'Payment',
  safety_rating: 'Safety',
};

function OptionalRatingField({
  name,
  value,
  onChange,
}: {
  name: OptionalRatingKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const numValue = value === '' ? 0 : Number(value);
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-fg">{OPTIONAL_LABELS[name]}</p>
        <p className="text-xs text-fg-subtle">Optional</p>
      </div>
      <div className="flex items-center gap-2">
        <StarRating
          value={numValue}
          onChange={(n) => onChange(String(n))}
          label={OPTIONAL_LABELS[name]}
        />
        {value !== '' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange('')}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const loggedIn = !!getToken();
  const [error, setError] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [workerReviews, setWorkerReviews] = useState<ReviewListResponse | null>(null);
  const [employerReviews, setEmployerReviews] = useState<ReviewListResponse | null>(null);

  const [collabId, setCollabId] = useState('');
  const [overallRating, setOverallRating] = useState('5');
  const [qualityRating, setQualityRating] = useState('');
  const [reliabilityRating, setReliabilityRating] = useState('');
  const [communicationRating, setCommunicationRating] = useState('');
  const [paymentRating, setPaymentRating] = useState('');
  const [safetyRating, setSafetyRating] = useState('');
  const [comment, setComment] = useState('');
  const [createResult, setCreateResult] = useState<unknown>(null);

  async function searchWorkerReviews(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    try {
      const id = workerId.trim();
      if (!id) {
        setError('worker_id is required');
        return;
      }
      const data = await api<ReviewListResponse>(
        `/reviews/worker/${id}?page=1&limit=10`,
      );
      setWorkerReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWorkerReviews(null);
    }
  }

  async function searchEmployerReviews(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    try {
      const id = employerId.trim();
      if (!id) {
        setError('employer_id is required');
        return;
      }
      const data = await api<ReviewListResponse>(
        `/reviews/employer/${id}?page=1&limit=10`,
      );
      setEmployerReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEmployerReviews(null);
    }
  }

  async function handleCreateReview(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreateResult(null);
    try {
      const cid = collabId.trim();
      if (!cid) {
        setError('collaboration_id is required');
        return;
      }
      const body: Record<string, unknown> = {
        overall_rating: Number(overallRating),
        comment: comment || undefined,
      };
      const addOpt = (k: string, v: string) => {
        if (v !== '') body[k] = Number(v);
      };
      addOpt('quality_rating', qualityRating);
      addOpt('reliability_rating', reliabilityRating);
      addOpt('communication_rating', communicationRating);
      addOpt('payment_rating', paymentRating);
      addOpt('safety_rating', safetyRating);

      const out = await api(`/reviews/collaboration/${cid}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreateResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Reviews</h1>
        <p className="text-sm text-fg-muted">Browse published reviews and submit your own.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Search worker reviews</CardTitle>
          <CardDescription>Look up reviews about a specific worker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={searchWorkerReviews}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="worker-id">worker_id</Label>
              <Input
                id="worker-id"
                type="number"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={() => void searchWorkerReviews()}>
                Refresh
              </Button>
            </div>
          </form>
          <ReviewCardsList items={workerReviews?.items} />
          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {workerReviews == null ? '' : JSON.stringify(workerReviews, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search employer reviews</CardTitle>
          <CardDescription>Look up reviews about a specific employer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={searchEmployerReviews}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="employer-id">employer_id</Label>
              <Input
                id="employer-id"
                type="number"
                value={employerId}
                onChange={(e) => setEmployerId(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={() => void searchEmployerReviews()}>
                Refresh
              </Button>
            </div>
          </form>
          <ReviewCardsList items={employerReviews?.items} />
          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="mt-2 rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
              {employerReviews == null ? '' : JSON.stringify(employerReviews, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      {!loggedIn ? (
        <div
          role="status"
          className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
        >
          You are browsing as a guest.{' '}
          <Link to="/login" className="font-medium underline underline-offset-4">
            Sign in
          </Link>{' '}
          to write reviews.
        </div>
      ) : null}

      {loggedIn ? (
        <Card>
          <CardHeader>
            <CardTitle>Create review</CardTitle>
            <CardDescription>
              Rate a collaboration. Overall rating is required; sub-ratings are optional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateReview} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="collab-id">collaboration_id *</Label>
                <Input
                  id="collab-id"
                  type="number"
                  value={collabId}
                  onChange={(e) => setCollabId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>overall_rating *</Label>
                <div className="flex items-center gap-3">
                  <StarRating
                    value={overallRating === '' ? 0 : Number(overallRating)}
                    onChange={(n) => setOverallRating(String(n))}
                    label="Overall rating"
                  />
                  <span className="text-sm text-fg-muted">
                    {overallRating || '0'} / 5
                  </span>
                </div>
              </div>

              <div className="space-y-3 rounded-md border border-border-default p-4">
                <OptionalRatingField name="quality_rating" value={qualityRating} onChange={setQualityRating} />
                <OptionalRatingField name="reliability_rating" value={reliabilityRating} onChange={setReliabilityRating} />
                <OptionalRatingField name="communication_rating" value={communicationRating} onChange={setCommunicationRating} />
                <OptionalRatingField name="payment_rating" value={paymentRating} onChange={setPaymentRating} />
                <OptionalRatingField name="safety_rating" value={safetyRating} onChange={setSafetyRating} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-comment">Comment</Label>
                <Textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Optional comment…"
                />
              </div>
              <Button type="submit">Create review</Button>
            </form>
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold text-fg">Create response</h3>
              <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                {createResult == null ? '' : JSON.stringify(createResult, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReviewCardsList({ items }: { items: ReviewRow[] | undefined }) {
  if (!items?.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No reviews"
        description="No reviews in this result."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((rev, i) => (
        <li key={i}>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRating
                    value={rev.overall_rating ?? 0}
                    size="md"
                    label="Overall rating"
                  />
                  <span className="text-sm text-fg-muted">
                    {rev.overall_rating ?? '—'} / 5
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rev.reviewer_role ? (
                    <Badge variant="outline">{rev.reviewer_role}</Badge>
                  ) : null}
                  <Badge variant={rev.is_published ? 'success' : 'warning'}>
                    {rev.is_published ? 'Published' : 'Draft'}
                  </Badge>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted sm:grid-cols-5">
                <SubRating label="Quality" value={rev.quality_rating} />
                <SubRating
                  label="Reliability"
                  value={rev.reliability_rating}
                />
                <SubRating
                  label="Communication"
                  value={rev.communication_rating}
                />
                <SubRating label="Payment" value={rev.payment_rating} />
                <SubRating label="Safety" value={rev.safety_rating} />
              </dl>
              <p className="text-sm text-fg">
                {rev.comment ? (
                  rev.comment
                ) : (
                  <em className="text-fg-subtle">No comment</em>
                )}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SubRating({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-fg-subtle">{label}</span>
      {value != null ? (
        <StarRating value={value} size="sm" label={label} />
      ) : (
        <span className="text-fg-subtle">—</span>
      )}
    </div>
  );
}
