import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trackProjectClick } from '@/components/escrow';
import { toast } from '@/components/ui/toast';

/**
 * On mount, if `?ref=CODE` is present in the URL, fire the
 * project-click attribution to set the referral cookie + show a toast,
 * then strip the param from the URL via history.replaceState.
 */
export function useRefAttribution(opts: {
  targetId: string | number | null | undefined;
  targetRole: 'WORKER' | 'EMPLOYER';
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || opts.targetId == null) return;
    let cancelled = false;
    void trackProjectClick({
      code: ref.toUpperCase(),
      target_id: Number(opts.targetId),
      target_role: opts.targetRole,
    })
      .then((r) => {
        if (cancelled) return;
        if (r.referrer_display_name) {
          toast.success(`Referred by ${r.referrer_display_name}`);
        }
        const next = new URLSearchParams(searchParams);
        next.delete('ref');
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        // Silent — invalid code is a no-op.
        const next = new URLSearchParams(searchParams);
        next.delete('ref');
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.targetId, opts.targetRole]);
}
