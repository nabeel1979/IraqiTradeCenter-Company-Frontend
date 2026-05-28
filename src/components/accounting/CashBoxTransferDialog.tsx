import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  X, Save, ArrowLeftRight, ArrowDown, ArrowUp, Wallet, Banknote, AlertTriangle,
  Ban, Pencil,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { cn, extractApiError, formatAmount } from '@/lib/utils';
import { useLocale, localizedName, localizedAccountName, type AppLocale } from '@/lib/i18n';
import { accountingApi } from '@/lib/api/accounting';
import {
  cashBoxesApi,
  type CashBoxDto,
  type CashBoxBalanceDto,
  type CashBoxTransferDto,
  type CreateCashBoxTransferPayload,
  type UpdateCashBoxTransferPayload,
} from '@/lib/api/cashBoxes';
import type { AccountDto } from '@/types/api';

const TRANSIT_PREF_KEY = 'cashbox.transfer.transitAccountId';

function flattenLeafAccounts(tree: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (nodes: AccountDto[]) => {
    for (const n of nodes) {
      if (n.isLeaf) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/** ─────────────────────────────────────────────────────────────────────
 * توقيت بغداد (Asia/Baghdad) — UTC+3 ثابت بلا توقيت صيفي. كل تواريخ
 * المناقلات (إرسال/استلام/إلغاء) يجب أن تُسجَّل وتُعرَض بهذا التوقيت
 * بصرف النظر عن منطقة جهاز المستخدم، حتى تطابق ما يراه أمين الصندوق
 * في الواجهة وفي السندات المطبوعة.
 * ───────────────────────────────────────────────────────────────────── */

function _baghdadParts(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}

/** يبني قيمة datetime-local (YYYY-MM-DDTHH:mm) للحظة الحالية بتوقيت بغداد. */
function nowBaghdadInput(): string {
  const o = _baghdadParts(new Date());
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

/** يحوِّل ISO قادم من الـ API إلى صيغة datetime-local بتوقيت بغداد. */
function isoToBaghdadInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowBaghdadInput();
  const o = _baghdadParts(d);
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

/** يفسِّر إدخال datetime-local على أنه توقيت بغداد ويرجِّعه ISO UTC. */
function baghdadInputToIso(local: string): string {
  const v = local.length === 16 ? local + ':00' : local;
  return new Date(v + '+03:00').toISOString();
}

interface CashBoxTransferDialogProps {
  boxes: CashBoxDto[];
  balances: CashBoxBalanceDto[];
  onClose: () => void;
  onSaved: () => void;
  /** قيم ابتدائية اختيارية (مثل: تحديد صندوق المُرسِل من الصفّ المحدّد) */
  initialFromBoxId?: number | null;
  initialToBoxId?: number | null;
  initialCurrency?: string | null;
  /** مناقلة قائمة بانتظار الاستلام للتعديل/الإلغاء — في حال غيابها = إنشاء جديد */
  editTransfer?: CashBoxTransferDto | null;
}

export function CashBoxTransferDialog({
  boxes,
  balances,
  onClose,
  onSaved,
  initialFromBoxId = null,
  initialToBoxId = null,
  initialCurrency = null,
  editTransfer = null,
}: CashBoxTransferDialogProps) {
  const { t } = useTranslation();
  const { locale, direction } = useLocale();
  const qc = useQueryClient();
  const isEdit = !!editTransfer;
  const boxName = (b: CashBoxDto | undefined) =>
    b ? localizedName(locale, b.nameAr, b.nameEn) : '—';

  const activeBoxes = useMemo(() => boxes.filter(b => b.isActive), [boxes]);

  const [fromBoxId, setFromBoxId] = useState<number | null>(
    editTransfer?.fromCashBoxId ?? initialFromBoxId
  );
  const [toBoxId, setToBoxId] = useState<number | null>(
    editTransfer?.toCashBoxId ?? initialToBoxId
  );

  // ‎العملات المشتركة بين الصندوقين (تظهر فعّالة في كليهما)
  const sharedCurrencies = useMemo(() => {
    const f = activeBoxes.find(b => b.id === fromBoxId);
    const t = activeBoxes.find(b => b.id === toBoxId);
    if (!f || !t) return [] as string[];
    const fSet = new Set(
      f.currencies.filter(c => c.isActive).map(c => c.currency.toUpperCase())
    );
    return t.currencies
      .filter(c => c.isActive && fSet.has(c.currency.toUpperCase()))
      .map(c => c.currency.toUpperCase())
      .sort();
  }, [activeBoxes, fromBoxId, toBoxId]);

  const [currency, setCurrency] = useState<string>(
    editTransfer?.currency ?? initialCurrency ?? ''
  );
  useEffect(() => {
    if (isEdit) return; // ‎عند التعديل: العملة ثابتة من المناقلة
    if (sharedCurrencies.length === 0) {
      setCurrency('');
    } else if (!sharedCurrencies.includes(currency)) {
      setCurrency(sharedCurrencies[0]);
    }
  }, [sharedCurrencies, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const [amount, setAmount] = useState<string>(
    editTransfer ? String(editTransfer.amount) : ''
  );

  // ‎قيمة <input type="datetime-local"> دائماً تُعرض/تُفسَّر كتوقيت بغداد،
  // ‎بصرف النظر عن منطقة جهاز المستخدم — ليتطابق ما يكتبه أمين الصندوق
  // ‎مع ما يظهر في الجداول والسندات المطبوعة.
  const [sendDate, setSendDate] = useState<string>(
    editTransfer ? isoToBaghdadInput(editTransfer.sendDate) : nowBaghdadInput()
  );
  // ‎تاريخ الاستلام لم يعد يُحدَّد عند إنشاء المناقلة — يُضبط فعلياً عند موافقة
  // ‎أمين الصندوق المستلم على استلام المبلغ. نُرسل تاريخ الإرسال كقيمة مخطَّطة
  // ‎فقط للحفاظ على واجهة الـ API ثم يُستبدل بالقيمة الحقيقية عند الاستلام.

  // ‎الحساب الوسيط — يُسترجَع آخر اختيار من localStorage (أو من المناقلة المعدَّلة)
  const initialTransit = (() => {
    if (editTransfer) return editTransfer.transitAccountId;
    try {
      const v = localStorage.getItem(TRANSIT_PREF_KEY);
      return v ? Number(v) || null : null;
    } catch {
      return null;
    }
  })();
  const [transitAccountId, setTransitAccountId] = useState<number | null>(initialTransit);

  const [description, setDescription] = useState(editTransfer?.description ?? '');
  const [referenceNumber, setReferenceNumber] = useState(editTransfer?.referenceNumber ?? '');
  const [postImmediately, setPostImmediately] = useState(true);

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  const cashBoxAccountIds = useMemo(
    () => new Set(boxes.map(b => b.accountId)),
    [boxes]
  );

  // ‎الحسابات المتاحة كحساب وسيط: leaves غير مرتبطة بأيّ صندوق
  const transitCandidates = useMemo(() => {
    if (!treeQuery.data) return [] as AccountDto[];
    return flattenLeafAccounts(treeQuery.data).filter(
      a => !cashBoxAccountIds.has(a.id)
    );
  }, [treeQuery.data, cashBoxAccountIds]);

  // ESC للإغلاق
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // ‎رصيد الصندوقَين بالعملة المختارة (لإظهار رصيد قبل/بعد تقديري)
  const fromBalance = balances.find(
    b => b.cashBoxId === fromBoxId && b.currency === currency
  );
  const toBalance = balances.find(
    b => b.cashBoxId === toBoxId && b.currency === currency
  );

  const amountNum = Number(amount) || 0;
  const projectedFromAfter = (fromBalance?.balance ?? 0) - amountNum;
  const projectedToAfter = (toBalance?.balance ?? 0) + amountNum;

  const sameBox = fromBoxId != null && toBoxId != null && fromBoxId === toBoxId;
  const amountError =
    amount.trim() === ''
      ? t('cashBoxes.transferDialog.amountRequired')
      : amountNum <= 0
      ? t('cashBoxes.transferDialog.amountPositive')
      : null;
  const transitError =
    transitAccountId != null && cashBoxAccountIds.has(transitAccountId)
      ? t('cashBoxes.transferDialog.transitLinkedError')
      : null;

  const transitAccount = useMemo(
    () => transitCandidates.find(a => a.id === transitAccountId) ?? null,
    [transitCandidates, transitAccountId]
  );

  const fromBox = activeBoxes.find(b => b.id === fromBoxId);
  const toBox = activeBoxes.find(b => b.id === toBoxId);

  const saveM = useMutation({
    mutationFn: async () => {
      // ‎تفسير قيمة الإدخال كتوقيت بغداد (UTC+3) قبل إرسالها للـ API.
      const sendIso = baghdadInputToIso(sendDate);

      if (isEdit && editTransfer) {
        const payload: UpdateCashBoxTransferPayload = {
          amount: amountNum,
          sendDate: sendIso,
          transitAccountId: transitAccountId!,
          description: description.trim() || null,
          referenceNumber: referenceNumber.trim() || null,
          postImmediately,
        };
        await cashBoxesApi.updateTransfer(editTransfer.id, payload);
        return;
      }

      const payload: CreateCashBoxTransferPayload = {
        fromCashBoxId: fromBoxId!,
        toCashBoxId: toBoxId!,
        transitAccountId: transitAccountId!,
        currency,
        amount: amountNum,
        sendDate: sendIso,
        // ‎الاستلام يُحدَّد لاحقاً عند الموافقة. نُرسل قيمة افتراضية = تاريخ
        // ‎الإرسال للحفاظ على عقد الـ API الحالي (سيُستبدل عند تأكيد الاستلام).
        receiveDate: sendIso,
        description: description.trim() || null,
        referenceNumber: referenceNumber.trim() || null,
        postImmediately,
      };
      await cashBoxesApi.createTransfer(payload);
    },
    onSuccess: () => {
      try {
        if (transitAccountId != null)
          localStorage.setItem(TRANSIT_PREF_KEY, String(transitAccountId));
      } catch {
        /* ignore */
      }
      toast.success(
        isEdit
          ? t('cashBoxes.transferDialog.editSuccess')
          : t('cashBoxes.transferDialog.createSuccess'),
      );
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
      qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
      qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      onSaved();
    },
    onError: (e: any) =>
      toast.error(extractApiError(e, isEdit ? t('cashBoxes.transferDialog.editFailed') : t('cashBoxes.transferDialog.createFailed'))),
  });

  // ‎إلغاء المناقلة من نفس النافذة (في وضع التعديل فقط)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const cancelM = useMutation({
    mutationFn: () => {
      if (!editTransfer) throw new Error('no transfer');
      return cashBoxesApi.cancelTransfer(editTransfer.id, {
        reason: cancelReason.trim() || null,
        postImmediately: true,
      });
    },
    onSuccess: () => {
      toast.success(t('cashBoxes.transferDialog.cancelSuccess'));
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
      qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
      qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      onSaved();
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.transferDialog.cancelFailed'))),
  });

  const canSave =
    !saveM.isPending &&
    fromBoxId != null &&
    toBoxId != null &&
    !sameBox &&
    !!currency &&
    !amountError &&
    transitAccountId != null &&
    !transitError &&
    !!sendDate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        dir={direction}
      >
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {isEdit ? <Pencil className="h-4 w-4 text-primary" /> : <ArrowLeftRight className="h-4 w-4 text-primary" />}
            {isEdit
              ? t('cashBoxes.transferDialog.editTitle', { number: editTransfer!.transferNumber })
              : t('cashBoxes.transferDialog.createTitle')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[80vh] space-y-3 overflow-auto p-4">
          {/* الصندوقَان */}
          <div className="grid gap-3 sm:grid-cols-2">
            <BoxSelector
              label={t('cashBoxes.transferDialog.fromBox')}
              selectPlaceholder={t('cashBoxes.transferDialog.selectBox')}
              locale={locale}
              icon={<ArrowUp className="h-3.5 w-3.5 text-rose-500" />}
              boxes={activeBoxes}
              value={fromBoxId}
              onChange={setFromBoxId}
              excludeId={toBoxId}
              disabled={isEdit}
            />
            <BoxSelector
              label={t('cashBoxes.transferDialog.toBox')}
              selectPlaceholder={t('cashBoxes.transferDialog.selectBox')}
              locale={locale}
              icon={<ArrowDown className="h-3.5 w-3.5 text-emerald-500" />}
              boxes={activeBoxes}
              value={toBoxId}
              onChange={setToBoxId}
              excludeId={fromBoxId}
              disabled={isEdit}
            />
          </div>
          {isEdit && (
            <Banner
              type="info"
              message={t('cashBoxes.transferDialog.editLockedHint')}
            />
          )}

          {sameBox && (
            <Banner type="error" message={t('cashBoxes.transferDialog.sameBoxError')} />
          )}

          {fromBoxId && toBoxId && !sameBox && sharedCurrencies.length === 0 && (
            <Banner
              type="error"
              message={t('cashBoxes.transferDialog.noSharedCurrencies', {
                from: boxName(fromBox),
                to: boxName(toBox),
              })}
            />
          )}

          {/* العملة + المبلغ */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.transferDialog.currency')} *</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                disabled={isEdit || sharedCurrencies.length === 0}
                className={cn(
                  'h-9 w-full rounded border border-input bg-secondary/40 px-2 text-sm',
                  isEdit && 'cursor-not-allowed opacity-70'
                )}
              >
                <option value="">{t('cashBoxes.dialog.selectCurrency')}</option>
                {sharedCurrencies.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.transferDialog.amount')} *</label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.000"
                className={cn(
                  'h-9 num-display text-left text-sm',
                  amountError && 'border-destructive'
                )}
              />
              {amountError && <p className="mt-0.5 text-[10px] text-destructive">{amountError}</p>}
            </div>
          </div>

          {/* أرصدة قبل/بعد */}
          {currency && (fromBalance || toBalance) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <BalanceMiniCard
                title={t('cashBoxes.transferDialog.balanceTitle', { name: boxName(fromBox) })}
                currency={currency}
                before={fromBalance?.balance ?? 0}
                after={projectedFromAfter}
                debitLimit={fromBalance?.debitLimit}
                creditLimit={fromBalance?.creditLimit}
                tone="from"
              />
              <BalanceMiniCard
                title={t('cashBoxes.transferDialog.balanceTitle', { name: boxName(toBox) })}
                currency={currency}
                before={toBalance?.balance ?? 0}
                after={projectedToAfter}
                debitLimit={toBalance?.debitLimit}
                creditLimit={toBalance?.creditLimit}
                tone="to"
              />
            </div>
          )}

          {/* تاريخ الإرسال — تاريخ الاستلام يُحدَّد عند الموافقة */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              {t('cashBoxes.transferDialog.sendDate')} *
            </label>
            <Input
              type="datetime-local"
              value={sendDate}
              onChange={e => setSendDate(e.target.value)}
              className="h-9 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              {t('cashBoxes.transferDialog.receiveDateHint')}
            </p>
          </div>

          {/* الحساب الوسيط */}
          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-primary">
                  {t('cashBoxes.transferDialog.transitAccount')} *
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('cashBoxes.transferDialog.transitHint')}
                </p>
              </div>
            </div>
            <AccountPicker
              accounts={transitCandidates}
              value={transitAccountId}
              initialLabel={
                transitAccount
                  ? `${transitAccount.code} - ${localizedAccountName(locale, transitAccount.nameAr, transitAccount.nameEn)}`
                  : undefined
              }
              onChange={id => setTransitAccountId(id)}
              allowClear
              placeholder={t('cashBoxes.transferDialog.transitPlaceholder')}
              inputHeight={9}
            />
            {transitError && (
              <p className="text-[10px] text-destructive">{transitError}</p>
            )}
          </div>

          {/* ملاحظات + مرجع */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.transferDialog.description')}</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 500))}
                placeholder={t('cashBoxes.transferDialog.descriptionPlaceholder')}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('cashBoxes.transferDialog.reference')}
              </label>
              <Input
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value.slice(0, 50))}
                placeholder={t('cashBoxes.transferDialog.referencePlaceholder')}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-md border border-input bg-secondary/30 p-2 text-xs">
            <input
              type="checkbox"
              checked={postImmediately}
              onChange={e => setPostImmediately(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>{t('cashBoxes.transferDialog.postSendImmediately')}</span>
          </label>

          {/* معاينة قيد الإرسال — قيد الاستلام يُولَّد لاحقاً عند موافقة المستلم */}
          {fromBox && toBox && currency && amountNum > 0 && transitAccount && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px]">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <Banknote className="h-3.5 w-3.5" />
                {t('cashBoxes.transferDialog.previewSend')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewEntry
                  title={t('cashBoxes.transferDialog.sendEntry')}
                  date={sendDate}
                  rows={[
                    {
                      label: localizedAccountName(locale, transitAccount.nameAr, transitAccount.nameEn),
                      debit: amountNum,
                      credit: 0,
                      hint: t('cashBoxes.transferDialog.transitHintRow'),
                    },
                    {
                      label: boxName(fromBox),
                      debit: 0,
                      credit: amountNum,
                      hint: t('cashBoxes.transferDialog.senderBoxHint'),
                    },
                  ]}
                  currency={currency}
                />
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-center text-amber-600">
                  <Banknote className="mb-1 h-5 w-5 opacity-70" />
                  <div className="text-[11px] font-bold">{t('cashBoxes.transferDialog.receiveEntryLater')}</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-600/80">
                    {t('cashBoxes.transferDialog.receiveEntryHint')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* مربع تأكيد إلغاء المناقلة (يظهر داخل النافذة في وضع التعديل) */}
        {isEdit && showCancelConfirm && (
          <div className="border-t border-rose-500/40 bg-rose-500/5 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('cashBoxes.transferDialog.cancelConfirmTitle')}
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {t('cashBoxes.transferDialog.cancelConfirmHint')}
            </p>
            <Input
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value.slice(0, 500))}
              placeholder={t('cashBoxes.transferDialog.cancelReasonPlaceholder')}
              className="h-9 text-xs"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelM.isPending}
              >
                {t('cashBoxes.actionDialog.back')}
              </Button>
              <Button
                size="sm"
                onClick={() => cancelM.mutate()}
                disabled={cancelM.isPending}
                className="gap-1.5 bg-rose-500 text-white hover:bg-rose-600"
              >
                <Ban className="h-3.5 w-3.5" />
                {cancelM.isPending ? t('cashBoxes.transferDialog.cancelling') : t('cashBoxes.transferDialog.confirmCancel')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          {/* يسار: زر إلغاء المناقلة (تعديل فقط) */}
          <div>
            {isEdit && !showCancelConfirm && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="gap-1.5 border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
              >
                <Ban className="h-3.5 w-3.5" />
                {t('cashBoxes.transferDialog.cancelTransfer')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              {isEdit ? t('cashBoxes.transferDialog.close') : t('common.cancel')}
            </Button>
            <Button size="sm" onClick={() => saveM.mutate()} disabled={!canSave} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saveM.isPending
                ? isEdit ? t('cashBoxes.transferDialog.saving') : t('cashBoxes.transferDialog.creating')
                : isEdit ? t('cashBoxes.transferDialog.saveEdit') : t('cashBoxes.transferDialog.createTransfer')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// مكوّنات داخلية
// ─────────────────────────────────────────────────────────────────────

function BoxSelector({
  label,
  icon,
  boxes,
  value,
  onChange,
  excludeId,
  disabled,
  selectPlaceholder,
  locale,
}: {
  label: string;
  icon: React.ReactNode;
  boxes: CashBoxDto[];
  value: number | null;
  onChange: (id: number | null) => void;
  excludeId: number | null;
  disabled?: boolean;
  selectPlaceholder: string;
  locale: AppLocale;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label} *
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        className={cn(
          'h-9 w-full rounded border border-input bg-secondary/40 px-2 text-sm',
          disabled && 'cursor-not-allowed opacity-70'
        )}
      >
        <option value="">{selectPlaceholder}</option>
        {boxes
          .filter(b => b.id !== excludeId)
          .map(b => (
            <option key={b.id} value={b.id}>
              {b.code} — {localizedName(locale, b.nameAr, b.nameEn)}
            </option>
          ))}
      </select>
    </div>
  );
}

function BalanceMiniCard({
  title,
  currency,
  before,
  after,
  debitLimit,
  creditLimit,
  tone,
}: {
  title: string;
  currency: string;
  before: number;
  after: number;
  debitLimit?: number | null;
  creditLimit?: number | null;
  tone: 'from' | 'to';
}) {
  const { t } = useTranslation();
  const exceedsDebit = debitLimit != null && after > debitLimit;
  const exceedsCredit = creditLimit != null && after < -creditLimit;
  const warn = exceedsDebit || exceedsCredit;
  return (
    <div
      className={cn(
        'rounded-md border p-2 text-[11px]',
        warn
          ? 'border-destructive/50 bg-destructive/5'
          : tone === 'from'
          ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-emerald-500/30 bg-emerald-500/5'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold">
          <Wallet className="h-3 w-3" />
          {title}
        </span>
        <span className="num-display text-muted-foreground">{currency}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 num-display">
        <div>
          <div className="text-[10px] text-muted-foreground">{t('cashBoxes.transferDialog.before')}</div>
          <div className="text-xs font-bold">{formatAmount(before)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">{t('cashBoxes.transferDialog.after')}</div>
          <div
            className={cn(
              'text-xs font-bold',
              warn ? 'text-destructive' : tone === 'from' ? 'text-rose-500' : 'text-emerald-500'
            )}
          >
            {formatAmount(after)}
          </div>
        </div>
      </div>
      {warn && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {t('cashBoxes.transferDialog.exceedsLimit')}
        </div>
      )}
    </div>
  );
}

function PreviewEntry({
  title,
  date,
  rows,
  currency,
}: {
  title: string;
  date: string;
  rows: { label: string; debit: number; credit: number; hint: string }[];
  currency: string;
}) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const dt = date ? new Date(date) : null;
  const dateLocale = isRtl ? 'ar-IQ-u-nu-latn' : 'en-GB';
  return (
    <div className="rounded border border-border bg-card p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground">
          {dt
            ? dt.toLocaleString(dateLocale, {
                timeZone: 'Asia/Baghdad',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="p-0.5 text-end">{t('cashBoxes.transferDialog.colAccount')}</th>
            <th className="p-0.5 text-center">{t('cashBoxes.transferDialog.colDebit')}</th>
            <th className="p-0.5 text-center">{t('cashBoxes.transferDialog.colCredit')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40">
              <td className="p-0.5 text-end">
                <span className="font-medium">{r.label}</span>
                <span className="ms-1 text-[9px] text-muted-foreground">({r.hint})</span>
              </td>
              <td className="p-0.5 text-center num-display">
                {r.debit > 0 ? formatAmount(r.debit) : '—'}
              </td>
              <td className="p-0.5 text-center num-display">
                {r.credit > 0 ? formatAmount(r.credit) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-end text-[10px] text-muted-foreground num-display">{currency}</div>
    </div>
  );
}

function Banner({ type, message }: { type: 'error' | 'info'; message: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-2 text-[11px]',
        type === 'error'
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-primary/40 bg-primary/5 text-primary'
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
