import { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDownCircle, ArrowUpCircle, Search, CheckCircle2, Wallet as WalletIcon, ArrowRight, Printer,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletListItem, type WalletTransaction } from '@/lib/api/storeWallets';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { extractApiError } from '@/lib/utils';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

type Mode = 'pay' | 'withdraw';

interface Props {
  mode: Mode;
}

export function WalletPostingPage({ mode }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId = '' } = useParams<{ groupId: string }>();
  const isPay = mode === 'pay';

  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ tx: WalletTransaction; wallet: WalletListItem } | null>(null);

  const { data: group } = useQuery({
    queryKey: ['wallet-group', groupId],
    queryFn: () => storeWalletsApi.groups.get(groupId),
    enabled: !!groupId,
  });

  const { data: wallets, isLoading } = useQuery({
    queryKey: ['parent-wallets', groupId, ''],
    queryFn: () => storeWalletsApi.list({ groupId }),
    enabled: !!groupId,
  });

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
    setDone(null);
  };

  const submit = async () => {
    const value = Number(amount);
    if (!walletId) { toast.error(t('walletPosting.selectWallet')); return; }
    if (!Number.isFinite(value) || value <= 0) { toast.error(t('wallets.invalidAmount')); return; }

    setSubmitting(true);
    try {
      const body = { amount: value, description: note.trim() || null };
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

  const Icon = isPay ? ArrowDownCircle : ArrowUpCircle;
  const accent = isPay ? 'text-emerald-600' : 'text-amber-600';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <button
            onClick={() => navigate(`/parent/wallets/${groupId}`)}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {t('wallets.groups.backMembers')}
          </button>
          <CardTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accent}`} />
            {groupName
              ? (isPay ? t('walletPosting.payTitleNamed', { name: groupName }) : t('walletPosting.withdrawTitleNamed', { name: groupName }))
              : (isPay ? t('walletPosting.payTitle') : t('walletPosting.withdrawTitle'))}
          </CardTitle>
          <CardDescription>
            {isPay ? t('walletPosting.payDesc') : t('walletPosting.withdrawDesc')}
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
              printing={printing}
            />
          ) : (
            <>
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

              <Field label={t('wallets.amount')}>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={reset} disabled={submitting}>
                  {t('common.reset')}
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {isPay ? t('walletPosting.confirmPay') : t('walletPosting.confirmWithdraw')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SuccessView({
  mode, tx, wallet, onNew, onPrint, printing,
}: { mode: Mode; tx: WalletTransaction; wallet: WalletListItem; onNew: () => void; onPrint: () => void; printing: boolean }) {
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

      <div className="flex justify-end gap-2">
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
