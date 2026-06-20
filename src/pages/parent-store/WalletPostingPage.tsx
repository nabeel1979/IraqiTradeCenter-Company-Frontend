import { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDownCircle, ArrowUpCircle, Search, CheckCircle2, Wallet as WalletIcon, ArrowRight, Printer, FileText, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletListItem, type WalletTransaction } from '@/lib/api/storeWallets';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { JournalEntryViewDialog } from '@/components/accounting/JournalEntryViewDialog';
import { extractApiError } from '@/lib/utils';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

type Mode = 'pay' | 'withdraw';

/** يبقي الأرقام ونقطة عشرية واحدة فقط في القيمة الخام (بدون فواصل). */
function sanitizeAmount(input: string): string {
  let cleaned = input.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned;
}

/** يعرض القيمة الخام مع فواصل الآلاف للجزء الصحيح. */
function formatAmountDisplay(raw: string): string {
  if (!raw) return '';
  const hasDot = raw.includes('.');
  const [intPart, decPart = ''] = raw.split('.');
  const intFmt = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hasDot ? `${intFmt}.${decPart}` : intFmt;
}

interface Props {
  mode?: Mode;
  standalone?: boolean;
}

export function WalletPostingPage({ mode: modeProp = 'pay', standalone = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { can, cashBoxIds, isSuper } = usePermissions();
  const canPay = can(PERMS.Parent.Wallets.Topup);
  const canWithdraw = can(PERMS.Parent.Wallets.Withdraw);

  const [searchParams] = useSearchParams();
  const initialMode: Mode = standalone && searchParams.get('mode') === 'withdraw' ? 'withdraw' : modeProp;
  const [modeState, setModeState] = useState<Mode>(initialMode);
  const mode = standalone ? modeState : modeProp;
  const isPay = mode === 'pay';

  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [cashBoxId, setCashBoxId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ tx: WalletTransaction; wallet: WalletListItem } | null>(null);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  // في الوضع المستقل: إن لم يملك المستخدم صلاحية الدفع نبدأ على السحب
  useEffect(() => {
    if (standalone && !canPay && canWithdraw) setModeState('withdraw');
  }, [standalone, canPay, canWithdraw]);

  // فتح النافذة من «أصل القيد» في كشف الحساب: تحديد المحفظة مسبقاً عبر كود حسابها.
  const accountParam = standalone ? searchParams.get('account') : null;

  const { data: group } = useQuery({
    queryKey: ['wallet-group', groupId],
    queryFn: () => storeWalletsApi.groups.get(groupId),
    enabled: !standalone && !!groupId,
  });

  const { data: wallets, isLoading } = useQuery({
    queryKey: ['parent-wallets', standalone ? 'all' : groupId, ''],
    queryFn: () => storeWalletsApi.list(standalone ? {} : { groupId }),
    enabled: standalone || !!groupId,
  });

  // تحديد المحفظة مسبقاً عند فتح النافذة من «أصل القيد» (account = كود حساب المحفظة).
  useEffect(() => {
    if (!accountParam || walletId || !wallets?.length) return;
    const match = wallets.find((w) => w.accountCode === accountParam);
    if (match) setWalletId(match.id);
  }, [accountParam, wallets, walletId]);

  // جلب المبلغ مسبقاً من «أصل القيد» (يبقى قابلاً للتعديل أو الحذف).
  const amountParam = standalone ? searchParams.get('amount') : null;
  const amountPrefilled = useRef(false);
  useEffect(() => {
    if (!amountParam || amountPrefilled.current) return;
    amountPrefilled.current = true;
    setAmount(sanitizeAmount(amountParam));
  }, [amountParam]);

  const { data: allCashBoxes } = useQuery({
    queryKey: ['cash-boxes-active'],
    queryFn: () => cashBoxesApi.getAll(true),
  });

  // قائمة الصناديق محكومة بصلاحيات المستخدم — نفس منطق السندات الفردية:
  // السوبر أدمن يرى الكل، والقائمة الفارغة تعني عدم وجود تقييد.
  const cashBoxes = useMemo(() => {
    const list = (allCashBoxes ?? []).filter((c) => c.isActive && c.accountCode);
    if (isSuper || !cashBoxIds || cashBoxIds.length === 0) return list;
    const allowed = new Set(cashBoxIds);
    return list.filter((c) => allowed.has(c.id));
  }, [allCashBoxes, cashBoxIds, isSuper]);

  // جلب الصندوق المستخدم في القيد الأصلي عند الفتح من «أصل القيد».
  const entryParam = standalone ? searchParams.get('entry') : null;
  const { data: sourceEntry } = useQuery({
    queryKey: ['wallet-source-entry', entryParam],
    queryFn: () => accountingApi.getJournalEntryById(Number(entryParam)),
    enabled: standalone && !!entryParam,
  });
  const cashBoxPrefilled = useRef(false);
  useEffect(() => {
    if (cashBoxPrefilled.current || cashBoxId || !sourceEntry || !cashBoxes.length) return;
    const box = cashBoxes.find((c) => sourceEntry.lines.some((l) => l.accountId === c.accountId));
    if (box) {
      cashBoxPrefilled.current = true;
      setCashBoxId(String(box.id));
    }
  }, [sourceEntry, cashBoxes, cashBoxId]);

  // وضع التعديل/الحذف: عند الفتح من «أصل القيد» نطابِق الحركة بقيدها لإتاحة الحفظ/الحذف.
  const editEntryId = entryParam ? Number(entryParam) : null;
  const { data: walletTxns } = useQuery({
    queryKey: ['wallet-edit-tx', walletId, editEntryId],
    queryFn: () => storeWalletsApi.statement(walletId),
    enabled: standalone && !!walletId && !!editEntryId,
  });
  const editTx = useMemo(
    () => walletTxns?.find((x) => x.journalEntryId === editEntryId && (x.type === 1 || x.type === 2)) ?? null,
    [walletTxns, editEntryId],
  );
  const isEdit = !!editTx;
  const [deleting, setDeleting] = useState(false);

  const { data: company } = useQuery({
    queryKey: ['company-settings-print'],
    queryFn: () => companySettingsApi.get(),
    staleTime: 5 * 60_000,
  });

  const [printing, setPrinting] = useState(false);

  const printReceipt = async (tx: WalletTransaction) => {
    setPrinting(true);
    try {
      const full = await accountingApi.getJournalEntryById(tx.journalEntryId);
      printSingleJournalEntry(full, company ?? null);
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setPrinting(false);
    }
  };

  const groupName = group?.name ?? '';

  const selected = wallets?.find((w) => w.id === walletId) ?? null;

  const reset = () => {
    setWalletId('');
    setAmount('');
    setNote('');
    setCashBoxId('');
    setDone(null);
  };

  const submit = async () => {
    const value = Number(amount);
    if (!walletId) { toast.error(t('walletPosting.selectWallet')); return; }
    if (!Number.isFinite(value) || value <= 0) { toast.error(t('wallets.invalidAmount')); return; }
    const cashBox = cashBoxes.find((c) => String(c.id) === cashBoxId);
    if (!cashBox?.accountCode) { toast.error(t('walletPosting.selectCashBox')); return; }

    setSubmitting(true);
    try {
      const body = { amount: value, description: note.trim() || null, fundingAccountCode: cashBox.accountCode };

      if (isEdit && editTx) {
        const res = await storeWalletsApi.updateTransaction(editTx.id, body);
        if (res && (res as { success: boolean }).success === false) {
          toast.error((res as { message?: string }).message ?? t('common.error'));
          return;
        }
        toast.success(t('walletPosting.editSaved'));
        navigate(-1);
        return;
      }

      const res = isPay
        ? await storeWalletsApi.topup(walletId, body)
        : await storeWalletsApi.withdraw(walletId, body);

      if (res && (res as { success: boolean }).success === false) {
        toast.error((res as { message?: string }).message ?? t('common.error'));
        return;
      }
      const tx = (res as { data?: WalletTransaction }).data;
      toast.success(t('walletPosting.posted'));
      if (tx && selected) setDone({ tx, wallet: selected });
      else reset();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editTx) return;
    if (!window.confirm(t('walletPosting.confirmDelete'))) return;
    setDeleting(true);
    try {
      const res = await storeWalletsApi.deleteTransaction(editTx.id);
      if (res && (res as { success: boolean }).success === false) {
        toast.error((res as { message?: string }).message ?? t('common.error'));
        return;
      }
      toast.success(t('walletPosting.deleted'));
      navigate(-1);
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const Icon = isPay ? ArrowDownCircle : ArrowUpCircle;
  const accent = isPay ? 'text-emerald-600' : 'text-amber-600';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          {!standalone && (
            <button
              onClick={() => navigate(`/parent/wallets/${groupId}`)}
              className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {t('wallets.groups.backMembers')}
            </button>
          )}
          <CardTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accent}`} />
            {standalone
              ? t('walletPosting.standaloneTitle')
              : groupName
                ? (isPay ? t('walletPosting.payTitleNamed', { name: groupName }) : t('walletPosting.withdrawTitleNamed', { name: groupName }))
                : (isPay ? t('walletPosting.payTitle') : t('walletPosting.withdrawTitle'))}
          </CardTitle>
          <CardDescription>
            {isEdit
              ? t('walletPosting.editDesc')
              : (isPay ? t('walletPosting.payDesc') : t('walletPosting.withdrawDesc'))}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
          ) : done ? (
            <SuccessView
              mode={mode}
              tx={done.tx}
              wallet={done.wallet}
              onNew={reset}
              onPrint={() => printReceipt(done.tx)}
              onViewEntry={() => done.tx.journalEntryId && setViewEntryId(done.tx.journalEntryId)}
              printing={printing}
            />
          ) : (
            <>
              {standalone && !isEdit && (
                <div className="flex gap-2">
                  {canPay && (
                    <Button
                      type="button"
                      size="sm"
                      variant={isPay ? 'default' : 'outline'}
                      onClick={() => setModeState('pay')}
                    >
                      <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                      {t('walletPosting.payTitle')}
                    </Button>
                  )}
                  {canWithdraw && (
                    <Button
                      type="button"
                      size="sm"
                      variant={!isPay ? 'default' : 'outline'}
                      onClick={() => setModeState('withdraw')}
                    >
                      <ArrowUpCircle className="h-4 w-4 text-amber-600" />
                      {t('walletPosting.withdrawTitle')}
                    </Button>
                  )}
                </div>
              )}

              <Field label={t('walletPosting.account')}>
                <WalletPicker
                  wallets={wallets ?? []}
                  value={walletId}
                  onChange={setWalletId}
                  placeholder={t('walletPosting.searchWallet')}
                />
              </Field>

              {selected && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t('wallets.currentBalance')}: </span>
                  <span className="font-semibold tabular-nums" dir="ltr">
                    {formatMoney(selected.balance)} {selected.currency}
                  </span>
                </div>
              )}

              <Field label={t('walletPosting.cashBox')}>
                <select
                  value={cashBoxId}
                  onChange={(e) => setCashBoxId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('walletPosting.selectCashBox')}</option>
                  {cashBoxes.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.nameAr}{c.accountCode ? ` — ${c.accountCode}` : ''}
                    </option>
                  ))}
                </select>
                {cashBoxes.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-600">{t('walletPosting.noCashBoxes')}</p>
                )}
              </Field>

              <Field label={t('wallets.amount')}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formatAmountDisplay(amount)}
                  onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                  dir="ltr"
                  placeholder="0"
                />
              </Field>

              <Field label={t('wallets.note')}>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('wallets.notePlaceholder')}
                />
              </Field>

              <p className="text-[11px] text-muted-foreground">
                {t('walletPosting.autoEntryNote')}
              </p>

              {isEdit ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={handleDelete}
                    disabled={submitting || deleting}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('walletPosting.deleteTx')}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate(-1)} disabled={submitting || deleting}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={submit} disabled={submitting || deleting}>
                      {t('walletPosting.saveEdit')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={reset} disabled={submitting}>
                    {t('common.reset')}
                  </Button>
                  <Button onClick={submit} disabled={submitting}>
                    {isPay ? t('walletPosting.confirmPay') : t('walletPosting.confirmWithdraw')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <JournalEntryViewDialog
        entryId={viewEntryId}
        onClose={() => setViewEntryId(null)}
        allowEdit={false}
      />
    </div>
  );
}

function SuccessView({
  mode, tx, wallet, onNew, onPrint, onViewEntry, printing,
}: { mode: Mode; tx: WalletTransaction; wallet: WalletListItem; onNew: () => void; onPrint: () => void; onViewEntry: () => void; printing: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          {t('walletPosting.posted')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('walletPosting.journalEntry')}: <span className="font-mono" dir="ltr">#{tx.journalEntryId}</span>
        </p>
      </div>

      <dl className="divide-y rounded-lg border text-sm">
        <Row label={t('walletPosting.account')} value={`${wallet.userName} — ${wallet.accountCode}`} />
        <Row
          label={mode === 'pay' ? t('walletPosting.payAmount') : t('walletPosting.withdrawAmount')}
          value={`${formatMoney(tx.amount)} ${wallet.currency}`}
        />
        <Row label={t('wallets.col.balanceAfter')} value={`${formatMoney(tx.balanceAfter)} ${wallet.currency}`} />
        {tx.counterAccountName && (
          <Row label={t('walletPosting.counterAccount')} value={tx.counterAccountName} />
        )}
        <Row label={t('walletPosting.dateTime')} value={new Date(tx.createdAt).toLocaleString()} />
        {tx.description && <Row label={t('wallets.note')} value={tx.description} />}
      </dl>

      <div className="flex flex-wrap justify-end gap-2">
        {!!tx.journalEntryId && (
          <Button variant="outline" onClick={onViewEntry}>
            <FileText className="h-4 w-4" />
            {t('walletPosting.viewEntry')}
          </Button>
        )}
        <Button variant="outline" onClick={onPrint} disabled={printing}>
          <Printer className="h-4 w-4" />
          {t('walletPosting.printReceipt')}
        </Button>
        <Button onClick={onNew}>{t('walletPosting.newOperation')}</Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium" dir="auto">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Combobox للبحث عن محفظة (حساب ابن للحساب الأب) بالاسم/المعرّف/كود الحساب. */
function WalletPicker({
  wallets, value, onChange, placeholder,
}: {
  wallets: WalletListItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = wallets.find((w) => w.id === value);
  const selectedLabel = selected ? `${selected.userName} — ${selected.accountCode}` : '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = wallets.filter((w) => w.isActive);
    if (!q) return active.slice(0, 80);
    return active
      .filter((w) =>
        w.userName.toLowerCase().includes(q) ||
        w.userCode.toLowerCase().includes(q) ||
        w.accountCode.toLowerCase().includes(q))
      .slice(0, 80);
  }, [wallets, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const select = (w: WalletListItem) => {
    onChange(w.id);
    setOpen(false);
    setQuery('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const w = filtered[highlight]; if (w) select(w); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : selectedLabel}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onKeyDown={handleKey}
          placeholder={selectedLabel || placeholder}
          className="pr-7"
        />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {query ? `لا توجد نتائج لـ "${query}"` : '—'}
              </div>
            ) : (
              filtered.map((w, idx) => (
                <button
                  key={w.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(w); }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-right text-sm transition-colors ${
                    idx === highlight ? 'bg-primary/15' : 'hover:bg-secondary/60'
                  } ${w.id === value ? 'font-semibold' : ''}`}
                >
                  <WalletIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{w.userName}</span>
                  <span className="num-display shrink-0 text-xs text-muted-foreground" dir="ltr">{w.accountCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
