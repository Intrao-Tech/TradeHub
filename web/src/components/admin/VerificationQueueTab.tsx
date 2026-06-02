import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '../../api';
import { useAccountMe } from '../../hooks/useAccountMe';
import { publicFileUrl } from '../../lib/files';
import { formatDate } from '@/lib/format';
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
  { value: 'PENDING,IN_REVIEW', labelKey: 'verification.statusActive' },
  { value: 'PENDING', labelKey: 'verification.statusPending' },
  { value: 'IN_REVIEW', labelKey: 'verification.statusInReview' },
  { value: 'APPROVED', labelKey: 'verification.statusApproved' },
  { value: 'REJECTED', labelKey: 'verification.statusRejected' },
] as const;

const ASSIGNMENT_FILTERS = [
  { value: 'all', labelKey: 'verification.assignAll' },
  { value: 'mine', labelKey: 'verification.assignMine' },
  { value: 'unassigned', labelKey: 'verification.assignUnassigned' },
] as const;

export function VerificationQueueTab() {
  const { t } = useTranslation('admin');
  const { isAdmin } = useAccountMe();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING,IN_REVIEW');
  // Non-admins can't list 'all' — default to 'mine'. Admins keep the broad view.
  const [assignment, setAssignment] = useState<string>(isAdmin ? 'all' : 'mine');
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
      setError(parsed?.message ?? t('verification.loadError'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, assignment, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // If account loads and reveals the user is non-admin, swap 'all' → 'mine'
  // so the next fetch doesn't trip the backend 403.
  useEffect(() => {
    if (!isAdmin && assignment === 'all') {
      setAssignment('mine');
    }
  }, [isAdmin, assignment]);

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
      setActionErr(parsed?.message ?? t('verification.approveFailed'));
    } finally {
      setActionInFlight(false);
    }
  }

  async function submitReject() {
    if (!rejecting) return;
    const reason = rejecting.reason.trim();
    if (reason.length < 10) {
      setActionErr(t('verification.rejectReasonTooShort'));
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
      setActionErr(parsed?.message ?? t('verification.rejectFailed'));
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
      setActionErr(parsed?.message ?? t('verification.claimFailed'));
    } finally {
      setActionInFlight(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('verification.title')}</CardTitle>
        <CardDescription>{t('verification.desc')}</CardDescription>
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
            <Label>{t('verification.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t(f.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('verification.assignment')}</Label>
            <Select value={assignment} onValueChange={setAssignment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_FILTERS.filter(
                  (f) => f.value !== 'all' || isAdmin,
                ).map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t(f.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={load} disabled={loading}>
              {loading ? t('verification.loading') : t('verification.refresh')}
            </Button>
          </div>
        </div>

        {data == null ? (
          <p className="text-sm text-fg-muted">{t('verification.loading')}</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('verification.noDocuments')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('verification.colUploader')}</TableHead>
                <TableHead>{t('verification.colType')}</TableHead>
                <TableHead>{t('verification.colStatus')}</TableHead>
                <TableHead>{t('verification.colAssignee')}</TableHead>
                <TableHead>{t('verification.colUploaded')}</TableHead>
                <TableHead>{t('verification.colFile')}</TableHead>
                <TableHead className="text-right">{t('verification.colActions')}</TableHead>
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
                          {t('verification.claim')}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(item.document.created_at, 'short')}
                    </TableCell>
                    <TableCell>
                      {url && item.document.file_url !== '(structured-only)' ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
                        >
                          {t('verification.open')}
                        </a>
                      ) : (
                        <span className="text-xs text-fg-muted">{t('verification.structured')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => approve(item.document.id)}
                          disabled={terminal || actionInFlight}
                        >
                          {t('verification.approve')}
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
                          {t('verification.reject')}
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
              {t('verification.rejectReasonLabel')}
            </Label>
            <Textarea
              id="reject-reason"
              value={rejecting.reason}
              onChange={(e) =>
                setRejecting({ ...rejecting, reason: e.target.value })
              }
              rows={3}
              placeholder={t('verification.rejectReasonPlaceholder')}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={submitReject}
                disabled={actionInFlight || rejecting.reason.trim().length < 10}
              >
                {t('verification.confirmReject')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRejecting(null)}
                disabled={actionInFlight}
              >
                {t('verification.cancel')}
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
