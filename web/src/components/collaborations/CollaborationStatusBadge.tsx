import { Badge } from '@/components/ui/badge';

/**
 * COLLAB-010 / COLLAB-020 — collaboration status pill. Uses the same
 * subtle-variant mapping rule established by Profiles (PROF-030) and
 * reused by Jobs.
 */

export type CollaborationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'DISPUTED';

const LABEL: Record<CollaborationStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  DISPUTED: 'Disputed',
};

const VARIANT: Record<
  CollaborationStatus,
  'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'outline'
> = {
  PENDING: 'warning',
  CONFIRMED: 'secondary',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  REJECTED: 'danger',
  DISPUTED: 'danger',
};

export function CollaborationStatusBadge({ status }: { status?: string | null }) {
  const upper = (status ?? '').toUpperCase() as CollaborationStatus;
  if (upper in LABEL) {
    return <Badge variant={VARIANT[upper]}>{LABEL[upper]}</Badge>;
  }
  return <Badge variant="outline">{status ?? 'Unknown'}</Badge>;
}
CollaborationStatusBadge.displayName = 'CollaborationStatusBadge';
