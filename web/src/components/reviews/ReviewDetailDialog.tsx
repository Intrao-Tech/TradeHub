import { Link } from 'react-router-dom';
import { formatDate as formatDateLocale } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAccountMe } from '@/hooks/useAccountMe';
import { ReviewCard } from './ReviewCard';
import type { Review } from './api';

type ReviewDetailDialogProps = {
  review: Review | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value?: string | null): string | null {
  return formatDateLocale(value) || null;
}

export function ReviewDetailDialog({
  review,
  open,
  onOpenChange,
}: ReviewDetailDialogProps) {
  const { clientProfile, isStaff } = useAccountMe();
  const myClientProfileId =
    clientProfile?.id != null ? String(clientProfile.id) : null;

  const collab = review?.collaboration ?? null;
  const startDate = formatDate(collab?.started_at);
  const endDate = formatDate(collab?.ended_at);
  let dates: string | null = null;
  if (startDate && endDate) dates = `${startDate} – ${endDate}`;
  else if (startDate) dates = `Started ${startDate}`;
  else if (endDate) dates = `Ended ${endDate}`;

  const projectType = collab?.project_type ?? null;
  const titleParts = [projectType ?? 'Review', dates].filter(
    Boolean,
  ) as string[];

  const isAuthor =
    review != null &&
    myClientProfileId != null &&
    collab != null &&
    ((review.reviewer_role === 'WORKER' &&
      String(collab.worker_id) === myClientProfileId) ||
      (review.reviewer_role === 'EMPLOYER' &&
        String(collab.employer_id) === myClientProfileId));
  const isCounterparty =
    review != null &&
    myClientProfileId != null &&
    collab != null &&
    ((review.reviewer_role === 'WORKER' &&
      String(collab.employer_id) === myClientProfileId) ||
      (review.reviewer_role === 'EMPLOYER' &&
        String(collab.worker_id) === myClientProfileId));
  const canSeeCollabLink = isAuthor || isCounterparty || isStaff;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {titleParts.join(' · ')}
          </DialogTitle>
        </DialogHeader>

        {review ? (
          <div className="space-y-4">
            {!review.is_published ? (
              <div
                role="status"
                className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
              >
                This review is not public yet — pending staff review.
              </div>
            ) : null}

            <ReviewCard review={review} />

            {canSeeCollabLink && collab?.id != null ? (
              <Button asChild variant="link" size="sm" className="px-0">
                <Link to={`/collaborations/${collab.id}`}>
                  View collaboration #{String(collab.id)}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

ReviewDetailDialog.displayName = 'ReviewDetailDialog';
