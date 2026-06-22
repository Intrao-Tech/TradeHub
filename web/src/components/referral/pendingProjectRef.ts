// Bridges project-referral attribution across the auth gap.
//
// A logged-out visitor who opens `/jobs/:id?ref=` has no account yet, so no
// server-side `referral_intent` can be written (the row needs an actor
// client_profile). We stash the click here; once the visitor authenticates
// it is either:
//   - replayed as a project intent  (existing user logs in), or
//   - folded into `referred_by_code` (brand-new user registers → account ref).
// No DB change is needed — the bridge is purely client-side.

import { recordProjectIntent } from '@/components/escrow';
import { toast } from '@/components/ui/toast';

const KEY = 'th.pendingProjectRef';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — matches the intent window

export type PendingProjectRef = {
  code: string;
  target_id: number;
};

type Stored = PendingProjectRef & { savedAt: number };

/** Persist a project-referral click made while logged out. */
export function savePendingProjectRef(ref: PendingProjectRef): void {
  try {
    const stored: Stored = { ...ref, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* localStorage unavailable — referral attribution is best-effort */
  }
}

/** Read the pending project-referral, or null if absent / malformed / expired. */
export function readPendingProjectRef(): PendingProjectRef | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Stored>;
    if (
      typeof s.code !== 'string' ||
      typeof s.target_id !== 'number' ||
      typeof s.savedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - s.savedAt > TTL_MS) {
      clearPendingProjectRef();
      return null;
    }
    return { code: s.code, target_id: s.target_id };
  } catch {
    return null;
  }
}

export function clearPendingProjectRef(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Called once the visitor authenticates: if a logged-out project-referral
 * click is pending, materialise it as a server-side project intent.
 *
 * The registration path (RegisterPage) consumes and clears the pending ref
 * before this runs, so a brand-new user is attributed as an account referral
 * only — never double-attributed.
 */
export async function replayPendingProjectRef(): Promise<void> {
  const pending = readPendingProjectRef();
  if (!pending) return;
  // Clear up-front: a referral is best-effort, never retried across logins.
  clearPendingProjectRef();
  try {
    const r = await recordProjectIntent(pending);
    if (r.recorded && r.referrer_display_name) {
      toast.success(`Referred by ${r.referrer_display_name}`);
    }
  } catch {
    /* invalid code / self-ref / network — best-effort, already cleared */
  }
}
