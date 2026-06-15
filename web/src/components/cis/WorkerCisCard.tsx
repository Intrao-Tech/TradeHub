import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Info, Clock, XCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseApiError } from '../../api';
import {
  declareMyCis,
  submitCisDocument,
  getMyCis,
  DECLARABLE_CIS_STATUSES,
  CIS_RATE_BY_STATUS,
  type CisStatus,
  type WorkerCis,
} from './api';

const UTR_RE = /^\d{10}$/;
const NI_RE = /^[A-Z]{2}\d{6}[A-Z]$/;

/**
 * Worker CIS card — EVIDENCE-BASED. The worker declares their HMRC Construction
 * Industry Scheme status AND submits their UTR + NI number, which uploads an
 * HMRC CIS document into the staff verification queue. The declaration is
 * "self-declared / unverified" to employers until a staff reviewer approves the
 * document — only then does it show as verified.
 */
export function WorkerCisCard({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation('cis');
  const [data, setData] = useState<WorkerCis | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Exclude<CisStatus, 'NONE'>>('REGISTERED');
  const [utr, setUtr] = useState('');
  const [ni, setNi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const cis = await getMyCis();
      setData(cis);
      if (cis.status !== 'NONE') {
        setStatus(cis.status);
        if (cis.verification_number) setUtr(cis.verification_number);
      }
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('card.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError('');
    const utrTrim = utr.trim();
    const niNorm = ni.trim().toUpperCase().replace(/\s+/g, '');
    if (!UTR_RE.test(utrTrim)) {
      setError(t('card.utrError'));
      return;
    }
    // NI number is optional, but if the worker supplied one it must be valid.
    if (niNorm && !NI_RE.test(niNorm)) {
      setError(t('card.niError'));
      return;
    }
    setBusy(true);
    try {
      // 1) Submit the verifiable evidence (UTR required, NI optional) — lands
      //    in the staff queue.
      await submitCisDocument(utrTrim, niNorm || undefined);
      // 2) Record the declared status (provisional until the doc is approved).
      await declareMyCis({ status, verification_number: utrTrim });
      await load();
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('card.declareError'));
    } finally {
      setBusy(false);
    }
  }

  const notDeclared = !data || data.status === 'NONE';
  const docStatus = data?.document_status ?? 'NONE';

  return (
    <Card id="section-cis">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> {t('card.title')}
        </CardTitle>
        <CardDescription>{t('card.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-fg-muted">{t('card.loading')}</p>
        ) : (
          <>
            {/* Current standing */}
            {!notDeclared ? (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={data!.verified ? 'success' : 'warning'}>
                    {t(`status.${data!.status}`)}
                  </Badge>
                  <span className="text-fg-muted">
                    {t('card.rate', { rate: data!.rate ?? 0 })}
                  </span>
                  {data!.verification_number ? (
                    <span className="text-fg-muted">
                      · {t('card.utr', { number: data!.verification_number })}
                    </span>
                  ) : null}
                </div>
                {/* Verification state — the realistic picture employers see. */}
                {data!.verified ? (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <ShieldCheck className="h-3.5 w-3.5" /> {t('card.verified')}
                  </p>
                ) : docStatus === 'PENDING' ? (
                  <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Clock className="h-3.5 w-3.5" /> {t('card.docPending')}
                  </p>
                ) : docStatus === 'REJECTED' ? (
                  <p className="flex items-center gap-1.5 text-xs text-danger">
                    <XCircle className="h-3.5 w-3.5" /> {t('card.docRejected')}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-warning">
                    <Info className="h-3.5 w-3.5" /> {t('card.unverifiedNoDoc')}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-fg">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                <span>{t('card.notDeclared')}</span>
              </div>
            )}

            {/* Declaration + evidence form */}
            {editing ? (
              <div className="space-y-3 rounded-md border border-border-default bg-raised p-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cis-status">{t('card.statusLabel')}</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setStatus(v as Exclude<CisStatus, 'NONE'>)
                    }
                  >
                    <SelectTrigger id="cis-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DECLARABLE_CIS_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`status.${s}`)} — {CIS_RATE_BY_STATUS[s]}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-fg-muted">{t(`hint.${status}`)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cis-utr">{t('card.utrLabel')}</Label>
                  <Input
                    id="cis-utr"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder={t('card.utrPlaceholder')}
                    inputMode="numeric"
                    maxLength={10}
                    disabled={busy}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cis-ni">{t('card.niLabelOptional')}</Label>
                  <Input
                    id="cis-ni"
                    value={ni}
                    onChange={(e) => setNi(e.target.value)}
                    placeholder={t('card.niPlaceholder')}
                    maxLength={13}
                    disabled={busy}
                  />
                  <p className="text-xs text-fg-muted">{t('card.niOptionalHint')}</p>
                </div>
                <p className="text-xs text-fg-muted">{t('card.evidenceHint')}</p>
                {error ? (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" onClick={submit} disabled={busy}>
                    {busy ? t('card.saving') : t('card.submitForVerification')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setError('');
                    }}
                    disabled={busy}
                  >
                    {t('card.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                {notDeclared
                  ? t('card.declare')
                  : docStatus === 'REJECTED'
                    ? t('card.resubmit')
                    : t('card.update')}
              </Button>
            )}

            {error && !editing ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
