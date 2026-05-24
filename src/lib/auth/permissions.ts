/**
 * كاتالوج أكواد الصلاحيات للاستخدام في الواجهة.
 * يجب أن يبقى متطابقاً مع
 *   E:\projects\IraqiTradeCenter-Company-Backend\src\Host\IraqiTradeCenterCompany.API\Auth\Permissions\PermissionRegistry.cs
 *
 * استعمل هذه الثوابت بدل النصوص الحرفية لتفادي الأخطاء الإملائية:
 *   <PermissionGate perm={PERMS.Accounting.JournalEntries.Post}>...</PermissionGate>
 */
export const PERMS = {
  Accounting: {
    JournalEntries: {
      Read:   'Accounting.JournalEntries.Read',
      Create: 'Accounting.JournalEntries.Create',
      Update: 'Accounting.JournalEntries.Update',
      Delete: 'Accounting.JournalEntries.Delete',
      Print:  'Accounting.JournalEntries.Print',
      Post:   'Accounting.JournalEntries.Post',
    },
    /**
     * صلاحيات السندات تُولَّد ديناميكياً لكل نوع سند (RV, PV, AV, …).
     * استعمل الـ helper:
     *   PERMS.Accounting.Vouchers.read('RV')   → 'Accounting.Vouchers.RV.Read'
     *   PERMS.Accounting.Vouchers.create('PV') → 'Accounting.Vouchers.PV.Create'
     */
    Vouchers: {
      prefix: 'Accounting.Vouchers.' as const,
      read:   (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Read`,
      create: (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Create`,
      update: (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Update`,
      delete: (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Delete`,
      print:  (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Print`,
      post:   (code: string) => `Accounting.Vouchers.${code.toUpperCase()}.Post`,
    },
    Accounts: {
      Read:   'Accounting.Accounts.Read',
      Create: 'Accounting.Accounts.Create',
      Update: 'Accounting.Accounts.Update',
      Delete: 'Accounting.Accounts.Delete',
      Print:  'Accounting.Accounts.Print',
    },
    TrialBalance: {
      Read:   'Accounting.TrialBalance.Read',
      Print:  'Accounting.TrialBalance.Print',
      Export: 'Accounting.TrialBalance.Export',
    },
    AccountStatement: {
      Read:   'Accounting.AccountStatement.Read',
      Print:  'Accounting.AccountStatement.Print',
      Export: 'Accounting.AccountStatement.Export',
    },
    CashBoxes: {
      Read:   'Accounting.CashBoxes.Read',
      Create: 'Accounting.CashBoxes.Create',
      Update: 'Accounting.CashBoxes.Update',
      Delete: 'Accounting.CashBoxes.Delete',
    },
    CashBoxBalances: {
      Read:  'Accounting.CashBoxBalances.Read',
      Print: 'Accounting.CashBoxBalances.Print',
    },
    CashBoxTransfers: {
      Read:    'Accounting.CashBoxTransfers.Read',
      Create:  'Accounting.CashBoxTransfers.Create',
      Update:  'Accounting.CashBoxTransfers.Update',
      Delete:  'Accounting.CashBoxTransfers.Delete',
      Receive: 'Accounting.CashBoxTransfers.Receive',
      Cancel:  'Accounting.CashBoxTransfers.Cancel',
      Print:   'Accounting.CashBoxTransfers.Print',
    },
    FiscalYears: {
      Read:   'Accounting.FiscalYears.Read',
      Create: 'Accounting.FiscalYears.Create',
      Update: 'Accounting.FiscalYears.Update',
      Delete: 'Accounting.FiscalYears.Delete',
    },
    CurrencyRates: {
      Read:   'Accounting.CurrencyRates.Read',
      Create: 'Accounting.CurrencyRates.Create',
      Update: 'Accounting.CurrencyRates.Update',
      Delete: 'Accounting.CurrencyRates.Delete',
    },
    VoucherTypes: {
      Read:   'Accounting.VoucherTypes.Read',
      Create: 'Accounting.VoucherTypes.Create',
      Update: 'Accounting.VoucherTypes.Update',
      Delete: 'Accounting.VoucherTypes.Delete',
    },
  },
  Sales: {
    Invoices: {
      Read:   'Sales.Invoices.Read',
      Create: 'Sales.Invoices.Create',
      Update: 'Sales.Invoices.Update',
      Delete: 'Sales.Invoices.Delete',
      Print:  'Sales.Invoices.Print',
    },
    Customers: {
      Read:   'Sales.Customers.Read',
      Create: 'Sales.Customers.Create',
      Update: 'Sales.Customers.Update',
      Delete: 'Sales.Customers.Delete',
    },
    SalesReps: {
      Read:   'Sales.SalesReps.Read',
      Create: 'Sales.SalesReps.Create',
      Update: 'Sales.SalesReps.Update',
      Delete: 'Sales.SalesReps.Delete',
    },
    Orders: {
      Read:   'Sales.Orders.Read',
      Update: 'Sales.Orders.Update',
    },
  },
  Inventory: {
    Items: {
      Read:   'Inventory.Items.Read',
      Create: 'Inventory.Items.Create',
      Update: 'Inventory.Items.Update',
      Delete: 'Inventory.Items.Delete',
    },
    Movements: {
      Read:   'Inventory.Movements.Read',
      Create: 'Inventory.Movements.Create',
    },
  },
  System: {
    Users: {
      Read:   'System.Users.Read',
      Create: 'System.Users.Create',
      Update: 'System.Users.Update',
      Delete: 'System.Users.Delete',
    },
    Roles: {
      Read:   'System.Roles.Read',
      Create: 'System.Roles.Create',
      Update: 'System.Roles.Update',
      Delete: 'System.Roles.Delete',
    },
    CompanySettings: {
      Read:   'System.CompanySettings.Read',
      Update: 'System.CompanySettings.Update',
    },
    Trash: {
      Read:    'System.Trash.Read',
      Restore: 'System.Trash.Restore',
      Purge:   'System.Trash.Purge',
    },
    License: {
      Read:     'System.License.Read',
      Apply:    'System.License.Apply',
      Generate: 'System.License.Generate',
    },
    Wallet: {
      Read:  'System.Wallet.Read',
      Topup: 'System.Wallet.Topup',
    },
  },
} as const;

export const ACTION_LABELS_AR: Record<string, string> = {
  Read:     'قراءة',
  Create:   'إضافة',
  Update:   'تعديل',
  Delete:   'حذف',
  Print:    'طباعة',
  Export:   'تصدير',
  Post:     'ترحيل',
  Restore:  'استعادة من',
  Purge:    'حذف نهائي من',
  Receive:  'استلام',
  Cancel:   'إلغاء',
  Apply:    'تطبيق',
  Generate: 'توليد',
  Topup:    'شحن',
};

export const MODULE_LABELS_AR: Record<string, string> = {
  Accounting: 'المحاسبة',
  Sales:      'المبيعات',
  Inventory:  'المخزون',
  System:     'النظام',
};
