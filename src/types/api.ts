// ════════════════════════════════════════
// API Types - matching backend DTOs
// ════════════════════════════════════════

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  /** رسالة معلوماتية إضافية يُرسلها الـ backend (مثل رسائل الفشل المباشرة في DomainException). */
  message?: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

// ── Authentication
export interface LoginRequest {
  phone: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    fullName: string;
    phone: string;
    role: string;
    roles?: string[];
    permissions?: string[];
    isSuperAdmin?: boolean;
  };
}

// ── Permissions & Roles
export interface PermissionNode {
  code: string;
  action: string;
  actionAr: string;
  nameAr: string;
}
export interface ResourceNode {
  resource: string;
  resourceAr: string;
  actions: PermissionNode[];
}
export interface ModuleNode {
  module: string;
  moduleAr: string;
  resources: ResourceNode[];
}

export interface RoleListItemDto {
  id: number;
  code: string;
  nameAr: string;
  description?: string | null;
  isSystemRole: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  permissionCount: number;
  userCount: number;
}

export interface RoleDetailDto {
  id: number;
  code: string;
  nameAr: string;
  description?: string | null;
  isSystemRole: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  permissions: string[];
}

export interface RoleUpsertPayload {
  code?: string;
  nameAr: string;
  description?: string | null;
  isActive?: boolean;
  permissions: string[];
}

export interface UserListItemDto {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  roles: string[];
  cashBoxCount: number;
}

export interface UserPermissionOverrideDto {
  permissionCode: string;
  isGranted: boolean;
}

export interface UserCashBoxAssignmentDto {
  cashBoxId: number;
  canReceive: boolean;
  canPay: boolean;
}

export interface UserDetailDto {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  roleIds: number[];
  overrides: UserPermissionOverrideDto[];
  cashBoxes: UserCashBoxAssignmentDto[];
  effectivePermissions: string[];
  isSuperAdmin: boolean;
}

export interface UserCreatePayload {
  fullName: string;
  phone: string;
  password: string;
  isActive?: boolean;
  roleIds?: number[];
}

export interface UserUpdatePayload {
  fullName?: string;
  phone?: string;
  password?: string;
  isActive?: boolean;
}

export interface MeDto {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
  cashBoxIds: number[];
  isSuperAdmin: boolean;
}

// ── Inventory
export interface ItemDto {
  id: number;
  code: string;
  barcode: string;
  nameAr: string;
  purchasePrice: number;
  baseSalesPrice: number;
  stockBaseQuantity: number;
  minimumStockLevel: number;
  isAvailableForSale: boolean;
  isLowStock: boolean;
}

export interface ItemSnapshot {
  id: number;
  code: string;
  nameAr: string;
  baseUnitId: number;
  baseUnitName: string;
  mediumUnitId?: number;
  mediumUnitName?: string;
  mediumUnitFactor?: number;
  largeUnitId?: number;
  largeUnitName?: string;
  largeUnitFactor?: number;
  baseSalesPrice: number;
  mediumSalesPrice?: number;
  largeSalesPrice?: number;
  availableStock: number;
  isAvailableForSale: boolean;
}

// ── Customers
export interface CustomerDto {
  id: number;
  code: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email?: string;
  address?: string;
  creditLimit: number;
  currentBalance: number;
  assignedSalesRepId?: number;
  isActive: boolean;
}

// ── Journal Entries
export type JournalEntrySource =
  | 'Manual'
  | 'SalesInvoice'
  | 'PurchaseInvoice'
  | 'Payment'
  | 'Receipt'
  | 'StockMovement'
  | 'CommissionPayment'
  | 'SalaryPayment'
  | 'System';

export interface JournalEntryDto {
  id: number;
  entryNumber: string;
  entryDate: string;
  status: 'Draft' | 'Posted' | 'Reversed';
  entryType?: 'Normal' | 'Opening';
  currency?: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  voucherTypeId?: number | null;
  voucherTypeCode?: string | null;
  voucherTypeName?: string | null;
  /** تسلسل خاص بنوع السند (يبدأ من 1 لكل نوع) */
  voucherSequence?: number | null;
  /** رقم السند المُهيّأ للعرض: "{Code}-{Sequence}" مثل "PV-1" */
  voucherNumber?: string | null;
  /** مصدر القيد — يحدد إن كان مولّداً من نافذة أخرى */
  source?: JournalEntrySource;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  lines: JournalLineDto[];
}

export interface JournalLineDto {
  id: number;
  accountId: number;
  accountName?: string;
  isDebit: boolean;
  amount: number;
  description?: string;
}

// ── Sales / Store
export interface SalesInvoiceDto {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: number;
  customerName?: string;
  salesRepId?: number;
  status: 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Cancelled';
  subTotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  journalEntryId?: number;
  lines: SalesInvoiceLineDto[];
}

export interface SalesInvoiceLineDto {
  id: number;
  itemId: number;
  itemName: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
}

export interface SalesRepDto {
  id: number;
  employeeCode: string;
  fullName: string;
  phone: string;
  commissionType: 'Fixed' | 'Tiered';
  fixedCommissionRate?: number;
  baseSalary: number;
  region?: string;
}

export interface SalesRepPerformanceDto {
  salesRepId: number;
  fullName: string;
  fromDate: string;
  toDate: string;
  totalSales: number;
  invoiceCount: number;
  calculatedCommission: number;
}

export interface CustomerStatementDto {
  customerId: number;
  customerName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  lines: CustomerStatementLineDto[];
}

export interface CustomerStatementLineDto {
  date: string;
  docType: string;
  docNumber: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface IncomingOrderDto {
  id: number;
  platformOrderId: string;
  platformOrderNumber: string;
  receivedAt: string;
  customerId: number;
  customerName?: string;
  status: 'Pending' | 'Reviewed' | 'Confirmed' | 'Rejected';
  totalAmount: number;
  assignedSalesRepId?: number;
  createdInvoiceId?: number;
  items: IncomingOrderItemDto[];
}

export interface IncomingOrderItemDto {
  id: number;
  itemId: number;
  itemName: string;
  unitOfMeasureId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// ── Accounting
export interface AccountDto {
  id: number;
  code: string;
  nameAr: string;
  type: number;
  nature: number;
  parentId?: number;
  level: number;
  isLeaf: boolean;
  openingBalance: number;
  /**
   * هل الحساب مفعَّل؟ يُرجَع فقط حين يُطلب الـ tree بـ `includeInactive=true`
   * (شاشة شجرة الحسابات). في باقي المواضع (شاشات الاختيار) يكون دائماً true
   * لأن الـ backend يستبعد المعطَّلة بشكل افتراضي.
   */
  isActive: boolean;
  /**
   * هل الحساب مرتبط فعلاً بقيد محاسبي / صندوق / نوع سند (كحساب افتراضي)
   * أو لديه رصيد افتتاحي؟ عندما يكون true تحجب الواجهة أزرار إضافة الفروع
   * والحذف لأن العملية ستفشل على الخادم على أي حال.
   */
  isUsed: boolean;
  children: AccountDto[];
}

/**
 * مدخل في سلة مهملات شجرة الحسابات — تمثيل مسطّح مع سياق الأب.
 * يأتي من `GET /accounts/trash`.
 */
export interface TrashedAccountDto {
  id: number;
  code: string;
  nameAr: string;
  type: number;
  nature: number;
  level: number;
  isLeaf: boolean;
  parentId?: number | null;
  parentCode?: string | null;
  parentNameAr?: string | null;
  /** هل الأب نفسه ما زال محذوفاً؟ في هذه الحالة لا يمكن الاستعادة قبل استعادته. */
  parentIsDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface TrialBalanceRowDto {
  accountId: number;
  accountCode: string;
  accountName: string;
  /** Asset | Liability | Equity | Revenue | Expense */
  accountType: string;
  /** Debit | Credit */
  accountNature: string;
  level: number;
  isLeaf: boolean;
  parentId?: number | null;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceDto {
  fromDate: string;
  toDate: string;
  currency?: string | null;
  valuated: boolean;
  baseCurrency: string;
  fxBulletinName?: string | null;
  fxBulletinEffectiveAt?: string | null;
  fxUsedFallback: boolean;
  maxLevel?: number | null;
  leavesOnly: boolean;
  rows: TrialBalanceRowDto[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
}

// ── Account Statement (كشف الحساب)
export interface AccountStatementRowDto {
  date: string;
  entryNumber: string;
  entryId: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  description?: string;
  lineDescription?: string;
  debit: number;
  credit: number;
  balance: number;
  balanceValuated: number;
  currency: string;
  /** نوع القيد كنص: Normal | Opening */
  entryType?: string;
  /** مصدر القيد: Manual | SalesInvoice | Payment | Receipt | StockMovement | ... */
  source?: string;
  /** نوع المرجع لأصل القيد (إن وُجد) */
  referenceType?: string | null;
  /** مُعرّف المرجع لأصل القيد (إن وُجد) */
  referenceId?: number | null;
  /** رقم/كود المرجع لأصل القيد (إن وُجد) */
  referenceNumber?: string | null;
  /** رقم السند المُهيّأ للعرض ("PV-1") */
  voucherNumber?: string | null;
  /** رمز نوع السند ("PV", "RV", "JV") */
  voucherTypeCode?: string | null;
  /** التسلسل ضمن نوع السند */
  voucherSequence?: number | null;
}

export interface AccountStatementDto {
  fromDate: string;
  toDate: string;
  accountId?: number;
  accountCode?: string;
  accountName?: string;
  currency: string;
  baseCurrency: string;
  fxUsedFallback: boolean;
  /** اسم النشرة المنشورة المستخدمة في تقويم العملات (إن وُجدت) */
  fxBulletinName?: string | null;
  /** تاريخ سريان النشرة المستخدمة (ISO) */
  fxBulletinEffectiveAt?: string | null;
  isAllAccounts: boolean;
  openingBalance: number;
  openingBalanceValuated: number;
  /** الرصيد الافتتاحي مفصَّلاً لكل عملة (Code → صافي بالعملة المحلية) */
  openingByCurrency?: Record<string, number>;
  /** مُضاعِفات التحويل لكل عملة من عملة السطر إلى العملة الأساسية */
  currencyMultipliers?: Record<string, number>;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  totalDebitValuated: number;
  totalCreditValuated: number;
  closingBalanceValuated: number;
  /** تفاصيل قيود الافتتاح (EntryType=Opening) المؤثرة في الرصيد الافتتاحي */
  openingEntries?: OpeningEntryRowDto[];
  rows: AccountStatementRowDto[];
}

export interface OpeningEntryRowDto {
  entryId: number;
  entryNumber: string;
  entryDate: string;
  currency: string;
  description?: string | null;
  debit: number;
  credit: number;
  /** صافي السطر (مدين − دائن) بعملة القيد */
  net: number;
  /** صافي السطر بالعملة الأساسية بعد التقويم */
  netValuated: number;
}

// ── Fiscal Years / Accounting Periods
export type AccountingPeriodStatus = 1 | 2 | 3; // 1=Open, 2=Closed, 3=Locked

export interface AccountingPeriodDto {
  id: number;
  fiscalYearId: number;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  statusText: string;
}

export interface FiscalYearDto {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
  /** السنة المالية المفعَّلة (النشطة) — التقارير تعتمد عليها افتراضياً. */
  isActive?: boolean;
  periods: AccountingPeriodDto[];
}

export interface FiscalYearStatusDto {
  fiscalYearId: number;
  fiscalYearName: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
  totalPeriods: number;
  openPeriods: number;
  closedPeriods: number;
  lockedPeriods: number;
  draftEntries: number;
  postedEntries: number;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export interface FiscalYearValidationDto {
  canClose: boolean;
  issues: string[];
  draftEntries: number;
  isBalanced: boolean;
  difference: number;
  draftEntriesList?: DraftJournalEntryRefDto[];
}

export interface DraftJournalEntryRefDto {
  id: number;
  entryNumber: string;
  entryDate: string;
  description: string;
  voucherTypeCode?: string | null;
  voucherSequence?: number | null;
}

export interface FiscalYearCloseResultDto {
  success: boolean;
  fiscalYearId: number;
  closedAt: string;
  lockedPeriods: number;
  message: string;
}

export interface FiscalYearRolloverResultDto {
  success: boolean;
  fromFiscalYearId: number;
  toFiscalYearId: number;
  balanceSheetAccountsRolled: number;
  retainedEarningsTransferred: number;
  message: string;
}

// ── Currency Rate Bulletins (نشرات أسعار العملات)
export type CurrencyRateBulletinStatus = 1 | 2 | 3; // 1=Draft, 2=Published, 3=Archived
export type CurrencyRateOperation = 1 | 2; // 1=Multiply, 2=Divide

export interface CurrencyRateLineDto {
  id: number;
  currency: string;
  rate: number;
  operation: CurrencyRateOperation;
  operationText: string; // "Multiply" أو "Divide"
  notes?: string | null;
}

export interface CurrencyRateBulletinDto {
  id: number;
  name: string;
  baseCurrency: string;
  effectiveAt: string;
  status: CurrencyRateBulletinStatus;
  statusText: string; // "Draft" | "Published" | "Archived"
  publishedAt?: string | null;
  publishedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy?: string | null;
  updatedAt?: string | null;
  isDefault: boolean;
  lines: CurrencyRateLineDto[];
}

export interface CurrencyRateLinePayload {
  currency: string;
  rate: number;
  operation: CurrencyRateOperation;
  notes?: string | null;
}
