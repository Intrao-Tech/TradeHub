import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getMilestoneCisBreakdown,
  getMilestonePds,
  type MilestoneCisBreakdown,
  type CisPds,
} from './api';

/** Milestone statuses for which a CIS breakdown is worth fetching/showing. */
const CIS_RELEVANT_STATUSES = new Set([
  'PENDING',
  'FUNDED',
  'SUBMITTED',
  'RELEASED',
  'RELEASE_FAILED',
  'DISPUTED',
]);

/**
 * Inline CIS deduction breakdown for a milestone, shown to either party once
 * the milestone is fundable/funded. Renders nothing when CIS doesn't apply.
 * Offers a PDS (Payment & Deduction Statement) view for the contractor/sub.
 */
export function MilestoneCisInfo({
  milestoneId,
  status,
}: {
  milestoneId: string | number;
  status: string;
}) {
  const { t } = useTranslation('cis');
  const [bd, setBd] = useState<MilestoneCisBreakdown | null>(null);
  const [pds, setPds] = useState<CisPds | null>(null);
  const [pdsOpen, setPdsOpen] = useState(false);
  const [pdsBusy, setPdsBusy] = useState(false);

  useEffect(() => {
    // Clear any stale breakdown when the milestone leaves a CIS-relevant
    // status (e.g. refunded/canceled) — the component instance is reused.
    if (!CIS_RELEVANT_STATUSES.has(status)) {
      setBd(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const data = await getMilestoneCisBreakdown(milestoneId);
        if (alive) setBd(data);
      } catch {
        /* CIS is best-effort context; ignore lookup failures in the row */
      }
    })();
    return () => {
      alive = false;
    };
  }, [milestoneId, status]);

  async function openPds() {
    setPdsBusy(true);
    try {
      const data = await getMilestonePds(milestoneId);
      setPds(data);
      setPdsOpen(true);
    } catch {
      /* swallow — the inline breakdown already conveys the figures */
    } finally {
      setPdsBusy(false);
    }
  }

  if (!bd || !bd.applies) return null;

  return (
    <div className="mt-2 rounded-md border border-border-default bg-subtle px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Landmark className="h-3.5 w-3.5 text-fg-muted" />
        <span className="font-medium text-fg">{t('breakdown.title')}</span>
        <Badge variant={bd.mode === 'MANAGED' ? 'info' : 'secondary'}>
          {t(`mode.${bd.mode}`)}
        </Badge>
        <Badge variant={bd.verified ? 'success' : 'warning'}>
          {bd.verified ? t('breakdown.verified') : t('breakdown.selfDeclared')}
        </Badge>
        <span className="text-fg-muted">{t('breakdown.rate', { rate: bd.rate })}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-fg-muted sm:grid-cols-4">
        <div>
          <dt className="text-[11px]">{t('breakdown.labour')}</dt>
          <dd className="text-fg">£{bd.labour}</dd>
        </div>
        <div>
          <dt className="text-[11px]">{t('breakdown.materials')}</dt>
          <dd className="text-fg">£{bd.materials}</dd>
        </div>
        <div>
          <dt className="text-[11px]">{t('breakdown.deduction')}</dt>
          <dd className="text-danger">−£{bd.deduction}</dd>
        </div>
        <div>
          <dt className="text-[11px]">{t('breakdown.netToWorker')}</dt>
          <dd className="text-fg">£{bd.net_to_worker}</dd>
        </div>
      </dl>
      {bd.worker_receives != null ? (
        <p className="mt-2 flex items-center justify-between rounded-md bg-success-subtle px-2 py-1 text-[11px] text-fg">
          <span className="font-medium">{t('breakdown.workerReceives')}</span>
          <span className="font-semibold text-success">
            £{bd.worker_receives}
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-fg-muted">
        {bd.mode === 'MANAGED'
          ? t('breakdown.managedNote')
          : t('breakdown.assistNote')}
      </p>
      {/* The PDS is the final statement — only meaningful once the milestone is
          released (materials declared at submission, CIS finalised at release).
          Before that the figures above are an estimate. */}
      <div className="mt-2">
        {status === 'RELEASED' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openPds}
            disabled={pdsBusy}
          >
            <FileText className="h-3.5 w-3.5" />{' '}
            {pdsBusy ? t('breakdown.loadingPds') : t('breakdown.viewPds')}
          </Button>
        ) : (
          <p className="text-[11px] italic text-fg-muted">
            {t('breakdown.pdsAfterRelease')}
          </p>
        )}
      </div>

      <Dialog open={pdsOpen} onOpenChange={setPdsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pds.title')}</DialogTitle>
            <DialogDescription>{t('pds.desc')}</DialogDescription>
          </DialogHeader>
          {pds ? (
            <dl className="space-y-2 text-sm">
              <Row label={t('pds.grossPaid')} value={`£${pds.gross_paid}`} />
              <Row
                label={t('pds.costOfMaterials')}
                value={`£${pds.cost_of_materials}`}
              />
              <Row
                label={t('pds.amountDeducted')}
                value={`−£${pds.amount_deducted}`}
              />
              <Row label={t('pds.netPaid')} value={`£${pds.net_paid}`} />
              <Row label={t('pds.cisRate')} value={`${pds.cis_rate}%`} />
              <Row
                label={t('pds.verificationNumber')}
                value={pds.verification_number ?? '—'}
              />
            </dl>
          ) : null}
          <p className="text-xs text-fg-muted">{t('pds.footnote')}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-default pb-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  );
}
