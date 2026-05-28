import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Search,
  Inbox,
  X,
  Filter,
  FolderTree,
  Wallet,
  FileText,
  BookOpen,
  Tag,
  CalendarRange,
  Coins,
  ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { trashApi, type TrashItemDto } from '@/lib/api/trash';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

/**
 * خريطة من اسم أيقونة (يأتي من Backend كنص) إلى المكوّن الفعلي.
 * عند إضافة نوع كيان جديد نضيف الأيقونة هنا فقط.
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FolderTree,
  Wallet,
  FileText,
  BookOpen,
  Tag,
  CalendarRange,
  Coins,
  ArrowRightLeft,
  Trash2,
  AlertTriangle,
};

function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Baghdad',
  }).format(d);
}

// ════════════════════════════════════════════════════════════════════
// Modal تأكيد مشترك
// ════════════════════════════════════════════════════════════════════
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmVariant = 'destructive',
  loading,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: 'destructive' | 'default';
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 text-sm leading-relaxed">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          {message}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t('common.processing') : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// الصفحة
// ════════════════════════════════════════════════════════════════════
export function TrashPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [restoreTarget, setRestoreTarget] = useState<TrashItemDto | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<TrashItemDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canRestore = can(PERMS.System.Trash.Restore);
  const canPurge = can(PERMS.System.Trash.Purge);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trash-all'],
    queryFn: trashApi.list,
  });

  // ‎بعد أي عملية نُبطل: السلة الموحدة + كل ما يعتمد على الشجرات والقوائم.
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['trash-all'] });
    qc.invalidateQueries({ queryKey: ['accounts-tree'] });
    qc.invalidateQueries({ queryKey: ['accounts-trash'] });
    qc.invalidateQueries({ queryKey: ['cash-boxes'] });
    qc.invalidateQueries({ queryKey: ['journal-entries'] });
    qc.invalidateQueries({ queryKey: ['journal-voucher-types'] });
    qc.invalidateQueries({ queryKey: ['fiscal-years'] });
    qc.invalidateQueries({ queryKey: ['currency-rate-bulletins'] });
    qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
  };

  const restoreMut = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: number }) =>
      trashApi.restore(entityType, id),
    onSuccess: res => {
      if (!res.success) {
        setActionError(res.errors?.join(' / ') ?? t('accountsTrash.restoreFailed'));
        return;
      }
      invalidateAll();
      setRestoreTarget(null);
      setActionError(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { errors?: string[] } } };
      setActionError(e.response?.data?.errors?.join(' / ') ?? t('common.connectionError'));
    },
  });

  const permanentMut = useMutation({
    mutationFn: ({ entityType, id }: { entityType: string; id: number }) =>
      trashApi.permanentlyDelete(entityType, id),
    onSuccess: res => {
      if (!res.success) {
        setActionError(res.errors?.join(' / ') ?? t('accountsTrash.permanentDeleteFailed'));
        return;
      }
      invalidateAll();
      setPermanentTarget(null);
      setActionError(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { errors?: string[] } } };
      setActionError(e.response?.data?.errors?.join(' / ') ?? t('common.connectionError'));
    },
  });

  // ‎إحصاء عدد العناصر لكل نوع (لزرّ التبويب) — يستخدم البيانات الخام قبل الفلترة بالبحث.
  const countsByType = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const it of data?.items ?? []) {
      const cur = m.get(it.entityType);
      if (cur) cur.count++;
      else m.set(it.entityType, { label: it.entityTypeLabel, count: 1 });
    }
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (typeFilter !== 'all' && it.entityType !== typeFilter) return false;
      if (!q) return true;
      const haystack = [it.code ?? '', it.displayName, it.subInfo ?? '', it.entityTypeLabel]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search, typeFilter]);

  if (isLoading) return <LoadingSpinner text={t('systemTrash.loading')} />;
  if (isError) {
    return (
      <EmptyState
        icon={Trash2}
        title={t('systemTrash.loadError')}
        description={t('common.serverConnectionError')}
      />
    );
  }

  const total = data?.items.length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              <div>
                <CardTitle>{t('systemTrash.title')}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('systemTrash.subtitle')}
                  {total > 0 && (
                    <>
                      {' · '}
                      <span className="num-display">{total}</span> {t('systemTrash.itemCount')}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('systemTrash.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>

          {/* تبويبات تصفية النوع — تظهر فقط لو كانت السلة تحوي أكثر من نوع */}
          {countsByType.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] transition-colors',
                  typeFilter === 'all'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
                )}
              >
                {t('common.all')} ({total})
              </button>
              {Array.from(countsByType.entries()).map(([type, info]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] transition-colors',
                    typeFilter === type
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
                  )}
                >
                  {info.label} ({info.count})
                </button>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {total === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('systemTrash.emptyTitle')}
              description={t('systemTrash.emptyDescription')}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('common.noResults')}
              description={t('systemTrash.noSearchResults')}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(it => {
                const Icon = ICON_MAP[it.icon] ?? Trash2;
                const blockRestore = !it.canRestore;
                // ‎canPurge اختياري: لو لم يُرسله الخادم نعتبره true (سلوك سابق).
                const blockPurge = it.canPurge === false;
                return (
                  <div
                    key={`${it.entityType}-${it.entityId}`}
                    className="group flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {it.code && (
                            <span className="num-display text-xs text-muted-foreground">
                              {it.code}
                            </span>
                          )}
                          <span className="line-through opacity-70">{it.displayName}</span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                            {it.entityTypeLabel}
                          </span>
                          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                            {it.module}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {it.subInfo && <span>{it.subInfo}</span>}
                          <span>{t('accountsTrash.deletedAt', { date: formatRelative(it.deletedAt) })}</span>
                          {it.deletedBy && <span>{t('accountsTrash.deletedBy', { user: it.deletedBy })}</span>}
                        </div>
                        {blockRestore && it.cannotRestoreReason && (
                          <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-500">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{it.cannotRestoreReason}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:self-center">
                      {canRestore && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionError(null);
                            setRestoreTarget(it);
                          }}
                          disabled={blockRestore}
                          title={blockRestore ? it.cannotRestoreReason ?? '' : t('accountsTrash.restoreBtn')}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('accountsTrash.restoreBtn')}
                        </Button>
                      )}
                      {canPurge && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setActionError(null);
                            setPermanentTarget(it);
                          }}
                          disabled={blockPurge}
                          title={
                            blockPurge
                              ? it.cannotPurgeReason ?? t('systemTrash.purgeBlocked')
                              : t('accountsTrash.permanentDeleteTitle')
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('accountsTrash.permanentDeleteBtn')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!restoreTarget}
        title={t('systemTrash.restoreDialog.title', { type: restoreTarget?.entityTypeLabel ?? t('systemTrash.item') })}
        confirmLabel={t('accountsTrash.restoreBtn')}
        confirmVariant="default"
        loading={restoreMut.isPending}
        error={actionError}
        onConfirm={() =>
          restoreTarget &&
          restoreMut.mutate({ entityType: restoreTarget.entityType, id: restoreTarget.entityId })
        }
        onClose={() => {
          if (!restoreMut.isPending) {
            setRestoreTarget(null);
            setActionError(null);
          }
        }}
        message={
          restoreTarget && (
            <p>
              {t('systemTrash.restoreDialog.messagePre')}{' '}
              <span className="font-bold">
                {restoreTarget.code && (
                  <span className="num-display">{restoreTarget.code} · </span>
                )}
                {restoreTarget.displayName}
              </span>{' '}
              {t('systemTrash.restoreDialog.messagePost')}
            </p>
          )
        }
      />

      <ConfirmDialog
        open={!!permanentTarget}
        title={t('accountsTrash.permanentDeleteTitle')}
        confirmLabel={t('accountsTrash.permanentDeleteBtn')}
        confirmVariant="destructive"
        loading={permanentMut.isPending}
        error={actionError}
        onConfirm={() =>
          permanentTarget &&
          permanentMut.mutate({
            entityType: permanentTarget.entityType,
            id: permanentTarget.entityId,
          })
        }
        onClose={() => {
          if (!permanentMut.isPending) {
            setPermanentTarget(null);
            setActionError(null);
          }
        }}
        message={
          permanentTarget && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <div>
                  {t('accountsTrash.permanentDeleteDialog.warningPre')}{' '}
                  <span className="font-bold">{t('accountsTrash.permanentDeleteDialog.irreversible')}</span>.{' '}
                  {t('systemTrash.permanentDeleteDialog.warningPost')}
                </div>
              </div>
              <p className="text-sm">
                {t('systemTrash.permanentDeleteDialog.confirmPre')}{' '}
                <span className="font-bold">
                  {permanentTarget.code && (
                    <span className="num-display">{permanentTarget.code} · </span>
                  )}
                  {permanentTarget.displayName}
                </span>{' '}
                ({permanentTarget.entityTypeLabel}) {t('systemTrash.permanentDeleteDialog.confirmPost')}
              </p>
            </div>
          )
        }
      />
    </div>
  );
}
