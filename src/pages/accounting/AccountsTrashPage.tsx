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
  Wallet,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { accountingApi } from '@/lib/api/accounting';
import { cn } from '@/lib/utils';
import type { TrashedAccountDto } from '@/types/api';

function useAccountTypeLabels() {
  const { t } = useTranslation();
  return {
    1: t('accountsTrash.typeAssets'),
    2: t('accountsTrash.typeLiabilities'),
    3: t('accountsTrash.typeEquity'),
    4: t('accountsTrash.typeRevenue'),
    5: t('accountsTrash.typeExpenses'),
  } as Record<number, string>;
}

const ACCOUNT_TYPE_COLORS: Record<number, string> = {
  1: 'text-blue-400',
  2: 'text-amber-400',
  3: 'text-violet-400',
  4: 'text-emerald-400',
  5: 'text-rose-400',
};

function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(d);
}

// ════════════════════════════════════════════════════════════════════
// Modal بسيط لاستخدام تأكيد الحذف النهائي
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
export function AccountsTrashPage() {
  const { t } = useTranslation();
  const accountTypeLabels = useAccountTypeLabels();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<TrashedAccountDto | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<TrashedAccountDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts-trash'],
    queryFn: accountingApi.getAccountsTrash,
  });

  // ‎بعد أي عملية نُبطل: السلة + شجرة الحسابات (بكلا متغيّريها).
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['accounts-trash'] });
    qc.invalidateQueries({ queryKey: ['accounts-tree'] });
    qc.invalidateQueries({ queryKey: ['accounts', 'tree'] });
  };

  const restoreMut = useMutation({
    mutationFn: (id: number) => accountingApi.restoreAccount(id),
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
    mutationFn: (id: number) => accountingApi.permanentlyDeleteAccount(id),
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

  // ‎بحث case-insensitive يطابق الكود/الاسم/كود الأب/اسم الأب.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(a => {
      const haystack = [a.code, a.nameAr, a.parentCode ?? '', a.parentNameAr ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search]);

  if (isLoading) return <LoadingSpinner text={t('accountsTrash.loading')} />;
  if (isError) {
    return (
      <EmptyState
        icon={Trash2}
        title={t('accountsTrash.loadError')}
        description={t('common.serverConnectionError')}
      />
    );
  }

  const total = data?.length ?? 0;

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
                <CardTitle>{t('accountsTrash.title')}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('accountsTrash.subtitle')}
                  {total > 0 && (
                    <>
                      {' · '}
                      <span className="num-display">{total}</span> {t('accountsTrash.accountCount')}
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
                placeholder={t('accountsTrash.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {total === 0 ? (
            <EmptyState
              icon={Inbox}
              title={t('accountsTrash.emptyTitle')}
              description={t('accountsTrash.emptyDescription')}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('common.noResults')}
              description={t('accountsTrash.noSearchResults')}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(a => {
                const typeColor = ACCOUNT_TYPE_COLORS[a.type] ?? 'text-muted-foreground';
                const typeLabel = accountTypeLabels[a.type] ?? '—';
                return (
                  <div
                    key={a.id}
                    className="group flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Wallet className={cn('mt-0.5 h-5 w-5 shrink-0', typeColor)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="num-display text-xs text-muted-foreground">{a.code}</span>
                          <span className="line-through opacity-70">{a.nameAr}</span>
                          <span className={cn('rounded-full bg-card px-2 py-0.5 text-[10px]', typeColor)}>
                            {typeLabel}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                            L{a.level}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {a.parentId ? (
                            <span>
                              {t('accountsTrash.under')}{' '}
                              <span className="num-display">{a.parentCode}</span>
                              {' · '}
                              {a.parentNameAr}
                              {a.parentIsDeleted && (
                                <span className="ms-1 inline-flex items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                                  {t('accountsTrash.parentInTrash')}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span>{t('accountsTrash.rootAccount')}</span>
                          )}
                          <span>{t('accountsTrash.deletedAt', { date: formatRelative(a.deletedAt) })}</span>
                          {a.deletedBy && <span>{t('accountsTrash.deletedBy', { user: a.deletedBy })}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActionError(null);
                          setRestoreTarget(a);
                        }}
                        disabled={a.parentIsDeleted}
                        title={
                          a.parentIsDeleted
                            ? t('accountsTrash.restoreParentFirst')
                            : t('accountsTrash.restoreBtn')
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t('accountsTrash.restoreBtn')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setActionError(null);
                          setPermanentTarget(a);
                        }}
                        title={t('accountsTrash.permanentDeleteTitle')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('accountsTrash.permanentDeleteBtn')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* تأكيد الاستعادة */}
      <ConfirmDialog
        open={!!restoreTarget}
        title={t('accountsTrash.restoreDialog.title')}
        confirmLabel={t('accountsTrash.restoreBtn')}
        confirmVariant="default"
        loading={restoreMut.isPending}
        error={actionError}
        onConfirm={() => restoreTarget && restoreMut.mutate(restoreTarget.id)}
        onClose={() => {
          if (!restoreMut.isPending) {
            setRestoreTarget(null);
            setActionError(null);
          }
        }}
        message={
          restoreTarget && (
            <p>
              {t('accountsTrash.restoreDialog.messagePre')}{' '}
              <span className="font-bold">
                <span className="num-display">{restoreTarget.code}</span> · {restoreTarget.nameAr}
              </span>{' '}
              {t('accountsTrash.restoreDialog.messagePost')}
            </p>
          )
        }
      />

      {/* تأكيد الحذف النهائي */}
      <ConfirmDialog
        open={!!permanentTarget}
        title={t('accountsTrash.permanentDeleteTitle')}
        confirmLabel={t('accountsTrash.permanentDeleteBtn')}
        confirmVariant="destructive"
        loading={permanentMut.isPending}
        error={actionError}
        onConfirm={() => permanentTarget && permanentMut.mutate(permanentTarget.id)}
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
                  {t('accountsTrash.permanentDeleteDialog.warningPost')}
                </div>
              </div>
              <p className="text-sm">
                {t('accountsTrash.permanentDeleteDialog.confirmPre')}{' '}
                <span className="font-bold">
                  <span className="num-display">{permanentTarget.code}</span> ·{' '}
                  {permanentTarget.nameAr}
                </span>{' '}
                {t('accountsTrash.permanentDeleteDialog.confirmPost')}
              </p>
            </div>
          )
        }
      />
    </div>
  );
}
