import { api } from './client';
import type { ApiResponse, AccountBalancesDto, AccountDto, AccountStatementDto, JournalEntryDto, PagedResult, TrashedAccountDto, TrialBalanceDto } from '@/types/api';

export interface AccountStatementParams {
  from: string;          // YYYY-MM-DD
  to: string;            // YYYY-MM-DD
  accountId?: number;    // null = all accounts
  currency?: string;     // null = all currencies
  includeDraft?: boolean;
  includeOpeningEntries?: boolean;
  branchId?: number | null;
}

export type JournalEntryType = 1 | 2; // 1=Normal, 2=Opening

export interface JournalLinePayload {
  accountId: number;
  isDebit: boolean;
  amount: number;
  description?: string | null;
}

export interface PostJournalEntryPayload {
  entryDate: string;
  description: string;
  entryType?: JournalEntryType;
  currency?: string;
  postImmediately?: boolean;
  voucherTypeId?: number | null;
  branchId?: number | null;
  /** رقم يدوي اختياري — شيك، إيصال خارجي، … (قابل للبحث) */
  manualNumber?: string | null;
  /** سعر صرف يدوي اختياري (حين لا توجد نشرة تُسعّر العملة بتاريخ القيد) */
  manualExchangeRate?: number | null;
  /** عملية السعر اليدوي: 1=ضرب (افتراضي)، 2=قسمة */
  manualExchangeRateOperation?: number | null;
  lines: JournalLinePayload[];
}

export interface UpdateJournalEntryPayload {
  entryDate: string;
  description: string;
  entryType: JournalEntryType;
  currency: string;
  postImmediately?: boolean;
  voucherTypeId?: number | null;
  branchId?: number | null;
  /** رقم يدوي اختياري — شيك، إيصال خارجي، … */
  manualNumber?: string | null;
  /** سعر صرف يدوي اختياري (حين لا توجد نشرة تُسعّر العملة بتاريخ القيد) */
  manualExchangeRate?: number | null;
  /** عملية السعر اليدوي: 1=ضرب (افتراضي)، 2=قسمة */
  manualExchangeRateOperation?: number | null;
  lines: JournalLinePayload[];
}

/** تحديث سند مخصّص (سند قبض/دفع/…) — لا يحتاج entryType أو voucherTypeId (ثابتان) */
export interface UpdateVoucherEntryPayload {
  entryDate: string;
  description: string;
  currency: string;
  postImmediately?: boolean;
  branchId?: number | null;
  /** رقم يدوي اختياري للسند */
  manualNumber?: string | null;
  /** سعر صرف يدوي اختياري (حين لا توجد نشرة تُسعّر العملة بتاريخ السند) */
  manualExchangeRate?: number | null;
  /** عملية السعر اليدوي: 1=ضرب (افتراضي)، 2=قسمة */
  manualExchangeRateOperation?: number | null;
  lines: JournalLinePayload[];
}

export interface JournalEntriesListParams {
  pageNumber?: number; pageSize?: number; status?: string; search?: string;
  fromDate?: string; toDate?: string; voucherTypeId?: number;
  branchId?: number;
  /** عند true: استبعد القيود التي نوع سندها مفعَّل في القائمة الجانبية */
  excludeSidebarVoucherTypes?: boolean;
}

export interface PostDraftJournalEntriesParams {
  search?: string;
  fromDate?: string;
  toDate?: string;
  voucherTypeId?: number;
  excludeSidebarVoucherTypes?: boolean;
}

export interface PostDraftJournalEntryIssueDto {
  entryId: number;
  entryNumber: string;
  voucherNumber?: string | null;
  reason: string;
  kind: 'Skipped' | 'Failed';
}

export interface PostDraftJournalEntriesResultDto {
  postedCount: number;
  skippedCount: number;
  failedCount: number;
  issues: PostDraftJournalEntryIssueDto[];
}

export interface CreateAccountPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  type: number;     // 1=Asset, 2=Liability, 3=Equity, 4=Revenue, 5=Expense
  nature?: number | null; // 1=Debit, 2=Credit (auto if null)
  parentId?: number | null;
  isLeaf: boolean;
  description?: string | null;
  isLockedForManualPosting?: boolean;
}

export interface UpdateAccountPayload {
  nameAr: string;
  nameEn?: string | null;
  type: number;
  nature: number;
  description?: string | null;
  isActive: boolean;
  isLockedForManualPosting?: boolean;
}

export const accountingApi = {
  /**
   * شجرة الحسابات المفعَّلة فقط — للاستخدام في شاشات الاختيار
   * (قيود، صناديق، سندات…). نُبقي على التوقيع بدون باراميتر كي يبقى متوافقاً
   * مع تمرير الدالة مباشرة كـ queryFn في TanStack Query.
   */
  getTree: async () => {
    const res = await api.get<ApiResponse<AccountDto[]>>('/accounts/tree');
    return res.data.data ?? [];
  },
  /**
   * شجرة الحسابات الكاملة (مفعَّلة + معطَّلة) — مخصّصة لشاشة إدارة شجرة
   * الحسابات حصراً. الـ DTO يحمل `isActive` لتمييز المعطَّل بصرياً وكي يعمل
   * اقتراح الكود التالي بشكل صحيح حتى عند وجود كودات محجوزة بحسابات معطَّلة.
   */
  getFullTree: async () => {
    const res = await api.get<ApiResponse<AccountDto[]>>('/accounts/tree', {
      params: { includeInactive: 'true' },
    });
    return res.data.data ?? [];
  },
  /** صناديق + حسابات وسيط تسوية — لا تظهر في القيود اليومية */
  getJournalRestrictedAccountIds: async (): Promise<number[]> => {
    const res = await api.get<ApiResponse<number[]>>('/accounts/journal-restricted-ids');
    return res.data.data ?? [];
  },
  createAccount: async (data: CreateAccountPayload) => {
    const res = await api.post<ApiResponse<number>>('/accounts', data);
    return res.data;
  },
  updateAccount: async (id: number, data: UpdateAccountPayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/accounts/${id}`, { id, ...data });
    return res.data;
  },
  /**
   * حذف ناعم — ينقل الحساب إلى سلة المهملات (يبقى الكود محجوزاً).
   * للحذف النهائي استخدم {@link permanentlyDeleteAccount} بعد التأكد.
   */
  deleteAccount: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/${id}`);
    return res.data;
  },
  /** قائمة الحسابات في سلة المهملات (محذوفة ناعماً). */
  getAccountsTrash: async () => {
    const res = await api.get<ApiResponse<TrashedAccountDto[]>>('/accounts/trash');
    return res.data.data ?? [];
  },
  /** استعادة حساب من سلة المهملات (يعكس الحذف الناعم). */
  restoreAccount: async (id: number) => {
    const res = await api.post<ApiResponse<unknown>>(`/accounts/${id}/restore`);
    return res.data;
  },
  /** حذف نهائي للحساب من DB — مسموح فقط للموجودين في السلة. لا تراجع عن هذا. */
  permanentlyDeleteAccount: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/${id}/permanent`);
    return res.data;
  },
  getAccountBalances: async (params: {
    from: string;
    to: string;
    accountId?: number | null;
    currency?: string | null;
    valuated?: boolean;
    maxLevel?: number | null;
    leavesOnly?: boolean;
    includeDraft?: boolean;
    includeOpeningEntries?: boolean;
    branchId?: number | null;
  }) => {
    const res = await api.get<ApiResponse<AccountBalancesDto>>('/accounts/balances', {
      params: {
        from: params.from,
        to: params.to,
        accountId: params.accountId ?? undefined,
        currency: params.currency || undefined,
        valuated: params.valuated ?? false,
        maxLevel: params.maxLevel ?? undefined,
        leavesOnly: params.leavesOnly ?? true,
        includeDraft: params.includeDraft ?? false,
        includeOpeningEntries: params.includeOpeningEntries ?? true,
        branchId: params.branchId ?? undefined,
      },
    });
    return res.data.data!;
  },
  getTrialBalance: async (params: {
    from: string;
    to: string;
    currency?: string | null;
    valuated?: boolean;
    maxLevel?: number | null;
    leavesOnly?: boolean;
    includeDraft?: boolean;
    includeOpeningEntries?: boolean;
    branchId?: number | null;
  }) => {
    const res = await api.get<ApiResponse<TrialBalanceDto>>('/accounts/trial-balance', {
      params: {
        from: params.from,
        to: params.to,
        currency: params.currency || undefined,
        valuated: params.valuated ?? false,
        maxLevel: params.maxLevel ?? undefined,
        leavesOnly: params.leavesOnly ?? true,
        includeDraft: params.includeDraft ?? false,
        includeOpeningEntries: params.includeOpeningEntries ?? true,
        branchId: params.branchId ?? undefined,
      },
    });
    return res.data.data!;
  },
  getAccountStatement: async (params: AccountStatementParams) => {
    const res = await api.get<ApiResponse<AccountStatementDto>>('/accounts/statement', {
      params: {
        ...params,
        includeOpeningEntries: params.includeOpeningEntries ?? true,
      },
    });
    return res.data.data!;
  },
  getJournalEntries: async (params: JournalEntriesListParams = {}) => {
    const res = await api.get<ApiResponse<PagedResult<JournalEntryDto>>>('/accounts/journal-entries', { params });
    return res.data.data!;
  },
  postDraftJournalEntries: async (params: PostDraftJournalEntriesParams = {}) => {
    const res = await api.post<ApiResponse<PostDraftJournalEntriesResultDto>>(
      '/accounts/journal-entries/post-drafts',
      null,
      {
        params: {
          search: params.search || undefined,
          fromDate: params.fromDate || undefined,
          toDate: params.toDate || undefined,
          voucherTypeId: params.voucherTypeId,
          excludeSidebarVoucherTypes: params.excludeSidebarVoucherTypes ?? false,
        },
        skipGlobalErrorHandler: true,
      },
    );
    return res.data.data!;
  },
  postJournalEntry: async (data: PostJournalEntryPayload) => {
    const res = await api.post<ApiResponse<number>>('/accounts/journal-entries', data);
    return res.data;
  },
  getJournalEntryById: async (id: number) => {
    const res = await api.get<ApiResponse<JournalEntryDto>>(`/accounts/journal-entries/${id}`);
    return res.data.data!;
  },
  updateJournalEntry: async (id: number, data: UpdateJournalEntryPayload) => {
    const res = await api.put<ApiResponse<number>>(`/accounts/journal-entries/${id}`, { id, ...data });
    return res.data;
  },
  deleteJournalEntry: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/journal-entries/${id}`);
    return res.data;
  },
  // ── سندات (تعديل/حذف القيود المولّدة من سندات مخصّصة)
  updateVoucherEntry: async (id: number, data: UpdateVoucherEntryPayload) => {
    const res = await api.put<ApiResponse<number>>(`/accounts/vouchers/${id}`, { id, ...data });
    return res.data;
  },
  deleteVoucherEntry: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/vouchers/${id}`);
    return res.data;
  },
};

export {
  CASH_BOX_BALANCES_PATH,
  CASH_BOX_TRANSFERS_PATH,
  getReversalOriginalEntryId,
  isDirectTransferReference,
  isTransferRelatedJournalEntry,
  navigateJournalEntrySource,
} from '@/lib/accounting/journalEntrySource';
