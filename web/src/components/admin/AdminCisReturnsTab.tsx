import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  getCisGlobalMode,
  setCisGlobalMode,
  listCisReturns,
  buildCisReturn,
  submitCisReturn,
  remitCisReturn,
  adminConfirmWorkerCis,
  cisTaxMonthLabel,
  CIS_RATE_BY_STATUS,
  DECLARABLE_CIS_STATUSES,
  type CisReturn,
  type CisStatus,
} from '../cis/api';

const STATUS_VARIANT: Record<
  CisReturn['status'],
  'secondary' | 'info' | 'success' | 'danger' | 'warning'
> = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  ACCEPTED: 'info',
  REJECTED: 'danger',
  PAID: 'success',
};

/** Current UK CIS tax month/year (tax year runs 6 Apr → 5 Apr; month 1 = Apr). */
function currentTaxPeriod(): { year: number; month: number } {
  const now = new Date();
  // Use UTC to match the backend's cisTaxMonth() (which stamps/aggregates in
  // UTC) — otherwise the prefilled period can drift by one near the 6th.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const day = now.getUTCDate();
  // The CIS month boundary is the 6th; before the 6th we're still in the
  // previous tax month.
  let monthIndex = m; // calendar month
  if (day < 6) monthIndex -= 1;
  // Convert calendar month → tax month (April=1).
  let taxMonth = monthIndex - 3;
  let taxYear = y;
  if (taxMonth <= 0) {
    taxMonth += 12;
    taxYear -= 1;
  }
  return { year: taxYear, month: taxMonth };
}

export function AdminCisReturnsTab() {
  const { t } = useTranslation('cis');
  const [mode, setMode] = useState<'ASSIST' | 'MANAGED' | null>(null);
  const [returns, setReturns] = useState<CisReturn[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const period = currentTaxPeriod();
  const [taxYear, setTaxYear] = useState(String(period.year));
  const [taxMonth, setTaxMonth] = useState(String(period.month));

  // Worker confirm form
  const [workerId, setWorkerId] = useState('');
  const [confirmStatus, setConfirmStatus] =
    useState<Exclude<CisStatus, 'NONE'>>('REGISTERED');
  const [confirmUtr, setConfirmUtr] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  async function load() {
    setError('');
    try {
      const [m, r] = await Promise.all([getCisGlobalMode(), listCisReturns()]);
      setMode(m.mode);
      setReturns(r);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.loadError'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flipMode(next: 'ASSIST' | 'MANAGED') {
    setError('');
    setBusy(true);
    try {
      const res = await setCisGlobalMode(next);
      setMode(res.mode);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.modeError'));
    } finally {
      setBusy(false);
    }
  }

  async function build() {
    setError('');
    // Guard empty/invalid inputs — Number('') is 0, which would send a
    // nonsensical {tax_year:0, tax_month:0} and surface a raw validation error.
    const y = Number(taxYear);
    const mo = Number(taxMonth);
    if (
      taxYear.trim() === '' ||
      taxMonth.trim() === '' ||
      !Number.isInteger(y) ||
      !Number.isInteger(mo) ||
      y < 2000 ||
      mo < 1 ||
      mo > 12
    ) {
      setError(t('admin.invalidPeriod'));
      return;
    }
    setBusy(true);
    try {
      await buildCisReturn(y, mo);
      await load();
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.buildError'));
    } finally {
      setBusy(false);
    }
  }

  async function doSubmit(id: string) {
    setBusy(true);
    setError('');
    try {
      await submitCisReturn(id);
      await load();
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.submitError'));
    } finally {
      setBusy(false);
    }
  }

  async function doRemit(id: string) {
    setBusy(true);
    setError('');
    try {
      await remitCisReturn(id);
      await load();
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.remitError'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmWorker() {
    setConfirmMsg('');
    setError('');
    if (!workerId.trim()) return;
    setBusy(true);
    try {
      await adminConfirmWorkerCis(workerId.trim(), {
        status: confirmStatus,
        verification_number: confirmUtr.trim() || undefined,
      });
      setConfirmMsg(t('admin.confirmOk', { id: workerId.trim() }));
      setWorkerId('');
      setConfirmUtr('');
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('admin.confirmError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* V1 ↔ V2 master switch */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.modeTitle')}</CardTitle>
          <CardDescription>{t('admin.modeDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant={mode === 'MANAGED' ? 'info' : 'secondary'}>
              {mode ? t(`mode.${mode}`) : '…'}
            </Badge>
            <span className="text-sm text-fg-muted">
              {mode === 'MANAGED'
                ? t('admin.modeManagedHint')
                : t('admin.modeAssistHint')}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'ASSIST' ? 'primary' : 'outline'}
              size="sm"
              disabled={busy || mode === 'ASSIST'}
              onClick={() => flipMode('ASSIST')}
            >
              {t('admin.useAssist')}
            </Button>
            <Button
              type="button"
              variant={mode === 'MANAGED' ? 'primary' : 'outline'}
              size="sm"
              disabled={busy || mode === 'MANAGED'}
              onClick={() => flipMode('MANAGED')}
            >
              {t('admin.useManaged')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff: confirm a worker's CIS standing */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.confirmTitle')}</CardTitle>
          <CardDescription>{t('admin.confirmDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cis-worker-id">{t('admin.workerId')}</Label>
              <Input
                id="cis-worker-id"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                placeholder="123"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cis-confirm-status">{t('admin.status')}</Label>
              <Select
                value={confirmStatus}
                onValueChange={(v) =>
                  setConfirmStatus(v as Exclude<CisStatus, 'NONE'>)
                }
              >
                <SelectTrigger id="cis-confirm-status">
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
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cis-confirm-utr">{t('admin.utr')}</Label>
              <Input
                id="cis-confirm-utr"
                value={confirmUtr}
                onChange={(e) => setConfirmUtr(e.target.value)}
                placeholder={t('admin.utrPlaceholder')}
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={confirmWorker} disabled={busy}>
              {t('admin.confirmBtn')}
            </Button>
            {confirmMsg ? (
              <span className="text-sm text-success">{confirmMsg}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* V2: monthly CIS300 returns (MOCKED) */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.returnsTitle')}</CardTitle>
          <CardDescription>{t('admin.returnsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cis-tax-year">{t('admin.taxYear')}</Label>
              <Input
                id="cis-tax-year"
                type="number"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                className="w-28"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cis-tax-month">{t('admin.taxMonth')}</Label>
              <Input
                id="cis-tax-month"
                type="number"
                min={1}
                max={12}
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value)}
                className="w-24"
                disabled={busy}
              />
            </div>
            <Button type="button" onClick={build} disabled={busy}>
              {t('admin.buildBtn')}
            </Button>
          </div>

          {returns.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('admin.noReturns')}</p>
          ) : (
            <div className="space-y-3">
              {returns.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-border-default p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">
                      {cisTaxMonthLabel(r.tax_year, r.tax_month)}
                    </span>
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {t(`returnStatus.${r.status}`)}
                    </Badge>
                    {r.is_nil_return ? (
                      <Badge variant="secondary">{t('admin.nil')}</Badge>
                    ) : null}
                    {r.is_mocked ? (
                      <Badge variant="warning">{t('admin.mocked')}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-fg-muted">
                    {t('admin.totalDeducted', { amount: r.total_deducted })} ·{' '}
                    {t('admin.totalPaid', { amount: r.total_paid })} ·{' '}
                    {t('admin.subCount', { count: r.lines.length })}
                  </div>
                  {r.hmrc_irmark ? (
                    <div className="mt-1 text-xs text-fg-muted">
                      IRmark: {r.hmrc_irmark}
                      {r.remittance_ref ? ` · ${r.remittance_ref}` : ''}
                    </div>
                  ) : null}

                  {r.lines.length > 0 ? (
                    <table className="mt-2 w-full text-xs">
                      <thead className="text-fg-muted">
                        <tr className="text-left">
                          <th className="py-1">{t('admin.lineSub')}</th>
                          <th className="py-1">{t('admin.lineGross')}</th>
                          <th className="py-1">{t('admin.lineMaterials')}</th>
                          <th className="py-1">{t('admin.lineRate')}</th>
                          <th className="py-1">{t('admin.lineDeducted')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l) => (
                          <tr key={l.id} className="border-t border-border-default">
                            <td className="py-1">
                              #{l.subcontractor_client_profile_id}
                              {l.verification_number
                                ? ` (${l.verification_number})`
                                : ''}
                            </td>
                            <td className="py-1">£{l.gross_paid}</td>
                            <td className="py-1">£{l.cost_of_materials}</td>
                            <td className="py-1">{l.cis_rate}%</td>
                            <td className="py-1">£{l.amount_deducted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    {r.status === 'DRAFT' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => doSubmit(r.id)}
                        disabled={busy}
                      >
                        {t('admin.submitBtn')}
                      </Button>
                    ) : null}
                    {r.status === 'ACCEPTED' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => doRemit(r.id)}
                        disabled={busy}
                      >
                        {t('admin.remitBtn')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
