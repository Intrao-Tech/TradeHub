import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  FileText,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, parseApiError } from '../../api';
import { publicFileUrl } from '../../lib/files';
import { EmptyState } from '../EmptyState';
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

type DocumentRow = {
  id: string | number;
  doc_type: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | string;
  file_url?: string;
  rejection_reason?: string | null;
  created_at?: string;
};

const DOC_TYPES = [
  'ID_PHOTO',
  'SELFIE',
  'INSURANCE',
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'COMPANY_LETTERHEAD',
  'PROJECT_PHOTO',
  'OTHER',
] as const;

type DocType = (typeof DOC_TYPES)[number];

const DOC_LABELS: Record<DocType, string> = {
  ID_PHOTO: 'ID photo (passport / driving licence)',
  SELFIE: 'Selfie',
  INSURANCE: 'Insurance certificate',
  CSCS_CARD: 'CSCS card',
  GAS_SAFE_CERT: 'Gas Safe certificate',
  NICEIC_CERT: 'NICEIC certificate',
  COMPANY_LETTERHEAD: 'Company letterhead',
  PROJECT_PHOTO: 'Project photo',
  OTHER: 'Other',
};

const DOC_FORMAT_HINT: Record<DocType, string> = {
  ID_PHOTO: 'Clear photo or scan · JPEG, PNG, WebP, or PDF · max 10 MB.',
  SELFIE: 'Recent selfie · JPEG, PNG, or WebP · max 10 MB.',
  INSURANCE: 'PDF preferred · max 10 MB.',
  CSCS_CARD: 'Photo of both sides · JPEG, PNG, or WebP · max 10 MB.',
  GAS_SAFE_CERT: 'PDF or image · max 10 MB.',
  NICEIC_CERT: 'PDF or image · max 10 MB.',
  COMPANY_LETTERHEAD: 'Company letterhead PDF or image · max 10 MB.',
  PROJECT_PHOTO: 'JPEG, PNG, or WebP · max 10 MB.',
  OTHER: 'PDF or image · max 10 MB.',
};

const ACCEPT_BY_TYPE: Record<DocType, string> = {
  ID_PHOTO: 'image/jpeg,image/png,image/webp,application/pdf',
  SELFIE: 'image/jpeg,image/png,image/webp',
  INSURANCE: 'application/pdf,image/jpeg,image/png,image/webp',
  CSCS_CARD: 'image/jpeg,image/png,image/webp',
  GAS_SAFE_CERT: 'application/pdf,image/jpeg,image/png,image/webp',
  NICEIC_CERT: 'application/pdf,image/jpeg,image/png,image/webp',
  COMPANY_LETTERHEAD: 'application/pdf,image/jpeg,image/png,image/webp',
  PROJECT_PHOTO: 'image/jpeg,image/png,image/webp',
  OTHER: 'application/pdf,image/jpeg,image/png,image/webp',
};

const DOC_MAX_BYTES = 10 * 1024 * 1024;

const STATUS_VARIANT: Record<
  string,
  'success' | 'danger' | 'info' | 'warning' | 'outline'
> = {
  APPROVED: 'success',
  REJECTED: 'danger',
  IN_REVIEW: 'info',
  PENDING: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_REVIEW: 'In review',
  PENDING: 'Pending',
};

type WorkerRequiredType = Exclude<DocType, 'COMPANY_LETTERHEAD'>;
const WORKER_REQUIRED: WorkerRequiredType[] = [
  'ID_PHOTO',
  'CSCS_CARD',
  'INSURANCE',
];
const EMPLOYER_REQUIRED: DocType[] = ['INSURANCE', 'COMPANY_LETTERHEAD'];

type DocumentsTabProps = {
  isWorker: boolean;
  isEmployer: boolean;
  flash: (msg: string, err?: string) => void;
};

export function DocumentsTab({ isWorker, isEmployer, flash }: DocumentsTabProps) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState('');
  const [docType, setDocType] = useState<DocType>('ID_PHOTO');
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<DocumentRow[]>('/documents/me');
      setDocs(data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not load documents.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const requirements = useMemo<DocType[]>(() => {
    if (isWorker) return WORKER_REQUIRED as DocType[];
    if (isEmployer) return EMPLOYER_REQUIRED;
    return [];
  }, [isWorker, isEmployer]);

  function pickFile(file: File | null | undefined) {
    if (!file) return;
    setError('');
    if (file.size > DOC_MAX_BYTES) {
      setError(`${file.name}: file is too large. Max 10 MB for documents.`);
      return;
    }
    setPendingFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function upload() {
    if (!pendingFile) {
      setError('Choose a file to upload.');
      return;
    }
    setError('');
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('doc_type', docType);
      // We use the api() helper which doesn't expose progress, so fall back
      // to a simulated indicator. Real progress is a fetch limitation; the
      // upload still happens in a single round trip.
      setProgress(20);
      await api('/documents/upload', {
        method: 'POST',
        body: formData,
      });
      setProgress(100);
      flash('Document uploaded');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      const status = parsed?.status ?? 0;
      if (status === 413) {
        setError('File is too large. Max 10 MB for documents.');
      } else if (status === 415) {
        setError('Unsupported file type for this document.');
      } else {
        setError(parsed?.message ?? 'Upload failed.');
      }
    } finally {
      setProgress(null);
    }
  }

  async function deleteDoc(id: string | number) {
    setError('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      flash('Document deleted');
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? 'Could not delete document.');
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {requirements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Verification checklist</CardTitle>
            <CardDescription>
              {isWorker
                ? 'These document types are part of the Basic and Certified verification rungs.'
                : 'Recommended documents that strengthen your employer profile.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {requirements.map((t) => {
                const state = stateFor(docs, t);
                return (
                  <li
                    key={t}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-raised px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <RequirementIcon state={state} />
                      <span className="truncate font-medium text-fg">
                        {DOC_LABELS[t]}
                      </span>
                    </div>
                    <RequirementChip state={state} />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>My documents</CardTitle>
          <CardDescription>
            Upload verification documents for staff review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docs == null ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : docs.length > 0 ? (
            <ul className="divide-y divide-border-default">
              {docs.map((doc) => (
                <DocumentRowItem
                  key={String(doc.id)}
                  doc={doc}
                  onDelete={() => deleteDoc(doc.id)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload your first document below."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload document</CardTitle>
          <CardDescription>{DOC_FORMAT_HINT[docType]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOC_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-file">File</Label>
              <input
                ref={fileInputRef}
                id="doc-file"
                type="file"
                accept={ACCEPT_BY_TYPE[docType]}
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <div
                role="button"
                tabIndex={0}
                onDrop={onDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-3 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  dragOver
                    ? 'border-primary bg-subtle text-primary'
                    : 'border-border-default bg-raised text-fg-muted hover:border-border-strong'
                }`}
              >
                {pendingFile ? (
                  <span className="font-medium text-fg">{pendingFile.name}</span>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span className="font-medium text-fg">
                      Drop a file here
                    </span>
                    <span className="text-xs">or click to browse</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {progress != null ? (
            <div className="space-y-1">
              <p
                aria-live="polite"
                className="text-xs text-fg-muted"
              >
                {progress < 100 ? 'Uploading…' : 'Done.'}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={upload}
              disabled={progress != null || !pendingFile}
            >
              {progress != null ? 'Uploading…' : 'Upload'}
            </Button>
            {pendingFile ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPendingFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type RequirementState = 'approved' | 'pending' | 'rejected' | 'missing';

function stateFor(
  docs: DocumentRow[] | null,
  type: DocType,
): RequirementState {
  if (!docs) return 'missing';
  const matching = docs.filter((d) => d.doc_type === type);
  if (matching.some((d) => d.status === 'APPROVED')) return 'approved';
  if (matching.some((d) => d.status === 'PENDING' || d.status === 'IN_REVIEW'))
    return 'pending';
  if (matching.some((d) => d.status === 'REJECTED')) return 'rejected';
  return 'missing';
}

function RequirementIcon({ state }: { state: RequirementState }) {
  if (state === 'approved') return <CircleCheck className="h-4 w-4 text-success" />;
  if (state === 'rejected') return <CircleSlash className="h-4 w-4 text-danger" />;
  if (state === 'pending') return <CircleDashed className="h-4 w-4 text-info" />;
  return <CircleDashed className="h-4 w-4 text-fg-muted" />;
}

function RequirementChip({ state }: { state: RequirementState }) {
  if (state === 'approved') return <Badge variant="success">Done</Badge>;
  if (state === 'rejected') return <Badge variant="danger">Re-upload</Badge>;
  if (state === 'pending') return <Badge variant="info">In review</Badge>;
  return <Badge variant="outline">Not started</Badge>;
}

function DocumentRowItem({
  doc,
  onDelete,
}: {
  doc: DocumentRow;
  onDelete: () => void;
}) {
  const url = publicFileUrl(doc.file_url);
  const ext = doc.file_url ? doc.file_url.split('.').pop()?.toUpperCase() : '';
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(doc.file_url ?? '');
  const isPdf = /\.pdf$/i.test(doc.file_url ?? '');
  const variant = STATUS_VARIANT[doc.status] ?? 'outline';
  const label = STATUS_LABEL[doc.status] ?? doc.status;
  const date = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString()
    : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isImage && url ? (
          <img
            src={url}
            alt=""
            className="h-12 w-12 flex-none rounded-md object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-subtle text-fg-muted">
            <FileText className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">
              {DOC_LABELS[doc.doc_type as DocType] ?? doc.doc_type}
            </span>
            <Badge variant={variant}>{label}</Badge>
            {isPdf ? <Badge variant="outline">{ext}</Badge> : null}
          </div>
          {date ? (
            <p className="text-xs text-fg-muted">Uploaded {date}</p>
          ) : null}
          {doc.status === 'REJECTED' && doc.rejection_reason ? (
            <p className="mt-1 text-xs text-danger">
              Reason: {doc.rejection_reason}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {url ? (
          <Button asChild variant="ghost" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              View
            </a>
          </Button>
        ) : null}
        {doc.status === 'PENDING' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete document"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
