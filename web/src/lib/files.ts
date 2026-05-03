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

export function publicFileUrl(
  path: string | null | undefined,
): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
