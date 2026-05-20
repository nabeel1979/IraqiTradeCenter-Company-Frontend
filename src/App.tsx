import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { InvoicesListPage } from '@/pages/invoices/InvoicesListPage';
import { CreateInvoicePage } from '@/pages/invoices/CreateInvoicePage';
import { ItemsListPage } from '@/pages/inventory/ItemsListPage';
import { StockMovementsPage } from '@/pages/inventory/StockMovementsPage';
import { CustomersListPage } from '@/pages/customers/CustomersListPage';
import { SalesRepsListPage } from '@/pages/sales-reps/SalesRepsListPage';
import { IncomingOrdersListPage } from '@/pages/orders/IncomingOrdersListPage';
import { AccountsTreePage } from '@/pages/accounting/AccountsTreePage';
import { JournalEntriesPage } from '@/pages/accounting/JournalEntriesPage';
import { CreateJournalEntryPage } from '@/pages/accounting/CreateJournalEntryPage';
import { TrialBalancePage } from '@/pages/accounting/TrialBalancePage';
import { AccountStatementPage } from '@/pages/accounting/AccountStatementPage';
import { FiscalYearsPage } from '@/pages/accounting/FiscalYearsPage';
import { CurrencyRateBulletinsPage } from '@/pages/accounting/CurrencyRateBulletinsPage';
import { JournalVoucherTypesPage } from '@/pages/accounting/JournalVoucherTypesPage';
import { CashBoxesPage } from '@/pages/accounting/CashBoxesPage';
import { VoucherEntryPage } from '@/pages/accounting/VoucherEntryPage';
import { VoucherReportPage } from '@/pages/accounting/VoucherReportPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { MenuSettingsPage } from '@/pages/settings/MenuSettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route index element={<DashboardPage />} />

        {/* Invoices */}
        <Route path="invoices" element={<InvoicesListPage />} />
        <Route path="invoices/new" element={<CreateInvoicePage />} />

        {/* Inventory */}
        <Route path="inventory" element={<ItemsListPage />} />
        <Route path="inventory/movements" element={<StockMovementsPage />} />

        {/* Customers */}
        <Route path="customers" element={<CustomersListPage />} />

        {/* Sales Reps */}
        <Route path="sales-reps" element={<SalesRepsListPage />} />

        {/* Orders */}
        <Route path="orders" element={<IncomingOrdersListPage />} />

        {/* Accounting */}
        <Route path="accounting/accounts" element={<AccountsTreePage />} />
        <Route path="accounting/journal" element={<JournalEntriesPage />} />
        <Route path="accounting/journal/new" element={<CreateJournalEntryPage />} />
        <Route path="accounting/journal/:id/edit" element={<CreateJournalEntryPage />} />
        <Route path="accounting/journal/:id/view" element={<CreateJournalEntryPage viewOnly />} />
        <Route path="accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="accounting/account-statement" element={<AccountStatementPage />} />
        <Route path="accounting/fiscal-years" element={<FiscalYearsPage />} />
        <Route path="accounting/currency-rates" element={<CurrencyRateBulletinsPage />} />
        <Route path="accounting/voucher-types" element={<JournalVoucherTypesPage />} />
        <Route path="accounting/cash-boxes" element={<CashBoxesPage />} />
        {/* تقرير سند مخصّص (قائمة) ثم نموذج الإنشاء */}
        <Route path="accounting/vouchers/:code" element={<VoucherReportPage />} />
        <Route path="accounting/vouchers/:code/new" element={<VoucherEntryPage />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/menu" element={<MenuSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
