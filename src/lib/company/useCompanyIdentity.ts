import { useQuery } from '@tanstack/react-query';
import { companySettingsApi } from '@/lib/api/companySettings';
import { getCompanyCode, isCompanyHost } from '@/lib/platform';
import { useLocale, localizedName } from '@/lib/i18n';

/** اسم الشركة + المعرف — لعرضهما في القائمة وشاشة الدخول. */
export function useCompanyIdentity() {
  const companyCode = getCompanyCode();
  const { locale } = useLocale();
  const show = isCompanyHost() && !!companyCode;

  const query = useQuery({
    queryKey: ['company-settings', 'identity'],
    queryFn: companySettingsApi.get,
    enabled: show,
    staleTime: 10 * 60_000,
  });

  const companyName = query.data
    ? localizedName(locale, query.data.nameAr, query.data.nameEn)
    : null;

  return {
    show,
    companyCode,
    companyName,
    nameAr: query.data?.nameAr ?? null,
    nameEn: query.data?.nameEn ?? null,
    logoBase64: query.data?.logoBase64 ?? null,
    isLoading: query.isLoading,
  };
}
