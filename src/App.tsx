import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { InvoicesListPage } from '@/pages/invoices/InvoicesListPage';
import { CreateInvoicePage } from '@/pages/invoices/CreateInvoicePage';
import { ItemsListPage } from '@/pages/inventory/ItemsListPage';
import { StockMovementsPage } from '@/pages/inventory/StockMovementsPage';
import { CustomersListPage } from '@/pages/customers/CustomersListPage';
import { SalesRepsListPage } from '@/pages/sales-reps/SalesRepsListPage';
import { IncomingOrdersListPage } from '@/pages/orders/IncomingOrdersListPage';
import { AccountsTreePage } from '@/pages/accounting/AccountsTreePage';
import { AccountsTrashPage } from '@/pages/accounting/AccountsTrashPage';
import { TrashPage } from '@/pages/system/TrashPage';
import { AuditPage } from '@/pages/system/AuditPage';
import { JournalEntriesPage } from '@/pages/accounting/JournalEntriesPage';
import { CreateJournalEntryPage } from '@/pages/accounting/CreateJournalEntryPage';
import { TrialBalancePage } from '@/pages/accounting/TrialBalancePage';
import { AccountStatementPage } from '@/pages/accounting/AccountStatementPage';
import { AccountBalancesPage } from '@/pages/accounting/AccountBalancesPage';
import { FiscalYearsPage } from '@/pages/accounting/FiscalYearsPage';
import { CurrencyRateBulletinsPage } from '@/pages/accounting/CurrencyRateBulletinsPage';
import { JournalVoucherTypesPage } from '@/pages/accounting/JournalVoucherTypesPage';
import { CashBoxesLegacyRedirect } from '@/pages/accounting/CashBoxesLegacyRedirect';
import { VoucherEntryPage } from '@/pages/accounting/VoucherEntryPage';
import { VoucherReportPage } from '@/pages/accounting/VoucherReportPage';
import { FinancialManagementPage } from '@/pages/financial-management/FinancialManagementPage';
import { FinancialManagementRedirect } from '@/pages/financial-management/FinancialManagementRedirect';
import { AccountSettlementsPage } from '@/pages/financial-management/AccountSettlementsPage';
import {
  CASH_BOX_BALANCES_PATH,
  CASH_BOX_TRANSFERS_PATH,
} from '@/lib/accounting/journalEntrySource';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { MenuSettingsPage } from '@/pages/settings/MenuSettingsPage';
import { UsersPage } from '@/pages/settings/UsersPage';
import { RolesPage } from '@/pages/settings/RolesPage';

/**
 * Wrappers صغيرة تُجبر إعادة تركيب المكون عند تغيير الـ URL بين
 * "إنشاء جديد" و "تعديل" أو بين قيدين مختلفين. بدون هذا الـ key، React
 * يُعيد استخدام نفس instance ويحتفظ بحالة الفورم القديمة (تواريخ، حقول، …).
 */
function VoucherEntryRoute() {
  const { code, id } = useParams<{ code: string; id?: string }>();
  return <VoucherEntryPage key={`${code ?? ''}-${id ?? 'new'}`} />;
}

function CreateJournalEntryRoute({ viewOnly = false }: { viewOnly?: boolean }) {
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();
  // ‎نضمّن search لأن `?voucherType=XX` يُغيّر نوع السند المثبَّت
  return (
    <CreateJournalEntryPage
      key={`${id ?? 'new'}-${location.search}-${viewOnly ? 'view' : 'edit'}`}
      viewOnly={viewOnly}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <AuthGuard allowMustChangePassword>
            <ChangePasswordPage />
          </AuthGuard>
        }
      />
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
        <Route path="accounting/accounts/trash" element={<AccountsTrashPage />} />
        <Route path="system/trash" element={<TrashPage />} />
        <Route path="system/audit" element={<AuditPage />} />
        <Route path="accounting/journal" element={<JournalEntriesPage />} />
        <Route path="accounting/journal/new" element={<CreateJournalEntryRoute />} />
        <Route path="accounting/journal/:id/edit" element={<CreateJournalEntryRoute />} />
        <Route path="accounting/journal/:id/view" element={<CreateJournalEntryRoute viewOnly />} />
        <Route path="accounting/account-balances" element={<AccountBalancesPage />} />
        <Route path="accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="accounting/account-statement" element={<AccountStatementPage />} />
        <Route path="accounting/fiscal-years" element={<FiscalYearsPage />} />
        <Route path="accounting/currency-rates" element={<CurrencyRateBulletinsPage />} />
        <Route path="accounting/voucher-types" element={<JournalVoucherTypesPage />} />
        <Route path="accounting/cash-box-balances" element={<Navigate to={CASH_BOX_BALANCES_PATH} replace />} />
        <Route path="accounting/cash-box-transfers" element={<Navigate to={CASH_BOX_TRANSFERS_PATH} replace />} />
        <Route path="accounting/cash-boxes" element={<CashBoxesLegacyRedirect />} />
        {/* تقرير سند مخصّص (قائمة) ثم نموذج الإنشاء */}
        <Route path="accounting/vouchers/:code" element={<VoucherReportPage />} />
        <Route path="accounting/vouchers/:code/new" element={<VoucherEntryRoute />} />
        <Route path="accounting/vouchers/:code/:id/edit" element={<VoucherEntryRoute />} />

        {/* Financial Management */}
        <Route path="financial-management" element={<FinancialManagementRedirect />} />
        <Route path="financial-management/suppliers" element={<FinancialManagementPage kind="Supplier" />} />
        <Route path="financial-management/customers" element={<FinancialManagementPage kind="Customer" />} />
        <Route path="financial-management/banks" element={<FinancialManagementPage kind="Bank" />} />
        <Route path="financial-management/cash-boxes" element={<FinancialManagementPage kind="CashBox" />} />
        <Route path="financial-management/payment-companies" element={<FinancialManagementPage kind="PaymentCompany" />} />
        <Route path="financial-management/account-settlements" element={<AccountSettlementsPage />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/menu" element={<MenuSettingsPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="settings/roles" element={<RolesPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
