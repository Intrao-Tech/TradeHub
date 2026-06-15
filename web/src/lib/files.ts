/**
 * `publicFileUrl` — turns the backend's stored `/uploads/{uuid}.{ext}` paths
 * into absolute URLs the browser can load. Backend serves the `uploads/`
 * directory as static assets at `/uploads/*` (see `backend/src/main.ts`).
 *
 * Pass-through behaviour for already-absolute URLs (`http://`, `https://`)
 * keeps legacy avatar URLs that point at external CDNs working until they
 * are replaced through the avatar uploader.
 */

const API = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';
const ORIGIN = API.replace(/\/api\/?$/, '');

/**
 * Sentinel the backend stores in `Document.file_url` for structured-only
 * documents (e.g. HMRC CIS submissions captured as UTR/NI metadata with no
 * uploaded file). It is NOT a real path — it must never be turned into a link.
 */
export const STRUCTURED_ONLY_SENTINEL = '(structured-only)';

/** True when a document carries no real file, only structured metadata. */
export function isStructuredOnly(fileUrl?: string | null): boolean {
  return fileUrl === STRUCTURED_ONLY_SENTINEL;
}

export function publicFileUrl(
  path: string | null | undefined,
): string | undefined {
  if (!path) return undefined;
  // Structured-only documents have no file — never produce a (broken) URL.
  if (path === STRUCTURED_ONLY_SENTINEL) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
