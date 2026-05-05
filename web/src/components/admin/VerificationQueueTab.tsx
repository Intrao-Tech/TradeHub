import { useCallback, useEffect, useState } from 'react';
import { api, parseApiError } from '../../api';
import { publicFileUrl } from '../../lib/files';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type QueueItem = {
  document: {
    id: string;
    doc_type: string;
    file_url: string;
    status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
    rejection_reason: string | null;
    metadata: { title?: string } | null;
    created_at: string;
  };
  uploader: { id: string; display_name: string; role: string };
  assignee: { id: string; display_name: string } | null;
};

type QueueResponse = {
  items: QueueItem[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_FILTERS = [
  { value: 'PENDING,IN_REVIEW', label: 'Active (default)' },
  { value: 'PENDING', label: 'Pending only' },
  { value: 'IN_REVIEW', label: 'In review only' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

const ASSIGNMENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'unassigned', label: 'Unassigned' },
] as const;

export function VerificationQueueTab() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING,IN_REVIEW');
  const [assignment, setAssignment] = useState<string>('all');
  const [rejecting, setRejecting] = useState<{
    docId: string;
    reason: string;
  } | null>(null);
  const [actionErr, setActionErr] = useState('');
  const [actionInFlight, setActionInFlight] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const q = new URLSearchParams({
        status: statusFilter,
        assignment,
        limit: '50',
      });
      const res = await api<QueueResponse>(`/verification/queue?${q.toString()}`);
      setData(res);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, assignment]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(documentId: string) {
    setActionErr('');
    setActionInFlight(true);
    try {
      await api(`/verification/documents/${documentId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVE' }),
      });
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      setActionErr(parsed?.message ?? 'Approve failed');
    } finally {
      setActionInFlight(false);
    }
  }

  async function submitReject() {
    if (!rejecting) return;
    const reason = rejecting.reason.trim();
    if (reason.length < 10) {
      setActionErr('Rejection reason must be at least 10 characters.');
      return;
    }
    setActionErr('');
    setActionInFlight(true);
    try {
      await api(`/verification/documents/${rejecting.docId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'REJECT', reason }),
      });
      setRejecting(null);
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      setActionErr(parsed?.message ?? 'Reject failed');
    } finally {
      setActionInFlight(false);
    }
  }

  async function claim(documentId: string) {
    setActionErr('');
    setActionInFlight(true);
    try {
      await api(`/verification/documents/${documentId}/claim`, {
        method: 'POST',
      });
      await load();
    } catch (err) {
      const parsed = parseApiError(err);
      setActionErr(parsed?.message ?? 'Claim failed');
    } finally {
      setActionInFlight(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification queue</CardTitle>
        <CardDescription>
          Documents waiting on staff review. Approve writes a milestone and may
          promote the user; reject requires a reason of at least 10 characters
          (shown to the uploader).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}
        {actionErr ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {actionErr}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assignment</Label>
            <Select value={assignment} onValueChange={setAssignment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
        </div>

        {data == null ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">No documents matching the current filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uploader</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const url = publicFileUrl(item.document.file_url);
                const terminal =
                  item.document.status === 'APPROVED' ||
                  item.document.status === 'REJECTED';
                return (
                  <TableRow key={item.document.id}>
                    <TableCell className="font-medium">
                      {item.uploader.display_name}
                      <span className="ml-1 text-xs text-fg-muted">
                        ({item.uploader.role})
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.document.doc_type}
                      {item.document.doc_type === 'OTHER' &&
                      item.document.metadata?.title ? (
                        <span className="ml-1 text-xs text-fg-muted">
                          — {item.document.metadata.title}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.document.status)}>
                        {item.document.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.assignee ? (
                        item.assignee.display_name
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => claim(item.document.id)}
                          disabled={actionInFlight}
                        >
                          Claim
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(item.document.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {url && item.document.file_url !== '(structured-only)' ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-fg-muted">structured</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => approve(item.document.id)}
                          disabled={terminal || actionInFlight}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRejecting({ docId: item.document.id, reason: '' })
                          }
                          disabled={terminal || actionInFlight}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {rejecting ? (
          <div className="rounded-md border border-border-default bg-raised p-3 space-y-2">
            <Label htmlFor="reject-reason">
              Rejection reason (visible to uploader, ≥10 chars)
            </Label>
            <Textarea
              id="reject-reason"
              value={rejecting.reason}
              onChange={(e) =>
                setRejecting({ ...rejecting, reason: e.target.value })
              }
              rows={3}
              placeholder="e.g. Card photo is too blurry to read the registration number — please re-upload a sharper image."
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                onClick={submitReject}
                disabled={actionInFlight || rejecting.reason.trim().length < 10}
              >
                Confirm reject
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRejecting(null)}
                disabled={actionInFlight}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function statusVariant(
  status: QueueItem['document']['status'],
): 'success' | 'danger' | 'info' | 'warning' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'IN_REVIEW':
      return 'info';
    default:
      return 'warning';
  }
}
