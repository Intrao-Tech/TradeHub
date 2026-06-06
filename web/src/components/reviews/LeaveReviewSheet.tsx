import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { parseApiError } from '@/api';
import { formatRelative } from '@/lib/relative-time';
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

// Labels reuse the read-side review keys in the `common` namespace.
// `as const` keeps the keys as literals so the typed t() can check them.
const SUB_RATINGS = [
  { key: 'quality_rating', labelKey: 'common:review.quality' },
  { key: 'reliability_rating', labelKey: 'common:review.reliability' },
  { key: 'communication_rating', labelKey: 'common:review.communication' },
  { key: 'payment_rating', labelKey: 'common:review.payment' },
  { key: 'safety_rating', labelKey: 'common:review.safety' },
] as const satisfies ReadonlyArray<{ key: SubRatingKey; labelKey: string }>;

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
  const { t } = useTranslation(['collaborations', 'common']);
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
      toast.success(t('leaveReview.submittedToast'));
      onSubmitted?.(review);
      onOpenChange(false);
    } catch (err) {
      const parsed = parseApiError(err);
      const status = parsed?.status ?? 0;
      const message = parsed?.message ?? t('leaveReview.submitError');
      const lower = message.toLowerCase();

      if (status === 400 && lower.includes('no client profile')) {
        setError({
          kind: 'inline',
          message: t('leaveReview.completeProfileFirst'),
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
        toast.warning(t('leaveReview.notEligibleToast'));
        onOpenChange(false);
        return;
      }
      if (status === 400 && lower.includes('already exists')) {
        clearDraft();
        toast.info(t('leaveReview.alreadyExistsToast'));
        onOpenChange(false);
        return;
      }
      if (status === 403 && lower.includes('not a participant')) {
        clearDraft();
        toast.error(t('leaveReview.notParticipantToast'));
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
          <SheetTitle>{t('leaveReview.title')}</SheetTitle>
          <SheetDescription>{t('leaveReview.description')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {restoredAt != null ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
            >
              <span>
                {t('leaveReview.draftRestored', {
                  time: formatRelative(new Date(restoredAt), t),
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardDraft}
              >
                {t('leaveReview.discardDraft')}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5">
            <Label>{t('leaveReview.overallLabel')}</Label>
            <div className="flex items-center gap-3">
              <StarRating
                value={overall}
                onChange={setOverall}
                size="lg"
                label={t('leaveReview.overallAria')}
              />
              <span className="text-sm text-fg-muted">
                {overall === 0
                  ? t('leaveReview.notPicked')
                  : t('leaveReview.outOfFive', { value: overall })}
              </span>
            </div>
            <p className="text-xs text-fg-muted">{t('leaveReview.starsHint')}</p>
          </div>

          <details className="rounded-md border border-border-default p-3">
            <summary className="cursor-pointer text-sm font-medium text-fg">
              {t('leaveReview.detailedSummary')}
            </summary>
            <div className="mt-3 space-y-3">
              {SUB_RATINGS.map(({ key, labelKey }) => {
                const value = subs[key];
                const label = t(labelKey);
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
                          {t('leaveReview.clear')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="review-comment">{t('leaveReview.commentLabel')}</Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              placeholder={t('leaveReview.commentPlaceholder')}
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
                    <Link to="/profile">{t('leaveReview.goToProfile')}</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    {t('leaveReview.cancel')}
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
              {t('leaveReview.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? t('leaveReview.submitting') : t('leaveReview.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

LeaveReviewSheet.displayName = 'LeaveReviewSheet';
