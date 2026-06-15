import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, Hammer } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '../hooks/useAccountMe';
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

/**
 * Dual-role: add the cabinet the account doesn't have yet (worker→+employer,
 * employer→+worker). One account, two cabinets — Upwork-style. Posts to
 * `POST /account/me/roles`, then drops the user straight into the new cabinet.
 */
export default function AddRolePage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { hasWorkerProfile, hasBothRoles, clientProfile, loading, refetch, setActiveRole } =
    useAccountMe();
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return null;
  // Staff (no client profile) or already dual-role → nothing to add here.
  if (!clientProfile || hasBothRoles) {
    return <Navigate to="/profile" replace />;
  }

  // The role we'd be ADDING is the one the account doesn't have.
  const roleToAdd: 'worker' | 'employer' = hasWorkerProfile ? 'employer' : 'worker';
  const addingEmployer = roleToAdd === 'employer';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/account/me/roles', {
        method: 'POST',
        body: JSON.stringify({
          role: roleToAdd.toUpperCase(),
          ...(addingEmployer && companyName.trim()
            ? { company_name: companyName.trim() }
            : {}),
        }),
      });
      await refetch();
      // Drop the user into the cabinet they just created.
      setActiveRole(roleToAdd);
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('addRole.error', { defaultValue: 'Could not add the role. Try again.' }));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {addingEmployer ? (
              <Briefcase className="h-6 w-6 text-primary" />
            ) : (
              <Hammer className="h-6 w-6 text-primary" />
            )}
            <CardTitle>
              {addingEmployer
                ? t('addRole.employerTitle', { defaultValue: 'Add an employer account' })
                : t('addRole.workerTitle', { defaultValue: 'Add a tradesperson account' })}
            </CardTitle>
          </div>
          <CardDescription>
            {addingEmployer
              ? t('addRole.employerDesc', {
                  defaultValue:
                    'Add an employer cabinet to your existing account. You keep one login, one wallet and one referral code — just switch cabinets from the account menu.',
                })
              : t('addRole.workerDesc', {
                  defaultValue:
                    'Add a tradesperson cabinet to your existing account. You keep one login, one wallet and one referral code — just switch cabinets from the account menu.',
                })}
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

          {addingEmployer ? (
            <div className="space-y-1.5">
              <Label htmlFor="company_name">
                {t('addRole.companyName', { defaultValue: 'Company name' })}{' '}
                <span className="text-fg-muted">
                  ({t('addRole.optional', { defaultValue: 'optional' })})
                </span>
              </Label>
              <Input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={200}
                placeholder={t('addRole.companyPlaceholder', {
                  defaultValue: 'e.g. Acme Builders Ltd',
                })}
                disabled={busy}
              />
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy
                ? t('addRole.adding', { defaultValue: 'Adding…' })
                : addingEmployer
                  ? t('addRole.confirmEmployer', { defaultValue: 'Add employer account' })
                  : t('addRole.confirmWorker', { defaultValue: 'Add tradesperson account' })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(-1)}
              disabled={busy}
            >
              {t('addRole.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
