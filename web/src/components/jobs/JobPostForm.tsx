import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Info } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { AttachmentsField } from '@/components/jobs/AttachmentsField';
import {
  pendingFilesFromValue,
  savedIdsFromValue,
  type AttachedFile,
} from '@/components/jobs/attachmentValue';
import {
  deleteJobAttachment,
  uploadJobPostAttachment,
} from '@/components/jobs/attachmentApi';
import { useSpecialisations } from '@/hooks/useSpecialisations';
import { useTags } from '@/hooks/useTags';
import {
  LONDON_BOROUGHS,
  POSTCODE_OUTWARD_REGEX,
} from '@/lib/london-boroughs';
import { cn } from '@/lib/utils';

export type JobPostFormValues = {
  title: string;
  description: string;
  pay_type: 'DAY_RATE' | 'FIXED_PRICE';
  day_rate_min: string;
  day_rate_max: string;
  fixed_price: string;
  postcode_area: string;
  site_address: string;
  duration_days: string;
  start_date: string;
  expires_at: string;
  is_urgent: boolean;
  specialisation_ids: number[];
  tag_ids: number[];
  attachments: AttachedFile[];
};

type JobPostFormProps = {
  mode: 'create' | 'edit';
  initial?: Partial<JobPostFormValues>;
  jobPostId?: string | number;
  frozenFields?: Set<keyof JobPostFormValues>;
  freezeReason?: string;
  onSuccess: (jobPost: { id: string | number }) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

const EMPTY: JobPostFormValues = {
  title: '',
  description: '',
  pay_type: 'DAY_RATE',
  day_rate_min: '',
  day_rate_max: '',
  fixed_price: '',
  postcode_area: '',
  site_address: '',
  duration_days: '',
  start_date: '',
  expires_at: '',
  is_urgent: false,
  specialisation_ids: [],
  tag_ids: [],
  attachments: [],
};

const POSTCODE_AREAS = Array.from(
  new Set(
    LONDON_BOROUGHS.flatMap((b) => b.postcodeAreas).sort((a, b) =>
      a.localeCompare(b),
    ),
  ),
);

type Errors = Partial<Record<keyof JobPostFormValues | 'form', string>>;

export function JobPostForm({
  mode,
  initial,
  jobPostId,
  frozenFields,
  freezeReason,
  onSuccess,
  onCancel,
  submitLabel,
}: JobPostFormProps) {
  const { t } = useTranslation('jobs');
  const freezeReasonText = freezeReason ?? t('form.freezeReason');
  const [values, setValues] = useState<JobPostFormValues>(() => ({
    ...EMPTY,
    ...initial,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const { items: specs, loading: specsLoading } = useSpecialisations();
  const { items: tags, loading: tagsLoading } = useTags();

  useEffect(() => {
    if (initial) {
      setValues((prev) => ({ ...EMPTY, ...prev, ...initial }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.title, initial?.pay_type]);

  const isFrozen = (field: keyof JobPostFormValues): boolean =>
    Boolean(frozenFields?.has(field));

  function setValue<K extends keyof JobPostFormValues>(
    field: K,
    v: JobPostFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: v }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!values.title.trim()) e.title = t('form.error.titleRequired');
    else if (values.title.length > 200) e.title = t('form.error.titleTooLong');

    if (values.description.length > 10000)
      e.description = t('form.error.descriptionTooLong');

    if (
      values.postcode_area &&
      !POSTCODE_OUTWARD_REGEX.test(values.postcode_area.toUpperCase())
    ) {
      e.postcode_area = t('form.error.postcodeInvalid');
    }

    if (values.site_address.length > 300)
      e.site_address = t('form.error.siteAddressTooLong');

    if (values.pay_type === 'DAY_RATE') {
      const min = values.day_rate_min ? Number(values.day_rate_min) : null;
      const max = values.day_rate_max ? Number(values.day_rate_max) : null;
      if (min != null && (Number.isNaN(min) || min <= 0))
        e.day_rate_min = t('form.error.dayRateMinPositive');
      if (max != null && (Number.isNaN(max) || max <= 0))
        e.day_rate_max = t('form.error.dayRateMaxPositive');
      if (min != null && max != null && max < min)
        e.day_rate_max = t('form.error.maxGteMin');
    } else {
      const fixed = values.fixed_price ? Number(values.fixed_price) : null;
      if (fixed != null && (Number.isNaN(fixed) || fixed <= 0))
        e.fixed_price = t('form.error.fixedPositive');
    }

    if (values.duration_days) {
      const n = Number(values.duration_days);
      if (!Number.isInteger(n) || n <= 0)
        e.duration_days = t('form.error.durationPositive');
    }

    if (values.expires_at) {
      const ts = new Date(values.expires_at).getTime();
      if (Number.isNaN(ts)) e.expires_at = t('form.error.invalidDate');
      else if (ts < Date.now()) e.expires_at = t('form.error.expiryFuture');
    }

    if (values.specialisation_ids.length > 10)
      e.specialisation_ids = t('form.error.maxSpecialisations');
    if (values.tag_ids.length > 10) e.tag_ids = t('form.error.maxTags');

    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    const body: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      pay_type: values.pay_type,
      postcode_area: values.postcode_area.trim().toUpperCase() || undefined,
      site_address: values.site_address.trim() || undefined,
      duration_days: values.duration_days
        ? Number(values.duration_days)
        : undefined,
      start_date: values.start_date || undefined,
      expires_at: values.expires_at || undefined,
      is_urgent: values.is_urgent,
      specialisation_ids: values.specialisation_ids,
      tag_ids: values.tag_ids,
    };

    if (values.pay_type === 'DAY_RATE') {
      body.day_rate_min = values.day_rate_min
        ? Number(values.day_rate_min)
        : undefined;
      body.day_rate_max = values.day_rate_max
        ? Number(values.day_rate_max)
        : undefined;
    } else {
      body.fixed_price = values.fixed_price
        ? Number(values.fixed_price)
        : undefined;
    }

    setSubmitting(true);
    try {
      const path = mode === 'create' ? '/job-posts' : `/job-posts/${jobPostId}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      let saved: { id: string | number };
      try {
        saved = await api<{ id: string | number }>(path, {
          method,
          body: JSON.stringify(body),
        });
      } catch (err) {
        const parsed = parseApiError(err);
        setErrors({ form: parsed?.message ?? t('form.saveError') });
        return;
      }

      // Parent-first attachments: the post exists now, so sync files onto it.
      // Best-effort — a failed file op must not block navigation or trigger a
      // duplicate re-submit of the post itself.
      if (mode === 'edit') {
        const kept = savedIdsFromValue(values.attachments);
        const removed = savedIdsFromValue(initial?.attachments ?? []).filter(
          (id) => !kept.includes(id),
        );
        for (const id of removed) await deleteJobAttachment(id);
      }
      for (const file of pendingFilesFromValue(values.attachments)) {
        try {
          await uploadJobPostAttachment(saved.id, file);
        } catch {
          /* best-effort — the post is saved; the file can be re-added later */
        }
      }

      onSuccess(saved);
    } finally {
      setSubmitting(false);
    }
  }

  const specOptions = useMemo(
    () => specs.map((s) => ({ id: s.id, name: s.name })),
    [specs],
  );
  const tagOptions = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name })),
    [tags],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label={t('form.titleLabel')}
        required
        htmlFor="job-title"
        error={errors.title}
        frozen={isFrozen('title')}
        freezeReason={freezeReasonText}
      >
        <Input
          id="job-title"
          value={values.title}
          onChange={(e) => setValue('title', e.target.value)}
          maxLength={200}
          required
          disabled={isFrozen('title')}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'job-title-error' : undefined}
        />
      </Field>

      <Field
        label={t('form.descriptionLabel')}
        htmlFor="job-description"
        error={errors.description}
        frozen={isFrozen('description')}
        freezeReason={freezeReasonText}
      >
        <Textarea
          id="job-description"
          rows={4}
          value={values.description}
          onChange={(e) => setValue('description', e.target.value)}
          maxLength={10000}
          disabled={isFrozen('description')}
        />
      </Field>

      <Field
        label={t('form.payTypeLabel')}
        required
        htmlFor="job-pay-type"
        frozen={isFrozen('pay_type')}
        freezeReason={freezeReasonText}
      >
        <Select
          value={values.pay_type}
          onValueChange={(v) => setValue('pay_type', v as 'DAY_RATE' | 'FIXED_PRICE')}
          disabled={isFrozen('pay_type')}
        >
          <SelectTrigger id="job-pay-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DAY_RATE">{t('card.payDayRate')}</SelectItem>
            <SelectItem value="FIXED_PRICE">{t('card.payFixed')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {values.pay_type === 'DAY_RATE' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t('form.dayRateMinLabel')}
            htmlFor="job-day-min"
            error={errors.day_rate_min}
            frozen={isFrozen('day_rate_min')}
            freezeReason={freezeReasonText}
          >
            <Input
              id="job-day-min"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={values.day_rate_min}
              onChange={(e) => setValue('day_rate_min', e.target.value)}
              disabled={isFrozen('day_rate_min')}
            />
          </Field>
          <Field
            label={t('form.dayRateMaxLabel')}
            htmlFor="job-day-max"
            error={errors.day_rate_max}
            frozen={isFrozen('day_rate_max')}
            freezeReason={freezeReasonText}
          >
            <Input
              id="job-day-max"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={values.day_rate_max}
              onChange={(e) => setValue('day_rate_max', e.target.value)}
              disabled={isFrozen('day_rate_max')}
            />
          </Field>
        </div>
      ) : (
        <Field
          label={t('form.fixedPriceLabel')}
          htmlFor="job-fixed"
          error={errors.fixed_price}
          frozen={isFrozen('fixed_price')}
          freezeReason={freezeReasonText}
        >
          <Input
            id="job-fixed"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={values.fixed_price}
            onChange={(e) => setValue('fixed_price', e.target.value)}
            disabled={isFrozen('fixed_price')}
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={t('form.postcodeLabel')}
          htmlFor="job-postcode"
          error={errors.postcode_area}
          frozen={isFrozen('postcode_area')}
          freezeReason={freezeReasonText}
        >
          <PostcodeAreaSelect
            id="job-postcode"
            value={values.postcode_area}
            onChange={(v) => setValue('postcode_area', v.toUpperCase())}
            options={POSTCODE_AREAS}
            disabled={isFrozen('postcode_area')}
            invalid={Boolean(errors.postcode_area)}
          />
        </Field>
        <Field
          label={t('form.durationLabel')}
          htmlFor="job-duration"
          error={errors.duration_days}
        >
          <Input
            id="job-duration"
            type="number"
            inputMode="numeric"
            min="1"
            value={values.duration_days}
            onChange={(e) => setValue('duration_days', e.target.value)}
          />
        </Field>
      </div>

      <Field
        label={t('form.siteAddressLabel')}
        htmlFor="job-site-address"
        error={errors.site_address}
      >
        <Input
          id="job-site-address"
          value={values.site_address}
          onChange={(e) => setValue('site_address', e.target.value)}
          maxLength={300}
          placeholder={t('form.siteAddressPlaceholder')}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('form.startDateLabel')} htmlFor="job-start">
          <Input
            id="job-start"
            type="date"
            value={values.start_date}
            onChange={(e) => setValue('start_date', e.target.value)}
          />
        </Field>
        <Field
          label={t('form.expiresLabel')}
          htmlFor="job-expires"
          error={errors.expires_at}
        >
          <Input
            id="job-expires"
            type="date"
            value={values.expires_at}
            onChange={(e) => setValue('expires_at', e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={values.is_urgent}
          onChange={(e) => setValue('is_urgent', e.target.checked)}
          className="h-4 w-4"
        />
        {t('form.markUrgent')}
      </label>

      <Field
        label={t('form.specialisationsLabel')}
        htmlFor="job-specs"
        error={errors.specialisation_ids}
        frozen={isFrozen('specialisation_ids')}
        freezeReason={freezeReasonText}
      >
        <ChipMultiSelect
          id="job-specs"
          ariaLabel={t('form.specialisationsLabel')}
          options={specOptions}
          selectedIds={values.specialisation_ids}
          onChange={(next) => setValue('specialisation_ids', next)}
          placeholder={specsLoading ? t('form.loading') : t('form.searchSpecialisations')}
          emptyText={t('form.noSpecialisationsMatch')}
          disabled={isFrozen('specialisation_ids')}
          loading={specsLoading}
          maxSelectedHint={10}
        />
      </Field>

      <Field
        label={t('form.tagsLabel')}
        htmlFor="job-tags"
        error={errors.tag_ids}
      >
        <ChipMultiSelect
          id="job-tags"
          ariaLabel={t('form.tagsLabel')}
          options={tagOptions}
          selectedIds={values.tag_ids}
          onChange={(next) => setValue('tag_ids', next)}
          placeholder={tagsLoading ? t('form.loading') : t('form.searchTags')}
          emptyText={t('form.noTagsMatch')}
          loading={tagsLoading}
          maxSelectedHint={10}
        />
      </Field>

      <AttachmentsField
        value={values.attachments}
        onChange={(next) => setValue('attachments', next)}
        helperText={t('form.attachmentsHelper')}
      />

      {errors.form ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {errors.form}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('form.cancel')}
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode === 'create'
              ? t('form.posting')
              : t('form.saving')
            : (submitLabel ?? (mode === 'create' ? t('form.postJob') : t('form.saveChanges')))}
        </Button>
      </div>
    </form>
  );
}
JobPostForm.displayName = 'JobPostForm';

function PostcodeAreaSelect({
  id,
  value,
  onChange,
  options,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { t } = useTranslation('jobs');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return options;
    return options.filter((p) => p.includes(q));
  }, [options, value]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('form.postcodePlaceholder')}
          maxLength={10}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className="pr-9 uppercase"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? t('form.closePostcodeList') : t('form.openPostcodeList')}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 flex items-center px-2 text-fg-muted hover:text-fg disabled:opacity-50"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
      {open && !disabled ? (
        <div
          id={`${id}-list`}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border-default bg-raised shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-muted">{t('form.noMatches')}</p>
          ) : (
            <ul className="py-1">
              {filtered.map((opt, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = opt === value.trim().toUpperCase();
                return (
                  <li
                    key={opt}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(opt);
                    }}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm text-fg',
                      isActive && 'bg-subtle',
                      isSelected && 'font-medium',
                    )}
                  >
                    <span>{opt}</span>
                    {isSelected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  frozen,
  freezeReason,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  frozen?: boolean;
  freezeReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </Label>
        {frozen && freezeReason ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-fg-muted"
            title={freezeReason}
          >
            <Info className="h-3 w-3" />
            {freezeReason}
          </span>
        ) : null}
      </div>
      <div className={cn(frozen && 'opacity-60')}>{children}</div>
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
