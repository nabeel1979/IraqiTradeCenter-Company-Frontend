import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Search,
  X,
  Filter,
  Plus,
  Pencil,
  Trash2,
  Printer,
  CheckCircle2,
  RotateCcw,
  Eye,
  LogIn,
  LogOut,
  ChevronLeft,
  ChevronRight,
  History,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { EntityAuditDialog } from '@/components/audit/EntityAuditDialog';
import { auditApi, AUDIT_ACTIONS, type AuditLogDto } from '@/lib/api/audit';
import { usersApi } from '@/lib/api/users';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatLocalizedAuditPayload } from '@/lib/audit/formatPayload';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

/** الكيانات التي يدعمها سجل المراقبة حالياً (تظهر في فلتر نوع الكيان). */
const ENTITY_TYPES = [
  'JournalEntry',
  'Voucher',
  'VoucherAttachment',
  'CashBox',
  'CashBoxTransfer',
  'Account',
  'FiscalYear',
  'CompanySettings',
  'CurrencyRateBulletin',
  'VoucherType',
  'AttachmentStorageSettings',
  'User',
  'Role',
] as const;

const ACTION_VISUALS: Record<string, { icon: typeof Activity; tone: string }> = {
  Create:  { icon: Plus,         tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Update:  { icon: Pencil,       tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  Delete:  { icon: Trash2,       tone: 'text-destructive bg-destructive/10 border-destructive/30' },
  Print:   { icon: Printer,      tone: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  Post:    { icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Unpost:  { icon: RotateCcw,    tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  Reverse: { icon: RotateCcw,    tone: 'text-destructive bg-destructive/10 border-destructive/30' },
  View:    { icon: Eye,          tone: 'text-muted-foreground bg-secondary/40 border-border' },
  Login:   { icon: LogIn,        tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Logout:  { icon: LogOut,       tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

/**
 * صياغة الوقت دائماً بالأرقام والشهور الإنجليزية حتى في الواجهة العربية.
 * المراقبة سجل تقني — التواريخ بالميلادي/الإنجليزي تُسهّل قراءة عدّة سجلات
 * وأنواع رقمية (IP/IDs) على نفس السطر.
 */
function formatWhen(iso: string): string {
  if (!iso) return iso;
  // ‎الخادم يخزّن الوقت UTC، لكنّ SQL Server/EF يُعيده بـ Kind=Unspecified فيُسلسَل
  // ‎بلا لاحقة Z؛ لو تركناه يُفسَّر محلياً (على خادم بتوقيت بغداد) لظهر ناقصاً 3 ساعات.
  // ‎لذا نُلحق Z حين لا يحمل النص أي مؤشّر منطقة زمنية، ثم نعرضه بتوقيت بغداد.
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Baghdad',
  }).format(d);
}

/**
 * يحوّل تاريخ بصيغة <input type="date"> (YYYY-MM-DD) إلى ISO UTC.
 * `endOfDay` يحدّد ما إذا كان يجب اعتبار التاريخ نهاية اليوم (23:59:59.999)
 * أم بدايته (00:00:00). نستخدمه لجعل فلتر "إلى" شاملاً اليوم كاملاً.
 */
function dateInputToUtc(value: string | null | undefined, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const local = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  return local.toISOString();
}

/** يُرجع YYYY-MM-DD بتوقيت بغداد لتاريخ معيّن (أو اليوم إذا لم يُمرَّر شيء). */
function toBaghdadDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Baghdad',
  }).format(d);
}

/** يُرجع YYYY-01-01 لبداية السنة الحالية بتوقيت بغداد. */
function currentYearStart(): string {
  const year = new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Baghdad' }).format(new Date());
  return `${year}-01-01`;
}

export function AuditPage() {
  const { t } = useTranslation();
  const { isRtl } = useLocale();

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('');
  const [entityType, setEntityType] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  // ── الافتراضي: من بداية السنة حتى اليوم
  const [fromDate, setFromDate] = useState<string>(() => currentYearStart());
  const [toDate, setToDate] = useState<string>(() => toBaghdadDateString());
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string; subtitle?: string } | null>(null);

  // ‎جلب قائمة المستخدمين لفلتر "بواسطة المستخدم". نُحمّلها مرّة واحدة ونُبقيها
  // ‎مخزّنة لدقيقتين لأن قائمة المستخدمين نادراً ما تتغيّر داخل جلسة الإدارة.
  const usersQuery = useQuery({
    queryKey: ['users', 'audit-filter'],
    queryFn: () => usersApi.list(),
    staleTime: 2 * 60 * 1000,
  });
  const users = usersQuery.data ?? [];
  const usersById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.fullName);
    return m;
  }, [users]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['audit-list', { pageNumber, pageSize, search, action, entityType, userId, fromDate, toDate }],
    queryFn: () =>
      auditApi.list({
        pageNumber,
        pageSize,
        search: search.trim() || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        userId: userId || undefined,
        fromUtc: dateInputToUtc(fromDate, false),
        toUtc: dateInputToUtc(toDate, true),
      }),
    placeholderData: prev => prev,
  });

  const total = data?.totalCount ?? 0;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const to = Math.min(total, pageNumber * pageSize);

  const DEFAULT_FROM = currentYearStart();
  const DEFAULT_TO   = toBaghdadDateString();
  // يُعتبر هناك فلتر فعّال إذا تغيّر أي حقل عن القيمة الافتراضية
  const hasFilters = !!(
    search || action || entityType || userId ||
    (fromDate && fromDate !== DEFAULT_FROM) ||
    (toDate && toDate !== DEFAULT_TO)
  );
  const clearFilters = () => {
    setSearch('');
    setAction('');
    setEntityType('');
    setUserId('');
    setFromDate(DEFAULT_FROM);
    setToDate(DEFAULT_TO);
    setPageNumber(1);
  };

  const entityLabel = (type: string) =>
    t(`audit.entities.${type}`, { defaultValue: type });

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <CardTitle>{t('audit.title')}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('audit.subtitle')}
                  {total > 0 && (
                    <>
                      {' · '}
                      <span className="num-display">{total.toLocaleString('en-US')}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-3.5 w-3.5" />
                {t('audit.filters.clear')}
              </Button>
            )}
          </div>

          {/*
            صف الفلاتر الأساسية:
              • بحث (يشمل الوصف، المستخدم، معرّف الكيان)
              • نوع العملية
              • نوع الكيان
              • المستخدم (قائمة بأسماء كل المستخدمين)
          */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="relative md:col-span-5">
              <Search className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-2.5' : 'left-2.5')} />
              <Input
                placeholder={t('audit.filters.search')}
                value={search}
                onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
                className={cn(isRtl ? 'pr-9' : 'pl-9')}
              />
            </div>

            <select
              className="h-10 rounded-md border border-input bg-secondary/40 px-3 text-sm md:col-span-2"
              value={action}
              onChange={e => { setAction(e.target.value); setPageNumber(1); }}
              title={t('audit.filters.action')}
            >
              <option value="">{t('audit.filters.allActions')}</option>
              {AUDIT_ACTIONS.map(a => (
                <option key={a} value={a}>
                  {t(`audit.actions.${a}`, { defaultValue: a })}
                </option>
              ))}
            </select>

            <select
              className="h-10 rounded-md border border-input bg-secondary/40 px-3 text-sm md:col-span-2"
              value={entityType}
              onChange={e => { setEntityType(e.target.value); setPageNumber(1); }}
              title={t('audit.filters.entityType')}
            >
              <option value="">{t('audit.filters.allTypes')}</option>
              {ENTITY_TYPES.map(et => (
                <option key={et} value={et}>{entityLabel(et)}</option>
              ))}
            </select>

            <div className="md:col-span-3 relative">
              <User className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none', isRtl ? 'right-2.5' : 'left-2.5')} />
              <select
                className={cn(
                  'h-10 w-full appearance-none rounded-md border border-input bg-secondary/40 px-3 text-sm',
                  isRtl ? 'pr-9' : 'pl-9',
                )}
                value={userId}
                onChange={e => { setUserId(e.target.value); setPageNumber(1); }}
                title={t('audit.filters.user')}
                disabled={usersQuery.isLoading}
              >
                <option value="">{t('audit.filters.allUsers')}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/*
            صف التواريخ: حقلَي تاريخ (من/إلى) + شريط الفترات السريعة المشترك مع
            بقية التقارير (اليوم، أمس، هذا الأسبوع، الشهر، السنة المالية…).
          */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <Input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPageNumber(1); }}
              title={t('audit.filters.from')}
              className="num-display md:col-span-2"
              dir="ltr"
            />
            <Input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPageNumber(1); }}
              title={t('audit.filters.to')}
              className="num-display md:col-span-2"
              dir="ltr"
            />
            <div className="md:col-span-8 flex items-center">
              <DateRangePresets
                from={fromDate}
                to={toDate}
                onChange={(f, ti) => {
                  setFromDate(f);
                  setToDate(ti);
                  setPageNumber(1);
                }}
                showLabel={false}
                showFiscalYearBadge={false}
                className="w-full"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <LoadingSpinner text={t('common.loading')} />
          ) : isError ? (
            <EmptyState icon={Activity} title={t('audit.loadError')} description={t('common.serverConnectionError')} />
          ) : items.length === 0 ? (
            <EmptyState icon={Filter} title={t('audit.noResults')} description={t('audit.subtitle')} />
          ) : (
            <ol className="space-y-2">
              {items.map((row: AuditLogDto) => {
                const visual = ACTION_VISUALS[row.action] ?? { icon: Activity, tone: 'text-muted-foreground bg-secondary/40 border-border' };
                const Icon = visual.icon;
                // ‎نعرض اسم المستخدم القادم مع السطر، ونتأكد بإحضاره من قائمة
                // ‎المستخدمين إذا كانت قيمة السجل فارغة (مفيد للسجلات القديمة).
                const userName = row.userName ?? (row.userId ? usersById.get(row.userId) ?? null : null);
                return (
                  <li
                    key={row.id}
                    className="group rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0 flex-1">
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', visual.tone)}>
                          <Icon className="h-3 w-3" />
                          {t(`audit.actions.${row.action}`, { defaultValue: row.action })}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                          {entityLabel(row.entityType)}
                        </span>
                        <span className="num-display rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground" dir="ltr">
                          #{row.entityId}
                        </span>
                        {userName && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            {userName}
                          </span>
                        )}
                        <span className="num-display text-[11px] text-muted-foreground" dir="ltr">
                          {formatWhen(row.occurredAtUtc)}
                        </span>
                        {row.ipAddress && (
                          <span className="num-display rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground" dir="ltr">
                            {row.ipAddress}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedEntity({
                            type: row.entityType,
                            id: row.entityId,
                            subtitle: `${entityLabel(row.entityType)} · #${row.entityId}`,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                        title={t('audit.openButtonTip')}
                      >
                        <History className="h-3 w-3" />
                        {t('audit.openButton')}
                      </button>
                    </div>

                    {row.summary && (
                      <p className="mt-1.5 text-sm text-foreground/90 break-words">{row.summary}</p>
                    )}
                    {row.detailsJson && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                          {t('audit.details.raw')}
                        </summary>
                        <pre
                          className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] text-muted-foreground"
                          dir={isRtl ? 'rtl' : 'ltr'}
                        >
                          {formatLocalizedAuditPayload(row.detailsJson, t)}
                        </pre>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('audit.page.pageSize')}</span>
            <select
              className="h-8 rounded-md border border-input bg-secondary/40 px-2 text-xs"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageNumber(1); }}
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {isFetching && <span className="ms-2 text-amber-400">⟳</span>}
          </div>

          <div className="text-xs text-muted-foreground num-display" dir="ltr">
            {t('audit.page.pagination', {
              from: from.toLocaleString('en-US'),
              to: to.toLocaleString('en-US'),
              total: total.toLocaleString('en-US'),
            })}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber === 1}
              className="h-8 gap-1"
            >
              {isRtl ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
              {t('audit.page.previous')}
            </Button>
            <span className="num-display px-2 text-xs text-muted-foreground" dir="ltr">
              {pageNumber} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
              disabled={pageNumber >= totalPages}
              className="h-8 gap-1"
            >
              {t('audit.page.next')}
              {isRtl ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedEntity && (
        <EntityAuditDialog
          open={!!selectedEntity}
          onClose={() => setSelectedEntity(null)}
          entityType={selectedEntity.type}
          entityId={selectedEntity.id}
          subtitle={selectedEntity.subtitle}
        />
      )}
    </div>
  );
}
