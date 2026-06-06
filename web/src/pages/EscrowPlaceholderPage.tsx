import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format';
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

const fmt = (s: string) => formatMoney(Number(s));

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
  const { t } = useTranslation('wallet');
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
      setError(parseApiError(err)?.message ?? t('escrow.loadError'));
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
            {t('escrow.backToCollab')}
          </Link>
        </Button>
        <p className="text-sm text-fg-muted">{t('escrow.loading')}</p>
      </div>
    );
  }

  if (error || !collab) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={backHref}>
            <ArrowLeft />
            {t('escrow.backToCollab')}
          </Link>
        </Button>
        <div role="alert" className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error || t('escrow.collabNotFound')}
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
            {t('escrow.back')}
          </Link>
        </Button>
        <EmptyState
          icon={Banknote}
          title={t('escrow.privateTitle')}
          description={t('escrow.privateDesc')}
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
          {t('escrow.backToCollab')}
        </Link>
      </Button>

      {fundedMilestoneId ? (
        <div role="status" className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          {t('escrow.fundingSubmitted')}
        </div>
      ) : null}

      {canceledMilestoneId ? (
        <div role="status" className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning">
          {t('escrow.checkoutCanceled')}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t('escrow.title')}</CardTitle>
              <CardDescription>{t('escrow.collabNumber', { id: String(collab.id) })}</CardDescription>
            </div>
            {escrow ? <Badge variant={STATUS_VARIANT[escrow.status]}>{escrow.status}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <Stat label={t('escrow.statFunded')} value={fmt(String(totalFunded))} />
          <Stat label={t('escrow.statReleased')} value={fmt(String(totalReleased))} />
          <Stat label={t('escrow.statRefunded')} value={fmt(String(totalRefunded))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('escrow.milestones')}</CardTitle>
          <CardDescription>{t('escrow.milestonesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!escrow ? (
            <EmptyState
              icon={Banknote}
              title={t('escrow.noEscrowTitle')}
              description={t('escrow.noEscrowDesc')}
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
            <p className="text-sm text-fg-muted">{t('escrow.noMilestones')}</p>
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
                  submitLabel={t('escrow.requestMilestone')}
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
            <CardTitle>{t('escrow.contractActions')}</CardTitle>
            <CardDescription>{t('escrow.contractActionsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndOpen(true)}
            >
              {t('escrow.endContract')}
            </Button>
            {isWorker ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeclineOpen(true)}
              >
                {t('escrow.declineContract')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {escrow && escrow.status === 'ACTIVE' && !everFunded ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('escrow.cancelBeforeFunding')}</CardTitle>
            <CardDescription>{t('escrow.cancelBeforeFundingDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(true)}
            >
              {t('escrow.cancelContract')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('escrow.cancelContract')}
        description={t('escrow.cancelDesc')}
        confirmLabel={t('escrow.cancelContract')}
        destructive
        placeholder={t('escrow.cancelPlaceholder')}
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
        title={t('escrow.declineContract')}
        description={t('escrow.declineDesc')}
        confirmLabel={t('escrow.declineConfirm')}
        destructive
        placeholder={t('escrow.declinePlaceholder')}
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
            <DialogTitle>{t('escrow.endContract')}</DialogTitle>
            <DialogDescription>{t('escrow.endDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              {t('escrow.cancel')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (!resolvedContractId)
                    throw new Error(t('escrow.noActiveContract'));
                  await initiateEndContract(resolvedContractId);
                  setEndOpen(false);
                  await reload();
                } catch (err) {
                  setError(parseApiError(err)?.message ?? t('escrow.endError'));
                  setEndOpen(false);
                }
              }}
            >
              {t('escrow.initiateEnd')}
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
