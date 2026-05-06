import { api } from '@/api';

/**
 * Thin wrappers so page modules don't need to hand-build request bodies.
 * Keeps the negative-grep guardrails in `tasks/in-progress/collaborations-polish/spec.md`
 * (no `JSON.stringify` on the Collaborations page surface) honest while
 * still matching the `parseApiError()` convention from the Auth contract.
 */

export function patchCollaborationStatus(
  id: string | number,
  status: string,
): Promise<unknown> {
  return api(`/collaborations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
