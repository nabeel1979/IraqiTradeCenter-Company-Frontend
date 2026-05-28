import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  Archive,
  X,
  Star,
  AlertTriangle,
  Save,
  RefreshCw,
  Download,
  Copy,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { currencyRateBulletinsApi } from '@/lib/api/currencyRateBulletins';
import { companySettingsApi } from '@/lib/api/companySettings';
import { currenciesApi, type CurrencyDto } from '@/lib/api/currencies';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────
// التواريخ والأوقات تُعرض دائماً بتوقيت بغداد (Asia/Baghdad, UTC+3)
// بنسق ثابت لا يتأثر بـ locale المتصفح:
//   التاريخ: DD/MM/YYYY    مثال: 18/05/2026
//   الوقت  : HH:MM (24h)   مثال: 23:21
// ─────────────────────────────────────────
const BAGHDAD_TZ = 'Asia/Baghdad';

function getBaghdadParts(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BAGHDAD_TZ,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  // en-GB hour: '2-digit' hour12:false قد يُرجع "24" بدل "00" — نُصححه
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour,
    minute: get('minute'),
  };
}

function formatBaghdadDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const p = getBaghdadParts(d);
  if (!p) return '—';
  return `${p.day}/${p.month}/${p.year}`;
}

function formatBaghdadTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const p = getBaghdadParts(d);
  if (!p) return '—';
  return `${p.hour}:${p.minute}`;
}
import type {
  CurrencyRateBulletinDto,
  CurrencyRateBulletinStatus,
  CurrencyRateLinePayload,
  CurrencyRateOperation,
} from '@/types/api';

function useStatusBadge() {
  const { t } = useTranslation();
  return {
    1: { label: t('bulletins.statusDraft'), cls: 'bg-warning/15 text-warning border-warning/30' },
    2: { label: t('bulletins.statusPublished'), cls: 'bg-success/15 text-success border-success/30' },
    3: { label: t('bulletins.statusArchived'), cls: 'bg-muted text-muted-foreground border-border' },
  } as Record<CurrencyRateBulletinStatus, { label: string; cls: string }>;
}

interface DraftLine {
  key: string;
  currency: string;
  rate: string;
  operation: CurrencyRateOperation;
  notes: string;
}

const newLine = (currency = '', operation: CurrencyRateOperation = 1): DraftLine => ({
  key: Math.random().toString(36).slice(2),
  currency,
  rate: '',
  operation,
  notes: '',
});

/**
 * يُحوّل ISO UTC إلى قيمة input[type=datetime-local] **بتوقيت بغداد**.
 * بهذا الشكل، عند فتح النموذج من أي منطقة زمنية، المستخدم يرى الوقت كما هو في بغداد.
 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = getBaghdadParts(iso);
  if (!p) return '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * يُحوّل قيمة input[type=datetime-local] (تُعتبر **بتوقيت بغداد**) إلى ISO UTC.
 * مثال: "2026-05-18T23:21" بتوقيت بغداد ⇒ "2026-05-18T20:21:00.000Z"
 */
function fromLocalInput(v: string): string {
  if (!v) return new Date().toISOString();
  // ندفع الإزاحة "+03:00" يدوياً ليتم تفسير القيمة كتوقيت بغداد، ثم نحوّل لـ UTC
  // ملاحظة: العراق لا يطبق التوقيت الصيفي حالياً، فالإزاحة ثابتة +03:00.
  const withOffset = `${v}:00+03:00`;
  const d = new Date(withOffset);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** الـ "now" بتوقيت بغداد كقيمة datetime-local */
function nowBaghdadInput(): string {
  return toLocalInput(new Date().toISOString());
}

export function CurrencyRateBulletinsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<CurrencyRateBulletinDto | null>(null);
  /** قالب مأخوذ من نشرة قائمة (للاستيراد/النسخ): يُستخدم كقيم افتراضية */
  const [template, setTemplate] = useState<CurrencyRateBulletinDto | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const company = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const baseCurrencyDefault = (company.data?.currency ?? 'IQD').toUpperCase();

  const bulletinsQuery = useQuery({
    queryKey: ['currency-rate-bulletins', includeArchived],
    queryFn: () =>
      currencyRateBulletinsApi.getAll({ includeArchived }),
  });

  const bulletins = bulletinsQuery.data ?? [];
  const defaultBulletin = bulletins.find(b => b.isDefault);

  const publishM = useMutation({
    mutationFn: (id: number) => currencyRateBulletinsApi.publish(id),
    onSuccess: r => {
      if ((r as any).success) {
        toast.success(t('bulletins.toast.published'));
        qc.invalidateQueries({ queryKey: ['currency-rate-bulletins'] });
      } else {
        toast.error((r as any).message || t('bulletins.toast.publishFailed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('bulletins.toast.publishFailed')),
  });

  const archiveM = useMutation({
    mutationFn: (id: number) => currencyRateBulletinsApi.archive(id),
    onSuccess: () => {
      toast.success(t('bulletins.toast.archived'));
      qc.invalidateQueries({ queryKey: ['currency-rate-bulletins'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('bulletins.toast.archiveFailed')),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => currencyRateBulletinsApi.delete(id),
    onSuccess: () => {
      toast.success(t('bulletins.toast.deleted'));
      qc.invalidateQueries({ queryKey: ['currency-rate-bulletins'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('bulletins.toast.deleteFailed')),
  });

  const onCreateNew = () => {
    setEditing(null);
    setTemplate(null);
    setShowForm(true);
  };

  const onEdit = (b: CurrencyRateBulletinDto) => {
    setEditing(b);
    setTemplate(null);
    setShowForm(true);
  };

  /** فتح نموذج جديد مع قيم منسوخة من نشرة قائمة */
  const onCloneFrom = (b: CurrencyRateBulletinDto) => {
    setEditing(null);
    setTemplate(b);
    setShowImport(false);
    setShowForm(true);
  };

  return (
    <div className="space-y-3 pt-2">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('bulletins.baseCurrency')}:</span>
            <Badge variant="outline" className="font-semibold">{baseCurrencyDefault}</Badge>
            {defaultBulletin && (
              <span className="ms-3 inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">
                <Star className="h-3 w-3" />
                {t('bulletins.defaultBulletin')}: <span className="font-semibold">{defaultBulletin.name}</span>
                <span className="text-muted-foreground"> — {formatBaghdadDate(defaultBulletin.effectiveAt)} {formatBaghdadTime(defaultBulletin.effectiveAt)}</span>
              </span>
            )}
            {!defaultBulletin && (
              <span className="ms-3 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                <AlertTriangle className="h-3 w-3" />
                {t('bulletins.noDefault')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={e => setIncludeArchived(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              {t('bulletins.showArchived')}
            </label>
            <Button size="sm" variant="ghost" onClick={() => bulletinsQuery.refetch()} className="h-8 gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowImport(true)}
              className="h-8 gap-1.5 text-xs"
              title={t('bulletins.importTip')}
            >
              <Download className="h-3.5 w-3.5" />
              {t('bulletins.importBtn')}
            </Button>
            <Button size="sm" onClick={onCreateNew} className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              {t('bulletins.newBtn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {bulletinsQuery.isLoading ? (
        <LoadingSpinner text={t('common.loading')} />
      ) : bulletins.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('bulletins.empty.title')}
          description={t('bulletins.empty.description')}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {bulletins.map(b => (
            <BulletinCard
              key={b.id}
              bulletin={b}
              onEdit={() => onEdit(b)}
              onClone={() => onCloneFrom(b)}
              onPublish={() => publishM.mutate(b.id)}
              onArchive={() => archiveM.mutate(b.id)}
              onDelete={() => {
                if (confirm(t('bulletins.confirmDelete', { name: b.name }))) deleteM.mutate(b.id);
              }}
              loading={publishM.isPending || archiveM.isPending || deleteM.isPending}
            />
          ))}
        </div>
      )}

      {showForm && (
        <BulletinFormDialog
          bulletin={editing}
          template={template}
          baseCurrencyDefault={baseCurrencyDefault}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setTemplate(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            setTemplate(null);
            qc.invalidateQueries({ queryKey: ['currency-rate-bulletins'] });
          }}
        />
      )}

      {showImport && (
        <ImportFromBulletinDialog
          onClose={() => setShowImport(false)}
          onPick={onCloneFrom}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Bulletin card
// ─────────────────────────────────────────
function BulletinCard({
  bulletin,
  onEdit,
  onClone,
  onPublish,
  onArchive,
  onDelete,
  loading,
}: {
  bulletin: CurrencyRateBulletinDto;
  onEdit: () => void;
  onClone: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const STATUS_BADGE = useStatusBadge();
  const status = STATUS_BADGE[bulletin.status];
  return (
    <Card className={cn('relative', bulletin.isDefault && 'border-success/40 bg-success/5')}>
      {bulletin.isDefault && (
        <div className="absolute -top-2 end-3 inline-flex items-center gap-1 rounded-full border border-success/30 bg-success px-2 py-0.5 text-[10px] font-bold text-success-foreground shadow">
          <Star className="h-3 w-3" />
          {t('bulletins.defaultBadge')}
        </div>
      )}
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-bold">{bulletin.name}</h3>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  status.cls
                )}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                {t('bulletins.effectiveAt')}:{' '}
                <span className="font-medium text-foreground tnum">
                  {formatBaghdadDate(bulletin.effectiveAt)} {formatBaghdadTime(bulletin.effectiveAt)}
                </span>
                <span className="ms-1 text-[9px] text-muted-foreground">({t('bulletins.baghdadTz')})</span>
              </span>
              <span>{t('bulletins.base')}: <span className="font-bold text-foreground">{bulletin.baseCurrency}</span></span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {bulletin.status === 1 && (
              <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-1.5" title={t('common.edit')}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClone}
              disabled={loading}
              className="h-7 px-1.5 text-primary hover:bg-primary/10"
              title={t('bulletins.cloneTip')}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {bulletin.status === 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onPublish}
                disabled={loading}
                className="h-7 gap-1 px-1.5 text-success hover:bg-success/15"
                title={t('bulletins.publish')}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {bulletin.status !== 3 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onArchive}
                disabled={loading}
                className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
                title={t('bulletins.archive')}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
            {bulletin.status !== 2 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={loading}
                className="h-7 px-1.5 text-destructive hover:bg-destructive/10"
                title={t('common.delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {bulletin.notes && (
          <p className="mt-1.5 truncate text-[11px] italic text-muted-foreground" title={bulletin.notes}>
            {bulletin.notes}
          </p>
        )}

        <div className="mt-2 overflow-hidden rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-[10.5px] text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-start font-semibold">{t('bulletins.col.currency')}</th>
                <th className="px-2 py-1 text-end font-semibold">{t('bulletins.col.rate')}</th>
                <th className="px-2 py-1 text-center font-semibold">{t('bulletins.col.operation')}</th>
                <th className="px-2 py-1 text-start font-semibold">{t('bulletins.col.formula')}</th>
              </tr>
            </thead>
            <tbody>
              {bulletin.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-center text-[11px] text-muted-foreground">
                    {t('bulletins.noLines')}
                  </td>
                </tr>
              ) : (
                bulletin.lines.map(l => (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="px-2 py-1 font-bold">{l.currency}</td>
                    <td className="px-2 py-1 text-end tnum">{l.rate.toLocaleString()}</td>
                    <td className="px-2 py-1 text-center">
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded text-[12px] font-bold',
                          l.operation === 1
                            ? 'bg-primary/15 text-primary'
                            : 'bg-warning/20 text-warning'
                        )}
                        title={l.operation === 1 ? t('bulletins.multiply') : t('bulletins.divide')}
                      >
                        {l.operation === 1 ? '×' : '÷'}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-start text-[10.5px] text-muted-foreground tnum">
                      1 {l.currency} {l.operation === 1 ? '×' : '÷'} {l.rate.toLocaleString()} = ?
                      <span className="text-foreground"> {bulletin.baseCurrency}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// Form dialog (create / edit)
// ─────────────────────────────────────────
function BulletinFormDialog({
  bulletin,
  template,
  baseCurrencyDefault,
  onClose,
  onSaved,
}: {
  bulletin: CurrencyRateBulletinDto | null;
  template?: CurrencyRateBulletinDto | null;
  baseCurrencyDefault: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!bulletin;
  const source = bulletin ?? template ?? null;
  const [name, setName] = useState(
    bulletin?.name ?? (template ? t('bulletins.form.copyFrom', { name: template.name }) : '')
  );
  // العملة الأساسية للنشرة مقفولة على العملة الرئيسية للنظام:
  //  - عند الإنشاء (جديدة أو نسخ من نشرة): تُؤخذ من إعدادات النظام
  //  - عند التعديل (نشرة قائمة): نُبقيها كما كانت للقراءة فقط لأنها قد تختلف عن الحالية
  //    (تغيير العملة الرئيسية للنظام يجب أن يكون عبر صفحة الإعدادات لا من النشرة)
  const lockedBaseCurrency = (
    bulletin?.baseCurrency ?? baseCurrencyDefault
  ).toUpperCase();
  const [baseCurrency] = useState(lockedBaseCurrency);
  const [effectiveAt, setEffectiveAt] = useState(
    bulletin ? toLocalInput(bulletin.effectiveAt) : nowBaghdadInput()
  );
  const [notes, setNotes] = useState(
    bulletin?.notes ?? (template?.notes ? `(${t('bulletins.form.copiedFrom', { name: template.name })}) ${template.notes}` : '')
  );
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() => {
    if (source && source.lines.length > 0) {
      return source.lines.map(l => ({
        key: bulletin ? String(l.id) : Math.random().toString(36).slice(2),
        currency: l.currency,
        rate: String(l.rate),
        operation: l.operation,
        notes: l.notes ?? '',
      }));
    }
    return [newLine('')];
  });

  // العملات المفعّلة فقط (مرتّبة حسب DisplayOrder من الإعدادات)
  const enabledCurrenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60 * 1000,
  });
  const enabledCurrencies = enabledCurrenciesQuery.data ?? [];

  const upd = (idx: number, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) =>
    setLines(prev => prev.filter((_, i) => i !== idx));

  const addLine = () => setLines(prev => [...prev, newLine()]);

  const createM = useMutation({
    mutationFn: () =>
      currencyRateBulletinsApi.create({
        name,
        baseCurrency,
        effectiveAt: fromLocalInput(effectiveAt),
        notes: notes || null,
        publishImmediately,
        lines: buildPayload(lines),
      }),
    onSuccess: r => {
      if ((r as any).success) {
        toast.success(t('bulletins.toast.created'));
        onSaved();
      } else {
        toast.error((r as any).message || t('bulletins.toast.createFailed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('bulletins.toast.createFailed')),
  });

  const updateM = useMutation({
    mutationFn: () =>
      currencyRateBulletinsApi.update(bulletin!.id, {
        name,
        baseCurrency,
        effectiveAt: fromLocalInput(effectiveAt),
        notes: notes || null,
        lines: buildPayload(lines),
      }),
    onSuccess: r => {
      if ((r as any).success) {
        toast.success(t('bulletins.toast.updated'));
        onSaved();
      } else {
        toast.error((r as any).message || t('bulletins.toast.updateFailed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('bulletins.toast.updateFailed')),
  });

  const submit = () => {
    if (!name.trim()) return toast.error(t('bulletins.form.nameRequired'));
    if (!baseCurrency.trim()) return toast.error(t('bulletins.form.baseCurrencyRequired'));
    const payloadLines = buildPayload(lines);
    if (payloadLines.length === 0) return toast.error(t('bulletins.form.addAtLeastOneLine'));
    if (isEdit) updateM.mutate();
    else createM.mutate();
  };

  const submitting = createM.isPending || updateM.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="text-sm font-bold">
            {isEdit ? t('bulletins.form.titleEdit', { name: bulletin!.name }) : t('bulletins.form.titleNew')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4">
          {!isEdit && template && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px]">
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>
                {t('bulletins.form.importedFrom')} <span className="font-bold text-primary">{template.name}</span>
                {template.status === 3 && <span className="ms-1 text-muted-foreground">({t('bulletins.statusArchived')})</span>}
                — {t('bulletins.form.editBeforeSave')}
              </span>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <Label className="mb-1 block text-[11px]">{t('bulletins.form.name')}</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('bulletins.form.namePlaceholder')}
                className="h-9"
              />
            </div>
            <div className="md:col-span-3">
              <Label className="mb-1 flex items-center gap-1 text-[11px]">
                <span>{t('bulletins.form.baseCurrencyLabel')}</span>
                <span className="text-[9px] text-muted-foreground">({t('bulletins.form.fromSettings')})</span>
              </Label>
              <Input
                value={baseCurrency}
                readOnly
                disabled
                tabIndex={-1}
                className="h-9 cursor-not-allowed bg-secondary/40 font-bold uppercase opacity-90"
                title={t('bulletins.form.baseCurrencyTip')}
              />
            </div>
            <div className="md:col-span-4">
              <Label className="mb-1 flex items-center gap-1 text-[11px]">
                <span>{t('bulletins.form.effectiveAt')}</span>
                <span className="text-[9px] text-muted-foreground">({t('bulletins.baghdadTz')})</span>
              </Label>
              <Input
                type="datetime-local"
                value={effectiveAt}
                onChange={e => setEffectiveAt(e.target.value)}
                className="h-9 tnum"
                title={t('bulletins.form.effectiveAtTip')}
              />
            </div>
            <div className="md:col-span-12">
              <Label className="mb-1 block text-[11px]">{t('bulletins.form.notes')}</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('bulletins.form.notesPlaceholder')}
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-md border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 bg-secondary/30 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">{t('bulletins.form.linesTitle')}</span>
              <Button size="sm" variant="ghost" onClick={addLine} className="h-6 gap-1 text-[10.5px]">
                <Plus className="h-3 w-3" />
                {t('bulletins.form.addLine')}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/20 text-[10.5px] text-muted-foreground">
                  <tr>
                    <th className="w-56 px-2 py-1.5 text-start font-semibold">{t('bulletins.col.currency')}</th>
                    <th className="w-28 px-2 py-1.5 text-start font-semibold">{t('bulletins.col.rate')}</th>
                    <th className="w-40 px-2 py-1.5 text-start font-semibold">{t('bulletins.col.operation')}</th>
                    <th className="px-2 py-1.5 text-start font-semibold">{t('bulletins.col.note')}</th>
                    <th className="w-10 px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.key} className="border-t border-border/40">
                      <td className="p-1.5">
                        <CurrencyInput
                          value={l.currency}
                          onChange={v => upd(idx, { currency: v })}
                          baseCurrency={baseCurrency}
                          existing={lines.filter((_, j) => j !== idx).map(x => x.currency.toUpperCase())}
                          enabledCurrencies={enabledCurrencies}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="0.000001"
                          min={0}
                          value={l.rate}
                          onChange={e => upd(idx, { rate: e.target.value })}
                          placeholder="0.00"
                          className="h-8 text-end tnum"
                        />
                      </td>
                      <td className="p-1.5">
                        <div className="flex h-8 items-center overflow-hidden rounded-md border border-input">
                          <button
                            type="button"
                            onClick={() => upd(idx, { operation: 1 })}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-1 px-2 text-[11px] transition-colors',
                              l.operation === 1
                                ? 'bg-primary/15 font-semibold text-primary'
                                : 'text-muted-foreground hover:bg-secondary/40'
                            )}
                            title={t('bulletins.multiplyFormula')}
                          >
                            <span className="text-base font-bold">×</span>
                            {t('bulletins.multiply')}
                          </button>
                          <span className="h-full w-px bg-border" />
                          <button
                            type="button"
                            onClick={() => upd(idx, { operation: 2 })}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-1 px-2 text-[11px] transition-colors',
                              l.operation === 2
                                ? 'bg-warning/20 font-semibold text-warning'
                                : 'text-muted-foreground hover:bg-secondary/40'
                            )}
                            title={t('bulletins.divideFormula')}
                          >
                            <span className="text-base font-bold">÷</span>
                            {t('bulletins.divide')}
                          </button>
                        </div>
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={l.notes}
                          onChange={e => upd(idx, { notes: e.target.value })}
                          placeholder="—"
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(idx)}
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">{t('bulletins.form.formulaTitle')}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li><span className="font-bold">{t('bulletins.multiply')} (×):</span> {t('bulletins.form.multiplyDesc', { base: baseCurrency || 'IQD' })}</li>
              <li><span className="font-bold">{t('bulletins.divide')} (÷):</span> {t('bulletins.form.divideDesc', { base: baseCurrency || 'IQD' })}</li>
            </ul>
          </div>

          {!isEdit && (
            <label className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2 text-xs">
              <input
                type="checkbox"
                checked={publishImmediately}
                onChange={e => setPublishImmediately(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>
                <span className="font-semibold">{t('bulletins.form.publishImmediately')}:</span> {t('bulletins.form.publishImmediatelyDesc')}
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {isEdit ? t('common.saveChanges') : t('bulletins.form.saveBulletin')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * منتقي عملة مخصّص:
 *  - يعرض فقط العملات المفعّلة من إعدادات النظام
 *  - يستثني العملة الأساسية للنشرة والعملات المستخدَمة فعلاً في الأسطر الأخرى
 *  - يدعم الكتابة للبحث + التصفّح من القائمة
 */
function CurrencyInput({
  value,
  onChange,
  baseCurrency,
  existing,
  enabledCurrencies,
}: {
  value: string;
  onChange: (v: string) => void;
  baseCurrency: string;
  existing: string[];
  enabledCurrencies: CurrencyDto[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popupRect, setPopupRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const baseUp = baseCurrency.trim().toUpperCase();
  const existingUp = useMemo(
    () => new Set(existing.map(e => e.trim().toUpperCase()).filter(Boolean)),
    [existing]
  );

  // العملات المتاحة = المفعّلة − العملة الأساسية − المستخدمة في أسطر أخرى
  // (نُبقي القيمة الحالية للسطر إن كانت موجودة في القائمة، حتى لا تختفي عند التحرير)
  const availableOptions = useMemo(() => {
    const valUp = value.trim().toUpperCase();
    return enabledCurrencies.filter(c => {
      const code = c.code.toUpperCase();
      if (code === baseUp) return false;
      if (existingUp.has(code) && code !== valUp) return false;
      return true;
    });
  }, [enabledCurrencies, baseUp, existingUp, value]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableOptions;
    return availableOptions.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.nameAr?.toLowerCase().includes(q) ||
      c.nameEn?.toLowerCase().includes(q) ||
      c.numericCode?.toLowerCase().includes(q)
    );
  }, [availableOptions, search]);

  // إغلاق عند النقر خارج الـ container أو الـ popup المرسوم بـ Portal
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // حساب موضع القائمة (Portal) بناء على bounding rect للحاوي
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minWidth = Math.max(r.width, 280);
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - r.bottom;
      const spaceAbove = r.top;
      const popupMaxH = 320;
      const openUpwards = spaceBelow < 200 && spaceAbove > spaceBelow;
      const top = openUpwards
        ? Math.max(8, r.top - Math.min(popupMaxH, spaceAbove - 8) - 4)
        : r.bottom + 4;
      // اضبط الـ left/right بحيث تبقى القائمة داخل الشاشة (ندعم RTL)
      const left = Math.max(
        8,
        Math.min(r.left, window.innerWidth - minWidth - 8)
      );
      setPopupRect({ top, left, width: minWidth });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, filteredOptions.length]);

  const dup = !!value && existingUp.has(value.toUpperCase());
  const isBase = !!value && value.toUpperCase() === baseUp;
  const notEnabled =
    !!value &&
    !isBase &&
    enabledCurrencies.length > 0 &&
    !enabledCurrencies.some(c => c.code.toUpperCase() === value.toUpperCase());

  const pick = (code: string) => {
    onChange(code.toUpperCase());
    setSearch('');
    setOpen(false);
  };

  // عرض القيمة المختارة في الإدخال: الكود + الاسم العربي إن أمكن
  const selectedMeta = useMemo(
    () => enabledCurrencies.find(c => c.code.toUpperCase() === value.toUpperCase()),
    [enabledCurrencies, value]
  );
  const displayValue = open
    ? search
    : selectedMeta
      ? `${selectedMeta.code} — ${selectedMeta.nameAr}`
          : value;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={displayValue}
          onFocus={() => {
            setSearch('');
            setOpen(true);
          }}
          onChange={e => {
            const v = e.target.value.toUpperCase();
            setSearch(v);
            onChange(v);
            if (!open) setOpen(true);
          }}
          placeholder={t('bulletins.form.currencyPlaceholder')}
          className={cn(
            'h-8 pe-7 text-xs font-semibold',
            (dup || isBase || notEnabled) && 'border-destructive focus:border-destructive',
            // اجعل الكود فقط uppercase، لا الاسم العربي
            !selectedMeta && 'uppercase font-bold'
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => {
            e.preventDefault();
            setSearch('');
            setOpen(o => !o);
            inputRef.current?.focus();
          }}
          className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary/40"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>

      {dup && (
        <span className="absolute -bottom-3.5 start-0 text-[9px] text-destructive">{t('bulletins.form.duplicate')}</span>
      )}
      {isBase && (
        <span className="absolute -bottom-3.5 start-0 text-[9px] text-destructive">= {t('bulletins.form.isBaseCurrency')}</span>
      )}
      {notEnabled && !dup && !isBase && (
        <span className="absolute -bottom-3.5 start-0 text-[9px] text-destructive">{t('bulletins.form.notEnabled')}</span>
      )}

      {open && popupRect && createPortal(
        <div
          ref={popupRef}
          dir="rtl"
          style={{
            position: 'fixed',
            top: popupRect.top,
            left: popupRect.left,
            width: popupRect.width,
            zIndex: 9999,
          }}
          className="overflow-hidden rounded-md border border-border bg-popover shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border/60 bg-secondary/40 px-2.5 py-1.5 text-[10.5px]">
              <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{filteredOptions.length}</span>
              {' / '}
              {enabledCurrencies.length} {t('bulletins.form.enabledCurrencies')}
            </span>
            <span className="text-[9.5px] text-muted-foreground">{t('bulletins.form.typeToSearch')}</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                {availableOptions.length === 0
                  ? t('bulletins.form.allUsed')
                  : t('bulletins.form.noSearchResults')}
              </div>
            ) : (
              <ul className="py-1">
                {filteredOptions.map(c => {
                  const isSelected = value.toUpperCase() === c.code.toUpperCase();
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pick(c.code)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-2.5 py-2 text-start text-xs transition-colors hover:bg-primary/10',
                          isSelected && 'bg-primary/15'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-7 min-w-[48px] shrink-0 items-center justify-center rounded-md border px-1.5 text-[11px] font-bold',
                            isSelected
                              ? 'border-primary/50 bg-primary/20 text-primary'
                              : 'border-border bg-secondary/50 text-foreground'
                          )}
                        >
                          {c.code}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12px] font-semibold text-foreground">
                            {c.nameAr}
                          </span>
                          {(c.nameEn || c.numericCode) && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {c.nameEn}
                              {c.nameEn && c.numericCode && ' · '}
                              {c.numericCode && `#${c.numericCode}`}
                            </span>
                          )}
                        </span>
                        {c.symbol && (
                          <span className="shrink-0 rounded bg-secondary/60 px-1.5 py-0.5 text-[10.5px] font-bold text-foreground">
                            {c.symbol}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function buildPayload(lines: DraftLine[]): CurrencyRateLinePayload[] {
  return lines
    .map(l => ({
      currency: l.currency.trim().toUpperCase(),
      rate: parseFloat(l.rate || '0'),
      operation: l.operation,
      notes: l.notes.trim() || null,
    }))
    .filter(l => l.currency && l.rate > 0);
}

// ─────────────────────────────────────────
// Import from existing bulletin (مؤرشفة/منشورة)
// ─────────────────────────────────────────
function ImportFromBulletinDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (b: CurrencyRateBulletinDto) => void;
}) {
  const { t } = useTranslation();
  const STATUS_BADGE = useStatusBadge();
  const [filter, setFilter] = useState<'archived' | 'all'>('archived');
  const [search, setSearch] = useState('');

  const allQuery = useQuery({
    queryKey: ['currency-rate-bulletins-all'],
    queryFn: () => currencyRateBulletinsApi.getAll({ includeArchived: true }),
  });

  const list = (allQuery.data ?? []).filter(b => {
    if (filter === 'archived' && b.status !== 3) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      if (!b.name.toLowerCase().includes(q) &&
          !b.baseCurrency.toLowerCase().includes(q) &&
          !b.lines.some(l => l.currency.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Download className="h-4 w-4 text-primary" />
            {t('bulletins.import.title')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 border-b border-border bg-secondary/10 p-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-input">
              <button
                type="button"
                onClick={() => setFilter('archived')}
                className={cn(
                  'px-3 py-1 text-xs transition-colors',
                  filter === 'archived'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-secondary/50'
                )}
              >
                {t('bulletins.import.archivedOnly')}
              </button>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cn(
                  'px-3 py-1 text-xs transition-colors',
                  filter === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-secondary/50'
                )}
              >
                {t('common.all')}
              </button>
            </div>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('bulletins.import.searchPlaceholder')}
              className="h-8 flex-1 text-xs"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {allQuery.isLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">{t('common.loading')}</div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {filter === 'archived' ? t('bulletins.import.noArchived') : t('bulletins.import.noBulletins')}
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map(b => {
                const status = STATUS_BADGE[b.status];
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onPick(b)}
                      className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-secondary/20 p-2.5 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{b.name}</span>
                          <span className={cn(
                            'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px]',
                            status.cls
                          )}>
                            {status.label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                          <span>{t('bulletins.effectiveAt')}: {formatBaghdadDate(b.effectiveAt)} {formatBaghdadTime(b.effectiveAt)}</span>
                          <span>· {t('bulletins.base')}: <span className="font-bold text-foreground">{b.baseCurrency}</span></span>
                          <span>· {b.lines.length} {t('bulletins.import.currencies')}</span>
                        </div>
                        {b.lines.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {b.lines.slice(0, 6).map(l => (
                              <span
                                key={l.id}
                                className="inline-flex items-center gap-0.5 rounded bg-secondary/50 px-1.5 py-0.5 text-[10px]"
                              >
                                <span className="font-bold">{l.currency}</span>
                                <span className="text-muted-foreground">{l.operation === 1 ? '×' : '÷'}</span>
                                <span className="tnum">{l.rate.toLocaleString()}</span>
                              </span>
                            ))}
                            {b.lines.length > 6 && (
                              <span className="text-[10px] text-muted-foreground">+{b.lines.length - 6}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-primary" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-secondary/10 px-3 py-2 text-[10.5px] text-muted-foreground">
          {t('bulletins.import.hint')}
        </div>
      </div>
    </div>
  );
}
