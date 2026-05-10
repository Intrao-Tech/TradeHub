import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { recordProjectIntent } from '@/components/escrow';
import { getToken } from '@/api';
import { toast } from '@/components/ui/toast';

/**
 * On mount, if `?ref=CODE` is present in the URL AND the user is logged in,
 * fire the project-intent record (server-side persistence keyed by the
 * actor account) and strip the param from the URL.
 *
 * Anonymous users on `/jobs/:id?ref=` or `/workers/:id?ref=` are ignored
 * here — they can't perform a qualifying action (apply / hire) without
 * registering anyway, and the account-ref flow uses `/r/:code` instead.
 */
export function useRefAttribution(opts: {
  targetId: string | number | null | undefined;
  targetRole: 'WORKER' | 'EMPLOYER';
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || opts.targetId == null) return;

    const stripParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('ref');
      setSearchParams(next, { replace: true });
    };

    if (!getToken()) {
      // Anonymous viewer — nothing to attribute server-side. Strip param
      // to keep the URL clean.
      stripParam();
      return;
    }

    let cancelled = false;
    void recordProjectIntent({
      code: ref.toUpperCase(),
      target_id: Number(opts.targetId),
      target_role: opts.targetRole,
    })
      .then((r) => {
        if (cancelled) return;
        if (r.recorded && r.referrer_display_name) {
          toast.success(`Referred by ${r.referrer_display_name}`);
        }
        stripParam();
      })
      .catch(() => {
        // Silent — invalid code or self-ref is a no-op.
        stripParam();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.targetId, opts.targetRole]);
}
