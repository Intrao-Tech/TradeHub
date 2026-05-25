import { useEffect, useSyncExternalStore } from 'react';
import { api, parseApiError } from '../api';

/**
 * `useAccountMe` (PROF-051) — single client-side cache of `GET /account/me`.
 *
 * The Profiles spec requires every page in the feature to share one
 * `/account/me` response so editor saves can refresh the whole tree
 * without round-tripping per consumer. Auth's contract (§3) confirms
 * `/account/me` is exempt from `AccountStateGuard`, so unverified users
 * can read it too.
 *
 * Implementation: module-level cache + subscriber set. Mirrors the
 * `auth-changed` window event pattern in `App.tsx` so login/logout
 * invalidate the cache without per-consumer wiring.
 */

export type AccountStatus = 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED';

export type SpecialisationLink = {
  worker_id?: string | number;
  specialisation_id?: number;
  is_primary?: boolean;
  specialisation?: {
    id?: number;
    name?: string;
    slug?: string;
  };
};

export type WorkerLanguageLink = {
  worker_id?: string | number;
  language_code: string;
};

export type WorkerProfile = {
  id: string | number;
  years_experience?: number | null;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  available_from?: string | null;
  is_available?: boolean;
  rating_avg?: string | number | null;
  rating_count?: number | null;
  worker_specialisations?: SpecialisationLink[];
  worker_languages?: WorkerLanguageLink[];
  [key: string]: unknown;
};

export type EmployerProfile = {
  id: string | number;
  company_name?: string | null;
  company_number?: string | null;
  team_size?: number | null;
  rating_avg?: string | number | null;
  rating_count?: number | null;
  [key: string]: unknown;
};

export type ClientProfile = {
  id: string | number;
  display_name?: string;
  bio?: string | null;
  city?: string | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  slug?: string;
  verification_level?: string;
  worker_profile?: WorkerProfile | null;
  employer_profile?: EmployerProfile | null;
  [key: string]: unknown;
};

export type StaffMember = {
  id: string | number;
  staff_role?: string;
  member_roles?: { staff_role: { name: string } }[];
  [key: string]: unknown;
};

export type AccountMe = {
  id: string | number;
  email: string;
  email_verified_at: string | null;
  phone: string | null;
  phone_verified: boolean;
  status: AccountStatus;
  client_profile: ClientProfile | null;
  staff_member: StaffMember | null;
  /**
   * Flat list of permission keys granted to the user via their roles.
   * Populated from /account/me; empty array for non-staff. ADMIN role
   * implicitly satisfies any permission — check `isAdmin` first.
   */
  permissions?: string[];
  [key: string]: unknown;
};

type CacheState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; account: AccountMe }
  | { kind: 'error'; error: string };

let state: CacheState = { kind: 'idle' };
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

function setState(next: CacheState) {
  state = next;
  notify();
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  setState({ kind: 'loading' });
  inflight = api<AccountMe>('/account/me')
    .then((account) => {
      setState({ kind: 'ready', account });
    })
    .catch((err) => {
      const parsed = parseApiError(err);
      setState({ kind: 'error', error: parsed?.message ?? 'Failed to load account.' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function clearCache() {
  state = { kind: 'idle' };
  inflight = null;
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth-changed', clearCache);
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): CacheState {
  return state;
}

export type UseAccountMe = {
  account: AccountMe | null;
  clientProfile: ClientProfile | null;
  isWorker: boolean;
  isEmployer: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  permissions: string[];
  hasPermission: (key: string) => boolean;
  verificationState: AccountStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useAccountMe(): UseAccountMe {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (state.kind === 'idle') {
      void fetchOnce();
    }
  }, []);

  const account = snapshot.kind === 'ready' ? snapshot.account : null;
  const clientProfile = account?.client_profile ?? null;

  const isAdmin = account?.staff_member?.staff_role === 'ADMIN';
  const permissions = account?.permissions ?? [];

  return {
    account,
    clientProfile,
    isWorker: Boolean(clientProfile?.worker_profile),
    isEmployer: Boolean(clientProfile?.employer_profile),
    isStaff: Boolean(account?.staff_member),
    isAdmin,
    permissions,
    hasPermission: (key: string) => isAdmin || permissions.includes(key),
    verificationState: account?.status ?? null,
    loading: snapshot.kind === 'loading' || snapshot.kind === 'idle',
    error: snapshot.kind === 'error' ? snapshot.error : null,
    refetch: async () => {
      inflight = null;
      await fetchOnce();
    },
  };
}
