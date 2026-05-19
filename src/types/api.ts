// ════════════════════════════════════════
// API Types - matching backend DTOs
// ════════════════════════════════════════

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  errors?: string[];
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
  };
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
  children: AccountDto[];
}

export interface TrialBalanceRowDto {
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
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
  rows: AccountStatementRowDto[];
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
