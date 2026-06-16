import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { ResetCredentialsPage } from '@/pages/auth/ResetCredentialsPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { InvoicesListPage } from '@/pages/invoices/InvoicesListPage';
import { CreateInvoicePage } from '@/pages/invoices/CreateInvoicePage';
import { InvoiceConstantsHubPage } from '@/pages/invoices/InvoiceConstantsHubPage';
import { InvoiceTypesPage } from '@/pages/invoices/InvoiceTypesPage';
import { InvoiceSettingsPage } from '@/pages/invoices/InvoiceSettingsPage';
import { ItemsListPage } from '@/pages/inventory/ItemsListPage';
import { ItemFormPage } from '@/pages/inventory/ItemFormPage';
import { ItemCategoriesPage } from '@/pages/inventory/ItemCategoriesPage';
import { UnitsOfMeasurePage } from '@/pages/inventory/UnitsOfMeasurePage';
import { ItemColorsPage } from '@/pages/inventory/ItemColorsPage';
import { ItemConstantsPage } from '@/pages/inventory/ItemConstantsPage';
import { WarehousesPage } from '@/pages/inventory/WarehousesPage';
import { StockMovementsPage } from '@/pages/inventory/StockMovementsPage';
import { StockCountReportPage } from '@/pages/inventory/StockCountReportPage';
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
import { BranchesPage } from '@/pages/settings/BranchesPage';
import { CountriesPage } from '@/pages/settings/CountriesPage';
import { CitiesPage } from '@/pages/settings/CitiesPage';
import { SystemConstantsPage } from '@/pages/settings/SystemConstantsPage';
import { SubscribersPage } from '@/pages/subscribers/SubscribersPage';
import { StoreTraderSalesPage } from '@/pages/parent-store/StoreTraderSalesPage';
import { StoreCompanyRequestsPage } from '@/pages/parent-store/StoreCompanyRequestsPage';
import { StoreUsersPage } from '@/pages/parent-store/StoreUsersPage';
import { StoreCartsPage } from '@/pages/parent-store/StoreCartsPage';
import { isParentHost } from '@/lib/platform';

/**
 * Wrappers صغيرة تُجبر إعادة تركيب المكون عند تغيير الـ URL بين
 * "إنشاء جديد" و "تعديل" أو بين قيدين مختلفين. بدون هذا الـ key، React
 * يُعيد استخدام نفس instance ويحتفظ بحالة الفورم القديمة (تواريخ، حقول، …).
 */
function VoucherEntryRoute() {
  const { code, id } = useParams<{ code: string; id?: string }>();
  return <VoucherEntryPage key={`${code ?? ''}-${id ?? 'new'}`} />;
}

function CompanyOnlyRoute({ children }: { children: ReactNode }) {
  if (isParentHost()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ParentOnlyRoute({ children }: { children: ReactNode }) {
  if (!isParentHost()) return <Navigate to="/" replace />;
  return <>{children}</>;
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
      <Route path="/reset-credentials/:token" element={<ResetCredentialsPage />} />
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
        <Route path="invoices" element={<Navigate to="/invoices/sales" replace />} />
        <Route path="invoices/sales" element={<InvoicesListPage category={1} />} />
        <Route path="invoices/purchase" element={<InvoicesListPage category={2} />} />
        <Route path="invoices/purchase-return" element={<InvoicesListPage category={3} />} />
        <Route path="invoices/sales-return" element={<InvoicesListPage category={4} />} />
        <Route path="invoices/type/:typeId" element={<InvoicesListPage />} />
        <Route path="invoices/new" element={<CreateInvoicePage />} />
        <Route path="invoices/:id/edit" element={<CreateInvoicePage />} />
        <Route path="invoices/constants" element={<InvoiceConstantsHubPage />} />
        <Route path="invoices/types" element={<InvoiceTypesPage />} />
        <Route path="invoices/settings" element={<InvoiceSettingsPage />} />

        {/* Inventory */}
        <Route path="inventory/movements" element={<StockMovementsPage />} />
        <Route path="inventory/stock-count" element={<StockCountReportPage />} />
        <Route path="inventory/constants" element={<ItemConstantsPage />} />
        <Route path="inventory/colors" element={<ItemColorsPage />} />
        <Route path="inventory/categories" element={<ItemCategoriesPage />} />
        <Route path="inventory/units" element={<UnitsOfMeasurePage />} />
        <Route path="inventory/warehouses" element={<WarehousesPage />} />
        <Route path="inventory/new" element={<ItemFormPage />} />
        <Route path="inventory/:id" element={<ItemFormPage />} />
        <Route path="inventory" element={<ItemsListPage />} />

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
        <Route path="settings/branches" element={<CompanyOnlyRoute><BranchesPage /></CompanyOnlyRoute>} />
        <Route path="settings/constants" element={<CompanyOnlyRoute><SystemConstantsPage /></CompanyOnlyRoute>} />
        <Route path="settings/countries" element={<CompanyOnlyRoute><CountriesPage /></CompanyOnlyRoute>} />
        <Route path="settings/cities" element={<CompanyOnlyRoute><CitiesPage /></CompanyOnlyRoute>} />
        <Route path="system/countries" element={<Navigate to="/settings/countries" replace />} />
        <Route path="system/cities" element={<Navigate to="/settings/cities" replace />} />

        {/* Parent — Subscribers & Store */}
        <Route path="subscribers" element={<SubscribersPage />} />
        <Route path="parent/store/users" element={<ParentOnlyRoute><StoreUsersPage /></ParentOnlyRoute>} />
        <Route path="parent/store/trader-sales" element={<ParentOnlyRoute><StoreTraderSalesPage /></ParentOnlyRoute>} />
        <Route path="parent/store/company-requests" element={<ParentOnlyRoute><StoreCompanyRequestsPage /></ParentOnlyRoute>} />
        <Route path="parent/store/carts" element={<ParentOnlyRoute><StoreCartsPage /></ParentOnlyRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
