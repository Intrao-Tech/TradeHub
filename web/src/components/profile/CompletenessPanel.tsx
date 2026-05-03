import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
} from 'lucide-react';
import type {
  ClientProfile,
  WorkerProfile,
  EmployerProfile,
} from '../../hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Profile-completeness card (PROF-035 / PROF-036 / PROF-037). Visible only
 * on the user's own ProfilePage (LinkedIn pattern); never on public detail
 * pages.
 *
 * The action handlers are wired by ProfilePage so that scroll-to-section
 * and tab-switch behaviour stays one click away.
 */

export type CompletenessAction = {
  label: string;
  /** Scroll anchor inside the Profile tab. */
  scrollTo?: string;
  /** Switch to a sibling tab (Portfolio / Documents). */
  switchTab?: 'portfolio' | 'documents';
};

export type CompletenessRequirement = {
  id: string;
  title: string;
  done: boolean;
  cta: CompletenessAction;
};

type CompletenessPanelProps = {
  isWorker: boolean;
  isEmployer: boolean;
  clientProfile: ClientProfile | null;
  workerProfile?: WorkerProfile | null;
  employerProfile?: EmployerProfile | null;
  hasPortfolioItem: boolean;
  hasUploadedDocument: boolean;
  onAction: (action: CompletenessAction) => void;
};

export function CompletenessPanel({
  isWorker,
  isEmployer,
  clientProfile,
  workerProfile,
  employerProfile,
  hasPortfolioItem,
  hasUploadedDocument,
  onAction,
}: CompletenessPanelProps) {
  const reqs = buildRequirements({
    isWorker,
    isEmployer,
    clientProfile,
    workerProfile,
    employerProfile,
    hasPortfolioItem,
    hasUploadedDocument,
  });

  if (reqs.length === 0) return null;

  const done = reqs.filter((r) => r.done).length;
  const percent = Math.round((done / reqs.length) * 100);
  const missing = reqs.filter((r) => !r.done);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Profile completeness</CardTitle>
            <CardDescription>
              {percent}% complete · {done}/{reqs.length} sections done
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completeness"
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        {missing.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {missing.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-raised px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <CircleDashed className="h-4 w-4 text-fg-muted" />
                  <span className="truncate font-medium text-fg">
                    {r.title}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction(r.cta)}
                >
                  {r.cta.label}
                  <ArrowRight />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-success">
            <CircleCheck className="h-4 w-4" />
            All sections complete.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function buildRequirements({
  isWorker,
  isEmployer,
  clientProfile,
  workerProfile,
  employerProfile,
  hasPortfolioItem,
  hasUploadedDocument,
}: Omit<CompletenessPanelProps, 'onAction'>): CompletenessRequirement[] {
  const cp = clientProfile;
  const reqs: CompletenessRequirement[] = [];

  if (isWorker || isEmployer) {
    reqs.push({
      id: 'avatar',
      title: 'Profile photo',
      done: Boolean(cp?.avatar_url),
      cta: { label: 'Add photo', scrollTo: 'section-avatar' },
    });
    reqs.push({
      id: 'display_name',
      title: isEmployer ? 'Display name + company name' : 'Display name',
      done: Boolean((cp?.display_name ?? '').trim().length > 0),
      cta: { label: 'Edit', scrollTo: 'section-client' },
    });
    reqs.push({
      id: 'bio',
      title: 'Bio',
      done: Boolean((cp?.bio ?? '').trim().length > 0),
      cta: { label: 'Add bio', scrollTo: 'section-client' },
    });
    reqs.push({
      id: 'location',
      title: 'City + postcode area',
      done: Boolean(cp?.city && cp?.postcode_area),
      cta: { label: 'Set location', scrollTo: 'section-client' },
    });
  }

  if (isWorker) {
    const wp = workerProfile;
    const min = wp?.day_rate_min;
    const max = wp?.day_rate_max;
    reqs.push({
      id: 'day_rate',
      title: 'Day rate (min and max)',
      done:
        min != null &&
        max != null &&
        Number(min) > 0 &&
        Number(max) > 0,
      cta: { label: 'Set rate', scrollTo: 'section-worker' },
    });
    reqs.push({
      id: 'portfolio',
      title: '≥ 1 portfolio item',
      done: hasPortfolioItem,
      cta: { label: 'Add item', switchTab: 'portfolio' },
    });
    reqs.push({
      id: 'document',
      title: '≥ 1 verification document',
      done: hasUploadedDocument,
      cta: { label: 'Upload document', switchTab: 'documents' },
    });
  }

  if (isEmployer) {
    const ep = employerProfile;
    reqs.push({
      id: 'company_name',
      title: 'Company name',
      done: Boolean((ep?.company_name ?? '').trim().length > 0),
      cta: { label: 'Edit', scrollTo: 'section-employer' },
    });
    reqs.push({
      id: 'team_size',
      title: 'Team size',
      done: ep?.team_size != null,
      cta: { label: 'Set team size', scrollTo: 'section-employer' },
    });
  }

  return reqs;
}
