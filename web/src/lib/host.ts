/**
 * Hostname-aware helpers for the marketplace ↔ staff subdomain split (AUTH-016).
 *
 * Production: marketplace = `app.tradehub.co.uk`, staff = `internal.tradehub.co.uk`.
 * Dev: marketplace = `localhost:3000`, staff = `internal.localhost:3000`
 * (RFC 6761 — `*.localhost` resolves to 127.0.0.1 with no hosts file edit).
 * Railway defaults (no custom domain): marketplace and staff are sibling
 * `*.up.railway.app` hostnames; staff identity falls back to origin equality
 * with `VITE_STAFF_BASE_URL` so the subdomain check still resolves correctly.
 *
 * Same React build serves both surfaces; the hostname check below picks
 * which router tree mounts in `App.tsx`.
 */

/** Absolute URL of the staff surface, e.g. `https://internal.tradehub.co.uk`. */
export const STAFF_BASE_URL: string =
  (import.meta.env.VITE_STAFF_BASE_URL as string | undefined) ||
  'http://internal.localhost:3000';

export const IS_STAFF_HOST =
  typeof window !== 'undefined' &&
  (window.location.hostname.startsWith('internal.') ||
    window.location.origin === STAFF_BASE_URL);
