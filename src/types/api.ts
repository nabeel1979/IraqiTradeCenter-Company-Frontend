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
    mustChangePassword?: boolean;
    avatarBase64?: string | null;
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
  mustChangePassword?: boolean;
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
  mustChangePassword?: boolean;
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
  email?: string | null;
  contactPhone?: string | null;
  mobile?: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  roles: string[];
  cashBoxCount: number;
  hasAvatar?: boolean;
  isSystemAdmin?: boolean;
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
  email?: string | null;
  contactPhone?: string | null;
  mobile?: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  roleIds: number[];
  overrides: UserPermissionOverrideDto[];
  cashBoxes: UserCashBoxAssignmentDto[];
  effectivePermissions: string[];
  isSuperAdmin: boolean;
  isSystemAdmin?: boolean;
  avatarBase64?: string | null;
}

export interface UserCreatePayload {
  fullName: string;
  phone: string;
  password: string;
  isActive?: boolean;
  roleIds?: number[];
  mustChangePassword?: boolean;
  avatarBase64?: string | null;
  email?: string | null;
  contactPhone?: string | null;
  mobile?: string | null;
}

export interface UserUpdatePayload {
  fullName?: string;
  phone?: string;
  password?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  avatarBase64?: string | null;
  email?: string | null;
  contactPhone?: string | null;
  mobile?: string | null;
}

export interface ResetPasswordResponseDto {
  temporaryPassword: string;
  mustChangePassword: boolean;
  credentialsUrl: string;
  credentialsUrlCopyUsername: string;
  credentialsUrlCopyPassword: string;
}

export interface MeDto {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  roles: string[];
  permissions: string[];
  cashBoxIds: number[];
  branchIds?: number[];
  defaultBranchId?: number | null;
  isSuperAdmin: boolean;
  avatarBase64?: string | null;
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
  accountId?: number | null;
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
  /** اسم نوع السند بالإنجليزية (إن وُجد) — للعرض في وضع اللغة الإنجليزية */
  voucherTypeNameEn?: string | null;
  /** تسلسل خاص بنوع السند (يبدأ من 1 لكل نوع) */
  voucherSequence?: number | null;
  /** رقم السند المُهيّأ للعرض: "{Code}-{Sequence}" مثل "PV-1" */
  voucherNumber?: string | null;
  /**
   * رقم يدوي اختياري يدخله المستخدم (شيك، إيصال خارجي، …).
   * مستقل عن رقم القيد الداخلي ورقم السند التلقائي، وقابل للبحث.
   */
  manualNumber?: string | null;
  /** سعر صرف يدوي محفوظ على القيد (null = استخدام سعر النشرة) */
  manualExchangeRate?: number | null;
  /** عملية السعر اليدوي: 1=ضرب، 2=قسمة */
  manualExchangeRateOperation?: number | null;
  /** مصدر القيد — يحدد إن كان مولّداً من نافذة أخرى */
  source?: JournalEntrySource;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  /** معرّف الفرع — null يعني غير محدد أو الفرع الرئيسي */
  branchId?: number | null;
  lines: JournalLineDto[];
}

export interface JournalLineDto {
  id: number;
  accountId: number;
  /** اسم الحساب الموحَّد (للتوافق العكسي — عادةً = NameAr أو "Code - NameAr") */
  accountName?: string;
  /** اسم الحساب بالعربية كما هو في القاعدة */
  accountNameAr?: string | null;
  /** اسم الحساب بالإنجليزية إن وُجد — للعرض في وضع اللغة الإنجليزية */
  accountNameEn?: string | null;
  isDebit: boolean;
  amount: number;
  description?: string;
}

// ── Sales / Store
export interface SalesInvoiceDto {
  id: number;
  invoiceNumber: string;
  manualNumber?: string | null;
  incomingOrderId?: number | null;
  platformOrderNumber?: string | null;
  invoiceDate: string;
  currency?: string;
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
  invoiceTypeId?: number | null;
  financialPartyId?: number | null;
  settlementType?: number;
  paymentMeansAccountId?: number | null;
  warehouseId?: number | null;
  toWarehouseId?: number | null;
  additionAmount?: number;
  discountPercentage?: number;
  taxRate?: number;
  notes?: string | null;
  journalEntryId?: number;
  expenseDistributionMethod?: number;
  lines: SalesInvoiceLineDto[];
  expenses?: SalesInvoiceExpenseDto[];
  linkedOrder?: SalesInvoiceLinkedOrderDto | null;
}

export interface SalesInvoiceLinkedOrderDto {
  id: number;
  platformOrderNumber: string;
  receivedAt: string;
  status: IncomingOrderDto['status'];
  storeUserFullName?: string | null;
  storeUserCode?: string | null;
  platformUserId?: string | null;
  storeUserCountry?: string | null;
  storeUserCity?: string | null;
  storeUserAddress?: string | null;
  storeUserDetailedAddress?: string | null;
}

export interface SalesInvoiceExpenseDto {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description?: string | null;
}

export interface SalesInvoiceLineDto {
  id: number;
  itemId: number;
  itemName: string;
  unitOfMeasureId?: number;
  unitName: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  isGift?: boolean;
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
  customerCode?: string;
  customerIsActive: boolean;
  customerPlatformTraderId?: string | null;
  customerStoreUserCode?: string | null;
  customerLinkedToFinancialParty?: boolean;
  financialPartyId?: number | null;
  financialPartyName?: string | null;
  financialAccountCode?: string | null;
  storeUserFullName?: string | null;
  storeUserPhone?: string | null;
  storeUserContactPhone?: string | null;
  storeUserEmail?: string | null;
  storeUserCountry?: string | null;
  storeUserCity?: string | null;
  storeUserAddress?: string | null;
  storeUserDetailedAddress?: string | null;
  status: 'Pending' | 'Received' | 'InProcessing' | 'InvoiceIssued' | 'Shipping' | 'Delivered' | 'Rejected';
  totalAmount: number;
  assignedSalesRepId?: number;
  createdInvoiceId?: number;
  notes?: string | null;
  items: IncomingOrderItemDto[];
}

export interface IncomingOrderItemDto {
  id: number;
  itemId: number;
  itemName: string;
  unitOfMeasureId: number;
  unitName?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// ── Accounting
export interface AccountDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
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
  /**
   * هل الحساب محجوز للإدارة المالية (مرتبط بنوع طرف مالي)؟ في هذه الحالة
   * تُحجب أيقونة "+" في شجرة الحسابات لأن إضافة الأطراف تتم حصراً من نافذة
   * الإدارة المالية.
   */
  isLockedForParties?: boolean;
  /**
   * هل الحساب مُدار بالكامل من الإدارة المالية (نوع طرف أو طرف فردي)؟
   * يُحجب التعديل والحذف من شجرة الحسابات.
   */
  isManagedByFinancialManagement?: boolean;
  /**
   * هل الحساب مُدار من نافذة المستودعات؟ يُنشأ تلقائياً عند إضافة مستودع.
   * يُحجب التعديل والحذف وإضافة الفروع من شجرة الحسابات.
   */
  isLockedForWarehouse?: boolean;
  /**
   * هل الحساب مُدار من نافذة المحافظ الرقمية؟ (الحساب الوسيط للمجموعة وحسابات
   * المحافظ الفردية) — يُحجب التعديل والحذف وإضافة الفروع من شجرة الحسابات.
   */
  isLockedForWallet?: boolean;
  /** مقفل للقيد اليدوي (أرباح/خسائر…) — لا يُستخدم في القيود/السندات اليدوية */
  isLockedForManualPosting?: boolean;
  /** مرتبط بإعدادات تسوية الحسابات */
  isLinkedToAccountSettlement?: boolean;
  /** أدوار الارتباط: Transit | FxGain | FxLoss | FxDiscount */
  accountSettlementRoles?: string[];
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

// ── Account Balances (أرصدة الحسابات)
export interface AccountBalanceRowDto {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountNature: string;
  level: number;
  isLeaf: boolean;
  parentId?: number | null;
  currency: string;
  debitBalance: number;
  creditBalance: number;
  valuatedDebit: number;
  valuatedCredit: number;
}

export interface AccountBalancesDto {
  fromDate: string;
  toDate: string;
  filterCurrency?: string | null;
  filterAccountId?: number | null;
  valuated: boolean;
  baseCurrency: string;
  fxBulletinName?: string | null;
  fxBulletinEffectiveAt?: string | null;
  fxUsedFallback: boolean;
  maxLevel?: number | null;
  leavesOnly: boolean;
  rows: AccountBalanceRowDto[];
  totalDebit: number;
  totalCredit: number;
  totalValuatedDebit: number;
  totalValuatedCredit: number;
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
  /** الرقم اليدوي الذي يدخله المستخدم */
  manualNumber?: string | null;
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
  /** الاسم الإنجليزي الاختياري — يُعرض في واجهة اللغة الإنجليزية. */
  nameEn?: string | null;
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
  fiscalYearNameEn?: string | null;
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
  rolloverTargetFiscalYearId?: number | null;
  rolloverTargetFiscalYearName?: string | null;
  rolloverTargetFiscalYearNameEn?: string | null;
  hasRolloverOpeningEntries?: boolean;
  rolloverOpeningEntriesCount?: number;
  rolloverUndoTargets?: RolloverUndoTargetDto[];
}

export interface RolloverUndoTargetDto {
  targetFiscalYearId: number;
  targetFiscalYearName: string;
  targetFiscalYearNameEn?: string | null;
  openingEntriesCount: number;
  sourceFiscalYearId?: number | null;
  sourceFiscalYearName?: string | null;
  sourceFiscalYearNameEn?: string | null;
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
  openingEntriesCreated?: number;
  rolledBulletinId?: number | null;
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

// -- Financial Management
export type FinancialPartyKind = 'Supplier' | 'Customer' | 'Bank' | 'CashBox' | 'PaymentCompany';

export interface FinancialPartyCategoryDto {
  id: number;
  kind: FinancialPartyKind;
  nameAr: string;
  nameEn?: string | null;
  mainAccountId: number;
  mainAccountCode: string;
  mainAccountNameAr: string;
  mainAccountNameEn?: string | null;
  isActive: boolean;
  displayOrder: number;
  partyCount: number;
}

/** سقف ائتمان لعملة واحدة: حدّ مدين وحدّ دائن. */
export interface CreditLimitDto {
  debit?: number | null;
  credit?: number | null;
}

export interface FinancialPartyDto {
  id: number;
  categoryId: number;
  categoryNameAr: string;
  categoryNameEn?: string | null;
  kind: FinancialPartyKind;
  /** الاسم يُقرأ من بطاقة الحساب المرتبط (مزامنة كاملة مع شجرة الحسابات). */
  nameAr: string;
  nameEn?: string | null;
  accountId: number;
  accountCode: string;
  /** سقوف الائتمان مفهرسة برمز العملة (مدين/دائن لكل عملة). */
  creditLimits: Record<string, CreditLimitDto>;
  allowedCurrencies: string[];
  /** IBAN لكل عملة — خاص بأطراف نوع المصرف. */
  currencyIbans?: Record<string, string>;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
  /** العنوان بالإنجليزي. */
  addressEn?: string | null;
  /** رقم الحساب المصرفي — خاص بأطراف نوع المصرف. */
  bankAccountNumber?: string | null;
  /** رمز السويفت (SWIFT/BIC) — خاص بأطراف نوع المصرف. */
  swiftCode?: string | null;
  isActive: boolean;
  /** نوع السعر الافتراضي — ItemPriceType (3=جملة، 4=مفرد، 5=خاص، 6=تصدير) */
  defaultSalesPriceType?: number | null;
  /** تفعيل نسبة خصم مبيعات افتراضية تُجلب في فاتورة المبيعات. */
  salesDiscountEnabled?: boolean;
  /** نسبة خصم المبيعات الافتراضية (%). */
  salesDiscountPercentage?: number;
  showInStore?: boolean;
  storeUserCode?: string | null;
  mustChangePassword?: boolean;
  createdAt: string;
}

export interface CreateFinancialPartyCategoryPayload {
  kind: number;
  nameAr: string;
  nameEn?: string | null;
  mainAccountId: number;
}

export interface UpdateFinancialPartyCategoryPayload {
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface CreateFinancialPartyPayload {
  categoryId: number;
  nameAr: string;
  nameEn?: string | null;
  creditLimits?: Record<string, CreditLimitDto> | null;
  allowedCurrencies?: string[] | null;
  currencyIbans?: Record<string, string> | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  addressEn?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
  bankAccountNumber?: string | null;
  swiftCode?: string | null;
  defaultSalesPriceType?: number | null;
  salesDiscountEnabled?: boolean;
  salesDiscountPercentage?: number;
  showInStore?: boolean;
  storeUserCode?: string | null;
  linkStoreCustomerId?: number | null;
}

export interface UpdateFinancialPartyPayload {
  nameAr: string;
  nameEn?: string | null;
  creditLimits?: Record<string, CreditLimitDto> | null;
  allowedCurrencies?: string[] | null;
  currencyIbans?: Record<string, string> | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  addressEn?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
  bankAccountNumber?: string | null;
  swiftCode?: string | null;
  isActive: boolean;
  defaultSalesPriceType?: number | null;
  salesDiscountEnabled?: boolean;
  salesDiscountPercentage?: number;
  showInStore?: boolean;
  storeUserCode?: string | null;
  linkStoreCustomerId?: number | null;
}
