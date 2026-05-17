import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AddMilestoneForm,
  MilestoneRow,
  ReasonDialog,
  type Escrow,
  type Milestone,
  listMilestones,
  getEscrowByCollaboration,
  getEscrowByContract,
  cancelEscrow,
  declineContract,
  initiateEndContract,
} from '../components/escrow';

const STATUS_VARIANT: Record<
  Escrow['status'],
  'outline' | 'info' | 'warning' | 'success' | 'danger'
> = {
  DRAFT: 'outline',
  PROPOSED: 'warning',
  ACTIVE: 'info',
  ENDED: 'success',
};

type CollabSummary = {
  id: string | number;
  worker_id: string | number;
  employer_id: string | number;
};

type ContractSummary = {
  id: string | number;
  status: string;
  collaboration_id: string | number;
  collaboration: CollabSummary;
};

const fmt = (s: string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(s));

export default function EscrowDetailPage() {
  // Two routes share this component:
  //   • Legacy `/escrow/:id`               — :id is collaboration_id
  //   • New     `/contracts/:contractId/escrow` — :contractId is contract_id
  // We branch on which param is present and resolve to a single contract
  // either way (the back-compat collab path picks the latest active one).
  const params = useParams<{ id?: string; contractId?: string }>();
  const collabIdParam = params.id ?? null;
  const contractIdParam = params.contractId ?? null;

  const [searchParams] = useSearchParams();
  const fundedMilestoneId = searchParams.get('funded');
  const canceledMilestoneId = searchParams.get('canceled');
  const { clientProfile } = useAccountMe();
  const myClientProfileId = clientProfile?.id != null ? String(clientProfile.id) : null;
  const [collab, setCollab] = useState<CollabSummary | null>(null);
  const [resolvedContractId, setResolvedContractId] = useState<string | null>(
    null,
  );
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const isEmployer = !!collab && myClientProfileId === String(collab.employer_id);
  const isWorker = !!collab && myClientProfileId === String(collab.worker_id);
  const isParticipant = isEmployer || isWorker;

  const reload = useCallback(async () => {
    if (!collabIdParam && !contractIdParam) return;
    setError('');
    try {
      let escrowRes: Escrow | null;
      if (contractIdParam) {
        // New route: load the contract first to get collaboration context.
        const contractRes = await api<ContractSummary>(
          `/contracts/${contractIdParam}`,
        );
        setCollab(contractRes.collaboration);
        setResolvedContractId(String(contractRes.id));
        escrowRes = await getEscrowByContract(contractRes.id);
      } else {
        // Back-compat route: load collab + resolve via collab→latest-contract.
        const collabRes = await api<CollabSummary>(
          `/collaborations/${collabIdParam}`,
        );
        setCollab(collabRes);
        escrowRes = await getEscrowByCollaboration(collabIdParam!);
        setResolvedContractId(
          escrowRes ? String(escrowRes.contract_id) : null,
        );
      }
      setEscrow(escrowRes);
      if (escrowRes) {
        const ms = await listMilestones(escrowRes.contract_id);
        setMilestones(ms);
      } else {
        setMilestones([]);
      }
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not load escrow.');
    } finally {
      setLoading(false);
    }
  }, [collabIdParam, contractIdParam]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Poll briefly after Stripe redirect to catch the webhook update
  useEffect(() => {
    if (!fundedMilestoneId) return;
    const isStillPending = milestones?.some(
      (m) => String(m.id) === fundedMilestoneId && m.status === 'PENDING',
    );
    if (!isStillPending) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [fundedMilestoneId, milestones, reload]);

  const backHref = contractIdParam
    ? `/contracts/${contractIdParam}`
    : collabIdParam
      ? `/collaborations/${collabIdParam}`
      : '/collaborations';

  if (loading) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={backHref}>
            <ArrowLeft />
            Back to collaboration
          </Link>
        </Button>
        <p className="text-sm text-fg-muted">Loading escrow…</p>
      </div>
    );
  }

  if (error || !collab) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={backHref}>
            <ArrowLeft />
            Back to collaboration
          </Link>
        </Button>
        <div role="alert" className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error || 'Collaboration not found.'}
        </div>
      </div>
    );
  }

  if (!isParticipant) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={backHref}>
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <EmptyState
          icon={Banknote}
          title="Escrow is private"
          description="Only the worker and employer parties can view the escrow surface for this collaboration."
        />
      </div>
    );
  }

  const totalFunded =
    milestones?.filter((m) =>
      ['FUNDED', 'SUBMITTED', 'RELEASED', 'DISPUTED', 'RELEASE_FAILED'].includes(m.status),
    ).reduce((sum, m) => sum + Number(m.amount), 0) ?? 0;
  const totalReleased =
    milestones?.filter((m) => m.status === 'RELEASED').reduce((sum, m) => sum + Number(m.amount), 0) ?? 0;
  const totalRefunded =
    milestones?.filter((m) => m.status === 'REFUNDED').reduce((sum, m) => sum + Number(m.amount), 0) ?? 0;
  // Once any milestone has been funded the contract can only be ended /
  // disputed — not cancelled. Drives which contract-action card shows.
  const everFunded =
    milestones?.some((m) =>
      ['FUNDED', 'SUBMITTED', 'RELEASED', 'DISPUTED', 'REFUNDED', 'RELEASE_FAILED'].includes(
        m.status,
      ),
    ) ?? false;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={backHref}>
          <ArrowLeft />
          Back to collaboration
        </Link>
      </Button>

      {fundedMilestoneId ? (
        <div role="status" className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          Funding submitted — waiting for Stripe confirmation. Status updates as soon as the webhook lands (usually a few seconds).
        </div>
      ) : null}

      {canceledMilestoneId ? (
        <div role="status" className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning">
          Checkout canceled. The milestone is still available to fund.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Escrow</CardTitle>
              <CardDescription>Collaboration #{String(collab.id)}</CardDescription>
            </div>
            {escrow ? <Badge variant={STATUS_VARIANT[escrow.status]}>{escrow.status}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <Stat label="Funded" value={fmt(String(totalFunded))} />
          <Stat label="Released" value={fmt(String(totalReleased))} />
          <Stat label="Refunded" value={fmt(String(totalRefunded))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
          <CardDescription>
            Add as many milestones as needed. Each one is funded, submitted, and approved
            independently. Only one milestone can be in flight at a time (Upwork pattern).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!escrow ? (
            <EmptyState
              icon={Banknote}
              title="No escrow created yet"
              description="An escrow contract is automatically created when the collaboration is confirmed."
            />
          ) : milestones && milestones.length > 0 ? (
            (() => {
              // Lockstep funding (Q11): two rules combined.
              // 1) Only one in-flight milestone at a time (FUNDED/SUBMITTED/
              //    DISPUTED/RELEASE_FAILED). All other PENDING milestones lock.
              // 2) Among PENDING milestones, only the LOWEST-position one is
              //    fundable. Sequential funding — Upwork pattern.
              const inFlight = milestones.find((m) =>
                ['FUNDED', 'SUBMITTED', 'DISPUTED', 'RELEASE_FAILED'].includes(m.status),
              );
              const firstPending = [...milestones]
                .filter((m) => m.status === 'PENDING')
                .sort((a, b) => a.position - b.position)[0];
              return milestones.map((m) => {
                let locked = false;
                let lockReason: string | null = null;
                if (m.status === 'PENDING') {
                  if (inFlight) {
                    locked = true;
                    lockReason = inFlight.title;
                  } else if (firstPending && firstPending.id !== m.id) {
                    locked = true;
                    lockReason = firstPending.title;
                  }
                }
                return (
                  <MilestoneRow
                    key={String(m.id)}
                    milestone={m}
                    isEmployer={isEmployer}
                    isWorker={isWorker}
                    hasReferral={false}
                    fundLocked={locked}
                    fundLockReason={lockReason}
                    onChanged={reload}
                  />
                );
              });
            })()
          ) : (
            <p className="text-sm text-fg-muted">No milestones yet.</p>
          )}
          {escrow && escrow.status !== 'ENDED' ? (
            <div className="pt-2">
              {isEmployer ? (
                <AddMilestoneForm
                  contractId={escrow.contract_id}
                  onAdded={reload}
                />
              ) : isWorker ? (
                <AddMilestoneForm
                  contractId={escrow.contract_id}
                  submitLabel="Request milestone"
                  onAdded={reload}
                />
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {escrow && escrow.status === 'ACTIVE' && everFunded ? (
        <Card>
          <CardHeader>
            <CardTitle>Contract actions</CardTitle>
            <CardDescription>
              Wrap up or back out of this contract once work has started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndOpen(true)}
            >
              End contract
            </Button>
            {isWorker ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeclineOpen(true)}
              >
                Decline contract
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {escrow && escrow.status === 'ACTIVE' && !everFunded ? (
        <Card>
          <CardHeader>
            <CardTitle>Cancel before funding</CardTitle>
            <CardDescription>
              No milestones funded yet. Either party can cancel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(true)}
            >
              Cancel contract
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel contract"
        description="No milestones have been funded yet. This is reversible only by creating a new collaboration."
        confirmLabel="Cancel contract"
        destructive
        placeholder="Why are you canceling? (Both parties + audit log will see this.)"
        onConfirm={async (reason) => {
          if (resolvedContractId) {
            await cancelEscrow(resolvedContractId, reason);
            await reload();
          }
        }}
      />

      <ReasonDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline contract"
        description="As the worker, declining will refund all funded milestones to the employer and cancel the collaboration. No reviews window opens."
        confirmLabel="Decline + refund"
        destructive
        placeholder="Why are you declining the contract?"
        onConfirm={async (reason) => {
          if (resolvedContractId) {
            await declineContract(resolvedContractId, reason);
            await reload();
          }
        }}
      />

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End contract</DialogTitle>
            <DialogDescription>
              Other party will have 7 days to contest. If silent, the contract
              auto-completes, the collab status moves to COMPLETED, and the
              review window opens.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (!resolvedContractId)
                    throw new Error('No active contract to end');
                  await initiateEndContract(resolvedContractId);
                  setEndOpen(false);
                  await reload();
                } catch (err) {
                  setError(parseApiError(err)?.message ?? 'Could not end');
                  setEndOpen(false);
                }
              }}
            >
              Initiate end
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}
