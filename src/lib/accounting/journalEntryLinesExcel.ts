import * as XLSX from 'xlsx';
import type { AccountDto } from '@/types/api';
import { localizedAccountName, type AppLocale } from '@/lib/i18n';

/** رؤوس أعمدة التصدير/الاستيراد (عربي). */
export const JOURNAL_LINES_EXCEL_COL = {
  debit: 'مدين',
  credit: 'دائن',
  accountCode: 'رمز الحساب',
  accountName: 'الحساب',
  description: 'البيان',
} as const;

export interface JournalLineImportRow {
  uid: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  isDebit: boolean;
  amount: number;
  description: string;
}

export interface JournalLinesImportResult {
  lines: JournalLineImportRow[];
  imported: number;
  skippedZero: number;
  unknownAccounts: string[];
  ambiguousRows: number;
}

function parseAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s || s === '-') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pickCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function buildAccountLookup(accounts: AccountDto[]) {
  const byCode = new Map<string, AccountDto>();
  const byNameAr = new Map<string, AccountDto>();
  const byNameEn = new Map<string, AccountDto>();
  for (const a of accounts) {
    byCode.set(a.code.trim().toLowerCase(), a);
    byNameAr.set(a.nameAr.trim().toLowerCase(), a);
    if (a.nameEn?.trim()) byNameEn.set(a.nameEn.trim().toLowerCase(), a);
  }
  return { byCode, byNameAr, byNameEn };
}

function resolveAccount(
  code: string,
  name: string,
  lookup: ReturnType<typeof buildAccountLookup>,
): AccountDto | null {
  const c = code.trim().toLowerCase();
  if (c && lookup.byCode.has(c)) return lookup.byCode.get(c)!;
  const n = name.trim().toLowerCase();
  if (n && lookup.byNameAr.has(n)) return lookup.byNameAr.get(n)!;
  if (n && lookup.byNameEn.has(n)) return lookup.byNameEn.get(n)!;
  return null;
}

/** تصدير قالب Excel: كل الحسابات الورقة مع أعمدة المبالغ والبيان فارغة. */
export function exportJournalLinesTemplate(
  accounts: AccountDto[],
  locale: AppLocale,
  fileLabel = 'journal-lines-template',
): void {
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const rows = sorted.map(a => ({
    [JOURNAL_LINES_EXCEL_COL.debit]: '',
    [JOURNAL_LINES_EXCEL_COL.credit]: '',
    [JOURNAL_LINES_EXCEL_COL.accountCode]: a.code,
    [JOURNAL_LINES_EXCEL_COL.accountName]: localizedAccountName(locale, a.nameAr, a.nameEn),
    [JOURNAL_LINES_EXCEL_COL.description]: '',
  }));
  const sheetData = rows.length > 0
    ? rows
    : [Object.fromEntries(Object.values(JOURNAL_LINES_EXCEL_COL).map(k => [k, '']))];
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 36 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'بنود القيد');
  XLSX.writeFile(wb, `${fileLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** استيراد بنود القيد من Excel. */
export async function importJournalLinesFromExcel(
  file: File,
  accounts: AccountDto[],
): Promise<JournalLinesImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const lookup = buildAccountLookup(accounts);

  const lines: JournalLineImportRow[] = [];
  let skippedZero = 0;
  let ambiguousRows = 0;
  const unknownAccounts: string[] = [];

  for (const row of rows) {
    const debit = parseAmount(row[JOURNAL_LINES_EXCEL_COL.debit] ?? row['Debit'] ?? row['debit']);
    const credit = parseAmount(row[JOURNAL_LINES_EXCEL_COL.credit] ?? row['Credit'] ?? row['credit']);
    const code = pickCell(row, JOURNAL_LINES_EXCEL_COL.accountCode, 'AccountCode', 'code', 'Code');
    const name = pickCell(row, JOURNAL_LINES_EXCEL_COL.accountName, 'AccountName', 'name', 'Name');
    const description = pickCell(row, JOURNAL_LINES_EXCEL_COL.description, 'Description', 'desc');

    if (debit <= 0 && credit <= 0) {
      skippedZero++;
      continue;
    }

    const account = resolveAccount(code, name, lookup);
    if (!account) {
      unknownAccounts.push(code || name || `#${lines.length + 1}`);
      continue;
    }

    const label = `${account.code} - ${account.nameAr}`;

    if (debit > 0 && credit > 0) {
      ambiguousRows++;
      lines.push({
        uid: Math.random().toString(36).slice(2, 10),
        accountId: account.id,
        accountCode: account.code,
        accountName: label,
        isDebit: true,
        amount: debit,
        description,
      });
      lines.push({
        uid: Math.random().toString(36).slice(2, 10),
        accountId: account.id,
        accountCode: account.code,
        accountName: label,
        isDebit: false,
        amount: credit,
        description,
      });
      continue;
    }

    const isDebit = debit > 0;
    lines.push({
      uid: Math.random().toString(36).slice(2, 10),
      accountId: account.id,
      accountCode: account.code,
      accountName: label,
      isDebit,
      amount: isDebit ? debit : credit,
      description,
    });
  }

  return {
    lines,
    imported: lines.length,
    skippedZero,
    unknownAccounts,
    ambiguousRows,
  };
}
