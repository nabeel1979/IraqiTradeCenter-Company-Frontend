import type { NavigateFunction } from 'react-router-dom';
import type { JournalEntryDto } from '@/types/api';
import type { JournalVoucherTypeDto } from '@/lib/api/journalVoucherTypes';
import { accountingApi } from '@/lib/api/accounting';

/** مسار صفحة الصناديق — تبويب الأرصدة. */
export const CASH_BOX_BALANCES_PATH = '/financial-management/cash-boxes?view=balances';
/** مسار صفحة الصناديق — تبويب المناقلات. */
export const CASH_BOX_TRANSFERS_PATH = '/financial-management/cash-boxes?view=transfers';
/** مسار صفحة معالجة تكاليف المواد — مصدر قيود تسوية كلفة المخزون. */
export const COST_PROCESSING_PATH = '/invoices/cost-processing';

export type JournalEntrySourceInput = {
  id?: number;
  entryId?: number;
  source?: string;
  referenceType?: string | null;
  referenceId?: number | null;
  /** رقم/كود المرجع — لقيود المحفظة يساوي كود حساب المحفظة (لتحديدها مسبقاً). */
  referenceNumber?: string | null;
  /** مبلغ الحركة — لتعبئة حقل المبلغ مسبقاً في نافذة المحفظة. */
  amount?: number | null;
  voucherTypeId?: number | null;
  voucherTypeCode?: string | null;
};

export function isDirectTransferReference(referenceType?: string | null): boolean {
  return referenceType === 'CashBoxTransfer' || referenceType === 'CashBoxTransferReversal';
}

/** معرف القيد الأصلي إذا كان هذا القيد عكساً (ReversalOf). */
export function getReversalOriginalEntryId(entry: {
  referenceType?: string | null;
  referenceId?: number | null;
}): number | null {
  if (entry.referenceType === 'ReversalOf' && entry.referenceId) {
    return entry.referenceId;
  }
  return null;
}

/** هل القيد (أو القيد الذي عُكِس) مرتبط بمناقلة صناديق؟ */
export async function isTransferRelatedJournalEntry(
  entry: Pick<JournalEntryDto, 'referenceType' | 'referenceId'>,
): Promise<boolean> {
  if (isDirectTransferReference(entry.referenceType)) return true;
  const originalId = getReversalOriginalEntryId(entry);
  if (originalId == null) return false;
  try {
    const original = await accountingApi.getJournalEntryById(originalId);
    return isDirectTransferReference(original.referenceType);
  } catch {
    return false;
  }
}

export type JournalEntrySourceNavOptions = {
  returnState?: unknown;
  voucherTypes?: JournalVoucherTypeDto[];
};

/**
 * يفتح «أصل القيد» في النافذة المناسبة:
 * - مناقلة صناديق (أو عكس قيد مناقلة) → تبويب المناقلات
 * - عكس قيد عادي → عرض القيد الأصلي
 * - سند/فاتورة/يدوي → حسب المصدر
 */
export async function navigateJournalEntrySource(
  entry: JournalEntrySourceInput,
  navigate: NavigateFunction,
  options: JournalEntrySourceNavOptions = {},
): Promise<void> {
  const entryId = entry.id ?? entry.entryId;
  const { returnState, voucherTypes = [] } = options;

  if (await isTransferRelatedJournalEntry(entry)) {
    navigate(CASH_BOX_TRANSFERS_PATH, returnState ? { state: returnState } : undefined);
    return;
  }

  const reversalOriginalId = getReversalOriginalEntryId(entry);
  if (reversalOriginalId != null) {
    navigate(
      `/accounting/journal/${reversalOriginalId}/view`,
      returnState ? { state: returnState } : undefined,
    );
    return;
  }

  if (entry.voucherTypeCode && entryId != null) {
    const codeUpper = entry.voucherTypeCode.toUpperCase();
    const vt = entry.voucherTypeId
      ? voucherTypes.find(v => v.id === entry.voucherTypeId)
      : voucherTypes.find(v => v.code.toUpperCase() === codeUpper);
    if (vt?.nature === 'Mixed') {
      navigate(`/accounting/journal/${entryId}/edit`, returnState ? { state: returnState } : undefined);
    } else {
      navigate(
        `/accounting/vouchers/${entry.voucherTypeCode}/${entryId}/edit`,
        returnState ? { state: returnState } : undefined,
      );
    }
    return;
  }

  // ‎قيود المحافظ الرقمية (تعبئة/سحب/تحويل) → نافذة دفع/سحب المحافظ بالوضع المناسب.
  if (
    entry.source === 'WalletTopup' ||
    entry.source === 'WalletWithdraw' ||
    entry.source === 'WalletTransfer' ||
    entry.referenceType === 'Wallet'
  ) {
    const mode = entry.source === 'WalletWithdraw' ? 'withdraw' : 'pay';
    const acct = entry.referenceNumber ? `&account=${encodeURIComponent(entry.referenceNumber)}` : '';
    const amt = entry.amount && entry.amount > 0 ? `&amount=${entry.amount}` : '';
    const entId = (entry.id ?? entry.entryId) ? `&entry=${entry.id ?? entry.entryId}` : '';
    navigate(`/parent/wallet-posting?mode=${mode}${acct}${amt}${entId}`, returnState ? { state: returnState } : undefined);
    return;
  }

  // ‎قيد تسوية كلفة المخزون → صفحة معالجة تكاليف المواد (مصدره).
  if (entry.referenceType === 'CostSettlement') {
    navigate(COST_PROCESSING_PATH, returnState ? { state: returnState } : undefined);
    return;
  }

  // ‎كل الفواتير (مبيعات/شراء/مرتجعات) تُخزَّن بمصدر SalesInvoice وتُفتح في نفس الصفحة.
  const isInvoiceSource =
    entry.source === 'SalesInvoice' ||
    entry.source === 'PurchaseInvoice' ||
    entry.referenceType === 'SalesInvoice';
  if (isInvoiceSource && entry.referenceId) {
    navigate(
      `/invoices/${entry.referenceId}/edit`,
      returnState ? { state: returnState } : undefined,
    );
    return;
  }

  navigate(
    `/accounting/journal/${entryId}/edit`,
    returnState ? { state: returnState } : undefined,
  );
}
