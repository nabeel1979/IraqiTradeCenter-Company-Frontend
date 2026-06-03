import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, BookOpen, Receipt, Tag } from 'lucide-react';
import { NAV_GROUPS, type NavGroup } from '@/components/layout/Sidebar';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale } from '@/lib/i18n/useLocale';
import { localizedVoucherTypeName } from '@/lib/i18n';

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
  const { t } = useTranslation();
  const { locale } = useLocale();
  const voucherTypesQuery = useQuery({
    queryKey: ['voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });

  return useMemo(() => {
    // ابنِ المجموعات بما فيها مجموعة "السندات" الديناميكية.
    // ‎نحمل الاسمين العربي والإنجليزي معاً في الـ DynamicItem حتى نتمكّن
    // ‎لاحقاً من إعادة تقييم اللغة دون قفل الاسم المعروض على لغة بعينها.
    type DynamicItem = NavGroup['items'][number] & {
      dynamicLabelAr?: string;
      dynamicLabelEn?: string | null;
    };
    const groups: NavGroup[] = [];
    for (const g of NAV_GROUPS) {
      groups.push(g);
      if (g.key === 'dashboard') {
        const types = voucherTypesQuery.data ?? [];
        const voucherItems: DynamicItem[] = types
          .filter(vt => vt.showInSidebar)
          .map(vt => ({
            to: `/accounting/vouchers/${vt.code}`,
            labelKey: '',
            dynamicLabelAr: vt.nameAr,
            dynamicLabelEn: vt.nameEn ?? null,
            icon: vt.nature === 'Debit'
              ? ArrowDownLeft
              : vt.nature === 'Credit'
              ? ArrowUpRight
              : BookOpen,
            permission: PERMS.Accounting.Vouchers.read(vt.code),
          }));
        // ‎"أنواع السندات" أصبحت ضمن مجموعة السندات.
        voucherItems.push({
          to: '/accounting/voucher-types',
          labelKey: 'sidebar.items.voucherTypes',
          icon: Tag,
          permission: PERMS.Accounting.VoucherTypes.Read,
        });
        groups.push({
          key: 'vouchers',
          titleKey: 'sidebar.groups.vouchers',
          icon: Receipt,
          mandatory: true,
          items: voucherItems,
        });
      }
    }

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
        const dynItem = item as DynamicItem;
        const label = dynItem.dynamicLabelAr
          ? localizedVoucherTypeName(locale, dynItem.dynamicLabelAr, dynItem.dynamicLabelEn ?? null)
          : (item.labelKey ? t(item.labelKey) : '');
        out.push({
          to: item.to,
          label,
          icon: item.icon,
          groupKey: g.key,
          groupTitle: t(g.titleKey),
        });
      }
    }
    return out;
  }, [voucherTypesQuery.data, can, canAny, t, locale]);
}
