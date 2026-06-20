import { api } from './client';

/** معلومات الشركة العامة كما هي مسجَّلة في الشركة الأم (T_Subscribers). */
export interface CompanyContactInfo {
  name: string;
  address?: string | null;
  email?: string | null;
  phones?: string[];
  about?: string | null;
  googleMapUrl?: string | null;
}

export const companyDirectoryApi = {
  /**
   * يجلب اسم الشركة المسجَّل في الشركة الأم عبر الكود — endpoint عام
   * (لا يتطلّب تسجيل دخول) يصلح للاستخدام في شاشة الدخول.
   */
  contactByCode: async (companyCode: string): Promise<CompanyContactInfo> => {
    const res = await api.get<CompanyContactInfo>(
      `/store/companies/${encodeURIComponent(companyCode)}/contact`,
    );
    return res.data;
  },
};
