import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '@/api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { formatMoney, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import {
  endContract,
  respondToContract,
  type ContractRow,
} from '@/components/escrow';

type FullContract = ContractRow & {
  collaboration: {
    id: string;
    worker_id: string;
    employer_id: string;
    worker: { client_profile: { display_name: string } };
    employer: { client_profile: { display_name: string } };
    conversation?: { id: string } | null;
  };
};

const fmtGbp = (s: string | null | undefined) => {
  if (!s) return '—';
  const n = Number(s);
  return Number.isFinite(n) ? formatMoney(n) : '—';
};

const fmtDate = (s: string | null | undefined) => formatDate(s) || '—';

export default function ContractDetailPage() {
  const { t } = useTranslation('collaborations');
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { account } = useAccountMe();
  const [contract, setContract] = useState<FullContract | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState<
    'COMPLETED' | 'CANCELED' | 'ABANDONED'
  >('COMPLETED');
  const [endSubmitting, setEndSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!contractId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<FullContract>(`/contracts/${contractId}`);
      setContract(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('contractDetail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const myAccountId = account ? String(account.id) : null;
  const isWorker =
    contract != null &&
    myAccountId != null &&
    String(contract.collaboration.worker_id) === myAccountId;
  const isEmployer =
    contract != null &&
    myAccountId != null &&
    String(contract.collaboration.employer_id) === myAccountId;
  const isParty = isWorker || isEmployer;
  const isCounterparty =
    contract?.status === 'PROPOSED' &&
    ((contract.initiated_by === 'WORKER' && isEmployer) ||
      (contract.initiated_by === 'EMPLOYER' && isWorker));

  async function respond(accept: boolean) {
    if (!contract) return;
    try {
      await respondToContract(contract.id, accept);
      toast.success(accept ? t('contractDetail.accepted') : t('contractDetail.declined'));
      void load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('contractDetail.respondError'));
    }
  }

  async function submitEnd() {
    if (!contract) return;
    setEndSubmitting(true);
    try {
      await endContract(contract.id, endReason);
      toast.success(
        t('contractDetail.endedToast', {
          reason: t(`contractDetail.reasonWord.${endReason}`),
        }),
      );
      setEndOpen(false);
      void load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('contractDetail.endError'));
    } finally {
      setEndSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('contractDetail.back')}
        </button>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('contractDetail.title', { position: contract?.position ?? '…' })}
        </h1>
        <p className="text-sm text-fg-muted">
          {contract?.project_type ?? '—'}
          {contract?.site_postcode ? ` · ${contract.site_postcode}` : ''}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCw />
          {t('contractDetail.refresh')}
        </Button>
        {contract ? (
          <Button asChild variant="outline">
            <Link to={`/collaborations/${contract.collaboration.id}`}>
              {t('contractDetail.viewRelationship')}
            </Link>
          </Button>
        ) : null}
        {contract?.collaboration.conversation?.id ? (
          <Button asChild variant="outline">
            <Link
              to={`/inbox/${contract.collaboration.conversation.id}`}
            >
              <MessageCircle />
              {t('contractDetail.openChat')}
            </Link>
          </Button>
        ) : null}
        {contract && contract.status === 'ACTIVE' ? (
          <Button asChild>
            <Link to={`/contracts/${contract.id}/escrow`}>{t('contractDetail.openEscrow')}</Link>
          </Button>
        ) : null}
        {isCounterparty ? (
          <>
            <Button type="button" onClick={() => void respond(true)}>
              {t('contractDetail.accept')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void respond(false)}
            >
              {t('contractDetail.decline')}
            </Button>
          </>
        ) : null}
        {isParty &&
        contract &&
        ['DRAFT', 'PROPOSED', 'ACTIVE'].includes(contract.status) ? (
          <Dialog open={endOpen} onOpenChange={setEndOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="destructive">
                <X />
                {t('contractDetail.end')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('contractDetail.end')}</DialogTitle>
                <DialogDescription>{t('contractDetail.endDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Select
                  value={endReason}
                  onValueChange={(v) =>
                    setEndReason(v as 'COMPLETED' | 'CANCELED' | 'ABANDONED')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLETED">
                      {t('contractDetail.endOption.COMPLETED')}
                    </SelectItem>
                    <SelectItem value="CANCELED">
                      {t('contractDetail.endOption.CANCELED')}
                    </SelectItem>
                    <SelectItem value="ABANDONED">
                      {t('contractDetail.endOption.ABANDONED')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEndOpen(false)}
                  disabled={endSubmitting}
                >
                  {t('contractDetail.keepOpen')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void submitEnd()}
                  disabled={endSubmitting}
                >
                  {endSubmitting ? t('contractDetail.ending') : t('contractDetail.end')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('contractDetail.summary')}</CardTitle>
          <CardDescription>{t('contractDetail.summaryDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.status')}</dt>
              <dd>
                <Badge variant="info">{contract?.status ?? '—'}</Badge>
                {contract?.end_reason ? (
                  <span className="ml-2 text-xs text-fg-muted">
                    ({contract.end_reason})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.agreedAmount')}</dt>
              <dd className="font-semibold">{fmtGbp(contract?.agreed_amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.started')}</dt>
              <dd>{fmtDate(contract?.started_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.ended')}</dt>
              <dd>{fmtDate(contract?.ended_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.worker')}</dt>
              <dd>{contract?.collaboration.worker.client_profile.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('contractDetail.employer')}</dt>
              <dd>{contract?.collaboration.employer.client_profile.display_name}</dd>
            </div>
            {contract?.project_referrer_id ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-fg-muted">{t('contractDetail.projectReferrer')}</dt>
                <dd>
                  {contract.project_referrer_role === 'WORKER'
                    ? t('contractDetail.shareWorker')
                    : t('contractDetail.shareEmployer')}{' '}
                  · {t('contractDetail.account', { id: contract.project_referrer_id })}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-fg-muted">{t('contractDetail.loading')}</p> : null}
    </div>
  );
}
