import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BookOpen, Receipt } from 'lucide-react';
import { NAV_GROUPS, type NavGroup } from '@/components/layout/Sidebar';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

// ════════════════════════════════════════════════════════════════════
// Available nav items (for shortcut picker, command palette, etc.)
// ════════════════════════════════════════════════════════════════════
// تجميع كل العناصر الـ navigable التي يسمح للمستخدم بالوصول إليها بصلاحياته
// الحالية — بما فيها مجموعة "السندات" الديناميكية المبنية على ShowInSidebar.
// نتخطّى المجموعات direct (الرئيسية) لأنها صفحة الـ shortcuts نفسها.

export interface AvailableNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  groupKey: string;
  groupTitle: string;
}

export function useAvailableNavItems(): AvailableNavItem[] {
  const { can, canAny } = usePermissions();
  const voucherTypesQuery = useQuery({
    queryKey: ['voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });

  return useMemo(() => {
    // ابنِ المجموعات بما فيها مجموعة "السندات" الديناميكية
    const groups: NavGroup[] = [];
    for (const g of NAV_GROUPS) {
      groups.push(g);
      if (g.key === 'dashboard') {
        const types = voucherTypesQuery.data ?? [];
        const voucherItems = types
          .filter(t => t.showInSidebar)
          .map(t => ({
            to: `/accounting/vouchers/${t.code}`,
            label: t.nameAr,
            icon: t.nature === 'Debit'
              ? ArrowDownLeft
              : t.nature === 'Credit'
              ? ArrowUpRight
              : BookOpen,
            permission: PERMS.Accounting.Vouchers.read(t.code),
          }));
        if (voucherItems.length > 0) {
          groups.push({
            key: 'vouchers',
            title: 'السندات',
            icon: Receipt,
            mandatory: true,
            items: voucherItems,
          });
        }
      }
    }

    // سطّح + فلتر بصلاحية القراءة
    const out: AvailableNavItem[] = [];
    const seen = new Set<string>();
    for (const g of groups) {
      // نتخطّى المجموعات direct (مثل "الرئيسية") لأنها صفحة المختصرات نفسها
      if (g.direct) continue;
      for (const item of g.items) {
        if (item.permission && !can(item.permission)) continue;
        if (item.permissionAny && !canAny(...item.permissionAny)) continue;
        if (seen.has(item.to)) continue;
        seen.add(item.to);
        out.push({
          to: item.to,
          label: item.label,
          icon: item.icon,
          groupKey: g.key,
          groupTitle: g.title,
        });
      }
    }
    return out;
  }, [voucherTypesQuery.data, can, canAny]);
}
