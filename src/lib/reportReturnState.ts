/** TTL مشترك لحالات الرجوع بين التقارير (sessionStorage). */
export const REPORT_NAV_TTL_MS = 30 * 60 * 1000;

export const ReportNavKeys = {
  statementReturn: 'account-statement:return-state',
  statementSource: 'account-statement:source-state',
  accountBalancesRestore: 'account-balances:restore-state',
  trialBalanceRestore: 'trial-balance:restore-state',
  journalEntrySource: 'journal-entry:source-state',
  journalEntriesRestore: 'journal-entries:restore-state',
} as const;

export interface StatementSourceState {
  sourcePath: '/accounting/account-balances' | '/accounting/trial-balance';
  sourceLabelKey: 'sidebar.items.accountBalances' | 'sidebar.items.trialBalance';
  restoreKey: typeof ReportNavKeys.accountBalancesRestore | typeof ReportNavKeys.trialBalanceRestore;
  restore: Record<string, unknown>;
  highlightAccountId: number;
  highlightCurrency?: string;
  ts?: number;
}

export function readSessionJson<T extends { ts?: number }>(
  key: string,
  remove = true,
  ttl = REPORT_NAV_TTL_MS,
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    if (remove) sessionStorage.removeItem(key);
    const data = JSON.parse(raw) as T;
    if (ttl > 0 && Date.now() - (data.ts ?? 0) > ttl) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSessionJson(key: string, data: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    // تجاهل — sessionStorage قد يكون معطّلاً
  }
}

export const ACCOUNT_STATEMENT_PATH = '/accounting/account-statement';

export function saveStatementSource(state: Omit<StatementSourceState, 'ts'>): void {
  writeSessionJson(ReportNavKeys.statementSource, state as Record<string, unknown>);
}

export interface JournalEntrySourceState {
  returnTo: string;
  returnLabel: string;
  restore: Record<string, unknown>;
  highlightEntryId: number;
  ts?: number;
}

export function saveJournalEntrySourceState(state: Omit<JournalEntrySourceState, 'ts'>): void {
  writeSessionJson(ReportNavKeys.journalEntrySource, state as Record<string, unknown>);
}

/** رجوع من «أصل القيد» إلى قائمة القيود مع استعادة الفلاتر والسطر. */
export function navigateBackToJournalList(
  navigate: (path: string) => void,
  fallbackHref: string,
): void {
  try {
    const src = readSessionJson<JournalEntrySourceState>(ReportNavKeys.journalEntrySource, false);
    if (src?.returnTo) {
      writeSessionJson(ReportNavKeys.journalEntriesRestore, {
        ...src.restore,
        highlightEntryId: src.highlightEntryId,
      });
      sessionStorage.removeItem(ReportNavKeys.journalEntrySource);
      navigate(src.returnTo);
      return;
    }
  } catch {
    // تجاهل
  }
  navigate(fallbackHref);
}

/** رجوع من «أصل القيد» — كشف حساب أو قائمة قيود. */
export function navigateBackFromEntrySource(
  navigate: (path: string) => void,
  fallbackHref: string,
  returnTo?: string,
): void {
  if (returnTo === ACCOUNT_STATEMENT_PATH) {
    try {
      const src = readSessionJson<JournalEntrySourceState>(ReportNavKeys.journalEntrySource, false);
      if (src?.returnTo === ACCOUNT_STATEMENT_PATH) {
        writeSessionJson(ReportNavKeys.statementReturn, {
          ...src.restore,
          autoSubmit: true,
          focusEntryId: src.highlightEntryId,
        });
        sessionStorage.removeItem(ReportNavKeys.journalEntrySource);
      }
    } catch {
      // تجاهل
    }
    navigate(ACCOUNT_STATEMENT_PATH);
    return;
  }
  navigateBackToJournalList(navigate, fallbackHref);
}
