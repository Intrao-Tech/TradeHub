import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, ScaleIcon, Undo2, XCircle } from 'lucide-react';
import { parseApiError } from '../../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  cancelDispute,
  decideProposal,
  getDisputeProposals,
  type DisputeProposalView,
} from './api';

/**
 * Client-side view of the mediator's proposal for a dispute.
 * Embedded in MilestoneRow when status=DISPUTED.
 *
 * - Shows the active proposal (worker share, refund, fee handling, reasoning).
 * - Lets the matching party (worker or employer) Accept or Reject.
 * - When BOTH parties have accepted, the backend auto-executes the split
 *   and the milestone transitions to RELEASED.
 * - On Reject, the proposal closes; staff will either send a new one or
 *   escalate the dispute to arbitration.
 */
type Props = {
  disputeId: string | number;
  /** Caller's role on the contract — controls which Accept/Reject buttons fire. */
  myRole: 'WORKER' | 'EMPLOYER' | null;
  /** Role that filed the dispute — used to gate the Cancel button. */
  filedByRole?: 'WORKER' | 'EMPLOYER';
  /** Called after a successful cancel so the parent can refetch milestones. */
  onCanceled?: () => void;
};

export function DisputeProposalView({
  disputeId,
  myRole,
  filedByRole,
  onCanceled,
}: Props) {
  const [view, setView] = useState<DisputeProposalView | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [actionErr, setActionErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await getDisputeProposals(disputeId);
      setView(data);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? 'Failed to load proposal');
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelMine() {
    if (
      !confirm(
        'Cancel this dispute? The milestone will go back to its previous state and the other party will be notified.',
      )
    ) {
      return;
    }
    setActionErr('');
    setBusy(true);
    try {
      await cancelDispute(disputeId);
      onCanceled?.();
    } catch (e) {
      setActionErr(parseApiError(e)?.message ?? 'Failed to cancel dispute');
    } finally {
      setBusy(false);
    }
  }

  async function decide(verdict: 'ACCEPT' | 'REJECT') {
    if (!view?.current) return;
    setActionErr('');
    setBusy(true);
    try {
      const updated = await decideProposal(
        disputeId,
        view.current.id,
        verdict,
        note.trim() || undefined,
      );
      setView(updated);
      setNote('');
      setNoteOpen(false);
    } catch (e) {
      setActionErr(parseApiError(e)?.message ?? 'Failed to record decision');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="text-xs text-fg-muted mt-2">Loading proposal…</p>
    );
  }
  if (err) {
    return (
      <div className="mt-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger">
        {err}
      </div>
    );
  }
  if (!view) return null;

  // Escalated → terminal
  if (view.dispute_status === 'ARBITRATION_PENDING') {
    return (
      <div className="mt-3 rounded-md border border-danger/40 bg-danger-subtle/30 p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-danger">
          <ScaleIcon className="h-4 w-4" />
          Dispute escalated to arbitration
        </div>
        <p className="text-xs text-fg-muted">
          In-platform mediation has ended. Our team will be in touch by email
          about next steps.
        </p>
      </div>
    );
  }

  if (!view.current) {
    const iAmFiler = !!myRole && !!filedByRole && myRole === filedByRole;
    // Filer can pull back the dispute ONLY while still OPEN (before the
    // counter-party has responded or staff has stepped in). Once status moves
    // past OPEN, cancel is no longer allowed.
    const canCancel = iAmFiler && view.dispute_status === 'OPEN';
    return (
      <div className="mt-3 rounded-md border border-border-subtle bg-subtle/40 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-3.5 w-3.5 text-fg-muted" />
          <span className="font-medium">Awaiting mediator</span>
        </div>
        <p className="text-xs text-fg-muted">
          A staff mediator will propose a worker/employer split. You'll see it
          here and can Accept or Reject.
        </p>
        {canCancel ? (
          <div className="pt-1 space-y-1">
            {actionErr ? (
              <p className="text-xs text-danger">{actionErr}</p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void cancelMine()}
            >
              <Undo2 className="h-3.5 w-3.5" />
              {busy ? 'Cancelling…' : 'Cancel this dispute'}
            </Button>
            <p className="text-[11px] text-fg-muted">
              Filed by mistake? You can pull it back as long as no one has
              responded yet. The milestone returns to its previous state.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const p = view.current;
  const myDecision = myRole === 'WORKER' ? p.worker_decision : p.employer_decision;
  const otherDecision =
    myRole === 'WORKER' ? p.employer_decision : p.worker_decision;
  const canDecide =
    !!myRole && myDecision === 'PENDING' && p.status === 'PENDING_RESPONSE';

  return (
    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScaleIcon className="h-4 w-4 text-primary" />
          Mediator proposal
        </div>
        <Badge variant="warning">{p.status}</Badge>
      </div>
      <div className="grid gap-1 sm:grid-cols-3 text-xs">
        <div>
          <span className="text-fg-muted">Worker share:</span>{' '}
          <span className="font-semibold">{p.worker_pct}%</span>
        </div>
        <div>
          <span className="text-fg-muted">Employer refund:</span>{' '}
          <span className="font-semibold">{p.employer_refund_pct}%</span>
        </div>
        <div>
          <span className="text-fg-muted">Platform fee:</span>{' '}
          <span className="font-semibold">
            {p.keep_platform_fee ? 'kept' : 'refunded'}
          </span>
        </div>
      </div>
      <div className="text-xs">
        <span className="text-fg-muted">From {p.proposed_by.display_name}:</span>
        <p className="mt-1 whitespace-pre-wrap text-fg">{p.reasoning}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {myRole ? (
          <>
            <span className="text-fg-muted">You:</span>
            <DecisionBadge d={myDecision} />
            <span className="text-fg-muted">· Other party:</span>
            <DecisionBadge d={otherDecision} />
          </>
        ) : (
          <>
            <span className="text-fg-muted">Worker:</span>
            <DecisionBadge d={p.worker_decision} />
            <span className="text-fg-muted">· Employer:</span>
            <DecisionBadge d={p.employer_decision} />
          </>
        )}
      </div>
      {p.worker_decision_note ? (
        <p className="text-xs text-fg-muted">
          Worker note: {p.worker_decision_note}
        </p>
      ) : null}
      {p.employer_decision_note ? (
        <p className="text-xs text-fg-muted">
          Employer note: {p.employer_decision_note}
        </p>
      ) : null}

      {canDecide ? (
        <div className="space-y-2 pt-1">
          {noteOpen ? (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (shown to the other party + mediator)"
              rows={2}
              className="text-sm"
            />
          ) : null}
          {actionErr ? (
            <p className="text-xs text-danger">{actionErr}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void decide('ACCEPT')}
              disabled={busy}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void decide('REJECT')}
              disabled={busy}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNoteOpen((v) => !v)}
            >
              {noteOpen ? 'Hide note' : 'Add note'}
            </Button>
          </div>
        </div>
      ) : myRole ? (
        <p className="text-xs text-fg-muted pt-1">
          {myDecision !== 'PENDING'
            ? `You ${myDecision.toLowerCase()} this proposal — waiting on the other party.`
            : 'Awaiting your decision.'}
        </p>
      ) : null}
    </div>
  );
}

function DecisionBadge({ d }: { d: 'PENDING' | 'ACCEPTED' | 'REJECTED' }) {
  if (d === 'ACCEPTED')
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Accepted
      </Badge>
    );
  if (d === 'REJECTED')
    return (
      <Badge variant="danger">
        <XCircle className="h-3 w-3" />
        Rejected
      </Badge>
    );
  return (
    <Badge variant="outline">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}
