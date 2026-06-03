import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight, Ban, Calendar, Check, Eye, ExternalLink, FileText, Loader2,
  Plus, RefreshCw, Save, Settings2, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { cn, extractApiError, formatAmount } from '@/lib/utils';
import {
  formatSettlementBulletinRateDisplay,
  formatSettlementExchangeRateDisplay,
  formatSettlementRateDisplay,
} from '@/lib/settlementRateDisplay';
import { useLocale, localizedAccountName } from '@/lib/i18n';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi } from '@/lib/api/currencies';
import {
  accountSettlementsApi,
  type AccountSettlementRowDto,
  type CreateAccountSettlementPayload,
  type SettlementCreatePreviewDto,
  type SettlementTransitMovementDto,
} from '@/lib/api/accountSettlements';
import type { AccountDto } from '@/types/api';
import { readSessionJson, writeSessionJson } from '@/lib/reportReturnState';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { defaultEntryDateForFiscalYear } from '@/lib/fiscalYearDates';

const ACCOUNT_SETTLEMENTS_PATH = '/financial-management/account-settlements';
const SETTLEMENT_DETAIL_RESTORE_KEY = 'account-settlements:detail-restore';

interface SettlementDetailRestoreState {
  settlementId: number;
  ts?: number;
}

type TabKey = 'list' | 'transit' | 'new' | 'settings';

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function flattenLeafAccounts(tree: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (nodes: AccountDto[]) => {
    for (const n of nodes) {
      if (n.isLeaf && n.isActive) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

function netBalance(debit: number, credit: number): number {
  return Math.round((debit - credit) * 1000) / 1000;
}

function JournalPreviewTable({
  title,
  lines,
  currency,
}: {
  title: string;
  lines: SettlementCreatePreviewDto['sourceEntryLines'];
  currency: string;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const totalDr = lines.filter(l => l.isDebit).reduce((s, l) => s + l.amount, 0);
  const totalCr = lines.filter(l => !l.isDebit).reduce((s, l) => s + l.amount, 0);

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
        {title} — {currency}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="px-2 py-1 text-start">{t('accountSettlements.preview.account')}</th>
              <th className="px-2 py-1 text-end">{t('accountSettlements.preview.debit')}</th>
              <th className="px-2 py-1 text-end">{t('accountSettlements.preview.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="px-2 py-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{l.accountCode}</span>
                  {' — '}
                  {localizedAccountName(locale, l.accountName, null)}
                  {l.description ? (
                    <span className="block text-[10px] text-muted-foreground">{l.description}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-end font-mono tabular-nums">
                  {l.isDebit ? formatAmount(l.amount) : '—'}
                </td>
                <td className="px-2 py-1 text-end font-mono tabular-nums">
                  {!l.isDebit ? formatAmount(l.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold">
              <td className="px-2 py-1">{t('accountSettlements.preview.total')}</td>
              <td className="px-2 py-1 text-end font-mono tabular-nums">{formatAmount(totalDr)}</td>
              <td className="px-2 py-1 text-end font-mono tabular-nums">{formatAmount(totalCr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SettlementOperationBlock({
  title,
  originalId,
  originalNumber,
  originalLabel,
  reversalId,
  reversalNumber,
  reversalLabel,
  onOpenJournal,
  t,
}: {
  title: string;
  originalId: number;
  originalNumber?: string | null;
  originalLabel: string;
  reversalId?: number | null;
  reversalNumber?: string | null;
  reversalLabel: string;
  onOpenJournal: (id: number) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/10 p-2.5 space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="flex items-center justify-between gap-2 rounded border border-border/60 bg-card px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs">
            {originalLabel}{originalNumber ? `: ${originalNumber}` : ''}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          title={t('accountSettlements.list.openEntry')}
          onClick={() => onOpenJournal(originalId)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
      {reversalId != null && reversalId > 0 && (
        <div className="flex items-center justify-between gap-2 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Ban className="h-3.5 w-3.5 shrink-0 text-rose-500" />
            <span className="truncate text-xs text-rose-600 dark:text-rose-400">
              {reversalLabel}{reversalNumber ? `: ${reversalNumber}` : ''}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-500/10"
            title={t('accountSettlements.list.openReversalEntry')}
            onClick={() => onOpenJournal(reversalId)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function DeleteSettlementDialog({
  row,
  onClose,
  onConfirm,
  pending,
}: {
  row: AccountSettlementRowDto;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const entries: { label: string; number?: string | null }[] = [];
  if (row.sourceReversalJournalEntryId) {
    entries.push({
      label: t('accountSettlements.list.reversalSourceEntry'),
      number: row.sourceReversalEntryNumber,
    });
  }
  if (row.targetReversalJournalEntryId) {
    entries.push({
      label: t('accountSettlements.list.reversalTargetEntry'),
      number: row.targetReversalEntryNumber,
    });
  }
  entries.push({
    label: t('accountSettlements.list.sourceEntry'),
    number: row.sourceEntryNumber,
  });
  entries.push({
    label: t('accountSettlements.list.targetEntry'),
    number: row.targetEntryNumber,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-destructive">
            <Trash2 className="h-4 w-4" />
            {t('accountSettlements.deleteDialog.title')}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            {t('accountSettlements.deleteDialog.confirm', { number: row.settlementNumber })}
          </p>
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
            <div className="mb-1.5 font-semibold text-rose-600 dark:text-rose-400">
              {t('accountSettlements.deleteDialog.willDelete')}
            </div>
            <ul className="space-y-1 text-muted-foreground">
              {entries.map((e, i) => (
                <li key={i}>
                  • {e.label}{e.number ? `: ${e.number}` : ''}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('accountSettlements.deleteDialog.warning')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="destructive" className="gap-1.5" disabled={pending} onClick={onConfirm}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('accountSettlements.deleteDialog.confirmDelete')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JournalEntryLink({
  entryId,
  label,
  onOpen,
  isReversal = false,
}: {
  entryId: number;
  label: string;
  onOpen: (id: number) => void;
  isReversal?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-1 rounded px-1 py-0.5',
      isReversal && 'bg-rose-500/5',
    )}>
      <button
        type="button"
        className={cn(
          'inline-flex min-w-0 flex-1 items-center gap-1 text-start text-[11px] hover:underline',
          isReversal ? 'text-rose-600 dark:text-rose-400' : 'text-primary',
        )}
        onClick={() => onOpen(entryId)}
      >
        {isReversal ? (
          <Ban className="h-3 w-3 shrink-0" />
        ) : (
          <ExternalLink className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title={isReversal ? undefined : undefined}
        onClick={() => onOpen(entryId)}
      >
        <Eye className="h-3 w-3" />
      </button>
    </div>
  );
}

function rowToPreviewPayload(row: AccountSettlementRowDto): CreateAccountSettlementPayload {
  return {
    sourceAccountId: row.sourceAccountId,
    sourceCurrency: row.sourceCurrency,
    sourceAmount: row.sourceAmount,
    targetAccountId: row.targetAccountId,
    targetCurrency: row.targetCurrency,
    targetAmount: row.targetAmount,
    exchangeRate: row.exchangeRate,
    fxDiscountAmount: row.fxDiscountAmount > 0 ? row.fxDiscountAmount : null,
    settlementDate: row.settlementDate.slice(0, 10),
    description: row.description ?? null,
  };
}

function SettlementDetailDialog({
  row,
  onClose,
  onOpenJournal,
  onCancel,
  onPermanentDelete,
  canCancel,
  canDelete,
}: {
  row: AccountSettlementRowDto;
  onClose: () => void;
  onOpenJournal: (id: number) => void;
  onCancel: (row: AccountSettlementRowDto) => void;
  onPermanentDelete: (row: AccountSettlementRowDto) => void;
  canCancel: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const previewQuery = useQuery({
    queryKey: ['account-settlement-detail', row.id],
    queryFn: () => accountSettlementsApi.preview(rowToPreviewPayload(row)),
  });
  const preview = previewQuery.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              {t('accountSettlements.list.detailTitle', { number: row.settlementNumber })}
              {row.isCancelled && (
                <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-500">
                  {t('accountSettlements.list.cancelled')}
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.settlementDate.slice(0, 10)}
              {row.description ? ` — ${row.description}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border/80 bg-muted/10 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                {t('accountSettlements.form.sourceSection')}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{row.sourceAccountCode}</span>
                {' '}{row.sourceAccountName}
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-primary">
                {formatAmount(row.sourceAmount)} {row.sourceCurrency}
              </div>
            </div>
            <div className="rounded-md border border-border/80 bg-muted/10 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                {t('accountSettlements.form.targetSection')}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{row.targetAccountCode}</span>
                {' '}{row.targetAccountName}
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-emerald-500">
                {formatAmount(row.targetAmount)} {row.targetCurrency}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div className="rounded-md border border-border px-2 py-1.5">
              <div className="text-muted-foreground">{t('accountSettlements.list.rate')}</div>
              <div className="font-mono font-semibold">
                {preview
                  ? formatSettlementExchangeRateDisplay(preview.preview, row.exchangeRate)
                  : formatSettlementRateDisplay(row.exchangeRate)}
              </div>
            </div>
            <div className="rounded-md border border-border px-2 py-1.5">
              <div className="text-muted-foreground">{t('accountSettlements.list.fx')}</div>
              <div className={cn(
                'font-mono font-semibold',
                row.fxGainLossAmount > 0 ? 'text-emerald-500' : row.fxGainLossAmount < 0 ? 'text-rose-500' : '',
              )}>
                {row.fxGainLossAmount !== 0
                  ? `${row.fxGainLossAmount > 0 ? '+' : ''}${formatAmount(row.fxGainLossAmount)}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-md border border-border px-2 py-1.5">
              <div className="text-muted-foreground">{t('accountSettlements.list.discount')}</div>
              <div className="font-mono font-semibold">
                {row.fxDiscountAmount > 0 ? formatAmount(row.fxDiscountAmount) : '—'}
              </div>
            </div>
            {row.isCancelled && row.cancelReason && (
              <div className="col-span-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 sm:col-span-4">
                <div className="text-muted-foreground">{t('accountSettlements.cancel.reason')}</div>
                <div className="text-sm">{row.cancelReason}</div>
              </div>
            )}
          </div>

          {previewQuery.isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : previewQuery.isError ? (
            <p className="text-sm text-destructive">{extractApiError(previewQuery.error)}</p>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded-md border border-border px-2 py-1.5">
                  <div className="text-muted-foreground">{t('accountSettlements.preview.bulletinRate')}</div>
                  <div className="font-mono text-sm font-semibold">
                    {formatSettlementBulletinRateDisplay(preview.preview)}
                  </div>
                </div>
                <div className="rounded-md border border-border px-2 py-1.5">
                  <div className="text-muted-foreground">{t('accountSettlements.preview.fxGainLoss')}</div>
                  <div className="font-mono text-sm font-semibold">{formatAmount(preview.preview.fxGainLossAmount)}</div>
                </div>
              </div>
              <JournalPreviewTable
                title={t('accountSettlements.preview.sourceEntry')}
                lines={preview.sourceEntryLines}
                currency={row.sourceCurrency}
              />
              <JournalPreviewTable
                title={t('accountSettlements.preview.targetEntry')}
                lines={preview.targetEntryLines}
                currency={row.targetCurrency}
              />
            </>
          ) : null}

          <div className="space-y-2 border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('accountSettlements.list.entries')}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {row.sourceJournalEntryId > 0 && (
                <SettlementOperationBlock
                  title={t('accountSettlements.form.sourceSection')}
                  originalId={row.sourceJournalEntryId}
                  originalNumber={row.sourceEntryNumber}
                  originalLabel={t('accountSettlements.list.sourceEntry')}
                  reversalId={row.sourceReversalJournalEntryId}
                  reversalNumber={row.sourceReversalEntryNumber}
                  reversalLabel={t('accountSettlements.list.reversalSourceEntry')}
                  onOpenJournal={onOpenJournal}
                  t={t}
                />
              )}
              {row.targetJournalEntryId > 0 && (
                <SettlementOperationBlock
                  title={t('accountSettlements.form.targetSection')}
                  originalId={row.targetJournalEntryId}
                  originalNumber={row.targetEntryNumber}
                  originalLabel={t('accountSettlements.list.targetEntry')}
                  reversalId={row.targetReversalJournalEntryId}
                  reversalNumber={row.targetReversalEntryNumber}
                  reversalLabel={t('accountSettlements.list.reversalTargetEntry')}
                  onOpenJournal={onOpenJournal}
                  t={t}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canCancel && !row.isCancelled && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
              onClick={() => { onClose(); onCancel(row); }}
            >
              <Ban className="h-4 w-4" />
              {t('accountSettlements.list.cancelOperation')}
            </Button>
          )}
          {canDelete && row.isCancelled && (
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              onClick={() => { onClose(); onPermanentDelete(row); }}
            >
              <Trash2 className="h-4 w-4" />
              {t('accountSettlements.list.deleteOperation')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SettlementListActions({
  row,
  onView,
  onCancel,
  onPermanentDelete,
  canView,
  canCancel,
  canDelete,
  t,
}: {
  row: AccountSettlementRowDto;
  onView: (row: AccountSettlementRowDto) => void;
  onCancel: (row: AccountSettlementRowDto) => void;
  onPermanentDelete: (row: AccountSettlementRowDto) => void;
  canView: boolean;
  canCancel: boolean;
  canDelete: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!canView && !(canCancel && !row.isCancelled) && !(canDelete && row.isCancelled)) return null;

  return (
    <div className="flex items-center justify-center gap-0.5">
      {canView && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-primary hover:bg-primary/10 hover:text-primary"
          title={t('accountSettlements.list.openDetail')}
          onClick={() => onView(row)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {canCancel && !row.isCancelled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
          title={t('accountSettlements.list.cancelOperation')}
          onClick={() => onCancel(row)}
        >
          <Ban className="h-4 w-4" />
        </Button>
      )}
      {canDelete && row.isCancelled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
          title={t('accountSettlements.list.deleteOperation')}
          onClick={() => onPermanentDelete(row)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function AccountSettlementsPage() {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const canRead = can(PERMS.FinancialManagement.AccountSettlements.Read);
  const canCreate = can(PERMS.FinancialManagement.AccountSettlements.Create);
  const canUpdate = can(PERMS.FinancialManagement.AccountSettlements.Update);
  const canCancel = can(PERMS.FinancialManagement.AccountSettlements.Cancel);
  const canDeleteSettlement = canCancel || canCreate;
  const showListActions = canRead || canDeleteSettlement;

  const openJournalEntry = useCallback((entryId: number, settlementRow?: AccountSettlementRowDto) => {
    if (settlementRow) {
      writeSessionJson(SETTLEMENT_DETAIL_RESTORE_KEY, { settlementId: settlementRow.id });
    }
    navigate(`/accounting/journal/${entryId}/view`, {
      state: {
        returnTo: ACCOUNT_SETTLEMENTS_PATH,
        returnLabel: t('accountSettlements.list.backToDetail'),
      },
    });
  }, [navigate, t]);

  const [detailTarget, setDetailTarget] = useState<AccountSettlementRowDto | null>(null);

  const [tab, setTab] = useState<TabKey>('list');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'settings' && canUpdate) setTab('settings');
  }, [searchParams, canUpdate]);
  const { activeFiscalYear, defaultFromDate, defaultToDate } = useActiveFiscalYear();
  const today = useMemo(() => toISODate(new Date()), []);

  const [listFrom, setListFrom] = useState(defaultFromDate);
  const [listTo, setListTo] = useState(defaultToDate);
  useEffect(() => {
    if (!listFrom && defaultFromDate) setListFrom(defaultFromDate);
    if (!listTo && defaultToDate) setListTo(defaultToDate);
  }, [defaultFromDate, defaultToDate, listFrom, listTo]);
  const [transitCurrency, setTransitCurrency] = useState('');
  const [cancelTarget, setCancelTarget] = useState<AccountSettlementRowDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AccountSettlementRowDto | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['accounts-tree'],
    queryFn: () => accountingApi.getTree(),
    staleTime: 60_000,
    enabled: canRead,
  });

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
    enabled: canRead,
  });

  const leafAccounts = useMemo(
    () => flattenLeafAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );

  const enabledCurrencies = useMemo(
    () => (currenciesQuery.data ?? []).filter(c => c.isEnabled).sort((a, b) => a.displayOrder - b.displayOrder),
    [currenciesQuery.data],
  );

  const settingsQuery = useQuery({
    queryKey: ['account-settlements', 'settings'],
    queryFn: () => accountSettlementsApi.getSettings(),
    enabled: canRead,
  });

  const listQuery = useQuery({
    queryKey: ['account-settlements', 'list', listFrom, listTo],
    queryFn: () => accountSettlementsApi.list({ from: listFrom, to: listTo }),
    enabled: canRead && (tab === 'list' || tab === 'transit'),
  });

  const transitQuery = useQuery({
    queryKey: ['account-settlements', 'transit', listFrom, listTo, transitCurrency],
    queryFn: () => accountSettlementsApi.transitMovements({
      from: listFrom,
      to: listTo,
      currency: transitCurrency || undefined,
    }),
    enabled: canRead && tab === 'transit',
  });

  // ── New settlement form ─────────────────────────────────────────
  const appliedDefaultSettlementDateRef = useRef(false);
  const [settlementDate, setSettlementDate] = useState(() =>
    defaultEntryDateForFiscalYear(activeFiscalYear),
  );
  useEffect(() => {
    if (tab !== 'new') {
      appliedDefaultSettlementDateRef.current = false;
      return;
    }
    if (!activeFiscalYear || appliedDefaultSettlementDateRef.current) return;
    setSettlementDate(defaultEntryDateForFiscalYear(activeFiscalYear));
    appliedDefaultSettlementDateRef.current = true;
  }, [activeFiscalYear?.id, tab]);
  const [sourceAccountId, setSourceAccountId] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('');
  const [sourceAmount, setSourceAmount] = useState('');
  const [targetAccountId, setTargetAccountId] = useState<number | null>(null);
  const [targetLabel, setTargetLabel] = useState('');
  const [targetCurrency, setTargetCurrency] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [manualRate, setManualRate] = useState(false);
  const [fxDiscount, setFxDiscount] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<SettlementCreatePreviewDto | null>(null);

  useEffect(() => {
    if (!sourceCurrency && enabledCurrencies.length) {
      const base = enabledCurrencies.find(c => c.isBase)?.code ?? enabledCurrencies[0].code;
      setSourceCurrency(base);
    }
    if (!targetCurrency && enabledCurrencies.length) {
      const usd = enabledCurrencies.find(c => c.code === 'USD')?.code
        ?? enabledCurrencies.find(c => !c.isBase)?.code
        ?? enabledCurrencies[0].code;
      setTargetCurrency(usd);
    }
  }, [enabledCurrencies, sourceCurrency, targetCurrency]);

  const sourceBalanceQuery = useQuery({
    queryKey: ['account-settlements', 'src-bal', sourceAccountId, sourceCurrency],
    queryFn: () => accountingApi.getAccountBalances({
      from: listFrom || defaultFromDate,
      to: listTo || defaultToDate,
      accountId: sourceAccountId,
      currency: sourceCurrency,
      leavesOnly: true,
    }),
    enabled: !!sourceAccountId && !!sourceCurrency && tab === 'new',
  });

  const targetBalanceQuery = useQuery({
    queryKey: ['account-settlements', 'tgt-bal', targetAccountId, targetCurrency],
    queryFn: () => accountingApi.getAccountBalances({
      from: listFrom || defaultFromDate,
      to: listTo || defaultToDate,
      accountId: targetAccountId,
      currency: targetCurrency,
      leavesOnly: true,
    }),
    enabled: !!targetAccountId && !!targetCurrency && tab === 'new',
  });

  const sourceBalance = useMemo(() => {
    const rows = sourceBalanceQuery.data?.rows ?? [];
    const row = rows.find(r => r.accountId === sourceAccountId && r.currency === sourceCurrency);
    return row ? netBalance(row.debitBalance, row.creditBalance) : 0;
  }, [sourceBalanceQuery.data, sourceAccountId, sourceCurrency]);

  const targetBalance = useMemo(() => {
    const rows = targetBalanceQuery.data?.rows ?? [];
    const row = rows.find(r => r.accountId === targetAccountId && r.currency === targetCurrency);
    return row ? netBalance(row.debitBalance, row.creditBalance) : 0;
  }, [targetBalanceQuery.data, targetAccountId, targetCurrency]);

  const buildPayload = useCallback((): CreateAccountSettlementPayload | null => {
    const amt = parseFloat(sourceAmount.replace(/,/g, ''));
    if (!sourceAccountId || !targetAccountId || !sourceCurrency || !targetCurrency) return null;
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const payload: CreateAccountSettlementPayload = {
      sourceAccountId,
      sourceCurrency,
      sourceAmount: amt,
      targetAccountId,
      targetCurrency,
      settlementDate,
      description: description.trim() || null,
    };
    if (manualRate && exchangeRate.trim()) {
      const rate = parseFloat(exchangeRate.replace(/,/g, ''));
      if (Number.isFinite(rate) && rate > 0) payload.exchangeRate = rate;
    }
    if (targetAmount.trim()) {
      const tgt = parseFloat(targetAmount.replace(/,/g, ''));
      if (Number.isFinite(tgt) && tgt > 0) payload.targetAmount = tgt;
    }
    if (fxDiscount.trim()) {
      const disc = parseFloat(fxDiscount.replace(/,/g, ''));
      if (Number.isFinite(disc) && disc > 0) payload.fxDiscountAmount = disc;
    }
    return payload;
  }, [
    sourceAccountId, targetAccountId, sourceCurrency, targetCurrency,
    sourceAmount, settlementDate, description, manualRate, exchangeRate, targetAmount, fxDiscount,
  ]);

  const previewMut = useMutation({
    mutationFn: (p: CreateAccountSettlementPayload) => accountSettlementsApi.preview(p),
    onSuccess: (data) => {
      setPreview(data);
      if (!manualRate) setExchangeRate(String(data.preview.bulletinCrossRate));
      if (!targetAmount.trim()) setTargetAmount(String(data.preview.computedTargetAmount));
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const createMut = useMutation({
    mutationFn: async (p: CreateAccountSettlementPayload) => {
      const freshPreview = await accountSettlementsApi.preview(p);
      setPreview(freshPreview);
      return accountSettlementsApi.create(p);
    },
    onSuccess: () => {
      toast.success(t('accountSettlements.messages.created'));
      qc.invalidateQueries({ queryKey: ['account-settlements'] });
      resetForm();
      setTab('list');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      accountSettlementsApi.cancel(id, { reason: reason || null, reversalDate: today }),
    onSuccess: () => {
      toast.success(t('accountSettlements.messages.cancelled'));
      qc.invalidateQueries({ queryKey: ['account-settlements'] });
      setCancelTarget(null);
      setCancelReason('');
      setDetailTarget(null);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => accountSettlementsApi.delete(id),
    onSuccess: () => {
      toast.success(t('accountSettlements.deleteDialog.success'));
      qc.invalidateQueries({ queryKey: ['account-settlements'] });
      setDeleteTarget(null);
      setDetailTarget(null);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  useEffect(() => {
    if (!listQuery.data?.length) return;
    const restore = readSessionJson<SettlementDetailRestoreState>(SETTLEMENT_DETAIL_RESTORE_KEY, true);
    if (!restore?.settlementId) return;
    const row = listQuery.data.find(r => r.id === restore.settlementId);
    if (row) {
      setDetailTarget(row);
      setTab('list');
    }
  }, [listQuery.data]);

  const resetForm = () => {
    setSourceAccountId(null);
    setSourceLabel('');
    setSourceAmount('');
    setTargetAccountId(null);
    setTargetLabel('');
    setTargetAmount('');
    setExchangeRate('');
    setManualRate(false);
    setFxDiscount('');
    setDescription('');
    setPreview(null);
    setSettlementDate(today);
  };

  const handlePreview = () => {
    const p = buildPayload();
    if (!p) {
      toast.error(t('accountSettlements.messages.fillRequired'));
      return;
    }
    previewMut.mutate(p);
  };

  const handleCreate = () => {
    const p = buildPayload();
    if (!p) {
      toast.error(t('accountSettlements.messages.fillRequired'));
      return;
    }
    if (!preview) {
      toast.error(t('accountSettlements.messages.previewFirst'));
      return;
    }
    createMut.mutate(p);
  };

  const useFullSourceBalance = () => {
    if (sourceBalance > 0) setSourceAmount(String(sourceBalance));
  };

  const useFullFxDiscount = () => {
    if (preview && Math.abs(preview.preview.fxGainLossAmount) > 0) {
      setFxDiscount(String(Math.abs(preview.preview.fxGainLossAmount)));
      setPreview(null);
    }
  };

  // ── Settings form ───────────────────────────────────────────────
  const [transitMap, setTransitMap] = useState<Record<string, number>>({});
  const [fxGainId, setFxGainId] = useState<number | null>(null);
  const [fxLossId, setFxLossId] = useState<number | null>(null);
  const [fxDiscountId, setFxDiscountId] = useState<number | null>(null);
  const [fxGainLabel, setFxGainLabel] = useState('');
  const [fxLossLabel, setFxLossLabel] = useState('');
  const [fxDiscountLabel, setFxDiscountLabel] = useState('');

  useEffect(() => {
    if (!settingsQuery.data) return;
    setTransitMap({ ...settingsQuery.data.transitAccounts });
    setFxGainId(settingsQuery.data.fxGainAccountId ?? null);
    setFxLossId(settingsQuery.data.fxLossAccountId ?? null);
    setFxDiscountId(settingsQuery.data.fxDiscountAccountId ?? null);
    const findLabel = (id: number | null) => {
      if (!id) return '';
      const a = leafAccounts.find(x => x.id === id);
      return a ? `${a.code} — ${localizedAccountName(locale, a.nameAr, a.nameEn)}` : `#${id}`;
    };
    setFxGainLabel(findLabel(settingsQuery.data.fxGainAccountId ?? null));
    setFxLossLabel(findLabel(settingsQuery.data.fxLossAccountId ?? null));
    setFxDiscountLabel(findLabel(settingsQuery.data.fxDiscountAccountId ?? null));
  }, [settingsQuery.data, leafAccounts, locale]);

  const settingsMut = useMutation({
    mutationFn: () => accountSettlementsApi.updateSettings({
      transitAccounts: transitMap,
      fxGainAccountId: fxGainId,
      fxLossAccountId: fxLossId,
      fxDiscountAccountId: fxDiscountId,
    }),
    onSuccess: () => {
      toast.success(t('accountSettlements.messages.settingsSaved'));
      qc.invalidateQueries({ queryKey: ['account-settlements', 'settings'] });
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      qc.invalidateQueries({ queryKey: ['accounts', 'tree'] });
      qc.invalidateQueries({ queryKey: ['accounts', 'journal-restricted-ids'] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  if (!canRead) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title={t('common.noPermission')}
        description={t('accountSettlements.noPermissionDesc')}
      />
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: 'list', label: t('accountSettlements.tabs.list'), icon: FileText },
    { key: 'transit', label: t('accountSettlements.tabs.transit'), icon: ArrowLeftRight },
    ...(canCreate ? [{ key: 'new' as TabKey, label: t('accountSettlements.tabs.new'), icon: Plus }] : []),
    ...(canUpdate ? [{ key: 'settings' as TabKey, label: t('accountSettlements.tabs.settings'), icon: Settings2 }] : []),
  ];

  return (
    <div className="space-y-2 p-3 md:p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            {t('accountSettlements.title')}
          </h1>
          <p className="text-xs text-muted-foreground">{t('accountSettlements.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base">{t('accountSettlements.list.title')}</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">{t('accountSettlements.list.from')}</Label>
                <Input type="date" value={listFrom} onChange={e => setListFrom(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">{t('accountSettlements.list.to')}</Label>
                <Input type="date" value={listTo} onChange={e => setListTo(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => listQuery.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {canCreate && (
                <Button size="sm" className="h-8 gap-1" onClick={() => setTab('new')}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('accountSettlements.tabs.new')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (listQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title={t('accountSettlements.list.empty')}
                description={t('accountSettlements.list.emptyDesc')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.number')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.date')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.source')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.target')}</th>
                      <th className="px-4 py-2.5 text-end">{t('accountSettlements.list.rate')}</th>
                      <th className="px-4 py-2.5 text-end">{t('accountSettlements.list.fx')}</th>
                      <th className="px-4 py-2.5 text-end">{t('accountSettlements.list.discount')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.entries')}</th>
                      {showListActions && (
                        <th className="px-4 py-2.5 text-center">{t('accountSettlements.list.actions')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(listQuery.data ?? []).map((row: AccountSettlementRowDto) => (
                      <tr key={row.id} className={cn(
                        'border-b border-border/50 hover:bg-muted/20',
                        row.isCancelled && 'opacity-60 bg-muted/10',
                      )}>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                            title={t('accountSettlements.list.openDetail')}
                            onClick={() => setDetailTarget(row)}
                          >
                            {row.settlementNumber}
                          </button>
                          {row.isCancelled && (
                            <span className="ms-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-500">
                              {t('accountSettlements.list.cancelled')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{row.settlementDate.slice(0, 10)}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs">
                            <span className="font-mono text-muted-foreground">{row.sourceAccountCode}</span>
                            {' '}{row.sourceAccountName}
                          </div>
                          <div className="font-mono text-xs font-semibold text-primary">
                            {formatAmount(row.sourceAmount)} {row.sourceCurrency}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs">
                            <span className="font-mono text-muted-foreground">{row.targetAccountCode}</span>
                            {' '}{row.targetAccountName}
                          </div>
                          <div className="font-mono text-xs font-semibold text-emerald-500">
                            {formatAmount(row.targetAmount)} {row.targetCurrency}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs tabular-nums">
                          {formatSettlementRateDisplay(row.exchangeRate)}
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs tabular-nums">
                          {row.fxGainLossAmount !== 0 ? (
                            <span className={row.fxGainLossAmount > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                              {row.fxGainLossAmount > 0 ? '+' : ''}{formatAmount(row.fxGainLossAmount)}
                            </span>
                          ) : '—'}
                          {row.fxDiscountAmount > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              {t('accountSettlements.list.effective')}: {formatAmount(row.effectiveFxGainLossAmount)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs tabular-nums">
                          {row.fxDiscountAmount > 0 ? formatAmount(row.fxDiscountAmount) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-1 min-w-[9rem]">
                            {row.sourceJournalEntryId > 0 && (
                              <JournalEntryLink
                                entryId={row.sourceJournalEntryId}
                                label={`${t('accountSettlements.list.sourceEntry')}: ${row.sourceEntryNumber ?? row.sourceJournalEntryId}`}
                                onOpen={(id) => openJournalEntry(id, row)}
                              />
                            )}
                            {row.isCancelled && row.sourceReversalJournalEntryId && (
                              <JournalEntryLink
                                entryId={row.sourceReversalJournalEntryId}
                                label={`${t('accountSettlements.list.reversalSourceEntry')}: ${row.sourceReversalEntryNumber ?? row.sourceReversalJournalEntryId}`}
                                onOpen={(id) => openJournalEntry(id, row)}
                                isReversal
                              />
                            )}
                            {row.targetJournalEntryId > 0 && (
                              <JournalEntryLink
                                entryId={row.targetJournalEntryId}
                                label={`${t('accountSettlements.list.targetEntry')}: ${row.targetEntryNumber ?? row.targetJournalEntryId}`}
                                onOpen={(id) => openJournalEntry(id, row)}
                              />
                            )}
                            {row.isCancelled && row.targetReversalJournalEntryId && (
                              <JournalEntryLink
                                entryId={row.targetReversalJournalEntryId}
                                label={`${t('accountSettlements.list.reversalTargetEntry')}: ${row.targetReversalEntryNumber ?? row.targetReversalJournalEntryId}`}
                                onOpen={(id) => openJournalEntry(id, row)}
                                isReversal
                              />
                            )}
                          </div>
                        </td>
                        {showListActions && (
                          <td className="px-4 py-2.5 text-center">
                            <SettlementListActions
                              row={row}
                              canView={canRead}
                              canCancel={canDeleteSettlement}
                              canDelete={canDeleteSettlement}
                              onView={setDetailTarget}
                              onCancel={setCancelTarget}
                              onPermanentDelete={setDeleteTarget}
                              t={t}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'transit' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">{t('accountSettlements.transit.title')}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t('accountSettlements.transit.subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">{t('accountSettlements.list.from')}</Label>
                <Input type="date" value={listFrom} onChange={e => setListFrom(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">{t('accountSettlements.list.to')}</Label>
                <Input type="date" value={listTo} onChange={e => setListTo(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">{t('accountSettlements.form.currency')}</Label>
                <select
                  value={transitCurrency}
                  onChange={e => setTransitCurrency(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{t('accountSettlements.transit.allCurrencies')}</option>
                  {enabledCurrencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => transitQuery.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {transitQuery.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (transitQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title={t('accountSettlements.transit.empty')}
                description={t('accountSettlements.transit.emptyDesc')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.date')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.number')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.transit.account')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.transit.side')}</th>
                      <th className="px-4 py-2.5 text-end">{t('accountSettlements.preview.debit')}</th>
                      <th className="px-4 py-2.5 text-end">{t('accountSettlements.preview.credit')}</th>
                      <th className="px-4 py-2.5 text-start">{t('accountSettlements.list.entries')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(transitQuery.data ?? []).map((m: SettlementTransitMovementDto, i: number) => (
                      <tr key={`${m.journalEntryId}-${m.transitAccountId}-${i}`} className={cn(
                        'border-b border-border/50 hover:bg-muted/20',
                        m.isCancelled && 'opacity-60',
                      )}>
                        <td className="px-4 py-2.5 text-xs">{m.settlementDate.slice(0, 10)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{m.settlementNumber}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="font-mono text-muted-foreground">{m.transitAccountCode}</span>
                          {' '}{m.transitAccountName}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {m.side === 'Source'
                            ? t('accountSettlements.transit.sideSource')
                            : t('accountSettlements.transit.sideTarget')}
                          {' '}
                          <span className="text-muted-foreground">({m.currency})</span>
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs tabular-nums">
                          {m.isDebit ? formatAmount(m.amount) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs tabular-nums">
                          {!m.isDebit ? formatAmount(m.amount) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {m.entryNumber && (
                            <button
                              type="button"
                              className="text-[11px] text-primary hover:underline"
                              onClick={() => navigate(`/accounting/journal/${m.journalEntryId}/view`)}
                            >
                              {m.entryNumber}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'new' && canCreate && (
        <div className="space-y-2">
          <Card>
            <CardHeader className="space-y-0 px-3 py-1.5">
              <CardTitle className="text-sm">{t('accountSettlements.form.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3 pt-0">
              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,11rem)_1fr]">
                <div className="space-y-0.5">
                  <Label className="text-[11px]">{t('accountSettlements.form.date')}</Label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute start-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="date"
                      value={settlementDate}
                      onChange={e => { setSettlementDate(e.target.value); setPreview(null); }}
                      className="h-8 ps-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">{t('accountSettlements.form.description')}</Label>
                  <Input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t('accountSettlements.form.descriptionPlaceholder')}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
                <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {t('accountSettlements.form.sourceSection')}
                  </h3>
                  <div className="space-y-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">{t('accountSettlements.form.sourceAccount')}</Label>
                      <AccountPicker
                        accounts={leafAccounts}
                        value={sourceAccountId}
                        initialLabel={sourceLabel}
                        onChange={(id, label) => {
                          setSourceAccountId(id);
                          setSourceLabel(label);
                          setPreview(null);
                        }}
                        placeholder={t('accountSettlements.form.pickAccount')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[11px]">{t('accountSettlements.form.currency')}</Label>
                        <select
                          value={sourceCurrency}
                          onChange={e => { setSourceCurrency(e.target.value); setPreview(null); }}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {enabledCurrencies.map(c => (
                            <option key={c.code} value={c.code}>{c.code} — {c.nameAr}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px]">{t('accountSettlements.form.balance')}</Label>
                        <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 font-mono text-xs tabular-nums">
                          {sourceBalanceQuery.isFetching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <span className={sourceBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                {formatAmount(sourceBalance)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{sourceCurrency}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <Label className="text-[11px]">{t('accountSettlements.form.sourceAmount')}</Label>
                        {sourceBalance > 0 && (
                          <button
                            type="button"
                            className="text-[10px] text-primary hover:underline"
                            onClick={useFullSourceBalance}
                          >
                            {t('accountSettlements.form.useFullBalance')}
                          </button>
                        )}
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={sourceAmount}
                        onChange={e => { setSourceAmount(e.target.value); setPreview(null); }}
                        className="h-8 font-mono text-sm"
                        placeholder="0.000"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center py-0.5 lg:px-1 lg:py-8">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                    <ArrowLeftRight className="h-4 w-4 text-primary" />
                  </div>
                </div>

                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    {t('accountSettlements.form.targetSection')}
                  </h3>
                  <div className="space-y-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">{t('accountSettlements.form.targetAccount')}</Label>
                      <AccountPicker
                        accounts={leafAccounts}
                        value={targetAccountId}
                        initialLabel={targetLabel}
                        onChange={(id, label) => {
                          setTargetAccountId(id);
                          setTargetLabel(label);
                          setPreview(null);
                        }}
                        placeholder={t('accountSettlements.form.pickAccount')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[11px]">{t('accountSettlements.form.currency')}</Label>
                        <select
                          value={targetCurrency}
                          onChange={e => { setTargetCurrency(e.target.value); setPreview(null); }}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {enabledCurrencies.map(c => (
                            <option key={c.code} value={c.code}>{c.code} — {c.nameAr}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px]">{t('accountSettlements.form.balance')}</Label>
                        <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 font-mono text-xs tabular-nums">
                          {targetBalanceQuery.isFetching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <span className={targetBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                {formatAmount(targetBalance)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{targetCurrency}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {sourceCurrency !== targetCurrency && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      {t('accountSettlements.form.exchangeSection')}
                    </h3>
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualRate}
                        onChange={e => { setManualRate(e.target.checked); setPreview(null); }}
                        className="rounded"
                      />
                      {t('accountSettlements.form.manualRate')}
                    </label>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">{t('accountSettlements.form.exchangeRate')}</Label>
                      <Input
                        type="text"
                        inputMode={manualRate ? 'decimal' : 'text'}
                        value={manualRate
                          ? exchangeRate
                          : (preview
                            ? formatSettlementBulletinRateDisplay(preview.preview)
                            : exchangeRate
                              ? formatSettlementRateDisplay(parseFloat(exchangeRate.replace(/,/g, '')))
                              : '')}
                        onChange={e => { setExchangeRate(e.target.value); setPreview(null); }}
                        disabled={!manualRate}
                        className="h-8 font-mono text-sm"
                        placeholder={t('accountSettlements.form.fromBulletin')}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {sourceCurrency} → {targetCurrency}
                      </p>
                    </div>
                    <div className="space-y-0.5 sm:col-span-2">
                      <Label className="text-[11px]">{t('accountSettlements.form.targetAmount')}</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={targetAmount}
                        onChange={e => { setTargetAmount(e.target.value); setPreview(null); }}
                        className="h-8 font-mono text-sm"
                        placeholder={t('accountSettlements.form.autoComputed')}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] border-t border-amber-500/20 pt-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">{t('accountSettlements.form.fxDiscount')}</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={fxDiscount}
                        onChange={e => { setFxDiscount(e.target.value); setPreview(null); }}
                        className="h-8 font-mono text-sm"
                        placeholder="0.000"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs whitespace-nowrap"
                        onClick={useFullFxDiscount}
                        disabled={!preview || preview.preview.fxGainLossAmount === 0}
                      >
                        {t('accountSettlements.form.zeroFullFx')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handlePreview}
                  disabled={previewMut.isPending}
                >
                  {previewMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {t('accountSettlements.form.preview')}
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleCreate}
                  disabled={createMut.isPending || !preview}
                >
                  {createMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t('accountSettlements.form.post')}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={resetForm}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-0 px-3 py-1.5">
              <CardTitle className="text-sm">{t('accountSettlements.preview.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3 pt-0">
              {!preview ? (
                <EmptyState
                  icon={Eye}
                  title={t('accountSettlements.preview.empty')}
                  description={t('accountSettlements.preview.emptyDesc')}
                  className="py-4 [&>div:first-child]:mb-1.5 [&>div:first-child]:h-9 [&>div:first-child]:w-9 [&>div:first-child_svg]:h-4 [&>div:first-child_svg]:w-4 [&>h3]:text-sm [&>p]:mt-0.5 [&>p]:text-xs"
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
                    <div className="rounded-md border border-border px-2 py-1">
                      <div className="text-muted-foreground">{t('accountSettlements.preview.bulletinRate')}</div>
                      <div className="font-mono text-sm font-semibold">
                        {formatSettlementBulletinRateDisplay(preview.preview)}
                      </div>
                    </div>
                    <div className="rounded-md border border-border px-2 py-1">
                      <div className="text-muted-foreground">{t('accountSettlements.preview.fxGainLoss')}</div>
                      <div className={cn(
                        'font-mono text-sm font-semibold',
                        preview.preview.fxGainLossAmount > 0 ? 'text-emerald-500'
                          : preview.preview.fxGainLossAmount < 0 ? 'text-rose-500' : '',
                      )}>
                        {preview.preview.fxGainLossAmount !== 0
                          ? `${preview.preview.fxGainLossAmount > 0 ? '+' : ''}${formatAmount(preview.preview.fxGainLossAmount)} ${targetCurrency}`
                          : '—'}
                      </div>
                    </div>
                    {preview.preview.fxDiscountAmount > 0 && (
                      <>
                        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 px-2 py-1">
                          <div className="text-muted-foreground">{t('accountSettlements.preview.fxDiscount')}</div>
                          <div className="font-mono text-sm font-semibold text-violet-500">
                            {formatAmount(preview.preview.fxDiscountAmount)} {targetCurrency}
                          </div>
                        </div>
                        <div className="rounded-md border border-border px-2 py-1">
                          <div className="text-muted-foreground">{t('accountSettlements.preview.effectiveFx')}</div>
                          <div className="font-mono text-sm font-semibold">
                            {preview.preview.effectiveFxGainLossAmount !== 0
                              ? formatAmount(preview.preview.effectiveFxGainLossAmount)
                              : t('accountSettlements.preview.fxZeroed')}
                            {' '}{targetCurrency}
                          </div>
                        </div>
                      </>
                    )}
                    {preview.preview.bulletinName && (
                      <div className="col-span-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground sm:col-span-4">
                        {t('accountSettlements.preview.bulletin')}: {preview.preview.bulletinName}
                        {preview.preview.bulletinEffectiveAt && (
                          <> — {preview.preview.bulletinEffectiveAt.slice(0, 10)}</>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 lg:grid-cols-2">
                    <JournalPreviewTable
                      title={t('accountSettlements.preview.sourceEntry')}
                      lines={preview.sourceEntryLines}
                      currency={sourceCurrency}
                    />
                    <JournalPreviewTable
                      title={t('accountSettlements.preview.targetEntry')}
                      lines={preview.targetEntryLines}
                      currency={targetCurrency}
                    />
                  </div>

                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {t('accountSettlements.preview.transitNote')}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'settings' && canUpdate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('accountSettlements.settings.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('accountSettlements.settings.subtitle')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="mb-3 text-sm font-semibold">{t('accountSettlements.settings.transitTitle')}</h3>
              <p className="mb-3 text-xs text-muted-foreground">{t('accountSettlements.settings.transitHint')}</p>
              <div className="space-y-2">
                {enabledCurrencies.map(c => {
                  const accId = transitMap[c.code] ?? null;
                  const acc = accId ? leafAccounts.find(a => a.id === accId) : null;
                  const label = acc
                    ? `${acc.code} — ${localizedAccountName(locale, acc.nameAr, acc.nameEn)}`
                    : '';
                  return (
                    <div key={c.code} className="grid gap-2 sm:grid-cols-[120px_1fr] items-center">
                      <span className="font-mono text-sm font-semibold">{c.code}</span>
                      <AccountPicker
                        accounts={leafAccounts}
                        value={accId}
                        initialLabel={label}
                        onChange={(id) => {
                          setTransitMap(prev => {
                            const next = { ...prev };
                            if (id) next[c.code] = id;
                            else delete next[c.code];
                            return next;
                          });
                        }}
                        placeholder={t('accountSettlements.settings.pickTransit')}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('accountSettlements.settings.fxGain')}</Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={fxGainId}
                  initialLabel={fxGainLabel}
                  onChange={(id, label) => { setFxGainId(id); setFxGainLabel(label); }}
                  placeholder={t('accountSettlements.settings.pickAccount')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('accountSettlements.settings.fxLoss')}</Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={fxLossId}
                  initialLabel={fxLossLabel}
                  onChange={(id, label) => { setFxLossId(id); setFxLossLabel(label); }}
                  placeholder={t('accountSettlements.settings.pickAccount')}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">{t('accountSettlements.settings.fxDiscount')}</Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={fxDiscountId}
                  initialLabel={fxDiscountLabel}
                  onChange={(id, label) => { setFxDiscountId(id); setFxDiscountLabel(label); }}
                  placeholder={t('accountSettlements.settings.pickAccount')}
                />
                <p className="text-[10px] text-muted-foreground">{t('accountSettlements.settings.fxDiscountHint')}</p>
              </div>
            </div>

            <Button
              className="gap-1.5"
              onClick={() => settingsMut.mutate()}
              disabled={settingsMut.isPending}
            >
              {settingsMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t('accountSettlements.settings.save')}
            </Button>
          </CardContent>
        </Card>
      )}

      {detailTarget && (
        <SettlementDetailDialog
          row={detailTarget}
          onClose={() => setDetailTarget(null)}
          onOpenJournal={(id) => openJournalEntry(id, detailTarget)}
          onCancel={setCancelTarget}
          onPermanentDelete={setDeleteTarget}
          canCancel={canDeleteSettlement}
          canDelete={canDeleteSettlement}
        />
      )}

      {deleteTarget && (
        <DeleteSettlementDialog
          row={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          pending={deleteMut.isPending}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCancelTarget(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-rose-500">
                <Ban className="h-4 w-4" />
                {t('accountSettlements.cancel.title')}
              </h2>
              <button type="button" onClick={() => setCancelTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                {t('accountSettlements.cancel.confirm', { number: cancelTarget.settlementNumber })}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('accountSettlements.cancel.reason')}</Label>
                <Input
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder={t('accountSettlements.cancel.reasonPlaceholder')}
                  className="h-9"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCancelTarget(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  disabled={cancelMut.isPending}
                  onClick={() => cancelMut.mutate({ id: cancelTarget.id, reason: cancelReason })}
                >
                  {cancelMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  {t('accountSettlements.cancel.submit')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
