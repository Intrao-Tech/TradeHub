import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { recordProjectIntent } from '@/components/escrow';
import { getToken } from '@/api';
import { toast } from '@/components/ui/toast';
import { savePendingProjectRef } from './pendingProjectRef';

/**
 * On mount, if `?ref=CODE` is present in the URL on `/jobs/:id` or
 * `/workers/:id`, attribute the project referral and strip the param.
 *
 * - Logged in  → record the project intent server-side immediately.
 * - Logged out → stash the click (pendingProjectRef); it is materialised
 *   once the visitor authenticates — replayed as a project intent if they
 *   log in, or folded into `referred_by_code` (account referral) if they
 *   register as a brand-new user.
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
      // Logged-out viewer — no actor account yet for a server-side intent.
      // Stash the click; it is materialised on the next login / registration.
      savePendingProjectRef({
        code: ref.toUpperCase(),
        target_id: Number(opts.targetId),
        target_role: opts.targetRole,
      });
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
