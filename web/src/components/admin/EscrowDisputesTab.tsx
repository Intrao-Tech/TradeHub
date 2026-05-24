import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ScaleIcon,
  Send,
  XCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '../EmptyState';
import {
  escalateDispute,
  getDisputeProposals,
  listOpenDisputes,
  proposeResolution,
  type DisputeProposal,
  type DisputeProposalView,
} from '../escrow';
import { parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';

type Dispute = {
  id: string | number;
  milestone_id: string | number;
  filed_by_role: 'WORKER' | 'EMPLOYER';
  reason: string;
  status: string;
  response?: string | null;
  created_at?: string;
  milestone?: {
    id: string | number;
    title: string;
    amount: string;
    contract?: {
      collaboration?: {
        id: string | number;
        worker?: { client_profile?: { display_name?: string } };
        employer?: { client_profile?: { display_name?: string } };
      };
    };
  };
};

function decisionBadge(d: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
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

function statusVariant(s: string): 'warning' | 'success' | 'secondary' | 'danger' {
  if (s === 'RESOLVED') return 'success';
  if (s === 'ARBITRATION_PENDING') return 'danger';
  if (s === 'MEDIATION') return 'warning';
  return 'secondary';
}

export function EscrowDisputesTab() {
  const { hasPermission } = useAccountMe();
  const canPropose = hasPermission('disputes.propose');
  const canEscalate = hasPermission('disputes.escalate');

  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState('');
  const [proposalsByDispute, setProposalsByDispute] = useState<
    Record<string, DisputeProposalView | null>
  >({});

  const reload = useCallback(async () => {
    setError('');
    try {
      const list = (await listOpenDisputes()) as Dispute[];
      setDisputes(list);
      // Load proposal state for each dispute (parallel)
      const entries = await Promise.all(
        list.map(async (d) => {
          try {
            const view = await getDisputeProposals(d.id);
            return [String(d.id), view] as const;
          } catch {
            return [String(d.id), null] as const;
          }
        }),
      );
      setProposalsByDispute(Object.fromEntries(entries));
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Failed to load disputes');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScaleIcon className="h-4 w-4 text-fg-muted" />
          <CardTitle>Escrow disputes</CardTitle>
        </div>
        <CardDescription>
          Mediator queue. Propose a worker/employer split — both parties must
          Accept before money moves. If they can't agree, escalate to
          arbitration (handled out-of-platform).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}
        {disputes == null ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : disputes.length === 0 ? (
          <EmptyState
            icon={ScaleIcon}
            title="No open disputes"
            description="Nothing in the mediator queue right now."
          />
        ) : (
          disputes.map((d) => (
            <DisputeCard
              key={String(d.id)}
              dispute={d}
              view={proposalsByDispute[String(d.id)] ?? null}
              canPropose={canPropose}
              canEscalate={canEscalate}
              onChanged={() => void reload()}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DisputeCard({
  dispute: d,
  view,
  canPropose,
  canEscalate,
  onChanged,
}: {
  dispute: Dispute;
  view: DisputeProposalView | null;
  canPropose: boolean;
  canEscalate: boolean;
  onChanged: () => void;
}) {
  const [proposeOpen, setProposeOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');

  const [workerPct, setWorkerPct] = useState(50);
  const [keepFee, setKeepFee] = useState(true);
  const [reasoning, setReasoning] = useState('');
  const [escalateReason, setEscalateReason] = useState('');

  const status = view?.dispute_status ?? d.status;
  const current = view?.current ?? null;
  const history = view?.history ?? [];

  async function submitProposal() {
    if (reasoning.trim().length < 30) {
      setActionErr('Reasoning must be at least 30 characters.');
      return;
    }
    setActionErr('');
    setBusy(true);
    try {
      await proposeResolution(d.id, {
        worker_pct: workerPct,
        employer_refund_pct: 100 - workerPct,
        keep_platform_fee: keepFee,
        reasoning: reasoning.trim(),
      });
      setProposeOpen(false);
      setReasoning('');
      onChanged();
    } catch (err) {
      setActionErr(parseApiError(err)?.message ?? 'Propose failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitEscalate() {
    if (escalateReason.trim().length < 10) {
      setActionErr('Reason must be at least 10 characters.');
      return;
    }
    setActionErr('');
    setBusy(true);
    try {
      await escalateDispute(d.id, escalateReason.trim());
      setEscalateOpen(false);
      setEscalateReason('');
      onChanged();
    } catch (err) {
      setActionErr(parseApiError(err)?.message ?? 'Escalate failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border-default bg-raised p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(status)}>{status}</Badge>
        <span className="font-medium">
          Milestone "{d.milestone?.title}" — £{d.milestone?.amount}
        </span>
        <span className="text-xs text-fg-muted">
          Collab #{String(d.milestone?.contract?.collaboration?.id)}
        </span>
      </div>
      <div className="text-sm text-fg-muted">
        <strong>Worker:</strong>{' '}
        {d.milestone?.contract?.collaboration?.worker?.client_profile?.display_name}
        {' · '}
        <strong>Employer:</strong>{' '}
        {d.milestone?.contract?.collaboration?.employer?.client_profile?.display_name}
      </div>
      <div className="text-sm">
        <strong>
          Filed by{' '}
          {d.filed_by_role === 'WORKER'
            ? (d.milestone?.contract?.collaboration?.worker?.client_profile
                ?.display_name ?? 'worker')
            : (d.milestone?.contract?.collaboration?.employer?.client_profile
                ?.display_name ?? 'employer')}
          :
        </strong>{' '}
        {d.reason}
      </div>
      {d.response ? (
        <div className="text-sm text-fg-muted">
          <strong>Counterparty response:</strong> {d.response}
        </div>
      ) : null}

      {/* Active proposal */}
      {current ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Active proposal by {current.proposed_by.display_name}
            </div>
            <Badge variant="warning">{current.status}</Badge>
          </div>
          <div className="text-xs grid gap-1 sm:grid-cols-3">
            <div>
              <span className="text-fg-muted">Worker share:</span>{' '}
              <span className="font-medium">{current.worker_pct}%</span>
            </div>
            <div>
              <span className="text-fg-muted">Employer refund:</span>{' '}
              <span className="font-medium">{current.employer_refund_pct}%</span>
            </div>
            <div>
              <span className="text-fg-muted">Platform fee:</span>{' '}
              <span className="font-medium">
                {current.keep_platform_fee ? 'kept' : 'refunded'}
              </span>
            </div>
          </div>
          <p className="text-xs whitespace-pre-wrap">{current.reasoning}</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">Worker:</span>
            {decisionBadge(current.worker_decision)}
            <span className="text-fg-muted">· Employer:</span>
            {decisionBadge(current.employer_decision)}
          </div>
          {current.worker_decision_note ? (
            <p className="text-xs text-fg-muted">
              Worker note: {current.worker_decision_note}
            </p>
          ) : null}
          {current.employer_decision_note ? (
            <p className="text-xs text-fg-muted">
              Employer note: {current.employer_decision_note}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* History */}
      {history.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-muted">
            Show {history.length} past proposal{history.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-2 space-y-2">
            {history.map((h) => (
              <PastProposal key={h.id} p={h} />
            ))}
          </div>
        </details>
      ) : null}

      {/* Actions */}
      {status === 'RESOLVED' || status === 'ARBITRATION_PENDING' ? (
        <div className="text-xs text-fg-muted">
          Dispute closed ({status.toLowerCase()}). No further action.
        </div>
      ) : (
        <div className="space-y-2">
          {actionErr ? (
            <div role="alert" className="text-xs text-danger">
              {actionErr}
            </div>
          ) : null}

          {proposeOpen ? (
            <div className="space-y-2 rounded border border-border-subtle p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Worker share %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={workerPct}
                    onChange={(e) => setWorkerPct(Number(e.target.value))}
                  />
                  <p className="text-xs text-fg-muted">
                    Employer refund: {100 - workerPct}%
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Platform keeps fee?</Label>
                  <select
                    value={keepFee ? 'yes' : 'no'}
                    onChange={(e) => setKeepFee(e.target.value === 'yes')}
                    className="block w-full h-9 rounded-md border border-border-default bg-raised px-3 text-sm"
                  >
                    <option value="yes">Yes (default)</option>
                    <option value="no">No (refund platform fee too)</option>
                  </select>
                </div>
              </div>
              <Label>Reasoning (≥30 chars, shown to both parties)</Label>
              <Textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                rows={3}
                placeholder="e.g. Worker delivered 60% of agreed scope per chat evidence; employer's complaints about quality not substantiated by submitted artifacts."
              />
              <div className="flex gap-2">
                <Button onClick={() => void submitProposal()} disabled={busy}>
                  <Send className="h-3.5 w-3.5" />
                  {busy ? 'Sending…' : current ? 'Replace proposal' : 'Send proposal'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProposeOpen(false);
                    setReasoning('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : escalateOpen ? (
            <div className="space-y-2 rounded border border-danger/40 bg-danger-subtle/30 p-3">
              <Label>Why escalate?</Label>
              <Textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                rows={3}
                placeholder="e.g. Worker rejected two proposals; positions still ~30 pp apart; cannot mediate further."
              />
              <p className="text-xs text-fg-muted">
                This locks the dispute as <code>ARBITRATION_PENDING</code> —
                in-platform mediation ends, parties get a notification,
                arbitration is handled out-of-platform.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => void submitEscalate()}
                  disabled={busy}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {busy ? 'Escalating…' : 'Escalate to arbitration'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEscalateOpen(false);
                    setEscalateReason('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canPropose ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setProposeOpen(true);
                    setEscalateOpen(false);
                    setActionErr('');
                  }}
                >
                  {current ? 'Replace proposal' : 'Propose resolution'}
                </Button>
              ) : null}
              {canEscalate ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEscalateOpen(true);
                    setProposeOpen(false);
                    setActionErr('');
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Escalate
                </Button>
              ) : null}
              {!canPropose && !canEscalate ? (
                <p className="text-xs text-fg-muted">
                  You don't have <code>disputes.propose</code> or{' '}
                  <code>disputes.escalate</code> — view only.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PastProposal({ p }: { p: DisputeProposal }) {
  return (
    <div className="rounded border border-border-subtle p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {p.worker_pct}% / {p.employer_refund_pct}% by{' '}
          {p.proposed_by.display_name}
        </span>
        <Badge
          variant={
            p.status === 'EXECUTED'
              ? 'success'
              : p.status === 'REJECTED'
                ? 'danger'
                : 'secondary'
          }
        >
          {p.status}
        </Badge>
      </div>
      <div className="text-fg-muted">
        Worker: {p.worker_decision} · Employer: {p.employer_decision} ·{' '}
        {new Date(p.proposed_at).toLocaleString()}
      </div>
      <div className="text-fg whitespace-pre-wrap">{p.reasoning}</div>
    </div>
  );
}
