import type { FinancialPartyKind } from '@/types/api';

export const FM_BASE = '/financial-management';

export const FM_PATHS: Record<FinancialPartyKind, string> = {
  Supplier: `${FM_BASE}/suppliers`,
  Customer: `${FM_BASE}/customers`,
  Bank: `${FM_BASE}/banks`,
  CashBox: `${FM_BASE}/cash-boxes`,
  PaymentCompany: `${FM_BASE}/payment-companies`,
};

export const KIND_ORDER: FinancialPartyKind[] = [
  'Supplier',
  'Customer',
  'Bank',
  'CashBox',
  'PaymentCompany',
];

export type CashBoxView = 'parties' | 'balances' | 'transfers';

export function getFinancialManagementPath(
  kind: FinancialPartyKind,
  view?: CashBoxView,
): string {
  const base = FM_PATHS[kind];
  if (kind === 'CashBox' && view && view !== 'parties') {
    return `${base}?view=${view}`;
  }
  return base;
}

export function parseCashBoxView(search: string): CashBoxView {
  const v = new URLSearchParams(search).get('view');
  if (v === 'balances' || v === 'transfers') return v;
  return 'parties';
}
