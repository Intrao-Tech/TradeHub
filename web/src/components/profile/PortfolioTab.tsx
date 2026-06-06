import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslateFn } from '@/i18n/types';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  FileText,
  Pencil,
  Plus,
  ShieldCheck,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MEDIA_PER_ITEM_LIMIT = 20;

type PortfolioMedia = {
  id: string | number;
  media_url: string;
  caption?: string | null;
  sort_order?: number | null;
};

type LinkedDocument = {
  document_id: string | number;
  document: {
    id: string | number;
    doc_type?: string;
    file_url?: string | null;
    status?: string;
  };
};

type ExperienceDetail = {
  company_name?: string | null;
  role?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type ProjectDetail = {
  project_type?: string | null;
  site_postcode?: string | null;
  completed_at?: string | null;
  project_value?: string | number | null;
};

type CertificationDetail = {
  cert_type?: string;
  cert_number?: string | null;
  issuing_body?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
};

export type PortfolioItem = {
  id: string | number;
  item_type: 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION' | string;
  title: string;
  description?: string | null;
  sort_order?: number | null;
  verified?: boolean;
  experience_detail?: ExperienceDetail | null;
  project_detail?: ProjectDetail | null;
  certification_detail?: CertificationDetail | null;
  portfolio_media?: PortfolioMedia[];
  portfolio_item_documents?: LinkedDocument[];
};

type DocumentRow = {
  id: string | number;
  doc_type?: string;
  status?: string;
  file_url?: string;
};

type CreateForm =
  | { type: 'EXPERIENCE'; title: string; description: string; company_name: string; role: string; start_date: string; end_date: string }
  | { type: 'PROJECT'; title: string; description: string; project_type: string; site_postcode: string; completed_at: string; project_value: string }
  | { type: 'CERTIFICATION'; title: string; description: string; cert_type: string; cert_number: string; issuing_body: string; issued_at: string; expires_at: string };

const EMPTY_EXPERIENCE: CreateForm = {
  type: 'EXPERIENCE',
  title: '',
  description: '',
  company_name: '',
  role: '',
  start_date: '',
  end_date: '',
};
const EMPTY_PROJECT: CreateForm = {
  type: 'PROJECT',
  title: '',
  description: '',
  project_type: '',
  site_postcode: '',
  completed_at: '',
  project_value: '',
};
const EMPTY_CERT: CreateForm = {
  type: 'CERTIFICATION',
  title: '',
  description: '',
  cert_type: '',
  cert_number: '',
  issuing_body: '',
  issued_at: '',
  expires_at: '',
};

type PortfolioTabProps = {
  workerId: string;
  flash: (msg: string, err?: string) => void;
};

export function PortfolioTab({ workerId, flash }: PortfolioTabProps) {
  const { t } = useTranslation('profile');
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PortfolioItem | null>(null);
  const [createType, setCreateType] = useState<'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION'>('EXPERIENCE');
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_EXPERIENCE);

  const reload = useCallback(async () => {
    if (!workerId) return;
    try {
      const data = await api<PortfolioItem[]>(`/portfolio/worker/${workerId}`);
      setItems(data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('portfolio.loadError'));
    }
  }, [workerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate(type: 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION') {
    setCreateType(type);
    setCreateForm(
      type === 'EXPERIENCE'
        ? EMPTY_EXPERIENCE
        : type === 'PROJECT'
          ? EMPTY_PROJECT
          : EMPTY_CERT,
    );
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (createForm.type === 'EXPERIENCE') {
        const body: Record<string, string> = { title: createForm.title };
        if (createForm.description) body.description = createForm.description;
        if (createForm.company_name) body.company_name = createForm.company_name;
        if (createForm.role) body.role = createForm.role;
        if (createForm.start_date) body.start_date = createForm.start_date;
        if (createForm.end_date) body.end_date = createForm.end_date;
        await api('/portfolio/experience', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else if (createForm.type === 'PROJECT') {
        const body: Record<string, string | number> = { title: createForm.title };
        if (createForm.description) body.description = createForm.description;
        if (createForm.project_type) body.project_type = createForm.project_type;
        if (createForm.site_postcode) body.site_postcode = createForm.site_postcode;
        if (createForm.completed_at) body.completed_at = createForm.completed_at;
        if (createForm.project_value) body.project_value = Number(createForm.project_value);
        await api('/portfolio/project', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else {
        const body: Record<string, string> = {
          title: createForm.title,
          cert_type: createForm.cert_type,
        };
        if (createForm.description) body.description = createForm.description;
        if (createForm.cert_number) body.cert_number = createForm.cert_number;
        if (createForm.issuing_body) body.issuing_body = createForm.issuing_body;
        if (createForm.issued_at) body.issued_at = createForm.issued_at;
        if (createForm.expires_at) body.expires_at = createForm.expires_at;
        await api('/portfolio/certification', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      flash(t('portfolio.added', { type: labelFor(createType, t) }));
      startCreate(createType);
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('portfolio.saveError'));
    }
  }

  async function deleteItem(id: string | number) {
    setError('');
    try {
      await api(`/portfolio/${id}`, { method: 'DELETE' });
      flash(t('portfolio.deleted'));
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('portfolio.deleteError'));
    }
  }

  async function move(item: PortfolioItem, direction: -1 | 1) {
    if (!items) return;
    const sorted = [...items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const idx = sorted.findIndex((x) => x.id === item.id);
    const target = idx + direction;
    if (target < 0 || target >= sorted.length) return;
    const swap = sorted[target];
    const a = item.sort_order ?? idx;
    const b = swap.sort_order ?? target;
    try {
      await Promise.all([
        api(`/portfolio/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: b }),
        }),
        api(`/portfolio/${swap.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: a }),
        }),
      ]);
      await reload();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed?.message ?? t('portfolio.reorderError'));
    }
  }

  const sortedItems = useMemo(
    () =>
      items
        ? [...items].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          )
        : null,
    [items],
  );

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

      <Card>
        <CardHeader>
          <CardTitle>{t('portfolio.cardTitle')}</CardTitle>
          <CardDescription>{t('portfolio.cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!sortedItems ? (
            <p className="text-sm text-fg-muted">{t('portfolio.loading')}</p>
          ) : sortedItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedItems.map((item, idx) => (
                <PortfolioItemRow
                  key={String(item.id)}
                  item={item}
                  onEdit={() => setEditing(item)}
                  onDelete={() => deleteItem(item.id)}
                  onMoveUp={idx > 0 ? () => move(item, -1) : undefined}
                  onMoveDown={
                    idx < sortedItems.length - 1
                      ? () => move(item, 1)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Briefcase}
              title={t('portfolio.noneTitle')}
              description={t('portfolio.noneDesc')}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('portfolio.addTitle')}</CardTitle>
          <CardDescription>{t('portfolio.addDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2.5">
            <Label>{t('portfolio.itemType')}</Label>
            <Select
              value={createType}
              onValueChange={(v) => {
                const t = v as 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION';
                startCreate(t);
              }}
            >
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPERIENCE">{t('portfolio.typeExperience')}</SelectItem>
                <SelectItem value="PROJECT">{t('portfolio.typeProject')}</SelectItem>
                <SelectItem value="CERTIFICATION">{t('portfolio.typeCertification')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CreateFormSection
            form={createForm}
            onChange={setCreateForm}
            onSubmit={submitCreate}
          />
        </CardContent>
      </Card>

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            void reload();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {editing ? (
            <ItemEditor
              item={editing}
              onSaved={async () => {
                await reload();
                const fresh = await api<PortfolioItem>(`/portfolio/${editing.id}`).catch(() => null);
                if (fresh) setEditing(fresh);
              }}
              onError={(msg) => setError(msg)}
              flash={flash}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TFn = TranslateFn;

function labelFor(type: string, t: TFn): string {
  if (type === 'EXPERIENCE') return t('portfolio.typeExperience');
  if (type === 'PROJECT') return t('portfolio.typeProject');
  if (type === 'CERTIFICATION') return t('portfolio.typeCertification');
  return type;
}

function PortfolioItemRow({
  item,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  item: PortfolioItem;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t } = useTranslation('profile');
  const firstMedia = item.portfolio_media?.[0];
  const thumb = publicFileUrl(firstMedia?.media_url);

  return (
    <Card className="bg-subtle">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="h-16 w-16 flex-none rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{labelFor(item.item_type, t)}</Badge>
              {item.verified ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {t('portfolio.verified')}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-fg">{item.title}</p>
            {item.description ? (
              <p className="mt-1 line-clamp-3 text-xs text-fg-muted">
                {item.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('portfolio.moveUp')}
              disabled={!onMoveUp}
              onClick={onMoveUp}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('portfolio.moveDown')}
              disabled={!onMoveDown}
              onClick={onMoveDown}
            >
              <ArrowDown />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              <Pencil />
              {t('portfolio.edit')}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('portfolio.deleteItem')}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateFormSection({
  form,
  onChange,
  onSubmit,
}: {
  form: CreateForm;
  onChange: (form: CreateForm) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const { t } = useTranslation('profile');
  if (form.type === 'EXPERIENCE') {
    return (
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('portfolio.fieldTitle')}
          id="exp-title"
          value={form.title}
          required
          onChange={(v) => onChange({ ...form, title: v })}
          colSpan2
        />
        <FieldArea
          label={t('portfolio.fieldDescription')}
          id="exp-desc"
          value={form.description}
          onChange={(v) => onChange({ ...form, description: v })}
        />
        <Field
          label={t('portfolio.fieldCompany')}
          id="exp-company"
          value={form.company_name}
          onChange={(v) => onChange({ ...form, company_name: v })}
        />
        <Field
          label={t('portfolio.fieldRole')}
          id="exp-role"
          value={form.role}
          onChange={(v) => onChange({ ...form, role: v })}
        />
        <Field
          label={t('portfolio.fieldStart')}
          id="exp-start"
          type="date"
          value={form.start_date}
          onChange={(v) => onChange({ ...form, start_date: v })}
        />
        <Field
          label={t('portfolio.fieldEnd')}
          id="exp-end"
          type="date"
          value={form.end_date}
          onChange={(v) => onChange({ ...form, end_date: v })}
        />
        <div className="sm:col-span-2">
          <Button type="submit">
            <Plus />
            {t('portfolio.addExperience')}
          </Button>
        </div>
      </form>
    );
  }
  if (form.type === 'PROJECT') {
    return (
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('portfolio.fieldTitle')}
          id="proj-title"
          value={form.title}
          required
          onChange={(v) => onChange({ ...form, title: v })}
          colSpan2
        />
        <FieldArea
          label={t('portfolio.fieldDescription')}
          id="proj-desc"
          value={form.description}
          onChange={(v) => onChange({ ...form, description: v })}
        />
        <Field
          label={t('portfolio.fieldProjectType')}
          id="proj-type"
          value={form.project_type}
          onChange={(v) => onChange({ ...form, project_type: v })}
        />
        <Field
          label={t('portfolio.fieldSitePostcode')}
          id="proj-postcode"
          value={form.site_postcode}
          onChange={(v) => onChange({ ...form, site_postcode: v })}
        />
        <Field
          label={t('portfolio.fieldCompleted')}
          id="proj-completed"
          type="date"
          value={form.completed_at}
          onChange={(v) => onChange({ ...form, completed_at: v })}
        />
        <Field
          label={t('portfolio.fieldProjectValue')}
          id="proj-value"
          type="number"
          step="0.01"
          value={form.project_value}
          onChange={(v) => onChange({ ...form, project_value: v })}
        />
        <div className="sm:col-span-2">
          <Button type="submit">
            <Plus />
            {t('portfolio.addProject')}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t('portfolio.fieldTitle')}
        id="cert-title"
        value={form.title}
        required
        onChange={(v) => onChange({ ...form, title: v })}
        colSpan2
      />
      <FieldArea
        label={t('portfolio.fieldDescription')}
        id="cert-desc"
        value={form.description}
        onChange={(v) => onChange({ ...form, description: v })}
      />
      <Field
        label={t('portfolio.fieldCertType')}
        id="cert-type"
        value={form.cert_type}
        required
        onChange={(v) => onChange({ ...form, cert_type: v })}
      />
      <Field
        label={t('portfolio.fieldCertNumber')}
        id="cert-number"
        value={form.cert_number}
        onChange={(v) => onChange({ ...form, cert_number: v })}
      />
      <Field
        label={t('portfolio.fieldIssuingBody')}
        id="cert-body"
        value={form.issuing_body}
        onChange={(v) => onChange({ ...form, issuing_body: v })}
        colSpan2
      />
      <Field
        label={t('portfolio.fieldIssued')}
        id="cert-issued"
        type="date"
        value={form.issued_at}
        onChange={(v) => onChange({ ...form, issued_at: v })}
      />
      <Field
        label={t('portfolio.fieldExpires')}
        id="cert-expires"
        type="date"
        value={form.expires_at}
        onChange={(v) => onChange({ ...form, expires_at: v })}
      />
      <div className="sm:col-span-2">
        <Button type="submit">
          <Plus />
          {t('portfolio.addCertification')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  value,
  type = 'text',
  step,
  required,
  colSpan2,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  type?: string;
  step?: string;
  required?: boolean;
  colSpan2?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`space-y-2 ${colSpan2 ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldArea({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Editor dialog ──────────────────────────────────────────────────

function ItemEditor({
  item,
  onSaved,
  onError,
  flash,
}: {
  item: PortfolioItem;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  flash: (msg: string, err?: string) => void;
}) {
  const { t } = useTranslation('profile');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('portfolio.editTitle', { type: labelFor(item.item_type, t).toLowerCase() })}</DialogTitle>
        <DialogDescription>{item.title}</DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">{t('portfolio.tabDetails')}</TabsTrigger>
          <TabsTrigger value="media">{t('portfolio.tabMedia')}</TabsTrigger>
          <TabsTrigger value="documents">{t('portfolio.tabDocuments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <DetailsForm item={item} onSaved={onSaved} flash={flash} onError={onError} />
        </TabsContent>

        <TabsContent value="media">
          <MediaSection item={item} onChanged={onSaved} flash={flash} onError={onError} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsSection item={item} onChanged={onSaved} flash={flash} onError={onError} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function DetailsForm({
  item,
  onSaved,
  flash,
  onError,
}: {
  item: PortfolioItem;
  onSaved: () => Promise<void>;
  flash: (msg: string, err?: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation('profile');
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');

  // Type-specific
  const exp = item.experience_detail ?? {};
  const proj = item.project_detail ?? {};
  const cert = item.certification_detail ?? {};

  const [companyName, setCompanyName] = useState(exp.company_name ?? '');
  const [role, setRole] = useState(exp.role ?? '');
  const [startDate, setStartDate] = useState(
    exp.start_date ? String(exp.start_date).slice(0, 10) : '',
  );
  const [endDate, setEndDate] = useState(
    exp.end_date ? String(exp.end_date).slice(0, 10) : '',
  );

  const [projectType, setProjectType] = useState(proj.project_type ?? '');
  const [sitePostcode, setSitePostcode] = useState(proj.site_postcode ?? '');
  const [completedAt, setCompletedAt] = useState(
    proj.completed_at ? String(proj.completed_at).slice(0, 10) : '',
  );
  const [projectValue, setProjectValue] = useState(
    proj.project_value != null ? String(proj.project_value) : '',
  );

  const [certType, setCertType] = useState(cert.cert_type ?? '');
  const [certNumber, setCertNumber] = useState(cert.cert_number ?? '');
  const [issuingBody, setIssuingBody] = useState(cert.issuing_body ?? '');
  const [issuedAt, setIssuedAt] = useState(
    cert.issued_at ? String(cert.issued_at).slice(0, 10) : '',
  );
  const [expiresAt, setExpiresAt] = useState(
    cert.expires_at ? String(cert.expires_at).slice(0, 10) : '',
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/portfolio/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description: description || null }),
      });
      if (item.item_type === 'EXPERIENCE') {
        await api(`/portfolio/${item.id}/experience`, {
          method: 'PATCH',
          body: JSON.stringify({
            company_name: companyName || null,
            role: role || null,
            start_date: startDate || null,
            end_date: endDate || null,
          }),
        });
      } else if (item.item_type === 'PROJECT') {
        await api(`/portfolio/${item.id}/project`, {
          method: 'PATCH',
          body: JSON.stringify({
            project_type: projectType || null,
            site_postcode: sitePostcode || null,
            completed_at: completedAt || null,
            project_value:
              projectValue.trim() !== '' ? Number(projectValue) : null,
          }),
        });
      } else if (item.item_type === 'CERTIFICATION') {
        await api(`/portfolio/${item.id}/certification`, {
          method: 'PATCH',
          body: JSON.stringify({
            cert_type: certType,
            cert_number: certNumber || null,
            issuing_body: issuingBody || null,
            issued_at: issuedAt || null,
            expires_at: expiresAt || null,
          }),
        });
      }
      flash(t('portfolio.updated'));
      await onSaved();
    } catch (err) {
      const parsed = parseApiError(err);
      onError(parsed?.message ?? t('portfolio.saveError'));
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t('portfolio.fieldTitle')}
        id="ed-title"
        value={title}
        required
        onChange={setTitle}
        colSpan2
      />
      <FieldArea
        label={t('portfolio.fieldDescription')}
        id="ed-desc"
        value={description}
        onChange={setDescription}
      />

      {item.item_type === 'EXPERIENCE' ? (
        <>
          <Field
            label={t('portfolio.fieldCompany')}
            id="ed-company"
            value={companyName}
            onChange={setCompanyName}
          />
          <Field label={t('portfolio.fieldRole')} id="ed-role" value={role} onChange={setRole} />
          <Field
            label={t('portfolio.fieldStart')}
            id="ed-start"
            type="date"
            value={startDate}
            onChange={setStartDate}
          />
          <Field
            label={t('portfolio.fieldEnd')}
            id="ed-end"
            type="date"
            value={endDate}
            onChange={setEndDate}
          />
        </>
      ) : null}

      {item.item_type === 'PROJECT' ? (
        <>
          <Field
            label={t('portfolio.fieldProjectType')}
            id="ed-proj-type"
            value={projectType}
            onChange={setProjectType}
          />
          <Field
            label={t('portfolio.fieldSitePostcode')}
            id="ed-postcode"
            value={sitePostcode}
            onChange={setSitePostcode}
          />
          <Field
            label={t('portfolio.fieldCompleted')}
            id="ed-completed"
            type="date"
            value={completedAt}
            onChange={setCompletedAt}
          />
          <Field
            label={t('portfolio.fieldProjectValue')}
            id="ed-value"
            type="number"
            step="0.01"
            value={projectValue}
            onChange={setProjectValue}
          />
        </>
      ) : null}

      {item.item_type === 'CERTIFICATION' ? (
        <>
          <Field
            label={t('portfolio.fieldCertType')}
            id="ed-cert-type"
            value={certType}
            required
            onChange={setCertType}
          />
          <Field
            label={t('portfolio.fieldCertNumber')}
            id="ed-cert-number"
            value={certNumber}
            onChange={setCertNumber}
          />
          <Field
            label={t('portfolio.fieldIssuingBody')}
            id="ed-issuing"
            value={issuingBody}
            onChange={setIssuingBody}
            colSpan2
          />
          <Field
            label={t('portfolio.fieldIssued')}
            id="ed-issued"
            type="date"
            value={issuedAt}
            onChange={setIssuedAt}
          />
          <Field
            label={t('portfolio.fieldExpires')}
            id="ed-expires"
            type="date"
            value={expiresAt}
            onChange={setExpiresAt}
          />
        </>
      ) : null}

      <DialogFooter className="sm:col-span-2">
        <Button type="submit">{t('portfolio.saveChanges')}</Button>
      </DialogFooter>
    </form>
  );
}

function MediaSection({
  item,
  onChanged,
  flash,
  onError,
}: {
  item: PortfolioItem;
  onChanged: () => Promise<void>;
  flash: (msg: string, err?: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const media = item.portfolio_media ?? [];
  const atLimit = media.length >= MEDIA_PER_ITEM_LIMIT;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (atLimit) {
      onError(t('portfolio.mediaLimit', { count: MEDIA_PER_ITEM_LIMIT }));
      return;
    }
    setUploading(true);
    try {
      const accepted = Array.from(files).slice(
        0,
        MEDIA_PER_ITEM_LIMIT - media.length,
      );
      for (const file of accepted) {
        if (!MEDIA_ALLOWED_MIMES.includes(file.type)) {
          onError(t('portfolio.mediaUseImage', { name: file.name }));
          continue;
        }
        if (file.size > MEDIA_MAX_BYTES) {
          onError(t('portfolio.mediaTooLarge', { name: file.name }));
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        if (caption) formData.append('caption', caption);
        await api(`/portfolio/${item.id}/media/upload`, {
          method: 'POST',
          body: formData,
        });
      }
      flash(t('portfolio.mediaUploaded'));
      setCaption('');
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      onError(parsed?.message ?? t('portfolio.mediaUploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function deleteMedia(mediaId: string | number) {
    try {
      await api(`/portfolio/media/${mediaId}`, { method: 'DELETE' });
      flash(t('portfolio.mediaRemoved'));
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      onError(parsed?.message ?? t('portfolio.mediaRemoveError'));
    }
  }

  return (
    <div className="space-y-4">
      {media.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) => {
            const url = publicFileUrl(m.media_url);
            return (
              <figure key={String(m.id)} className="relative">
                {url ? (
                  <img
                    src={url}
                    alt={m.caption ?? ''}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-md bg-subtle text-fg-muted">
                    <FileText />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => deleteMedia(m.id)}
                  aria-label={t('portfolio.removeMedia')}
                  className="absolute right-1 top-1 rounded-full bg-overlay p-1 text-fg-on-accent hover:bg-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {m.caption ? (
                  <figcaption className="mt-1 truncate text-xs text-fg-muted">
                    {m.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">{t('portfolio.noMedia')}</p>
      )}

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="media-caption">{t('portfolio.caption')}</Label>
        <Input
          id="media-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={300}
          placeholder={t('portfolio.captionPlaceholder')}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || atLimit}
      >
        <Upload />
        {uploading
          ? t('portfolio.uploading')
          : atLimit
            ? t('portfolio.limitReached')
            : t('portfolio.uploadMedia')}
      </Button>
      <p className="text-xs text-fg-muted">
        {t('portfolio.mediaHint', { count: MEDIA_PER_ITEM_LIMIT })}
      </p>
    </div>
  );
}

function DocumentsSection({
  item,
  onChanged,
  flash,
  onError,
}: {
  item: PortfolioItem;
  onChanged: () => Promise<void>;
  flash: (msg: string, err?: string) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation('profile');
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [picked, setPicked] = useState('');

  useEffect(() => {
    api<DocumentRow[]>('/documents/me')
      .then((rows) => setDocs(rows.filter((d) => d.status === 'APPROVED')))
      .catch((err) => {
        const parsed = parseApiError(err);
        onError(parsed?.message ?? t('portfolio.docsLoadError'));
      });
  }, [onError]);

  const linked = item.portfolio_item_documents ?? [];
  const linkedIds = new Set(linked.map((l) => String(l.document_id)));
  const available = (docs ?? []).filter((d) => !linkedIds.has(String(d.id)));

  async function link() {
    if (!picked) return;
    try {
      await api(`/portfolio/${item.id}/documents/${picked}`, {
        method: 'POST',
      });
      flash(t('portfolio.docLinked'));
      setPicked('');
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      onError(parsed?.message ?? t('portfolio.docLinkError'));
    }
  }

  async function unlink(documentId: string | number) {
    try {
      await api(`/portfolio/${item.id}/documents/${documentId}`, {
        method: 'DELETE',
      });
      flash(t('portfolio.docUnlinked'));
      await onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      onError(parsed?.message ?? t('portfolio.docUnlinkError'));
    }
  }

  return (
    <div className="space-y-4">
      {linked.length > 0 ? (
        <ul className="divide-y divide-border-default rounded-md border border-border-default">
          {linked.map((l) => (
            <li
              key={String(l.document_id)}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-fg-muted" />
                <span className="font-medium text-fg">
                  {l.document?.doc_type ?? t('portfolio.documentFallback')}
                </span>
                {l.document?.status ? (
                  <Badge variant="success">{l.document.status}</Badge>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => unlink(l.document_id)}
              >
                {t('portfolio.unlink')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t('portfolio.noDocsLinked')}</p>
      )}

      <div className="flex flex-col gap-2.5">
        <Label>{t('portfolio.linkApproved')}</Label>
        {docs == null ? (
          <p className="text-sm text-fg-muted">{t('portfolio.loadingDocs')}</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('portfolio.noApproved')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger className="sm:w-72">
                <SelectValue placeholder={t('portfolio.pickDocument')} />
              </SelectTrigger>
              <SelectContent>
                {available.map((d) => (
                  <SelectItem key={String(d.id)} value={String(d.id)}>
                    {d.doc_type} · #{String(d.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={link} disabled={!picked}>
              {t('portfolio.link')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
