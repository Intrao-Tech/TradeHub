import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  approveMilestone,
  approveMilestoneRequest,
  declineMilestoneRequest,
  deleteMilestone,
  deleteMilestoneAttachment,
  fileDispute,
  fundMilestone,
  refundMilestone,
  retryRelease,
  submitMilestone,
  updateMilestone,
  uploadMilestoneAttachment,
  type Milestone,
  type MilestoneAttachment,
} from './api';
import { DisputeProposalView } from './DisputeProposalView';
import { parseApiError } from '../../api';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:8081/api';
const ATTACHMENT_HOST = API_BASE.replace(/\/api\/?$/, '');

const MAX_PER_PHASE = 3;
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

type MilestoneRowProps = {
  milestone: Milestone;
  isEmployer: boolean;
  isWorker: boolean;
  hasReferral: boolean;
  /**
   * True when another milestone on the same contract is currently in flight
   * (FUNDED / SUBMITTED / DISPUTED / RELEASE_FAILED). Lockstep funding (Q11)
   * means this milestone can't be funded until the in-flight one resolves.
   */
  fundLocked?: boolean;
  /** Title of the in-flight milestone, surfaced in the lock copy. */
  fundLockReason?: string | null;
  onChanged: () => void;
};

const STATUS_VARIANT: Record<
  Milestone['status'],
  'outline' | 'info' | 'warning' | 'success' | 'danger'
> = {
  REQUESTED: 'warning',
  PENDING: 'outline',
  FUNDED: 'info',
  SUBMITTED: 'warning',
  RELEASED: 'success',
  DISPUTED: 'danger',
  REFUNDED: 'outline',
  CANCELED: 'outline',
  DECLINED: 'danger',
  RELEASE_FAILED: 'danger',
};

const STATUS_LABEL: Record<Milestone['status'], string> = {
  REQUESTED: 'Awaiting employer approval',
  PENDING: 'Not funded',
  FUNDED: 'In escrow',
  SUBMITTED: 'Awaiting review',
  RELEASED: 'Released',
  DISPUTED: 'Disputed',
  REFUNDED: 'Refunded',
  CANCELED: 'Canceled',
  DECLINED: 'Declined by employer',
  RELEASE_FAILED: 'Payout failed',
};

const fmt = (s: string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(s));

export function MilestoneRow({
  milestone,
  isEmployer,
  isWorker,
  hasReferral: _hasReferral,
  fundLocked = false,
  fundLockReason = null,
  onChanged,
}: MilestoneRowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [amount, setAmount] = useState(milestone.amount);
  const [description, setDescription] = useState(milestone.description ?? '');
  const [submitMsg, setSubmitMsg] = useState('');
  const [submittingMilestone, setSubmittingMilestone] = useState(false);
  const [refundMode, setRefundMode] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [disputeMode, setDisputeMode] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<'CREATION' | 'SUBMISSION' | null>(
    null,
  );
  const creationFileRef = useRef<HTMLInputElement | null>(null);
  const submissionFileRef = useRef<HTMLInputElement | null>(null);

  const isRequested = milestone.status === 'REQUESTED';
  const isPending = milestone.status === 'PENDING';
  const isFunded = milestone.status === 'FUNDED';
  const isSubmitted = milestone.status === 'SUBMITTED';
  const isReleaseFailed = milestone.status === 'RELEASE_FAILED';

  const isCreator =
    (milestone.created_by_role === 'WORKER' && isWorker) ||
    (milestone.created_by_role === 'EMPLOYER' && isEmployer);
  // Editing/deleting:
  // - PENDING is employer-created: only employer-creator can edit.
  // - REQUESTED is worker-created: only worker-creator can edit. Employer
  //   uses approve/decline buttons instead.
  const editable = isCreator && (isPending || isRequested);

  const attachments = milestone.attachments ?? [];
  const creationAttachments = attachments.filter((a) => a.phase === 'CREATION');
  const submissionAttachments = attachments.filter(
    (a) => a.phase === 'SUBMISSION',
  );
  const canAddCreationAttachment =
    isCreator &&
    (isRequested || isPending) &&
    creationAttachments.length < MAX_PER_PHASE;
  const canAddSubmissionAttachment =
    isWorker &&
    (isFunded || isSubmitted) &&
    submissionAttachments.length < MAX_PER_PHASE;

  const reviewDeadline =
    milestone.worker_submitted_at && isSubmitted
      ? daysLeft(milestone.worker_submitted_at, 7)
      : null;

  async function saveEdit() {
    setError('');
    setBusy(true);
    try {
      await updateMilestone(milestone.id, {
        title: title.trim(),
        amount: amount.trim(),
        description: description.trim() || null,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete milestone "${milestone.title}"? This can't be undone.`)) return;
    setError('');
    setBusy(true);
    try {
      await deleteMilestone(milestone.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Delete failed');
      setBusy(false);
    }
  }

  async function fund() {
    setError('');
    setBusy(true);
    try {
      const res = await fundMilestone(milestone.id);
      if (res.worker_onboarding_pending) {
        const ok = confirm(
          "Worker hasn't completed payout setup yet. Funds will sit in escrow until they do — they'll be notified by email. " +
          'You can refund anytime before they submit work.\n\n' +
          'Continue to checkout?',
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      if (res.checkout_url) window.location.href = res.checkout_url;
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not start checkout');
      setBusy(false);
    }
  }

  async function doSubmit() {
    setError('');
    setBusy(true);
    try {
      await submitMilestone(milestone.id, submitMsg.trim() || undefined);
      setSubmittingMilestone(false);
      setSubmitMsg('');
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  async function doApprove() {
    if (!confirm(`Approve milestone "${milestone.title}" and release funds?`)) return;
    setError('');
    setBusy(true);
    try {
      await approveMilestone(milestone.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function doApproveRequest() {
    setError('');
    setBusy(true);
    try {
      await approveMilestoneRequest(milestone.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function doDeclineRequest() {
    if (!confirm(`Decline milestone request "${milestone.title}"? The worker can re-request with different terms.`)) return;
    setError('');
    setBusy(true);
    try {
      await declineMilestoneRequest(milestone.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Decline failed');
    } finally {
      setBusy(false);
    }
  }

  async function doRetry() {
    setError('');
    setBusy(true);
    try {
      await retryRelease(milestone.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Retry failed');
    } finally {
      setBusy(false);
    }
  }

  async function doRefund() {
    setError('');
    if (refundReason.trim().length < 10) {
      setError('Refund reason must be at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      await refundMilestone(milestone.id, refundReason.trim());
      setRefundMode(false);
      setRefundReason('');
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Refund failed');
    } finally {
      setBusy(false);
    }
  }

  async function doDispute() {
    setError('');
    if (disputeReason.trim().length < 10) {
      setError('Dispute reason must be at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      await fileDispute(milestone.id, disputeReason.trim());
      setDisputeMode(false);
      setDisputeReason('');
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Dispute failed');
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachment(
    e: ChangeEvent<HTMLInputElement>,
    phase: 'CREATION' | 'SUBMISSION',
  ) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (list.length === 0) return;
    setError('');
    setUploading(phase);
    try {
      for (const f of list) {
        if (!ALLOWED_MIME.includes(f.type)) {
          setError(`${f.name}: only PDF, JPEG, PNG, WebP allowed.`);
          continue;
        }
        if (f.size > 25 * 1024 * 1024) {
          setError(`${f.name}: max 25 MB.`);
          continue;
        }
        await uploadMilestoneAttachment(milestone.id, f, phase);
      }
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function removeAttachment(att: MilestoneAttachment) {
    if (!confirm(`Remove "${att.original_name}"?`)) return;
    setError('');
    setBusy(true);
    try {
      await deleteMilestoneAttachment(att.id);
      onChanged();
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border-default bg-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Milestone title"
                disabled={busy}
              />
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                step="0.01"
                min="5"
                placeholder="Amount"
                disabled={busy}
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                maxLength={2000}
                disabled={busy}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveEdit} disabled={busy}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setTitle(milestone.title);
                    setAmount(milestone.amount);
                    setDescription(milestone.description ?? '');
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-muted">#{milestone.position}</span>
                <span className="font-medium text-fg">{milestone.title}</span>
                {isWorker &&
                milestone.status === 'RELEASED' &&
                milestone.worker_payout_on_hold ? (
                  <Badge variant="warning">Held — connect Stripe to receive</Badge>
                ) : (
                  <Badge variant={STATUS_VARIANT[milestone.status]}>
                    {STATUS_LABEL[milestone.status]}
                  </Badge>
                )}
                {isRequested && milestone.created_by_role === 'WORKER' ? (
                  <span className="text-xs text-fg-muted">
                    (worker-requested)
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-fg-muted">
                {fmt(milestone.amount)}
                {milestone.released_at ? (
                  <span className="ml-2 text-xs">
                    Released {new Date(milestone.released_at).toLocaleDateString()}
                  </span>
                ) : null}
                {milestone.refunded_at ? (
                  <span className="ml-2 text-xs">
                    Refunded {new Date(milestone.refunded_at).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {!editing ? (
          <div className="flex flex-shrink-0 items-start gap-2">
            {editable ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Edit"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={remove}
                  disabled={busy}
                >
                  <Trash2 />
                </Button>
              </>
            ) : null}
            {isRequested && isEmployer ? (
              <>
                <Button
                  type="button"
                  onClick={doApproveRequest}
                  disabled={busy}
                >
                  {busy ? 'Approving…' : 'Approve'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={doDeclineRequest}
                  disabled={busy}
                >
                  Decline
                </Button>
              </>
            ) : null}
            {isPending && isEmployer ? (
              <Button
                type="button"
                onClick={fund}
                disabled={busy || fundLocked}
                title={fundLocked && fundLockReason ? `Release "${fundLockReason}" first` : undefined}
              >
                {busy ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Starting…
                  </span>
                ) : fundLocked ? (
                  'Locked'
                ) : (
                  'Fund'
                )}
              </Button>
            ) : null}
            {isFunded && isWorker ? (
              <Button
                type="button"
                onClick={() => setSubmittingMilestone(true)}
                disabled={busy}
              >
                Submit work
              </Button>
            ) : null}
            {isSubmitted && isEmployer ? (
              <Button type="button" onClick={doApprove} disabled={busy}>
                {busy ? 'Approving…' : 'Approve & release'}
              </Button>
            ) : null}
            {isReleaseFailed && isWorker ? (
              <Button type="button" onClick={doRetry} disabled={busy}>
                {busy ? 'Retrying…' : 'Retry payout'}
              </Button>
            ) : null}
            {isFunded && isEmployer ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundMode(true)}
                disabled={busy}
              >
                Refund
              </Button>
            ) : null}
            {(isFunded || isSubmitted) && (isWorker || isEmployer) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisputeMode(true)}
                disabled={busy}
              >
                Dispute
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!editing && milestone.description ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">
          {milestone.description}
        </p>
      ) : null}

      {isWorker &&
      milestone.status === 'RELEASED' &&
      milestone.worker_payout_on_hold ? (
        <div className="mt-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning">
          The employer released {fmt(milestone.amount)}, but we couldn't pay it
          out yet — your Stripe payout account isn't connected. Funds are held
          on the platform and will sweep to you the moment you finish setup.{' '}
          <Link to="/payments" className="font-medium underline">
            Connect Stripe in Payments →
          </Link>
        </div>
      ) : null}

      {creationAttachments.length > 0 || canAddCreationAttachment ? (
        <AttachmentSection
          heading="Attachments"
          attachments={creationAttachments}
          canRemove={isCreator}
          onRemove={removeAttachment}
          fileInputRef={creationFileRef}
          onPick={(e) => uploadAttachment(e, 'CREATION')}
          canAdd={canAddCreationAttachment}
          uploading={uploading === 'CREATION'}
          remaining={MAX_PER_PHASE - creationAttachments.length}
          busy={busy}
        />
      ) : null}

      {submissionAttachments.length > 0 || canAddSubmissionAttachment ? (
        <AttachmentSection
          heading="Submission files"
          attachments={submissionAttachments}
          canRemove={isWorker}
          onRemove={removeAttachment}
          fileInputRef={submissionFileRef}
          onPick={(e) => uploadAttachment(e, 'SUBMISSION')}
          canAdd={canAddSubmissionAttachment}
          uploading={uploading === 'SUBMISSION'}
          remaining={MAX_PER_PHASE - submissionAttachments.length}
          busy={busy}
        />
      ) : null}

      {isSubmitted && reviewDeadline !== null ? (
        <div className="mt-2 text-xs text-fg-muted">
          {reviewDeadline > 0
            ? `${reviewDeadline} day${reviewDeadline === 1 ? '' : 's'} left for employer review (auto-releases after).`
            : 'Auto-release window has passed — release will fire on the next sweep.'}
          {milestone.submission_message ? (
            <div className="mt-1 italic">"{milestone.submission_message}"</div>
          ) : null}
        </div>
      ) : null}

      {submittingMilestone ? (
        <div className="mt-3 space-y-2">
          <Input
            value={submitMsg}
            onChange={(e) => setSubmitMsg(e.target.value)}
            placeholder="Optional message to employer (e.g. 'Photos in chat')"
            maxLength={2000}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={doSubmit} disabled={busy}>
              {busy ? 'Submitting…' : 'Confirm submit'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSubmittingMilestone(false);
                setSubmitMsg('');
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {isReleaseFailed ? (
        <div className="mt-2 text-xs text-danger">
          Last payout attempt failed. Worker should fix their Stripe Connect
          account at /payments, then click Retry.
        </div>
      ) : null}

      {fundLocked && isPending && isEmployer ? (
        <div className="mt-2 text-xs text-fg-muted">
          🔒 Locked — release{' '}
          {fundLockReason ? <em>"{fundLockReason}"</em> : 'the in-flight milestone'}{' '}
          before funding this one. Only one milestone can be in flight at a time.
        </div>
      ) : null}

      {refundMode ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            placeholder="Reason for refund (visible to worker)"
            rows={2}
            maxLength={500}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" onClick={doRefund} disabled={busy}>
              {busy ? 'Refunding…' : 'Confirm refund'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRefundMode(false); setRefundReason(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {disputeMode ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Why are you disputing? (≥10 characters, visible to other party + moderator)"
            rows={3}
            maxLength={2000}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" onClick={doDispute} disabled={busy}>
              {busy ? 'Filing…' : 'File dispute'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setDisputeMode(false); setDisputeReason(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      {/* When in dispute, show the active mediator proposal and let the
          party Accept/Reject. Filer can also cancel an OPEN dispute. */}
      {milestone.status === 'DISPUTED' && milestone.dispute?.id ? (
        <DisputeProposalView
          disputeId={milestone.dispute.id}
          myRole={isWorker ? 'WORKER' : isEmployer ? 'EMPLOYER' : null}
          filedByRole={milestone.dispute.filed_by_role}
          onCanceled={onChanged}
        />
      ) : null}
    </div>
  );
}

type AttachmentSectionProps = {
  heading: string;
  attachments: MilestoneAttachment[];
  // The uploader is no longer stored — it is derived (SUBMISSION → worker;
  // CREATION → the milestone creator). The parent passes whether the current
  // user is that party.
  canRemove: boolean;
  onRemove: (att: MilestoneAttachment) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  canAdd: boolean;
  uploading: boolean;
  remaining: number;
  busy: boolean;
};

function AttachmentSection({
  heading,
  attachments,
  canRemove,
  onRemove,
  fileInputRef,
  onPick,
  canAdd,
  uploading,
  remaining,
  busy,
}: AttachmentSectionProps) {
  return (
    <div className="mt-3 space-y-1">
      <div className="text-xs font-medium text-fg-muted">{heading}</div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const isMine = canRemove;
          return (
            <a
              key={String(att.id)}
              href={`${ATTACHMENT_HOST}${att.file_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-md border border-border-default bg-subtle px-2 py-1 text-xs hover:border-fg-muted"
              title={att.original_name}
            >
              <FileIcon mime={att.mime_type} />
              <span className="max-w-[180px] truncate">{att.original_name}</span>
              <span className="text-fg-muted">{formatSize(att.size_bytes)}</span>
              {isMine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(att);
                  }}
                  disabled={busy}
                  className="ml-1 hover:text-danger"
                  aria-label={`Remove ${att.original_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </a>
          );
        })}
        {canAdd ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_MIME.join(',')}
              className="hidden"
              onChange={onPick}
              disabled={busy || uploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="h-3 w-3" /> Add file ({remaining} left)
                </>
              )}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) {
    return <ImageIcon className="h-3 w-3 shrink-0 text-fg-muted" />;
  }
  if (mime === 'application/pdf') {
    return <FileText className="h-3 w-3 shrink-0 text-fg-muted" />;
  }
  return <Paperclip className="h-3 w-3 shrink-0 text-fg-muted" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function daysLeft(submittedAt: string, windowDays: number): number {
  const submitted = new Date(submittedAt).getTime();
  const deadline = submitted + windowDays * 24 * 60 * 60 * 1000;
  const ms = deadline - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
