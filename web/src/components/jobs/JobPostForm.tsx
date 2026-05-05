import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
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
import { ChipMultiSelect } from './ChipMultiSelect';
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
  freezeReason = 'Locked — applications received',
  onSuccess,
  onCancel,
  submitLabel,
}: JobPostFormProps) {
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
    if (!values.title.trim()) e.title = 'Title is required.';
    else if (values.title.length > 200) e.title = 'Title must be 200 characters or fewer.';

    if (values.description.length > 10000)
      e.description = 'Description is too long.';

    if (
      values.postcode_area &&
      !POSTCODE_OUTWARD_REGEX.test(values.postcode_area.toUpperCase())
    ) {
      e.postcode_area = 'Use a valid UK outward code (e.g. SW1, EC2A).';
    }

    if (values.site_address.length > 300)
      e.site_address = 'Site address must be 300 characters or fewer.';

    if (values.pay_type === 'DAY_RATE') {
      const min = values.day_rate_min ? Number(values.day_rate_min) : null;
      const max = values.day_rate_max ? Number(values.day_rate_max) : null;
      if (min != null && (Number.isNaN(min) || min <= 0))
        e.day_rate_min = 'Day rate min must be a positive number.';
      if (max != null && (Number.isNaN(max) || max <= 0))
        e.day_rate_max = 'Day rate max must be a positive number.';
      if (min != null && max != null && max < min)
        e.day_rate_max = 'Max must be greater than or equal to min.';
    } else {
      const fixed = values.fixed_price ? Number(values.fixed_price) : null;
      if (fixed != null && (Number.isNaN(fixed) || fixed <= 0))
        e.fixed_price = 'Fixed price must be a positive number.';
    }

    if (values.duration_days) {
      const n = Number(values.duration_days);
      if (!Number.isInteger(n) || n <= 0)
        e.duration_days = 'Duration must be a positive whole number.';
    }

    if (values.expires_at) {
      const t = new Date(values.expires_at).getTime();
      if (Number.isNaN(t)) e.expires_at = 'Invalid date.';
      else if (t < Date.now()) e.expires_at = 'Expiry must be in the future.';
    }

    if (values.specialisation_ids.length > 10)
      e.specialisation_ids = 'Pick up to 10 specialisations.';
    if (values.tag_ids.length > 10) e.tag_ids = 'Pick up to 10 tags.';

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
      const created = await api<{ id: string | number }>(path, {
        method,
        body: JSON.stringify(body),
      });
      onSuccess(created);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrors({ form: parsed?.message ?? 'Could not save the job.' });
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
        label="Title"
        required
        htmlFor="job-title"
        error={errors.title}
        frozen={isFrozen('title')}
        freezeReason={freezeReason}
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
        label="Description"
        htmlFor="job-description"
        error={errors.description}
        frozen={isFrozen('description')}
        freezeReason={freezeReason}
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
        label="Pay type"
        required
        htmlFor="job-pay-type"
        frozen={isFrozen('pay_type')}
        freezeReason={freezeReason}
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
            <SelectItem value="DAY_RATE">Day rate</SelectItem>
            <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {values.pay_type === 'DAY_RATE' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Day rate min (£)"
            htmlFor="job-day-min"
            error={errors.day_rate_min}
            frozen={isFrozen('day_rate_min')}
            freezeReason={freezeReason}
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
            label="Day rate max (£)"
            htmlFor="job-day-max"
            error={errors.day_rate_max}
            frozen={isFrozen('day_rate_max')}
            freezeReason={freezeReason}
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
          label="Fixed price (£)"
          htmlFor="job-fixed"
          error={errors.fixed_price}
          frozen={isFrozen('fixed_price')}
          freezeReason={freezeReason}
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
          label="Postcode area"
          htmlFor="job-postcode"
          error={errors.postcode_area}
          frozen={isFrozen('postcode_area')}
          freezeReason={freezeReason}
        >
          <Input
            id="job-postcode"
            list="job-postcode-suggestions"
            value={values.postcode_area}
            onChange={(e) =>
              setValue('postcode_area', e.target.value.toUpperCase())
            }
            placeholder="e.g. SW1"
            maxLength={10}
            disabled={isFrozen('postcode_area')}
          />
          <datalist id="job-postcode-suggestions">
            {POSTCODE_AREAS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Duration (days)"
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
        label="Site address"
        htmlFor="job-site-address"
        error={errors.site_address}
      >
        <Input
          id="job-site-address"
          value={values.site_address}
          onChange={(e) => setValue('site_address', e.target.value)}
          maxLength={300}
          placeholder="Optional — only shared with shortlisted workers"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start date" htmlFor="job-start">
          <Input
            id="job-start"
            type="date"
            value={values.start_date}
            onChange={(e) => setValue('start_date', e.target.value)}
          />
        </Field>
        <Field
          label="Expires"
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
        Mark as urgent
      </label>

      <Field
        label="Specialisations"
        htmlFor="job-specs"
        error={errors.specialisation_ids}
        frozen={isFrozen('specialisation_ids')}
        freezeReason={freezeReason}
      >
        <ChipMultiSelect
          id="job-specs"
          ariaLabel="Specialisations"
          options={specOptions}
          selectedIds={values.specialisation_ids}
          onChange={(next) => setValue('specialisation_ids', next)}
          placeholder={specsLoading ? 'Loading…' : 'Search specialisations'}
          emptyText="No specialisations match."
          disabled={isFrozen('specialisation_ids')}
          loading={specsLoading}
          maxSelectedHint={10}
        />
      </Field>

      <Field
        label="Tags"
        htmlFor="job-tags"
        error={errors.tag_ids}
      >
        <ChipMultiSelect
          id="job-tags"
          ariaLabel="Tags"
          options={tagOptions}
          selectedIds={values.tag_ids}
          onChange={(next) => setValue('tag_ids', next)}
          placeholder={tagsLoading ? 'Loading…' : 'Search tags'}
          emptyText="No tags match."
          loading={tagsLoading}
          maxSelectedHint={10}
        />
      </Field>

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
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode === 'create'
              ? 'Posting…'
              : 'Saving…'
            : (submitLabel ?? (mode === 'create' ? 'Post job' : 'Save changes'))}
        </Button>
      </div>
    </form>
  );
}
JobPostForm.displayName = 'JobPostForm';

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
