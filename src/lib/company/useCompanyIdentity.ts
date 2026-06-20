import { useQuery } from '@tanstack/react-query';
import { companySettingsApi } from '@/lib/api/companySettings';
import { companyDirectoryApi } from '@/lib/api/companyDirectory';
import { getCompanyCode, isCompanyHost } from '@/lib/platform';
import { useLocale, localizedName } from '@/lib/i18n';

/** اسم الشركة + المعرف — لعرضهما في القائمة وشاشة الدخول. */
export function useCompanyIdentity() {
  const companyCode = getCompanyCode();
  const { locale } = useLocale();
  const show = isCompanyHost() && !!companyCode;

  const query = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    enabled: show,
    staleTime: 10 * 60_000,
  });

  // ‎الاسم الرسمي المسجَّل في الشركة الأم (T_Subscribers.Dscrp) — له الأولوية في العرض.
  const registeredQuery = useQuery({
    queryKey: ['company-registered-name', companyCode],
    queryFn: () => companyDirectoryApi.contactByCode(companyCode!),
    enabled: show,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const registeredName = registeredQuery.data?.name?.trim() || null;

  const settingsName = query.data
    ? localizedName(locale, query.data.nameAr, query.data.nameEn)
    : null;

  // ‎الأولوية لاسم الشركة الذي يضبطه المستخدم في الإعدادات (قابل للتعديل ويُحدَّث فوراً).
  // ‎اسم الأم المسجَّل يُستخدم فقط كبديل عندما لا يضبط المستخدم اسماً (أو يبقى الاسم الافتراضي العام).
  const settingsNameAr = query.data?.nameAr?.trim() ?? '';
  const hasCustomName = settingsNameAr.length > 0 && !GENERIC_DEFAULT_NAMES.includes(settingsNameAr);

  return {
    show,
    companyCode,
    companyName: hasCustomName ? settingsName : (registeredName ?? settingsName),
    nameAr: hasCustomName ? (query.data?.nameAr ?? null) : (registeredName ?? query.data?.nameAr ?? null),
    nameEn: query.data?.nameEn ?? null,
    logoBase64: query.data?.logoBase64 ?? null,
    isLoading: query.isLoading,
  };
}

/** أسماء افتراضية عامة تدل على أن الشركة لم تضبط اسمها بعد — حينها نعرض اسم الأم المسجَّل. */
const GENERIC_DEFAULT_NAMES = ['مركز التجارة العراقي', 'Iraqi Trade Center'];
