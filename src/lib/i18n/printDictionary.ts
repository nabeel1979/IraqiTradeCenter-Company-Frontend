/**
 * ──────────────────────────────────────────────────────────────────────────
 * قاموس ترجمة الطباعة (HTML strings)
 * ──────────────────────────────────────────────────────────────────────────
 * كل وحدات الطباعة في `src/lib/printUtils.ts` تنتج HTML خام يُحقن في iframe
 * أو نافذة طباعة. لذلك لا يمكنها استخدام `useTranslation()` (لا React context
 * داخل srcdoc). بدلاً من ذلك نوفّر هنا قاموساً ثنائي اللغة + دالة بسيطة
 * `getPrintI18n(locale)` ترجع كل النصوص الجاهزة كـ object.
 *
 * اللغة تُختار تلقائياً من `document.documentElement.lang` ('ar' أو 'en')،
 * مع إمكانية التجاوز اليدوي عبر معامل `locale` في كل دالة طباعة.
 *
 * عند إضافة نص جديد للطباعة:
 *   1. أضِف المفتاح هنا في كلا ar و en.
 *   2. استخدمه عبر `i18n.<key>` بدل النص الثابت.
 *   3. لا تترجم القيم الديناميكية (أسماء الحسابات/الصناديق): تلك يجب أن
 *      تُرسل من المُستدعي بالاسم المحلَّى بالفعل (نسخة AR + EN).
 */

export type PrintLocale = 'ar' | 'en';

/** يُحدّد لغة الطباعة الحالية من سمة lang على عنصر <html>. */
export function getPrintLocale(): PrintLocale {
  if (typeof document === 'undefined') return 'ar';
  const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'ar';
}

/** اتجاه الكتابة المقابل للغة. */
export function getPrintDir(locale: PrintLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** نسق التاريخ والوقت المعروض في رأس الطباعة — دائماً بتوقيت بغداد. */
export function formatPrintedAt(locale: PrintLocale): string {
  const d = new Date();
  if (locale === 'en') {
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Baghdad',
    });
  }
  // ‎عربي: نُبقي تنسيق ar-IQ مع أرقام لاتينية لسهولة القراءة في الفواتير.
  return d.toLocaleString('ar-IQ-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Baghdad',
  });
}

export interface PrintI18n {
  // عام
  brand: { defaultCompanyName: string; phone: string; printedAt: string; taxNumber: string };
  status: { posted: string; draft: string; reversed: string };
  entryType: { opening: string; regular: string; openingBadge: string };
  accountType: { Asset: string; Liability: string; Equity: string; Revenue: string; Expense: string };
  signatures: { accountant: string; auditor: string; financialManager: string; generalManager: string; cashier: string; reviewer: string; sendingCashier: string; receivingCashier: string; accountantReviewer: string };
  // قائمة القيود (تقرير)
  journalList: {
    title: string;
    fromDate: string; toDate: string; status: string; entriesCount: string;
    all: string;
    colNo: string; colVoucherOrEntry: string; colDate: string; colDescription: string; colDebit: string; colCredit: string; colCurrency: string; colStatus: string;
    totals: string; empty: string;
    previewTitle: string;
  };
  // قيد مفرد
  singleEntry: {
    title: string;
    voucherNumber: string; entryNumber: string;
    manualNumber: string;
    date: string; type: string; currency: string;
    generalDescription: string;
    colNo: string; colAccount: string; colDescription: string; colDebit: string; colCredit: string;
    total: string; statusLabel: string;
    footer: (entryNumber: string) => string;
    previewTitle: (entryNumber: string) => string;
  };
  // كشف حساب
  statement: {
    title: string; previewTitle: string;
    allAccounts: string; all: string; account: string; fromDate: string; toDate: string;
    displayFilter: string; baseCurrency: string;
    colIdx: string; colDate: string; colEntry: string; colAccount: string; colDesc: string;
    colDebit: string; colCredit: string; colBalance: string; colValBalance: (base: string) => string; colCurrency: string;
    openingBalance: string;
    currencyMovements: (cur: string) => string;
    movementsCount: (n: number) => string;
    debitLbl: string; creditLbl: string; balanceLbl: string;
    noMovements: string; noMovementsCriteria: string;
    fxFallbackWarn: string;
    grandTotalTitle: (base: string) => string;
    openingBalanceLbl: string; totalDebitLbl: string; totalCreditLbl: string; closingBalanceLbl: string;
    multiCurrencyFoot: (count: number, bulletin: string | null) => string;
    totalsRowLabel: (opening?: string | null) => string;
  };
  // سند مفرد (قبض/دفع)
  voucher: {
    companyCopy: string; customerCopy: string;
    voucherNumber: string; entryNumber: string; entryDate: string;
    receiptVerb: string; paymentVerb: string; otherSideVerb: string;
    counterRoleReceipt: string; counterRolePayment: string; counterRoleOther: string;
    amountIs: string; amountInWords: string;
    entryType: string; cashBox: string;
    description: string;
    printedAtLbl: string;
    cutHere: string;
    previewTitle: (voucherTypeName: string, num: string) => string;
    titleSuffix: (entryNumber: string) => string;
  };
  // ميزان المراجعة
  trialBalance: {
    title: string; previewTitle: string;
    code: string; account: string; type: string;
    prevPeriod: string; currentMovement: string; closingBalance: string;
    debit: string; credit: string; total: string;
    balanced: string; unbalanced: string;
    profitTitle: string; totalRevenue: string; totalExpense: string;
    netProfit: string; netLoss: string;
    amountInWords: string; formula: string;
    fromDate: string; toDate: string; currencyChip: string;
    leavesOnly: string; maxLevel: (n: number) => string;
    valuated: string; bulletin: (name: string) => string;
    fxWarn: string;
    multiCurrency: string;
    footerText: string;
  };
  // أرصدة الصناديق
  cashBoxes: {
    title: string; previewTitle: string;
    subtitle: string;
    cashBoxLabel: string; accountLabel: string; currencyLabel: string;
    balance: string; debit: string; credit: string; limits: string;
    debitLimitPrefix: string; creditLimitPrefix: string;
    cashBoxesCount: string; currenciesCount: string; rowsCount: string;
    totalByCurrency: string; boxesSuffix: string;
    empty: string;
    footerText: string;
  };
  // مناقلة بين صندوقَين
  transfer: {
    title: string; previewTitle: (num: string) => string;
    transferNumber: string; status: string; amount: string;
    statusReceived: string; statusCancelled: string; statusPending: string;
    currency: string; transitAccount: string; externalRef: string; createdAt: string;
    description: string;
    sendSideTitle: string; receiveSideTitle: string; cancelSideTitle: string; pendingSideTitle: string;
    fromCashBox: string; toCashBox: string; targetCashBox: string;
    sendDateTime: string; receiveDateTime: string; expectedReceiveDate: string;
    sendEntry: string; receiveEntry: string; reversalEntry: string;
    sentAmount: string; receivedAmount: string; expectedAmount: string;
    approvedBy: string; approvalTime: string; notes: string;
    cancelledBy: string; cancelTime: string; cancelReason: string;
    pendingReceiveText: string;
    amountInWords: string;
    footerText: string;
  };
  // أرصدة الحسابات
  accountBalances: {
    title: string; previewTitle: string;
    idx: string; code: string; account: string; type: string; currency: string;
    debit: string; credit: string; valDebit: (base: string) => string; valCredit: (base: string) => string;
    totalsLbl: (count: number) => string;
    fromDate: string; toDate: string;
    accountChip: string; allAccounts: string;
    currencyChip: string; allCurrencies: string;
    leavesOnly: string; maxLevel: (n: number) => string;
    valuatedBy: (base: string) => string;
    bulletin: (name: string) => string;
    searchFilter: (q: string) => string;
    fxWarn: string;
    empty: string;
    footerText: string;
  };
  // شريط معاينة الطباعة
  preview: {
    titlePrefix: string;
    exportPdf: string; exportPdfTitle: string;
    print: string;
    close: string;
  };
}

const AR: PrintI18n = {
  brand: {
    defaultCompanyName: 'الشركة',
    phone: 'هاتف:',
    printedAt: 'تاريخ الطباعة',
    taxNumber: 'الرقم الضريبي',
  },
  status: {
    posted: 'مرحَّل',
    draft: 'غير مرحَّل',
    reversed: 'معكوس',
  },
  entryType: {
    opening: 'افتتاحي',
    regular: 'طبيعي',
    openingBadge: 'افتتاحي',
  },
  accountType: {
    Asset: 'أصول', Liability: 'خصوم', Equity: 'حقوق ملكية', Revenue: 'إيرادات', Expense: 'مصاريف',
  },
  signatures: {
    accountant: 'المحاسب',
    auditor: 'المدقّق',
    financialManager: 'المدير المالي',
    generalManager: 'المدير العام',
    cashier: 'أمين الصندوق',
    reviewer: 'المراجع',
    sendingCashier: 'أمين الصندوق المُرسِل',
    receivingCashier: 'أمين الصندوق المستلم',
    accountantReviewer: 'المحاسب / المراجع',
  },
  journalList: {
    title: 'تقرير القيود اليومية',
    fromDate: 'من تاريخ', toDate: 'إلى تاريخ', status: 'الحالة', entriesCount: 'عدد القيود',
    all: 'الكل',
    colNo: '#', colVoucherOrEntry: 'السند / القيد', colDate: 'التاريخ', colDescription: 'البيان',
    colDebit: 'المدين', colCredit: 'الدائن', colCurrency: 'العملة', colStatus: 'الحالة',
    totals: 'الإجمالي', empty: 'لا توجد قيود ضمن المعايير المحددة',
    previewTitle: 'تقرير القيود اليومية',
  },
  singleEntry: {
    title: 'قيد محاسبي',
    voucherNumber: 'رقم السند', entryNumber: 'رقم القيد',
    manualNumber: 'رقم يدوي',
    date: 'التاريخ', type: 'النوع', currency: 'العملة',
    generalDescription: 'البيان العام',
    colNo: '#', colAccount: 'الحساب', colDescription: 'البيان', colDebit: 'المدين', colCredit: 'الدائن',
    total: 'الإجمالي', statusLabel: 'الحالة:',
    footer: n => `قيد رقم ${n}`,
    previewTitle: n => `قيد رقم ${n}`,
  },
  statement: {
    title: 'كشف حساب', previewTitle: 'كشف حساب',
    allAccounts: 'جميع الحسابات', all: 'الكل', account: 'الحساب', fromDate: 'من تاريخ', toDate: 'إلى تاريخ',
    displayFilter: 'فلتر العرض', baseCurrency: 'العملة الأساسية (تقييم)',
    colIdx: '#', colDate: 'التاريخ', colEntry: 'السند / القيد', colAccount: 'الحساب', colDesc: 'البيان',
    colDebit: 'مدين', colCredit: 'دائن', colBalance: 'الرصيد',
    colValBalance: base => `رصيد مقوم (${base})`, colCurrency: 'العملة',
    openingBalance: 'رصيد افتتاحي',
    currencyMovements: cur => `حركات العملة • ${cur}`,
    movementsCount: n => `(${n} حركة)`,
    debitLbl: 'مدين:', creditLbl: 'دائن:', balanceLbl: 'الرصيد:',
    noMovements: 'لا توجد حركات',
    noMovementsCriteria: 'لا توجد حركات للمعايير المحددة',
    fxFallbackWarn: 'تنبيه: استُخدم مضاعف 1 لعملات دون سعر صرف في إعدادات الشركة.',
    grandTotalTitle: base => `⚖️ الإجمالي المُقوَّم بالعملة الأساسية (${base})`,
    openingBalanceLbl: 'الرصيد الافتتاحي', totalDebitLbl: 'إجمالي المدين',
    totalCreditLbl: 'إجمالي الدائن', closingBalanceLbl: 'الرصيد الختامي',
    multiCurrencyFoot: (count, bulletin) =>
      `تم تجميع المجاميع من <b>${count}</b> عملات مختلفة وتقويمها بالعملة الأساسية${bulletin ? ` باستخدام نشرة <b>${bulletin}</b>` : ''}.`,
    totalsRowLabel: opening => opening ? `الإجمالي (شامل افتتاحي ${opening})` : 'الإجمالي',
  },
  voucher: {
    companyCopy: 'نسخة الشركة', customerCopy: 'نسخة الزبون',
    voucherNumber: 'رقم السند:', entryNumber: 'رقم القيد:', entryDate: 'تاريخ القيد:',
    receiptVerb: 'استلمنا من السيِّد / السادة:',
    paymentVerb: 'صرفنا للسيِّد / السادة:',
    otherSideVerb: 'الطرف الآخر:',
    counterRoleReceipt: 'المسلِّم',
    counterRolePayment: 'المستلِم',
    counterRoleOther: 'الطرف الآخر',
    amountIs: 'مبلغاً وقدره:',
    amountInWords: 'المبلغ كتابةً:',
    entryType: 'نوع القيد', cashBox: 'الصندوق',
    description: 'وذلك عن (البيان):',
    printedAtLbl: 'طُبع في:',
    cutHere: 'قص هنا',
    previewTitle: (typeName, num) => `${typeName} ${num}`,
    titleSuffix: n => `رقم ${n}`,
  },
  trialBalance: {
    title: 'ميزان المراجعة — الأرصدة المدينة والدائنة', previewTitle: 'ميزان المراجعة',
    code: 'الكود', account: 'الحساب', type: 'النوع',
    prevPeriod: 'الفترة السابقة (الافتتاحي)', currentMovement: 'حركة الفترة الحالية', closingBalance: 'الرصيد النهائي',
    debit: 'مدين', credit: 'دائن', total: 'الإجمالي',
    balanced: '✓ الميزان متوازن', unbalanced: '× الميزان غير متوازن',
    profitTitle: 'نتيجة الفترة (طريقة احتساب الأرباح)',
    totalRevenue: 'إجمالي الإيرادات', totalExpense: 'إجمالي المصاريف',
    netProfit: 'صافي الربح', netLoss: 'صافي الخسارة',
    amountInWords: 'المبلغ كتابةً:',
    formula: 'المعادلة: صافي الربح = Σ(دائن − مدين) للإيرادات − Σ(مدين − دائن) للمصاريف',
    fromDate: 'من', toDate: 'إلى', currencyChip: 'العملة:',
    leavesOnly: 'الأبناء فقط', maxLevel: n => `حتى مستوى ${n}`,
    valuated: 'مبالغ مقوَّمة', bulletin: name => `نشرة: ${name}`,
    fxWarn: '⚠ عملة واحدة على الأقل لا تملك سعر صرف في النشرة المنشورة — استُعمل مضاعف 1 لها (قد لا تكون الأرقام دقيقة).',
    multiCurrency: 'متعددة',
    footerText: 'ميزان المراجعة — مولَّد إلكترونياً',
  },
  cashBoxes: {
    title: 'أرصدة الصناديق', previewTitle: 'أرصدة الصناديق',
    subtitle: 'محسوبة من سطور القيود المرحَّلة فقط — السقوف الحمراء تعني تجاوز السقف المعرَّف للصندوق.',
    cashBoxLabel: 'الصندوق', accountLabel: 'الحساب المحاسبي', currencyLabel: 'العملة',
    balance: 'الرصيد', debit: 'المدين', credit: 'الدائن', limits: 'السقوف',
    debitLimitPrefix: 'مدين ≤', creditLimitPrefix: 'دائن ≤',
    cashBoxesCount: 'عدد الصناديق', currenciesCount: 'عدد العملات', rowsCount: 'عدد الأسطر',
    totalByCurrency: 'الإجمالي حسب العملة', boxesSuffix: 'صندوق',
    empty: 'لا توجد أرصدة بعد — أنشئ صناديق أو أضف حركات.',
    footerText: 'تقرير أرصدة الصناديق',
  },
  transfer: {
    title: 'سند مناقلة بين صندوقَين', previewTitle: num => `سند مناقلة ${num}`,
    transferNumber: 'رقم المناقلة', status: 'الحالة', amount: 'المبلغ',
    statusReceived: 'مستلَمة', statusCancelled: 'ملغاة', statusPending: 'بانتظار الاستلام',
    currency: 'العملة', transitAccount: 'الحساب الوسيط', externalRef: 'المرجع الخارجي', createdAt: 'تاريخ الإنشاء',
    description: 'البيان:',
    sendSideTitle: 'طرف الإرسال (صادر)',
    receiveSideTitle: 'طرف الاستلام (وارد)',
    cancelSideTitle: 'طرف الاستلام — ألغيت قبل الاستلام',
    pendingSideTitle: 'طرف الاستلام — بانتظار الاعتماد',
    fromCashBox: 'من صندوق', toCashBox: 'إلى صندوق', targetCashBox: 'الصندوق المستهدَف',
    sendDateTime: 'تاريخ ووقت الإرسال', receiveDateTime: 'تاريخ ووقت الاستلام', expectedReceiveDate: 'تاريخ الاستلام المتوقَّع',
    sendEntry: 'قيد الإرسال', receiveEntry: 'قيد الاستلام', reversalEntry: 'قيد عكس الإرسال',
    sentAmount: 'المبلغ المُرسَل', receivedAmount: 'المبلغ المستلَم', expectedAmount: 'المبلغ المتوقَّع',
    approvedBy: 'اعتمد الاستلام', approvalTime: 'وقت الاعتماد', notes: 'ملاحظات',
    cancelledBy: 'ألغاها', cancelTime: 'وقت الإلغاء', cancelReason: 'سبب الإلغاء',
    pendingReceiveText: 'سيُولَّد عند موافقة الصندوق المستلم',
    amountInWords: 'المبلغ كتابةً:',
    footerText: 'سند مناقلة بين صندوقَين — مولَّد إلكترونياً',
  },
  accountBalances: {
    title: 'أرصدة الحسابات', previewTitle: 'أرصدة الحسابات',
    idx: '#', code: 'الكود', account: 'الحساب', type: 'النوع', currency: 'العملة',
    debit: 'رصيد مدين', credit: 'رصيد دائن',
    valDebit: base => `مقوَّم مدين (${base})`,
    valCredit: base => `مقوَّم دائن (${base})`,
    totalsLbl: c => `الإجمالي (${c} حساب)`,
    fromDate: 'من', toDate: 'إلى',
    accountChip: 'الحساب:', allAccounts: 'جميع الحسابات',
    currencyChip: 'العملة:', allCurrencies: 'جميع العملات',
    leavesOnly: 'الأبناء فقط', maxLevel: n => `حتى مستوى ${n}`,
    valuatedBy: base => `مقوَّم بـ ${base}`,
    bulletin: name => `نشرة: ${name}`,
    searchFilter: q => `بحث: «${q}»`,
    fxWarn: '⚠ استُخدم سعر صرف احتياطي (1) لبعض العملات غير المدرجة في النشرة المنشورة.',
    empty: 'لا توجد أرصدة للمعايير المحددة',
    footerText: 'أرصدة الحسابات — مولَّد إلكترونياً',
  },
  preview: {
    titlePrefix: 'معاينة الطباعة',
    exportPdf: 'تصدير PDF',
    exportPdfTitle: 'تصدير الوثيقة كـ PDF',
    print: 'طباعة',
    close: 'إغلاق',
  },
};

const EN: PrintI18n = {
  brand: {
    defaultCompanyName: 'Company',
    phone: 'Phone:',
    printedAt: 'Printed at',
    taxNumber: 'Tax number',
  },
  status: {
    posted: 'Posted',
    draft: 'Draft',
    reversed: 'Reversed',
  },
  entryType: {
    opening: 'Opening',
    regular: 'Regular',
    openingBadge: 'Opening',
  },
  accountType: {
    Asset: 'Asset', Liability: 'Liability', Equity: 'Equity', Revenue: 'Revenue', Expense: 'Expense',
  },
  signatures: {
    accountant: 'Accountant',
    auditor: 'Auditor',
    financialManager: 'Financial Manager',
    generalManager: 'General Manager',
    cashier: 'Cashier',
    reviewer: 'Reviewer',
    sendingCashier: 'Sending Cashier',
    receivingCashier: 'Receiving Cashier',
    accountantReviewer: 'Accountant / Reviewer',
  },
  journalList: {
    title: 'Journal Entries Report',
    fromDate: 'From', toDate: 'To', status: 'Status', entriesCount: 'Entries count',
    all: 'All',
    colNo: '#', colVoucherOrEntry: 'Voucher / Entry', colDate: 'Date', colDescription: 'Description',
    colDebit: 'Debit', colCredit: 'Credit', colCurrency: 'Currency', colStatus: 'Status',
    totals: 'Total', empty: 'No entries match the selected criteria',
    previewTitle: 'Journal Entries Report',
  },
  singleEntry: {
    title: 'Journal Entry',
    voucherNumber: 'Voucher No', entryNumber: 'Entry No',
    manualNumber: 'Manual No.',
    date: 'Date', type: 'Type', currency: 'Currency',
    generalDescription: 'General Description',
    colNo: '#', colAccount: 'Account', colDescription: 'Description', colDebit: 'Debit', colCredit: 'Credit',
    total: 'Total', statusLabel: 'Status:',
    footer: n => `Entry No. ${n}`,
    previewTitle: n => `Entry No. ${n}`,
  },
  statement: {
    title: 'Account Statement', previewTitle: 'Account Statement',
    allAccounts: 'All accounts', all: 'All', account: 'Account', fromDate: 'From', toDate: 'To',
    displayFilter: 'Display filter', baseCurrency: 'Base currency (valuation)',
    colIdx: '#', colDate: 'Date', colEntry: 'Voucher / Entry', colAccount: 'Account', colDesc: 'Description',
    colDebit: 'Debit', colCredit: 'Credit', colBalance: 'Balance',
    colValBalance: base => `Valued balance (${base})`, colCurrency: 'Currency',
    openingBalance: 'Opening balance',
    currencyMovements: cur => `Movements • ${cur}`,
    movementsCount: n => `(${n} movements)`,
    debitLbl: 'Debit:', creditLbl: 'Credit:', balanceLbl: 'Balance:',
    noMovements: 'No movements',
    noMovementsCriteria: 'No movements for the selected criteria',
    fxFallbackWarn: 'Notice: a multiplier of 1 was used for currencies without an FX rate in company settings.',
    grandTotalTitle: base => `⚖️ Total valued in base currency (${base})`,
    openingBalanceLbl: 'Opening balance', totalDebitLbl: 'Total debit',
    totalCreditLbl: 'Total credit', closingBalanceLbl: 'Closing balance',
    multiCurrencyFoot: (count, bulletin) =>
      `Totals were aggregated from <b>${count}</b> different currencies and valued in the base currency${bulletin ? ` using bulletin <b>${bulletin}</b>` : ''}.`,
    totalsRowLabel: opening => opening ? `Total (incl. opening ${opening})` : 'Total',
  },
  voucher: {
    companyCopy: 'Company copy', customerCopy: 'Customer copy',
    voucherNumber: 'Voucher No:', entryNumber: 'Entry No:', entryDate: 'Entry date:',
    receiptVerb: 'Received from Mr./Ms.:',
    paymentVerb: 'Paid to Mr./Ms.:',
    otherSideVerb: 'Other party:',
    counterRoleReceipt: 'Payer',
    counterRolePayment: 'Payee',
    counterRoleOther: 'Other party',
    amountIs: 'The amount of:',
    amountInWords: 'Amount in words:',
    entryType: 'Entry type', cashBox: 'Cash box',
    description: 'For (description):',
    printedAtLbl: 'Printed at:',
    cutHere: 'Cut here',
    previewTitle: (typeName, num) => `${typeName} ${num}`,
    titleSuffix: n => `No. ${n}`,
  },
  trialBalance: {
    title: 'Trial Balance — Debit & Credit Balances', previewTitle: 'Trial Balance',
    code: 'Code', account: 'Account', type: 'Type',
    prevPeriod: 'Prior period (opening)', currentMovement: 'Current period movement', closingBalance: 'Closing balance',
    debit: 'Debit', credit: 'Credit', total: 'Total',
    balanced: '✓ Trial balance is balanced', unbalanced: '× Trial balance is unbalanced',
    profitTitle: 'Period result (profit calculation)',
    totalRevenue: 'Total revenue', totalExpense: 'Total expense',
    netProfit: 'Net profit', netLoss: 'Net loss',
    amountInWords: 'Amount in words:',
    formula: 'Formula: net profit = Σ(credit − debit) for revenues − Σ(debit − credit) for expenses',
    fromDate: 'From', toDate: 'To', currencyChip: 'Currency:',
    leavesOnly: 'Leaves only', maxLevel: n => `Up to level ${n}`,
    valuated: 'Valued amounts', bulletin: name => `Bulletin: ${name}`,
    fxWarn: '⚠ At least one currency has no FX rate in the published bulletin — a multiplier of 1 was used (numbers may be inaccurate).',
    multiCurrency: 'Multi',
    footerText: 'Trial Balance — electronically generated',
  },
  cashBoxes: {
    title: 'Cash Box Balances', previewTitle: 'Cash Box Balances',
    subtitle: 'Computed from posted journal lines only — red limits indicate the cash box limit was exceeded.',
    cashBoxLabel: 'Cash box', accountLabel: 'Linked account', currencyLabel: 'Currency',
    balance: 'Balance', debit: 'Debit', credit: 'Credit', limits: 'Limits',
    debitLimitPrefix: 'Debit ≤', creditLimitPrefix: 'Credit ≤',
    cashBoxesCount: 'Cash boxes count', currenciesCount: 'Currencies count', rowsCount: 'Rows count',
    totalByCurrency: 'Total by currency', boxesSuffix: 'box(es)',
    empty: 'No balances yet — create cash boxes or add transactions.',
    footerText: 'Cash Box Balances Report',
  },
  transfer: {
    title: 'Cash Box Transfer Voucher', previewTitle: num => `Transfer voucher ${num}`,
    transferNumber: 'Transfer No.', status: 'Status', amount: 'Amount',
    statusReceived: 'Received', statusCancelled: 'Cancelled', statusPending: 'Pending receive',
    currency: 'Currency', transitAccount: 'Transit account', externalRef: 'External ref.', createdAt: 'Created at',
    description: 'Description:',
    sendSideTitle: 'Send side (outgoing)',
    receiveSideTitle: 'Receive side (incoming)',
    cancelSideTitle: 'Receive side — cancelled before receipt',
    pendingSideTitle: 'Receive side — pending approval',
    fromCashBox: 'From cash box', toCashBox: 'To cash box', targetCashBox: 'Target cash box',
    sendDateTime: 'Send date & time', receiveDateTime: 'Receive date & time', expectedReceiveDate: 'Expected receive date',
    sendEntry: 'Send entry', receiveEntry: 'Receive entry', reversalEntry: 'Reversal entry',
    sentAmount: 'Sent amount', receivedAmount: 'Received amount', expectedAmount: 'Expected amount',
    approvedBy: 'Approved by', approvalTime: 'Approval time', notes: 'Notes',
    cancelledBy: 'Cancelled by', cancelTime: 'Cancel time', cancelReason: 'Cancel reason',
    pendingReceiveText: 'Will be generated upon receiver cash box approval',
    amountInWords: 'Amount in words:',
    footerText: 'Cash Box Transfer Voucher — electronically generated',
  },
  accountBalances: {
    title: 'Account Balances', previewTitle: 'Account Balances',
    idx: '#', code: 'Code', account: 'Account', type: 'Type', currency: 'Currency',
    debit: 'Debit balance', credit: 'Credit balance',
    valDebit: base => `Valued debit (${base})`,
    valCredit: base => `Valued credit (${base})`,
    totalsLbl: c => `Total (${c} account(s))`,
    fromDate: 'From', toDate: 'To',
    accountChip: 'Account:', allAccounts: 'All accounts',
    currencyChip: 'Currency:', allCurrencies: 'All currencies',
    leavesOnly: 'Leaves only', maxLevel: n => `Up to level ${n}`,
    valuatedBy: base => `Valued in ${base}`,
    bulletin: name => `Bulletin: ${name}`,
    searchFilter: q => `Search: «${q}»`,
    fxWarn: '⚠ A fallback FX rate (1) was used for some currencies not listed in the published bulletin.',
    empty: 'No balances for the selected criteria',
    footerText: 'Account Balances — electronically generated',
  },
  preview: {
    titlePrefix: 'Print preview',
    exportPdf: 'Export PDF',
    exportPdfTitle: 'Export document as PDF',
    print: 'Print',
    close: 'Close',
  },
};

/** ترجع كائن النصوص الكامل للغة المطلوبة. */
export function getPrintI18n(locale?: PrintLocale): PrintI18n {
  const l = locale ?? getPrintLocale();
  return l === 'en' ? EN : AR;
}
