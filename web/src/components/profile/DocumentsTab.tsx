import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { formatDate } from '@/lib/format';
import type { ParseKeys } from 'i18next';
import type { TranslateFn } from '@/i18n/types';
import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  FileText,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  metadata?: { title?: string } | null;
};

type DocType =
  | 'INSURANCE'
  | 'CSCS_CARD'
  | 'GAS_SAFE_CERT'
  | 'NICEIC_CERT'
  | 'FIRAS_CERT'
  | 'COMPANY_LETTERHEAD'
  | 'OTHER';

type TFn = TranslateFn;

const DOC_LABEL_KEY: Record<DocType, ParseKeys<'profile'>> = {
  INSURANCE: 'documents.labelInsurance',
  CSCS_CARD: 'documents.labelCscs',
  GAS_SAFE_CERT: 'documents.labelGasSafe',
  NICEIC_CERT: 'documents.labelNiceic',
  FIRAS_CERT: 'documents.labelFiras',
  COMPANY_LETTERHEAD: 'documents.labelLetterhead',
  OTHER: 'documents.labelOther',
};

const DOC_FORMAT_HINT_KEY: Record<DocType, ParseKeys<'profile'>> = {
  INSURANCE: 'documents.hintInsurance',
  CSCS_CARD: 'documents.hintCscs',
  GAS_SAFE_CERT: 'documents.hintGasSafe',
  NICEIC_CERT: 'documents.hintNiceic',
  FIRAS_CERT: 'documents.hintFiras',
  COMPANY_LETTERHEAD: 'documents.hintLetterhead',
  OTHER: 'documents.hintOther',
};

const ACCEPT_BY_TYPE: Record<DocType, string> = {
  INSURANCE: 'application/pdf,image/jpeg,image/png,image/webp',
  CSCS_CARD: 'image/jpeg,image/png,image/webp',
  GAS_SAFE_CERT: 'application/pdf,image/jpeg,image/png,image/webp',
  NICEIC_CERT: 'application/pdf,image/jpeg,image/png,image/webp',
  FIRAS_CERT: 'application/pdf,image/jpeg,image/png,image/webp',
  COMPANY_LETTERHEAD: 'application/pdf,image/jpeg,image/png,image/webp',
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

const STATUS_LABEL_KEY: Record<string, ParseKeys<'profile'>> = {
  APPROVED: 'documents.statusApproved',
  REJECTED: 'documents.statusRejected',
  IN_REVIEW: 'documents.statusInReview',
  PENDING: 'documents.statusPending',
};

// Doc types relevant per role — drives BOTH the upload dropdown and the
// Verification checklist. Workers handle their own credentials + portfolio;
// employers handle company-level docs. INSURANCE is the only overlap (workers
// need public liability, employers need employer's liability). OTHER is the
// only free-form catch-all and is always available.
const WORKER_DOC_TYPES: DocType[] = [
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'FIRAS_CERT',
  'INSURANCE',
  'OTHER',
];
const EMPLOYER_DOC_TYPES: DocType[] = [
  'INSURANCE',
  'COMPANY_LETTERHEAD',
  'OTHER',
];

// Checklist excludes OTHER (user-defined, can have multiple) — only the
// predefined types belong on the static checklist.
const WORKER_CHECKLIST: DocType[] = WORKER_DOC_TYPES.filter(
  (t) => t !== 'OTHER',
);
const EMPLOYER_CHECKLIST: DocType[] = EMPLOYER_DOC_TYPES.filter(
  (t) => t !== 'OTHER',
);

type DocumentsTabProps = {
  isWorker: boolean;
  isEmployer: boolean;
  flash: (msg: string, err?: string) => void;
};

export function DocumentsTab({ isWorker, isEmployer, flash }: DocumentsTabProps) {
  const { t } = useTranslation('profile');
  // Role drives BOTH the upload dropdown and the static checklist. Workers
  // get worker-relevant types, employers get employer-relevant types.
  // Users with neither role (rare — staff-only accounts) get an empty list.
  const allowedTypes = useMemo<DocType[]>(() => {
    if (isWorker) return WORKER_DOC_TYPES;
    if (isEmployer) return EMPLOYER_DOC_TYPES;
    return [];
  }, [isWorker, isEmployer]);
  const checklistTypes = useMemo<DocType[]>(() => {
    if (isWorker) return WORKER_CHECKLIST;
    if (isEmployer) return EMPLOYER_CHECKLIST;
    return [];
  }, [isWorker, isEmployer]);

  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState('');
  const [docType, setDocType] = useState<DocType>(
    () => allowedTypes[0] ?? 'OTHER',
  );
  const [otherTitle, setOtherTitle] = useState('');
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
      setError(parsed?.message ?? t('documents.loadError'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // If the user's role flips (rare) and the currently-selected docType is
  // no longer valid for their role, snap back to the first allowed type.
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(docType)) {
      setDocType(allowedTypes[0]);
    }
  }, [allowedTypes, docType]);

  function pickFile(file: File | null | undefined) {
    if (!file) return;
    setError('');
    if (file.size > DOC_MAX_BYTES) {
      setError(t('documents.fileTooLargeNamed', { name: file.name }));
      return;
    }
    setPendingFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  const requiresTitle = docType === 'OTHER';
  const titleTrimmed = otherTitle.trim();
  const titleValid = !requiresTitle || (titleTrimmed.length >= 3 && titleTrimmed.length <= 100);

  async function upload() {
    if (!pendingFile) {
      setError(t('documents.chooseFile'));
      return;
    }
    if (requiresTitle && !titleValid) {
      setError(t('documents.titleRequired'));
      return;
    }
    setError('');
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('doc_type', docType);
      if (requiresTitle) {
        formData.append('metadata', JSON.stringify({ title: titleTrimmed }));
      }
      setProgress(20);
      await api('/documents/upload', {
        method: 'POST',
        body: formData,
      });
      setProgress(100);
      flash(t('documents.uploaded'));
      setPendingFile(null);
      setOtherTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      const status = parsed?.status ?? 0;
      if (status === 413) {
        setError(t('documents.fileTooLarge'));
      } else if (status === 415) {
        setError(t('documents.unsupportedType'));
      } else {
        setError(parsed?.message ?? t('documents.uploadFailed'));
      }
    } finally {
      setProgress(null);
    }
  }

  async function deleteDoc(id: string | number) {
    setError('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      flash(t('documents.deleted'));
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('documents.deleteError'));
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

      {checklistTypes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('documents.checklistTitle')}</CardTitle>
            <CardDescription>
              {isWorker
                ? t('documents.checklistDescWorker')
                : t('documents.checklistDescEmployer')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {checklistTypes.map((docTypeItem) => {
                const state = stateFor(docs, docTypeItem);
                return (
                  <li
                    key={docTypeItem}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-raised px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <RequirementIcon state={state} />
                      <span className="truncate font-medium text-fg">
                        {t(DOC_LABEL_KEY[docTypeItem])}
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
          <CardTitle>{t('documents.myDocsTitle')}</CardTitle>
          <CardDescription>{t('documents.myDocsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {docs == null ? (
            <p className="text-sm text-fg-muted">{t('documents.loading')}</p>
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
              title={t('documents.noneTitle')}
              description={t('documents.noneDesc')}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('documents.uploadTitle')}</CardTitle>
          <CardDescription>{t(DOC_FORMAT_HINT_KEY[docType])}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Label>{t('documents.docType')}</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedTypes.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {t(DOC_LABEL_KEY[dt])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {requiresTitle ? (
                <div className="flex flex-col gap-2.5 pt-2">
                  <Label htmlFor="doc-other-title">
                    {t('documents.titleLabel')} <span className="text-danger">*</span>
                  </Label>
                  <input
                    id="doc-other-title"
                    type="text"
                    value={otherTitle}
                    onChange={(e) => setOtherTitle(e.target.value)}
                    maxLength={100}
                    placeholder={t('documents.titlePlaceholder')}
                    className="flex h-9 w-full rounded-md border border-border-default bg-raised px-3 py-1 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-xs text-fg-muted">{t('documents.titleHint')}</p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="doc-file">{t('documents.file')}</Label>
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
                      {t('documents.dropHere')}
                    </span>
                    <span className="text-xs">{t('documents.orBrowse')}</span>
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
                {progress < 100 ? t('documents.uploading') : t('documents.done')}
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
              disabled={progress != null || !pendingFile || !titleValid}
            >
              {progress != null ? t('documents.uploading') : t('documents.upload')}
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
                {t('documents.cancel')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function documentDisplayName(doc: DocumentRow, t: TFn): string {
  // OTHER carries a user-supplied title in metadata.title — surface it so the
  // row reads "Public liability proof" instead of a generic "Other".
  if (doc.doc_type === 'OTHER' && doc.metadata?.title) {
    return doc.metadata.title;
  }
  const key = DOC_LABEL_KEY[doc.doc_type as DocType];
  return key ? t(key) : doc.doc_type;
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
  const { t } = useTranslation('profile');
  if (state === 'approved') return <Badge variant="success">{t('documents.chipDone')}</Badge>;
  if (state === 'rejected') return <Badge variant="danger">{t('documents.chipReupload')}</Badge>;
  if (state === 'pending') return <Badge variant="info">{t('documents.chipInReview')}</Badge>;
  return <Badge variant="outline">{t('documents.chipNotStarted')}</Badge>;
}

function DocumentRowItem({
  doc,
  onDelete,
}: {
  doc: DocumentRow;
  onDelete: () => void;
}) {
  const { t } = useTranslation('profile');
  const url = publicFileUrl(doc.file_url);
  const ext = doc.file_url ? doc.file_url.split('.').pop()?.toUpperCase() : '';
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(doc.file_url ?? '');
  const isPdf = /\.pdf$/i.test(doc.file_url ?? '');
  const variant = STATUS_VARIANT[doc.status] ?? 'outline';
  const statusKey = STATUS_LABEL_KEY[doc.status];
  const label = statusKey ? t(statusKey) : doc.status;
  const date = doc.created_at
    ? formatDate(doc.created_at, 'short')
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
              {documentDisplayName(doc, t)}
            </span>
            <Badge variant={variant}>{label}</Badge>
            {isPdf ? <Badge variant="outline">{ext}</Badge> : null}
          </div>
          {date ? (
            <p className="text-xs text-fg-muted">{t('documents.uploadedOn', { date })}</p>
          ) : null}
          {doc.status === 'REJECTED' && doc.rejection_reason ? (
            <p className="mt-1 text-xs text-danger">
              {t('documents.reason', { reason: doc.rejection_reason })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {url ? (
          <Button asChild variant="ghost" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {t('documents.view')}
            </a>
          </Button>
        ) : null}
        {doc.status === 'PENDING' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('documents.deleteAria')}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
