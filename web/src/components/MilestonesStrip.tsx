import {
  Award,
  BadgeCheck,
  Building2,
  FileCheck2,
  Receipt,
  ShieldCheck,
  Star,
  Stamp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Public-facing trust signals for a client profile. Renders one small badge
 * per verified milestone. Driven by the `flags` + `reviews` blocks returned
 * by `GET /verification/levels/:id`.
 *
 * What gets shown is intentionally a curated subset — booleans only, no doc
 * IDs / metadata / staff member identifiers. Full detail stays behind
 * `/verification/me` (owner) or `/verification/ladder/:id` (owner / staff).
 */

type Flags = {
  identity_verified?: boolean;
  insurance_approved?: boolean;
  company_house_verified?: boolean;
  company_letterhead_approved?: boolean;
  right_to_work_verified?: boolean;
  hmrc_cis_verified?: boolean;
  certification_doc_types?: string[];
};

type Reviews = {
  count?: number;
  average?: number | null;
};

const CERT_LABELS: Record<string, string> = {
  CSCS_CARD: 'CSCS',
  GAS_SAFE_CERT: 'Gas Safe',
  NICEIC_CERT: 'NICEIC',
  FIRAS_CERT: 'FIRAS',
};

type MilestonesStripProps = {
  flags?: Flags | null;
  reviews?: Reviews | null;
  className?: string;
};

export function MilestonesStrip({
  flags,
  reviews,
  className,
}: MilestonesStripProps) {
  if (!flags && !reviews) return null;

  const items: { key: string; node: React.ReactNode }[] = [];

  if (flags?.identity_verified) {
    items.push({
      key: 'id',
      node: (
        <Badge variant="info" className="gap-1">
          <ShieldCheck className="h-3 w-3" /> Identity verified
        </Badge>
      ),
    });
  }
  if (flags?.insurance_approved) {
    items.push({
      key: 'ins',
      node: (
        <Badge variant="success" className="gap-1">
          <FileCheck2 className="h-3 w-3" /> Insurance approved
        </Badge>
      ),
    });
  }
  if (flags?.company_house_verified) {
    items.push({
      key: 'ch',
      node: (
        <Badge variant="success" className="gap-1">
          <Building2 className="h-3 w-3" /> Companies House
        </Badge>
      ),
    });
  }
  if (flags?.company_letterhead_approved) {
    items.push({
      key: 'lh',
      node: (
        <Badge variant="success" className="gap-1">
          <Stamp className="h-3 w-3" /> Letterhead approved
        </Badge>
      ),
    });
  }
  if (flags?.right_to_work_verified) {
    items.push({
      key: 'rtw',
      node: (
        <Badge variant="success" className="gap-1">
          <BadgeCheck className="h-3 w-3" /> Right to work
        </Badge>
      ),
    });
  }
  if (flags?.hmrc_cis_verified) {
    items.push({
      key: 'cis',
      node: (
        <Badge variant="success" className="gap-1">
          <Receipt className="h-3 w-3" /> HMRC CIS
        </Badge>
      ),
    });
  }
  if (flags?.certification_doc_types?.length) {
    for (const docType of flags.certification_doc_types) {
      const label = CERT_LABELS[docType] ?? docType;
      items.push({
        key: `cert-${docType}`,
        node: (
          <Badge variant="success" className="gap-1">
            <Award className="h-3 w-3" /> {label}
          </Badge>
        ),
      });
    }
  }
  if (reviews?.count && reviews.count > 0) {
    const avg = typeof reviews.average === 'number' ? reviews.average : null;
    items.push({
      key: 'rev',
      node: (
        <Badge variant="warning" className="gap-1">
          <Star className="h-3 w-3" />
          {avg !== null
            ? `${avg.toFixed(1)} (${reviews.count} review${reviews.count === 1 ? '' : 's'})`
            : `${reviews.count} review${reviews.count === 1 ? '' : 's'}`}
        </Badge>
      ),
    });
  }

  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {items.map((it) => (
        <span key={it.key}>{it.node}</span>
      ))}
    </div>
  );
}
MilestonesStrip.displayName = 'MilestonesStrip';
