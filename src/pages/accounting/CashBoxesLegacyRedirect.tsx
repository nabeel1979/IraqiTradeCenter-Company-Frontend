import { Navigate, useLocation } from 'react-router-dom';
import {
  CASH_BOX_BALANCES_PATH,
  CASH_BOX_TRANSFERS_PATH,
} from '@/lib/accounting/journalEntrySource';

/** إعادة توجيه المسار القديم `/accounting/cash-boxes?tab=...` إلى الصفحات المستقلة. */
export function CashBoxesLegacyRedirect() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'transfers') {
    return <Navigate to={CASH_BOX_TRANSFERS_PATH} replace />;
  }
  return <Navigate to={CASH_BOX_BALANCES_PATH} replace />;
}
