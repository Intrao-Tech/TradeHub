import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Search, ScrollText } from 'lucide-react';
import { api, parseApiError } from '../../api';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '../EmptyState';

type AuditRow = {
  id: string | number;
  account_id: string | number | null;
  account: { id: string | number; email: string } | null;
  action: string;
  entity_type: string | null;
  entity_id: string | number | null;
  metadata: unknown;
  ip_address: string | null;
  created_at: string;
};

type AuditPage = {
  data: AuditRow[];
  total: number;
  page: number;
  limit: number;
};

export function AdminAuditTab() {
  const { t } = useTranslation('admin');
  const [searchParams] = useSearchParams();
  const [accountId, setAccountId] = useState('');
  const [action, setAction] = useState(searchParams.get('action') ?? '');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [data, setData] = useState<AuditPage | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const usp = new URLSearchParams();
      if (accountId.trim()) usp.set('account_id', accountId.trim());
      if (action.trim()) usp.set('action', action.trim());
      if (entityType.trim()) usp.set('entity_type', entityType.trim());
      if (fromDate) usp.set('from_date', fromDate);
      if (toDate) usp.set('to_date', toDate);
      usp.set('page', String(page));
      usp.set('limit', String(limit));
      const d = await api<AuditPage>(`/audit?${usp.toString()}`);
      setData(d);
    } catch (e) {
      setErr(parseApiError(e)?.message ?? t('audit.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accountId, action, entityType, fromDate, toDate, page, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  function search(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    void load();
  }

  function totalPages(): number {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limit));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-fg-muted" />
          <CardTitle>{t('audit.title')}</CardTitle>
        </div>
        <CardDescription>{t('audit.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="a-account" className="text-xs">{t('audit.accountId')}</Label>
            <Input
              id="a-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={t('audit.accountIdPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-action" className="text-xs">{t('audit.action')}</Label>
            <Input
              id="a-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={t('audit.actionPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-entity" className="text-xs">{t('audit.entityType')}</Label>
            <Input
              id="a-entity"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder={t('audit.entityTypePlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-from" className="text-xs">{t('audit.from')}</Label>
            <Input
              id="a-from"
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-to" className="text-xs">{t('audit.to')}</Label>
            <Input
              id="a-to"
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={loading}>
              <Search className="h-3.5 w-3.5" />
              {loading ? t('audit.searching') : t('audit.search')}
            </Button>
          </div>
        </form>

        {err ? (
          <div className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {err}
          </div>
        ) : null}

        {data && data.data.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={t('audit.noMatch')}
            description={t('audit.noMatchDesc')}
          />
        ) : data ? (
          <>
            <div className="rounded border border-border-subtle overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t('audit.colWhen')}</TableHead>
                    <TableHead>{t('audit.colAccount')}</TableHead>
                    <TableHead>{t('audit.colAction')}</TableHead>
                    <TableHead>{t('audit.colEntity')}</TableHead>
                    <TableHead className="w-20">{t('audit.colIp')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((r) => {
                    const isOpen = !!expanded[String(r.id)];
                    return (
                      <Fragment key={String(r.id)}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded((m) => ({
                              ...m,
                              [String(r.id)]: !isOpen,
                            }))
                          }
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-fg-muted" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-fg-muted" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-fg-muted whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.account ? (
                              <>
                                <div className="font-medium">{r.account.email}</div>
                                <div className="text-fg-muted">#{r.account.id}</div>
                              </>
                            ) : (
                              <span className="text-fg-muted">{t('audit.system')}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {r.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.entity_type ? (
                              <>
                                <div>{r.entity_type}</div>
                                {r.entity_id != null ? (
                                  <div className="text-fg-muted">#{String(r.entity_id)}</div>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-fg-muted">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-fg-muted font-mono">
                            {r.ip_address ?? '—'}
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-subtle/50">
                              {r.metadata != null && Object.keys(r.metadata as object).length > 0 ? (
                                <pre className="text-xs overflow-auto whitespace-pre-wrap p-2">
                                  {JSON.stringify(r.metadata, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-xs text-fg-muted px-2 py-1">
                                  {t('audit.noMetadata')}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>
                {t('audit.pageLine', {
                  page: data.page,
                  pages: totalPages(),
                  total: data.total,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('users.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages()}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('users.next')}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
