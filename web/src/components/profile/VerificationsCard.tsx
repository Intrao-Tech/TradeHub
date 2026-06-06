import { useEffect, useState } from 'react';
import type { ParseKeys } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Building2,
  FileCheck2,
  Hammer,
  Receipt,
  ShieldCheck,
  Stamp,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Upwork-style "Verifications" rail card. Renders one row per known
 * verification check with an explicit "Verified" / "Not verified" badge.
 *
 * Reads from the existing public endpoint `GET /verification/levels/:id`.
 * Mirrors the worker/employer doc-type sets handled by DocumentsTab so the
 * surface stays in sync with what's uploadable.
 */

export type VerificationsCardRole = 'WORKER' | 'EMPLOYER';

type PublicLevelResponse = {
  verification_level: string;
  flags?: {
    identity_verified?: boolean;
    insurance_approved?: boolean;
    company_house_verified?: boolean;
    company_letterhead_approved?: boolean;
    right_to_work_verified?: boolean;
    hmrc_cis_verified?: boolean;
    certification_doc_types?: string[];
  };
  reviews?: { count?: number; average?: number | null };
};

type Row = { key: string; labelKey: ParseKeys<'common'>; icon: LucideIcon; verified: boolean };

function workerRows(
  flags: PublicLevelResponse['flags'] | undefined,
): Row[] {
  const f = flags ?? {};
  const certs = new Set(f.certification_doc_types ?? []);
  return [
    { key: 'id', labelKey: 'verifications.id', icon: UserCheck, verified: Boolean(f.identity_verified) },
    { key: 'insurance', labelKey: 'verifications.insurance', icon: ShieldCheck, verified: Boolean(f.insurance_approved) },
    { key: 'right_to_work', labelKey: 'verifications.rightToWork', icon: FileCheck2, verified: Boolean(f.right_to_work_verified) },
    { key: 'hmrc_cis', labelKey: 'verifications.hmrcCis', icon: Receipt, verified: Boolean(f.hmrc_cis_verified) },
    { key: 'cscs', labelKey: 'verifications.cscs', icon: BadgeCheck, verified: certs.has('CSCS_CARD') },
    { key: 'gas_safe', labelKey: 'verifications.gasSafe', icon: Wrench, verified: certs.has('GAS_SAFE_CERT') },
    { key: 'niceic', labelKey: 'verifications.niceic', icon: Stamp, verified: certs.has('NICEIC_CERT') },
    { key: 'firas', labelKey: 'verifications.firas', icon: Hammer, verified: certs.has('FIRAS_CERT') },
  ];
}

function employerRows(
  flags: PublicLevelResponse['flags'] | undefined,
): Row[] {
  const f = flags ?? {};
  return [
    { key: 'id', labelKey: 'verifications.id', icon: UserCheck, verified: Boolean(f.identity_verified) },
    { key: 'insurance', labelKey: 'verifications.insurance', icon: ShieldCheck, verified: Boolean(f.insurance_approved) },
    { key: 'company_house', labelKey: 'verifications.companiesHouse', icon: Building2, verified: Boolean(f.company_house_verified) },
    { key: 'letterhead', labelKey: 'verifications.letterhead', icon: FileCheck2, verified: Boolean(f.company_letterhead_approved) },
  ];
}

export function VerificationsCard({
  clientProfileId,
  role,
}: {
  clientProfileId: string | number | bigint | null | undefined;
  role: VerificationsCardRole;
}) {
  const { t } = useTranslation('common');
  const [data, setData] = useState<PublicLevelResponse | null>(null);

  useEffect(() => {
    if (clientProfileId == null) return;
    let cancelled = false;
    api<PublicLevelResponse>(`/verification/levels/${clientProfileId}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* non-fatal — card just hides */
      });
    return () => {
      cancelled = true;
    };
  }, [clientProfileId]);

  if (!data) return null;
  const rows =
    role === 'WORKER' ? workerRows(data.flags) : employerRows(data.flags);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('verifications.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border-default">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 text-sm"
            >
              <span className="inline-flex items-center gap-2 text-fg">
                <row.icon className="h-4 w-4 text-fg-muted" />
                <span>{t(row.labelKey)}</span>
              </span>
              {row.verified ? (
                <Badge variant="success">{t('verifications.verified')}</Badge>
              ) : (
                <Badge variant="outline">{t('verifications.notVerified')}</Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
