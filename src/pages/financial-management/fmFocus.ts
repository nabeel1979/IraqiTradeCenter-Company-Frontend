import type {
  FinancialPartyCategoryDto,
  FinancialPartyDto,
  FinancialPartyKind,
} from '@/types/api';
import { getFinancialManagementPath } from '@/pages/financial-management/routes';

export const FM_FOCUS_KEY = 'fm:focus';

export type FmFocusTarget = 'party' | 'category';

export type PartyPrefillTab = 'basic' | 'contact' | 'pricing' | 'store';

export interface PartyPrefillPayload {
  nameAr?: string;
  nameEn?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  showInStore?: boolean;
  storeUserCode?: string;
  initialTab?: PartyPrefillTab;
  linkStoreCustomerId?: number;
}

export interface FmFocusPayload {
  accountId?: number | null;
  mode?: 'edit' | 'add';
  kind?: FinancialPartyKind;
  categoryId?: number;
  partyId?: number;
  focusTarget?: FmFocusTarget;
  prefill?: PartyPrefillPayload;
}

export interface ResolvedFmAccountTarget {
  kind: FinancialPartyKind;
  focusTarget: FmFocusTarget;
  categoryId: number;
  partyId?: number;
}

export async function resolveFmTargetForAccount(
  accountId: number,
  fetchParties: () => Promise<FinancialPartyDto[]>,
  fetchCategories: () => Promise<FinancialPartyCategoryDto[]>,
): Promise<ResolvedFmAccountTarget | null> {
  const parties = await fetchParties();
  const party = parties.find(p => p.accountId === accountId);
  if (party) {
    return {
      kind: party.kind,
      focusTarget: 'party',
      categoryId: party.categoryId,
      partyId: party.id,
    };
  }

  const categories = await fetchCategories();
  const category = categories.find(c => c.mainAccountId === accountId);
  if (category) {
    return {
      kind: category.kind,
      focusTarget: 'category',
      categoryId: category.id,
    };
  }

  return null;
}

export function navigateToFinancialManagementAccount(
  navigate: (path: string, options?: { replace?: boolean }) => void,
  accountId: number,
  target: ResolvedFmAccountTarget,
  mode: 'edit' | 'add' = 'edit',
): void {
  writeFmFocus({
    accountId,
    mode,
    kind: target.kind,
    categoryId: target.categoryId,
    partyId: target.partyId,
    focusTarget: target.focusTarget,
  });
  navigate(getFinancialManagementPath(target.kind));
}

export function writeFmFocus(payload: FmFocusPayload): void {
  try {
    sessionStorage.setItem(FM_FOCUS_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
  } catch { /* تجاهُل */ }
}

export function readFmFocus(): FmFocusPayload | null {
  try {
    const raw = sessionStorage.getItem(FM_FOCUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FmFocusPayload;
  } catch {
    return null;
  }
}

export function clearFmFocus(): void {
  try {
    sessionStorage.removeItem(FM_FOCUS_KEY);
  } catch { /* تجاهُل */ }
}

export type PendingFmFocus = {
  accountId: number | null;
  mode: 'edit' | 'add';
  kind?: FinancialPartyKind;
  categoryId?: number;
  partyId?: number;
  focusTarget?: FmFocusTarget;
  prefill?: PartyPrefillPayload;
};

export function parsePendingFmFocus(raw: FmFocusPayload | null): PendingFmFocus | null {
  if (!raw) return null;
  return {
    accountId: raw.accountId ?? null,
    mode: raw.mode === 'add' ? 'add' : 'edit',
    kind: raw.kind,
    categoryId: raw.categoryId,
    partyId: raw.partyId,
    focusTarget: raw.focusTarget,
    prefill: raw.prefill,
  };
}
