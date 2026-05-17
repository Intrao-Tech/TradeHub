// Job-attachment uploads are parent-first: a file is sent straight onto an
// existing job post or application (there is no orphan / pre-upload stage).
// `api()` is JSON-only, so these go through raw fetch with multipart bodies.

import { ApiError, getToken } from '../../api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export type UploadedAttachment = {
  id: string | number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

async function postFile(path: string, file: File): Promise<UploadedAttachment> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = { message: res.statusText };
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<UploadedAttachment>;
}

/** Upload a file onto a job post — the caller must be the post owner. */
export function uploadJobPostAttachment(
  jobPostId: string | number,
  file: File,
): Promise<UploadedAttachment> {
  return postFile(`/job-posts/${jobPostId}/attachments`, file);
}

/** Upload a file onto a job application — the caller must be the applicant. */
export function uploadJobApplicationAttachment(
  applicationId: string | number,
  file: File,
): Promise<UploadedAttachment> {
  return postFile(`/job-applications/${applicationId}/attachments`, file);
}

/** Delete a job attachment. Best-effort — never throws. */
export async function deleteJobAttachment(id: string | number): Promise<void> {
  try {
    const token = getToken();
    await fetch(`${API_BASE}/job-attachments/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    /* best-effort — a stale attachment is harmless */
  }
}
