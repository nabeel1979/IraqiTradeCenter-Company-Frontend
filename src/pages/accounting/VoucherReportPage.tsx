import { useParams } from 'react-router-dom';
import { JournalEntriesPage } from './JournalEntriesPage';

/**
 * تقرير سند مخصّص:
 *   نفس صفحة "القيود اليومية" لكن مع إقفال فلتر نوع السند على الكود
 *   الممرَّر في الرابط `/accounting/vouchers/:code`.
 *
 *   مثال:
 *     - `/accounting/vouchers/PV` → تقرير "سند دفع" فقط
 *     - `/accounting/vouchers/RV` → تقرير "سند قبض" فقط
 *
 *   في حين أن `/accounting/journal` يبقى يعرض جميع القيود المحاسبية مجتمعة.
 */
export function VoucherReportPage() {
  const { code } = useParams<{ code: string }>();
  // ‎مفتاح فريد لإجبار React على إعادة تركيب الحالة (filters/openIds/…)
  // عند الانتقال بين تقارير سندات مختلفة عبر الـ Sidebar.
  return <JournalEntriesPage key={code ?? '__none__'} lockedVoucherCode={code ?? ''} />;
}
