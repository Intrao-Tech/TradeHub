/**
 * Hostname-aware helpers for the marketplace ↔ staff subdomain split (AUTH-016).
 *
 * Production: marketplace = `app.tradehub.co.uk`, staff = `internal.tradehub.co.uk`.
 * Dev: marketplace = `localhost:3000`, staff = `internal.localhost:3000`
 * (RFC 6761 — `*.localhost` resolves to 127.0.0.1 with no hosts file edit).
 *
 * Same React build serves both surfaces; the hostname check below picks
 * which router tree mounts in `App.tsx`.
 */

export const IS_STAFF_HOST =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('internal.');

/** Absolute URL of the staff surface, e.g. `https://internal.tradehub.co.uk`. */
export const STAFF_BASE_URL: string =
  (import.meta.env.VITE_STAFF_BASE_URL as string | undefined) ||
  'http://internal.localhost:3000';
