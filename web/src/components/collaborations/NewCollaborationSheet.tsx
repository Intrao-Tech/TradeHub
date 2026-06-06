import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '@/api';
import { POSTCODE_OUTWARD_REGEX } from '@/lib/london-boroughs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

/**
 * COLLAB-030 / COLLAB-031 / COLLAB-032 / COLLAB-033 — role-aware
 * create-collaboration sheet. The user's *acting role* selects which
 * counterparty field is shown; the backend rejects passing both
 * (`collaboration.controller.ts:51-55`).
 */

export type NewCollaborationRole = 'WORKER' | 'EMPLOYER';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether the user is acting as a worker or employer for this submission.
   * Determines which counterparty id field is rendered.
   */
  role: NewCollaborationRole;
  onCreated: (created: { id: string | number }) => void;
};

const PROJECT_TYPE_MAX = 100;
const POSTCODE_MAX = 10;
const AGREED_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

export function NewCollaborationSheet({
  open,
  onOpenChange,
  role,
  onCreated,
}: Props) {
  const { t } = useTranslation('collaborations');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectType, setProjectType] = useState('');
  const [postcode, setPostcode] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [referralId, setReferralId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCounterpartyId('');
      setProjectType('');
      setPostcode('');
      setAgreedAmount('');
      setReferralId('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const counterpartyIdNum = Number(counterpartyId.trim());
  const counterpartyValid =
    counterpartyId.trim() !== '' &&
    Number.isInteger(counterpartyIdNum) &&
    counterpartyIdNum > 0;

  const normalisedPostcode = postcode.trim().toUpperCase();
  const postcodeValid =
    normalisedPostcode === '' ||
    (normalisedPostcode.length <= POSTCODE_MAX &&
      POSTCODE_OUTWARD_REGEX.test(normalisedPostcode));

  const amountTrimmed = agreedAmount.trim();
  const amountValid =
    amountTrimmed === '' ||
    (AGREED_AMOUNT_REGEX.test(amountTrimmed) && Number(amountTrimmed) >= 0);

  const referralIdNum = Number(referralId.trim());
  const referralValid =
    referralId.trim() === '' ||
    (Number.isInteger(referralIdNum) && referralIdNum > 0);

  const projectTypeValid = projectType.length <= PROJECT_TYPE_MAX;

  const canSubmit =
    counterpartyValid &&
    postcodeValid &&
    amountValid &&
    referralValid &&
    projectTypeValid &&
    !submitting;

  const counterpartyLabel =
    role === 'WORKER' ? t('newSheet.employerIdLabel') : t('newSheet.workerIdLabel');
  const counterpartyHelper =
    role === 'WORKER' ? t('newSheet.helperWorker') : t('newSheet.helperEmployer');
  const browseHref = role === 'WORKER' ? '/employers' : '/workers';
  const browseLink =
    role === 'WORKER' ? t('newSheet.browseLinkWorker') : t('newSheet.browseLinkEmployer');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (role === 'WORKER') {
        body.employer_id = counterpartyIdNum;
      } else {
        body.worker_id = counterpartyIdNum;
      }
      if (projectType.trim()) body.project_type = projectType.trim();
      if (normalisedPostcode) body.site_postcode = normalisedPostcode;
      if (amountTrimmed !== '') body.agreed_amount = Number(amountTrimmed);
      if (referralId.trim() !== '') body.referral_id = referralIdNum;

      const created = await api<{ id: string | number }>('/collaborations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(t('newSheet.createdToast'));
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('newSheet.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t('newSheet.title')}</SheetTitle>
          <SheetDescription>
            {role === 'WORKER'
              ? t('newSheet.descWorker')
              : t('newSheet.descEmployer')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-counterparty">{counterpartyLabel}</Label>
            <Input
              id="newcoll-counterparty"
              type="number"
              inputMode="numeric"
              min="1"
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              required
            />
            <p className="text-xs text-fg-muted">
              {counterpartyHelper}{' '}
              <Link
                to={browseHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                {browseLink}
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-project-type">{t('newSheet.projectTypeLabel')}</Label>
            <Input
              id="newcoll-project-type"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              maxLength={PROJECT_TYPE_MAX}
              placeholder={t('newSheet.projectTypePlaceholder')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="newcoll-postcode">{t('newSheet.postcodeLabel')}</Label>
              <Input
                id="newcoll-postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                maxLength={POSTCODE_MAX}
                placeholder={t('newSheet.postcodePlaceholder')}
                aria-invalid={!postcodeValid}
              />
              {!postcodeValid ? (
                <p className="text-xs text-danger">{t('newSheet.postcodeError')}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              <Label htmlFor="newcoll-amount">{t('newSheet.amountLabel')}</Label>
              <Input
                id="newcoll-amount"
                type="text"
                inputMode="decimal"
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                placeholder={t('newSheet.amountPlaceholder')}
                aria-invalid={!amountValid}
              />
              {!amountValid ? (
                <p className="text-xs text-danger">{t('newSheet.amountError')}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="newcoll-referral">{t('newSheet.referralLabel')}</Label>
            <Input
              id="newcoll-referral"
              type="number"
              inputMode="numeric"
              min="1"
              value={referralId}
              onChange={(e) => setReferralId(e.target.value)}
              aria-invalid={!referralValid}
            />
            {!referralValid ? (
              <p className="text-xs text-danger">{t('newSheet.referralError')}</p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('newSheet.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? t('newSheet.creating') : t('newSheet.create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
NewCollaborationSheet.displayName = 'NewCollaborationSheet';
