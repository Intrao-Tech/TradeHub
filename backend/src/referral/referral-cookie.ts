import { REF_COOKIE_NAMES } from './referral.constants';

export type ProjectRefCookie = {
  code: string;
  type: 'PROJECT';
  target_id: string;
  target_role: 'WORKER' | 'EMPLOYER';
  set_at: string;
};

export type AccountRefCookie = {
  code: string;
  type: 'ACCOUNT';
  set_at: string;
};

/**
 * Parse a raw `Cookie:` header into a key→value map. Tiny avoid-the-dep
 * helper so we don't pull in the `cookie-parser` package.
 */
export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = decodeURIComponent(p.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

export function readProjectRefCookie(
  cookieHeader: string | undefined,
): ProjectRefCookie | null {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[REF_COOKIE_NAMES.PROJECT];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectRefCookie;
    if (
      parsed.type !== 'PROJECT' ||
      typeof parsed.code !== 'string' ||
      typeof parsed.target_id !== 'string' ||
      (parsed.target_role !== 'WORKER' && parsed.target_role !== 'EMPLOYER')
    ) {
      return null;
    }
    // Reject cookies older than 30 days (defensive — browsers should already
    // expire it, but server-side check protects against stale stored values).
    const setAtMs = new Date(parsed.set_at).getTime();
    if (
      Number.isFinite(setAtMs) &&
      Date.now() - setAtMs > 30 * 24 * 60 * 60 * 1000
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readAccountRefCookie(
  cookieHeader: string | undefined,
): AccountRefCookie | null {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[REF_COOKIE_NAMES.ACCOUNT];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AccountRefCookie;
    if (parsed.type !== 'ACCOUNT' || typeof parsed.code !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
