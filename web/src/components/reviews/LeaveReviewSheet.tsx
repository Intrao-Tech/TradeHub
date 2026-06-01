import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { StarRating } from '@/components/StarRating';
import { createReview, type Review } from './api';

/**
 * REVIEW-011..017 — write-flow sheet for the post-completion review.
 * Autosaves drafts to localStorage; restores them on re-open.
 */

const COMMENT_MAX = 5000;
const COMMENT_DANGER_THRESHOLD = 4900;
const DRAFT_KEY_PREFIX = 'review-draft:';
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTOSAVE_DEBOUNCE_MS = 300;

type SubRatingKey =
  | 'quality_rating'
  | 'reliability_rating'
  | 'communication_rating'
  | 'payment_rating'
  | 'safety_rating';

const SUB_RATINGS: Array<{ key: SubRatingKey; label: string }> = [
  { key: 'quality_rating', label: 'Quality' },
  { key: 'reliability_rating', label: 'Reliability' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'payment_rating', label: 'Payment' },
  { key: 'safety_rating', label: 'Safety' },
];

type DraftPayload = {
  overall: number;
  subs: Record<SubRatingKey, number>;
  comment: string;
  savedAt: number;
};

function emptySubs(): Record<SubRatingKey, number> {
  return {
    quality_rating: 0,
    reliability_rating: 0,
    communication_rating: 0,
    payment_rating: 0,
    safety_rating: 0,
  };
}

function draftKey(collaborationId: string, clientProfileId: string | number) {
  return `${DRAFT_KEY_PREFIX}${collaborationId}:${String(clientProfileId)}`;
}

function readDraft(key: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    if (typeof parsed?.savedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function evictStaleDrafts() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_KEY_PREFIX)) continue;
      const d = readDraft(k);
      if (!d || now - d.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* localStorage may be unavailable in some browser modes — ignore. */
  }
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export type LeaveReviewSheetProps = {
  collaborationId: string;
  clientProfileId: string | number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (review: Review) => void;
};

export function LeaveReviewSheet({
  collaborationId,
  clientProfileId,
  open,
  onOpenChange,
  onSubmitted,
}: LeaveReviewSheetProps) {
  const storageKey = useMemo(
    () => draftKey(collaborationId, clientProfileId),
    [collaborationId, clientProfileId],
  );

  const [overall, setOverall] = useState(0);
  const [subs, setSubs] = useState<Record<SubRatingKey, number>>(emptySubs());
  const [comment, setComment] = useState('');
  const [error, setError] = useState<{ kind: 'inline'; message: string; isProfile?: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    evictStaleDrafts();
    const draft = readDraft(storageKey);
    if (draft) {
      setOverall(Number.isFinite(draft.overall) ? draft.overall : 0);
      setSubs({ ...emptySubs(), ...draft.subs });
      setComment(typeof draft.comment === 'string' ? draft.comment : '');
      setRestoredAt(draft.savedAt);
    } else {
      setOverall(0);
      setSubs(emptySubs());
      setComment('');
      setRestoredAt(null);
    }
    setError(null);
    setSubmitting(false);
    initRef.current = true;
  }, [open, storageKey]);

  // Debounced autosave while sheet is open.
  useEffect(() => {
    if (!open || !initRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const payload: DraftPayload = {
          overall,
          subs,
          comment,
          savedAt: Date.now(),
        };
        if (overall === 0 && comment === '' && Object.values(subs).every((v) => !v)) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify(payload));
        }
      } catch {
        /* ignore */
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, storageKey, overall, subs, comment]);

  function clearDraft() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  function discardDraft() {
    clearDraft();
    setOverall(0);
    setSubs(emptySubs());
    setComment('');
    setRestoredAt(null);
  }

  function setSub(key: SubRatingKey, v: number) {
    setSubs((prev) => ({ ...prev, [key]: v }));
  }

  const commentLength = comment.length;
  const commentDanger = commentLength >= COMMENT_DANGER_THRESHOLD;
  const commentOver = commentLength > COMMENT_MAX;
  const canSubmit = overall >= 1 && !commentOver && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Parameters<typeof createReview>[1] = {
        overall_rating: overall,
      };
      for (const { key } of SUB_RATINGS) {
        const v = subs[key];
        if (v >= 1) body[key] = v;
      }
      if (comment.trim() !== '') body.comment = comment;

      const review = await createReview(collaborationId, body);
      clearDraft();
      toast.success(
        'Review submitted — staff will review it before it appears publicly',
      );
      onSubmitted?.(review);
      onOpenChange(false);
    } catch (err) {
      const parsed = parseApiError(err);
      const status = parsed?.status ?? 0;
      const message = parsed?.message ?? 'Could not submit review.';
      const lower = message.toLowerCase();

      if (status === 400 && lower.includes('no client profile')) {
        setError({
          kind: 'inline',
          message: 'Complete your profile first',
          isProfile: true,
        });
        setSubmitting(false);
        return;
      }
      if (
        status === 400 &&
        lower.includes('completed collaborations')
      ) {
        clearDraft();
        toast.warning('This collaboration is no longer eligible for review');
        onOpenChange(false);
        return;
      }
      if (status === 400 && lower.includes('already exists')) {
        clearDraft();
        toast.info('A review already exists for this side');
        onOpenChange(false);
        return;
      }
      if (status === 403 && lower.includes('not a participant')) {
        clearDraft();
        toast.error("You can't review a collaboration you're not part of");
        onOpenChange(false);
        return;
      }

      setError({ kind: 'inline', message });
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Leave a review</SheetTitle>
          <SheetDescription>
            Rate this collaboration. Only the overall rating is required —
            sub-ratings and the comment are optional.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {restoredAt != null ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
            >
              <span>
                Draft restored — last edited {relativeTime(restoredAt)}.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardDraft}
              >
                Discard draft
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5">
            <Label>Overall rating *</Label>
            <div className="flex items-center gap-3">
              <StarRating
                value={overall}
                onChange={setOverall}
                size="lg"
                label="Overall rating"
              />
              <span className="text-sm text-fg-muted">
                {overall === 0 ? 'Not picked' : `${overall} / 5`}
              </span>
            </div>
            <p className="text-xs text-fg-muted">1 to 5 stars</p>
          </div>

          <details className="rounded-md border border-border-default p-3">
            <summary className="cursor-pointer text-sm font-medium text-fg">
              Add detailed ratings (optional)
            </summary>
            <div className="mt-3 space-y-3">
              {SUB_RATINGS.map(({ key, label }) => {
                const value = subs[key];
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <Label className="text-sm" htmlFor={`sub-${key}`}>
                      {label}
                    </Label>
                    <div className="flex items-center gap-2">
                      <StarRating
                        value={value}
                        onChange={(v) => setSub(key, v)}
                        label={label}
                      />
                      {value > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSub(key, 0)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="review-comment">Comment (optional)</Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              placeholder="What went well? Anything other tradespeople should know?"
              aria-invalid={commentOver}
            />
            <p
              className={
                commentOver
                  ? 'text-xs text-danger'
                  : commentDanger
                    ? 'text-xs text-danger'
                    : 'text-xs text-fg-muted'
              }
            >
              {commentLength} / {COMMENT_MAX}
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              <p>{error.message}</p>
              {error.isProfile ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/profile">Go to profile</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

LeaveReviewSheet.displayName = 'LeaveReviewSheet';
