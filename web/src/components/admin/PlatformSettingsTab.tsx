import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from '../escrow';
import { parseApiError } from '../../api';

export function PlatformSettingsTab() {
  const { t } = useTranslation('admin');
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [clientFee, setClientFee] = useState('');
  const [freelancerFee, setFreelancerFee] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [windowMonths, setWindowMonths] = useState<string>('');
  const [lifetimeWindow, setLifetimeWindow] = useState(false);
  const [w2wPct, setW2wPct] = useState('');
  const [e2ePct, setE2ePct] = useState('');
  const [passthrough, setPassthrough] = useState<
    'EMPLOYER_PAYS' | 'PLATFORM_ABSORBS' | 'WORKER_ABSORBS'
  >('EMPLOYER_PAYS');

  async function load() {
    setError('');
    try {
      const res = await getPlatformSettings();
      setSettings(res);
      setClientFee(res.client_marketplace_fee_percent);
      setFreelancerFee(res.freelancer_service_fee_percent);
      setAccountRef(res.account_referral_pct);
      if (res.account_referral_window_months == null) {
        setLifetimeWindow(true);
        setWindowMonths('');
      } else {
        setLifetimeWindow(false);
        setWindowMonths(String(res.account_referral_window_months));
      }
      setW2wPct(res.project_referral_w2w_pct);
      setE2ePct(res.project_referral_e2e_pct);
      setPassthrough(res.stripe_fee_passthrough);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('settings.loadError'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function save() {
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const res = await updatePlatformSettings({
        client_marketplace_fee_percent: Number(clientFee),
        freelancer_service_fee_percent: Number(freelancerFee),
        account_referral_pct: Number(accountRef),
        account_referral_window_months: lifetimeWindow
          ? null
          : Number(windowMonths),
        project_referral_w2w_pct: Number(w2wPct),
        project_referral_e2e_pct: Number(e2ePct),
        stripe_fee_passthrough: passthrough,
      });
      setSettings(res);
      setSaved(true);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-fg-muted">{t('settings.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.feesTitle')}</CardTitle>
          <CardDescription>{t('settings.feesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div role="alert" className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div role="status" className="rounded-md border border-success/40 bg-success-subtle px-3 py-2 text-sm text-success">
              {t('settings.saved')}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-fee">{t('settings.clientFee')}</Label>
              <Input
                id="client-fee"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={clientFee}
                onChange={(e) => setClientFee(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-fg-muted">{t('settings.clientFeeHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="freelancer-fee">{t('settings.freelancerFee')}</Label>
              <Input
                id="freelancer-fee"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={freelancerFee}
                onChange={(e) => setFreelancerFee(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-fg-muted">{t('settings.freelancerFeeHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="passthrough">{t('settings.passthrough')}</Label>
              <select
                id="passthrough"
                value={passthrough}
                onChange={(e) =>
                  setPassthrough(e.target.value as typeof passthrough)
                }
                disabled={saving}
                className="h-9 w-full rounded-md border border-border-default bg-raised px-3 text-sm"
              >
                <option value="EMPLOYER_PAYS">{t('settings.passthroughEmployer')}</option>
                <option value="PLATFORM_ABSORBS">{t('settings.passthroughPlatform')}</option>
                <option value="WORKER_ABSORBS">{t('settings.passthroughWorker')}</option>
              </select>
              <p className="text-xs text-fg-muted">{t('settings.passthroughHint')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.referralTitle')}</CardTitle>
          <CardDescription>{t('settings.referralDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-ref">{t('settings.accountRef')}</Label>
              <Input
                id="account-ref"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={accountRef}
                onChange={(e) => setAccountRef(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-fg-muted">{t('settings.accountRefHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-window">
                {t('settings.accountWindow')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="account-window"
                  type="number"
                  min="1"
                  max="240"
                  value={windowMonths}
                  onChange={(e) => setWindowMonths(e.target.value)}
                  disabled={saving || lifetimeWindow}
                  placeholder={lifetimeWindow ? t('settings.lifetimePlaceholder') : '12'}
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={lifetimeWindow}
                    onChange={(e) => setLifetimeWindow(e.target.checked)}
                    disabled={saving}
                  />
                  {t('settings.lifetime')}
                </label>
              </div>
              <p className="text-xs text-fg-muted">{t('settings.accountWindowHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="w2w-ref">{t('settings.w2wRef')}</Label>
              <Input
                id="w2w-ref"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={w2wPct}
                onChange={(e) => setW2wPct(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-fg-muted">{t('settings.w2wRefHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e2e-ref">{t('settings.e2eRef')}</Label>
              <Input
                id="e2e-ref"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={e2ePct}
                onChange={(e) => setE2ePct(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-fg-muted">{t('settings.e2eRefHint')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? t('settings.saving') : t('settings.saveAll')}
      </Button>
    </div>
  );
}
