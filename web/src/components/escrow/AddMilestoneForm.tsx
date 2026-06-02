import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createMilestone,
  uploadMilestoneAttachment,
  type MilestoneAttachment,
} from './api';
import { parseApiError } from '../../api';

const MAX_ATTACHMENTS = 3;
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

type Props = {
  contractId: string | number;
  /** Submit label override — defaults to 'Add milestone'. Worker → 'Request milestone'. */
  submitLabel?: string;
  onAdded: () => void;
};

export function AddMilestoneForm({ contractId, submitLabel, onAdded }: Props) {
  const { t } = useTranslation('wallet');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setAmount('');
    setStagedFiles([]);
    setError('');
  }

  function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (list.length === 0) return;
    const valid: File[] = [];
    for (const f of list) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(t('milestone.fileTypeError', { name: f.name }));
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError(t('milestone.fileSizeError', { name: f.name }));
        continue;
      }
      valid.push(f);
    }
    setStagedFiles((prev) => {
      const merged = [...prev, ...valid];
      if (merged.length > MAX_ATTACHMENTS) {
        setError(t('milestone.maxAttachmentsError', { count: MAX_ATTACHMENTS }));
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
    });
  }

  function removeFile(idx: number) {
    setStagedFiles((p) => p.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError('');
    if (title.trim().length < 3) {
      setError(t('milestone.titleError'));
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 5) {
      setError(t('milestone.amountError'));
      return;
    }
    setBusy(true);
    try {
      const m = await createMilestone(contractId, {
        title: title.trim(),
        amount,
        description: description.trim() || undefined,
      });
      // Upload staged attachments after milestone exists.
      const failures: string[] = [];
      const uploaded: MilestoneAttachment[] = [];
      for (const f of stagedFiles) {
        try {
          uploaded.push(await uploadMilestoneAttachment(m.id, f, 'CREATION'));
        } catch (err) {
          failures.push(
            `${f.name}: ${parseApiError(err)?.message ?? t('milestone.uploadFailed')}`,
          );
        }
      }
      if (failures.length > 0) {
        setError(
          t('milestone.attachmentsFailed', {
            count: failures.length,
            details: failures.join('; '),
          }),
        );
      }
      reset();
      setOpen(false);
      onAdded();
      void uploaded;
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('milestone.addError'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> {submitLabel ?? t('milestone.addMilestone')}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border-default bg-raised p-4 space-y-3">
      <h3 className="font-medium text-fg">{submitLabel ?? t('milestone.newMilestone')}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div className="space-y-1">
          <Label htmlFor="milestone-title">{t('milestone.titleLabel')}</Label>
          <Input
            id="milestone-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('milestone.titlePlaceholder')}
            disabled={busy}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="milestone-amount">{t('milestone.amountLabel')}</Label>
          <Input
            id="milestone-amount"
            type="number"
            step="0.01"
            min="5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('milestone.amountPlaceholder')}
            disabled={busy}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="milestone-desc">
          {t('milestone.descriptionLabel')} <span className="text-fg-muted">{t('milestone.optional')}</span>
        </Label>
        <Textarea
          id="milestone-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('milestone.descriptionPlaceholder')}
          rows={3}
          maxLength={2000}
          disabled={busy}
        />
        <p className="text-xs text-fg-muted">
          {description.length} / 2000
        </p>
      </div>
      <div className="space-y-1">
        <Label>
          {t('milestone.attachmentsLabel')}{' '}
          <span className="text-fg-muted">
            {t('milestone.attachmentsHelp', { count: MAX_ATTACHMENTS })}
          </span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ALLOWED_MIME.join(',')}
            className="hidden"
            onChange={pickFiles}
            disabled={busy || stagedFiles.length >= MAX_ATTACHMENTS}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy || stagedFiles.length >= MAX_ATTACHMENTS}
          >
            <Paperclip className="h-4 w-4" /> {t('milestone.pickFiles')}
          </Button>
          {stagedFiles.length === 0 ? (
            <span className="text-xs text-fg-muted">{t('milestone.noFiles')}</span>
          ) : (
            stagedFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-md border border-border-default bg-subtle px-2 py-1 text-xs"
              >
                {f.name}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  className="hover:text-danger"
                  aria-label={t('milestone.removeFile', { name: f.name })}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>
      {error ? (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? t('milestone.adding') : (submitLabel ?? t('milestone.addMilestone'))}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          {t('milestone.cancel')}
        </Button>
      </div>
    </div>
  );
}
