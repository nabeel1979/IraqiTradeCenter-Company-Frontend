import type { AccountStatementDto, JournalEntryDto, TrialBalanceDto } from '@/types/api';
import type { CompanySettingsDto } from '@/lib/api/companySettings';
import { formatAmount, formatDate } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status: string): string {
  if (status === 'Posted') return 'مرحَّل';
  if (status === 'Draft') return 'غير مرحَّل';
  if (status === 'Reversed') return 'معكوس';
  return status;
}

function typeLabel(t?: string): string {
  return t === 'Opening' ? 'افتتاحي' : 'طبيعي';
}

const PRINT_STYLES = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { background: #e9ecef; }
  body { font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif; margin: 0; padding: 0; color: #111; direction: rtl; }
  .preview-toolbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #2c3e50; color: #fff; padding: 8px 16px; border-bottom: 2px solid #1a242f; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .preview-toolbar .title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .preview-toolbar .actions { display: flex; gap: 8px; }
  .preview-toolbar button { background: #fff; color: #2c3e50; border: 0; border-radius: 4px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
  .preview-toolbar button:hover { background: #ecf0f1; transform: translateY(-1px); }
  .preview-toolbar button.primary { background: #27ae60; color: #fff; }
  .preview-toolbar button.primary:hover { background: #229954; }
  .preview-toolbar button.danger { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); }
  .preview-toolbar button.danger:hover { background: rgba(255,255,255,.1); }
  .preview-toolbar svg { width: 14px; height: 14px; }
  .preview-page { max-width: 210mm; margin: 16px auto; background: #fff; padding: 14mm; box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 4px; min-height: calc(100vh - 100px); }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 12px; gap: 12px; }
  .doc-header .brand { display: flex; align-items: center; gap: 12px; flex: 1; }
  .doc-header .brand img.logo { width: 64px; height: 64px; object-fit: contain; }
  .doc-header .brand .titles h1 { margin: 0; font-size: 18px; }
  .doc-header .brand .titles .sub-en { font-size: 11px; color: #666; margin-top: 2px; }
  .doc-header .brand .titles .contact { margin-top: 4px; font-size: 10px; color: #555; }
  .doc-header .brand .titles .contact span + span { margin-right: 8px; }
  .doc-header .meta { text-align: left; font-size: 10px; color: #555; min-width: 130px; }
  .doc-header .meta div { margin-bottom: 2px; }
  .report-title { text-align: center; font-size: 15px; font-weight: 700; padding: 6px 0; background: #f0f3f6; border-radius: 4px; margin-bottom: 10px; }
  .doc-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 12px; font-size: 12px; }
  .doc-meta .item { background: #f5f5f5; padding: 6px 8px; border-radius: 4px; }
  .doc-meta .label { color: #555; font-size: 10px; display: block; margin-bottom: 2px; }
  .doc-meta .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  th, td { border: 1px solid #555; padding: 5px 7px; text-align: right; vertical-align: middle; }
  thead th { background: #2c3e50; color: #fff; font-weight: 600; }
  tfoot th { background: #ecf0f1; }
  .center { text-align: center; }
  .left { text-align: left; }
  .right { text-align: right; }
  .num { font-family: 'Consolas', 'Menlo', monospace; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
  .badge-posted { background: #d4edda; color: #155724; }
  .badge-draft { background: #e2e3e5; color: #383d41; }
  .badge-reversed { background: #f8d7da; color: #721c24; }
  .badge-opening { background: #e7e0f5; color: #5b3a99; border: 1px solid #c4b3e6; }
  .doc-footer { margin-top: 18px; text-align: center; font-size: 9px; color: #777; border-top: 1px dashed #aaa; padding-top: 8px; }
  .doc-footer .custom-footer { font-weight: 600; color: #444; margin-bottom: 3px; }
  .signatures { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; font-size: 11px; text-align: center; }
  .signatures .sig { border-top: 1px solid #444; padding-top: 6px; }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .preview-toolbar, .no-print { display: none !important; }
    .preview-page { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; min-height: auto; }
  }

  /* ‎شاشات ضيقة (موبايل): الورقة A4 لا تتسع 210mm فيُقطع المحتوى من الجوانب */
  @media screen and (max-width: 800px) {
    body { background: #f1f3f5; }
    .preview-page { max-width: 100%; margin: 0; padding: 8px; box-shadow: none; border-radius: 0; min-height: auto; }
    .doc-header { flex-wrap: wrap; gap: 8px; padding-bottom: 8px; margin-bottom: 8px; }
    .doc-header .brand { gap: 8px; min-width: 0; flex-basis: 100%; }
    .doc-header .brand img.logo { width: 44px; height: 44px; }
    .doc-header .brand .titles h1 { font-size: 14px; }
    .doc-header .brand .titles .sub-en { font-size: 10px; }
    .doc-header .brand .titles .contact { font-size: 9px; }
    .doc-header .meta { min-width: 0; font-size: 9px; }
    .doc-meta { grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-bottom: 8px; }
    .doc-meta .item { padding: 4px 6px; }
    .report-title { font-size: 13px; padding: 4px 0; margin-bottom: 6px; }
    /* جداول قابلة للتمرير أفقياً + خط أصغر لتلائم الشاشة */
    table { font-size: 9.5px; display: block; overflow-x: auto; white-space: nowrap; }
    th, td { padding: 3px 4px; }
    .signatures { grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
    .ccy-block .ccy-head { padding: 6px 8px; }
    .ccy-block .ccy-summary { font-size: 9.5px; gap: 6px; }
    .ccy-badge { padding: 4px 10px; font-size: 11px; }
    .ccy-block table { font-size: 9.5px; }
    .base-summary-grid { grid-template-columns: 1fr 1fr; gap: 5px; padding: 8px; }
    .bs-cell { padding: 5px 7px; }
    .bs-value { font-size: 12px; }
  }
`;

// ════════════════════════════════════════════════════════════════════
// آلية معاينة الطباعة الموحَّدة
// ════════════════════════════════════════════════════════════════════
// كل دوال الطباعة كانت تستخدم window.open('', '_blank', 'width=...,height=...').
// هذا يفشل على الجوال ومتصفحات الموبايل ومن داخل PWA الـ standalone:
//   - متصفحات الجوال تتجاهل أبعاد النوافذ وقد ترفض popups بدون gesture كامل.
//   - PWA standalone يفتح المتصفح الخارجي أو يفشل الـ open() صامتاً.
// لذا نستخدم iframe overlay داخل نفس الصفحة (modal ملء الشاشة) في كل البيئات:
//   - يعمل على الموبايل والديسكتوب و PWA بنفس السلوك.
//   - زر "طباعة" يستدعي iframe.contentWindow.print() الذي يفتح الحوار الأصلي للطباعة.
//   - زر "إغلاق" يحذف الـ overlay.
//   - مفتاح Esc يغلق المعاينة.
// ────────────────────────────────────────────────────────────────────

// ‎ملاحظة مهمة: width/height صريحة بـ px واجبة، وإلا الـ inline SVG يأخذ
// ‎عرض الـ viewport كاملاً في بعض المتصفحات (خصوصاً Chromium داخل WebView2/PWA).
const PRINTER_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;width:14px;height:14px;display:inline-block"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';
const CLOSE_SVG   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;width:14px;height:14px;display:inline-block"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

const OVERLAY_STYLES = `
  position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column;
  background: #1f2937; color: #fff;
`;
const TOOLBAR_STYLES = `
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; background: #2c3e50; border-bottom: 2px solid #1a242f; box-shadow: 0 2px 6px rgba(0,0,0,.25);
  font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;
`;
const TOOLBAR_TITLE_STYLES = `font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;`;
const TOOLBAR_TITLE_TEXT_STYLES = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
const TOOLBAR_ACTIONS_STYLES = `display: flex; gap: 8px; flex-shrink: 0;`;
const BTN_BASE_STYLES = `border: 0; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit;`;
const BTN_PRIMARY_STYLES = `${BTN_BASE_STYLES} background: #27ae60; color: #fff;`;
const BTN_DANGER_STYLES  = `${BTN_BASE_STYLES} background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4);`;
const IFRAME_STYLES = `flex: 1; width: 100%; border: 0; background: #e9ecef;`;

/**
 * تفتح معاينة طباعة كاملة الشاشة داخل الصفحة الحالية باستخدام iframe.
 * تعمل في كل البيئات (موبايل/ديسكتوب/PWA standalone) دون الحاجة لـ popups.
 *
 * @param fullHtmlDocument محتوى HTML كامل (DOCTYPE + html + head + body) يُحقن في iframe عبر srcdoc.
 * @param title عنوان يظهر في شريط الأدوات.
 */
function openPrintPreview(fullHtmlDocument: string, title: string) {
  // ‎احذف أي معاينة سابقة قد تكون مفتوحة
  const existing = document.getElementById('itc-print-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'itc-print-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `معاينة الطباعة - ${title}`);
  overlay.style.cssText = OVERLAY_STYLES;

  // ‎حاجز CSS قوي: يمنع أي svg داخل الـ overlay من التمدد لكامل الـ viewport
  // ‎(يصلح بقايا من نسخ مخبَّأة قديمة لـ SVG بدون width/height)
  const guardStyle = document.createElement('style');
  guardStyle.textContent = `
    #itc-print-overlay svg { width: 14px !important; height: 14px !important; max-width: 14px !important; max-height: 14px !important; flex: none !important; }
    #itc-print-overlay button { white-space: nowrap; line-height: 1; }
  `;
  overlay.appendChild(guardStyle);

  const toolbar = document.createElement('div');
  toolbar.style.cssText = TOOLBAR_STYLES;
  // ‎innerHTML آمن لأن العنوان يمر عبر escapeHtml
  toolbar.innerHTML = `
    <div style="${TOOLBAR_TITLE_STYLES}">
      ${PRINTER_SVG}
      <span style="${TOOLBAR_TITLE_TEXT_STYLES}">معاينة الطباعة - ${escapeHtml(title)}</span>
    </div>
    <div style="${TOOLBAR_ACTIONS_STYLES}">
      <button type="button" data-act="print" style="${BTN_PRIMARY_STYLES}">${PRINTER_SVG}<span>طباعة</span></button>
      <button type="button" data-act="close" style="${BTN_DANGER_STYLES}">${CLOSE_SVG}<span>إغلاق</span></button>
    </div>
  `;

  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.style.cssText = IFRAME_STYLES;
  // ‎srcdoc يحقن الـ HTML مباشرة بدون رحلة شبكة — يعمل خارج الـ Service Worker scope.
  iframe.srcdoc = fullHtmlDocument;

  overlay.appendChild(toolbar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  // ‎امنع scroll الخلفية أثناء فتح المعاينة
  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const close = () => {
    document.body.style.overflow = prevBodyOverflow;
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener('keydown', onKey);

  toolbar.querySelector<HTMLButtonElement>('[data-act="close"]')?.addEventListener('click', close);
  toolbar.querySelector<HTMLButtonElement>('[data-act="print"]')?.addEventListener('click', () => {
    try {
      // ‎ركّز iframe قبل الطباعة (يتطلبها Safari)
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // fallback لطباعة الصفحة الحالية إن فشل الـ iframe
      window.print();
    }
  });
}

function openPrintWindow(html: string, title: string) {
  const fullDoc = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="preview-page">
    ${html}
  </div>
</body>
</html>`;
  openPrintPreview(fullDoc, title);
}

function statusBadgeHtml(status: string): string {
  const cls =
    status === 'Posted' ? 'badge-posted' :
    status === 'Reversed' ? 'badge-reversed' : 'badge-draft';
  return `<span class="badge ${cls}">${statusLabel(status)}</span>`;
}

/** يبني الترويسة الموحَّدة (لوكو + اسم + اتصال) من إعدادات الشركة */
function buildBrandHeader(company: CompanySettingsDto | null | undefined, printedAt: string): string {
  const c = company || ({} as CompanySettingsDto);
  const heading = c.printHeader || c.nameAr || 'الشركة';
  const logo = c.logoBase64
    ? `<img class="logo" src="${escapeHtml(c.logoBase64)}" alt="logo">`
    : '';
  const contactBits: string[] = [];
  if (c.address) contactBits.push(`<span>${escapeHtml(c.address)}</span>`);
  if (c.phone) contactBits.push(`<span>هاتف: ${escapeHtml(c.phone)}</span>`);
  if (c.email) contactBits.push(`<span>${escapeHtml(c.email)}</span>`);
  if (c.website) contactBits.push(`<span>${escapeHtml(c.website)}</span>`);
  const contact = contactBits.length
    ? `<div class="contact">${contactBits.join(' • ')}</div>`
    : '';

  const subEn = c.nameEn ? `<div class="sub-en">${escapeHtml(c.nameEn)}</div>` : '';

  const metaBits: string[] = [];
  metaBits.push(`<div>تاريخ الطباعة</div><div>${escapeHtml(printedAt)}</div>`);
  if (c.taxNumber) metaBits.push(`<div style="margin-top:4px">الرقم الضريبي</div><div>${escapeHtml(c.taxNumber)}</div>`);

  return `
    <div class="doc-header">
      <div class="brand">
        ${logo}
        <div class="titles">
          <h1>${escapeHtml(heading)}</h1>
          ${subEn}
          ${contact}
        </div>
      </div>
      <div class="meta">${metaBits.join('')}</div>
    </div>
  `;
}

function buildFooter(company: CompanySettingsDto | null | undefined, defaultText: string): string {
  const custom = company?.printFooter
    ? `<div class="custom-footer">${escapeHtml(company.printFooter)}</div>`
    : '';
  return `<div class="doc-footer">${custom}${defaultText}</div>`;
}

export interface PrintListFilters {
  fromDate?: string;
  toDate?: string;
  status?: string;
  search?: string;
}

export function printJournalEntriesList(
  entries: JournalEntryDto[],
  filters: PrintListFilters = {},
  company: CompanySettingsDto | null = null,
) {
  const totalDebit = entries.reduce((s, e) => s + (e.totalDebit || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.totalCredit || 0), 0);

  const rows = entries.map((e, idx) => {
    const entryCell = e.voucherNumber
      ? `<strong class="num">${escapeHtml(e.voucherNumber)}</strong><br><span class="num" style="font-size:9px;color:#777">#${escapeHtml(e.entryNumber)}</span>`
      : `<span class="num">#${escapeHtml(e.entryNumber)}</span>`;
    return `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="center">${entryCell}</td>
      <td class="center">${formatDate(e.entryDate)}</td>
      <td>${escapeHtml(e.description)} ${e.entryType === 'Opening' ? '<span class="badge badge-opening">افتتاحي</span>' : ''}</td>
      <td class="left num">${formatAmount(e.totalDebit)}</td>
      <td class="left num">${formatAmount(e.totalCredit)}</td>
      <td class="center">${escapeHtml(e.currency || 'IQD')}</td>
      <td class="center">${statusBadgeHtml(e.status)}</td>
    </tr>
  `;
  }).join('');

  const fromTxt = filters.fromDate ? formatDate(filters.fromDate) : '—';
  const toTxt = filters.toDate ? formatDate(filters.toDate) : '—';
  const statusTxt = filters.status ? statusLabel(filters.status) : 'الكل';
  const printedAt = new Date().toLocaleString('ar-IQ');

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">تقرير القيود اليومية</div>
    <div class="doc-meta">
      <div class="item"><span class="label">من تاريخ</span><span class="value">${fromTxt}</span></div>
      <div class="item"><span class="label">إلى تاريخ</span><span class="value">${toTxt}</span></div>
      <div class="item"><span class="label">الحالة</span><span class="value">${statusTxt}</span></div>
      <div class="item"><span class="label">عدد القيود</span><span class="value">${entries.length}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">#</th>
          <th class="center" style="width:80px">السند / القيد</th>
          <th class="center" style="width:80px">التاريخ</th>
          <th>البيان</th>
          <th class="left" style="width:90px">المدين</th>
          <th class="left" style="width:90px">الدائن</th>
          <th class="center" style="width:50px">العملة</th>
          <th class="center" style="width:60px">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="center" style="padding:20px;color:#888">لا توجد قيود ضمن المعايير المحددة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="4" class="right">الإجمالي</th>
          <th class="left num">${formatAmount(totalDebit)}</th>
          <th class="left num">${formatAmount(totalCredit)}</th>
          <th colspan="2"></th>
        </tr>
      </tfoot>
    </table>
    <div class="signatures">
      <div class="sig">المحاسب</div>
      <div class="sig">المراجع</div>
      <div class="sig">المدير المالي</div>
    </div>
    ${buildFooter(company, 'تقرير القيود اليومية')}
  `;

  openPrintWindow(html, `تقرير القيود اليومية - ${company?.nameAr ?? ''}`.trim());
}

export function printSingleJournalEntry(
  e: JournalEntryDto,
  company: CompanySettingsDto | null = null,
) {
  const lines = e.lines.map((l, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(l.accountName ?? `#${l.accountId}`)}</td>
      <td>${escapeHtml(l.description ?? '')}</td>
      <td class="left num">${l.isDebit ? formatAmount(l.amount) : '—'}</td>
      <td class="left num">${!l.isDebit ? formatAmount(l.amount) : '—'}</td>
    </tr>
  `).join('');

  const printedAt = new Date().toLocaleString('ar-IQ');

  const voucherHeader = e.voucherNumber
    ? `<div class="item"><span class="label">رقم السند</span><span class="value num" style="color:#1f6f43;font-size:14px">${escapeHtml(e.voucherNumber)}</span></div>
       <div class="item"><span class="label">رقم القيد</span><span class="value num">#${escapeHtml(e.entryNumber)}</span></div>`
    : `<div class="item"><span class="label">رقم القيد</span><span class="value num">${escapeHtml(e.entryNumber)}</span></div>`;
  const metaCols = e.voucherNumber ? 5 : 4;

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">قيد محاسبي</div>
    <div class="doc-meta" style="grid-template-columns: repeat(${metaCols}, 1fr)">
      ${voucherHeader}
      <div class="item"><span class="label">التاريخ</span><span class="value">${formatDate(e.entryDate)}</span></div>
      <div class="item"><span class="label">النوع</span><span class="value">${typeLabel(e.entryType)}</span></div>
      <div class="item"><span class="label">العملة</span><span class="value">${escapeHtml(e.currency || 'IQD')}</span></div>
    </div>
    <div style="background:#f8f9fa;padding:8px 10px;border-right:3px solid #2c3e50;margin-bottom:10px;font-size:12px">
      <div style="font-size:10px;color:#555;margin-bottom:2px">البيان العام</div>
      <div style="font-weight:600">${escapeHtml(e.description) || '—'}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">#</th>
          <th>الحساب</th>
          <th>البيان</th>
          <th class="left" style="width:120px">المدين</th>
          <th class="left" style="width:120px">الدائن</th>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="right">الإجمالي</th>
          <th class="left num">${formatAmount(e.totalDebit)}</th>
          <th class="left num">${formatAmount(e.totalCredit)}</th>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:14px;padding:6px 10px;background:#f1f8ff;border:1px solid #b3d7ff;border-radius:4px;font-size:11px">
      <strong>الحالة:</strong> ${statusBadgeHtml(e.status)}
    </div>
    <div class="signatures">
      <div class="sig">المحاسب</div>
      <div class="sig">المراجع</div>
      <div class="sig">المدير المالي</div>
    </div>
    ${buildFooter(company, `قيد رقم ${escapeHtml(e.entryNumber)}`)}
  `;

  openPrintWindow(html, `قيد رقم ${e.entryNumber}`);
}

/**
 * طباعة كشف حساب — جدول مستقل لكل عملة بنفس تخطيط الواجهة:
 *   - رأس مُلوَّن باسم العملة + ملخّص (مدين/دائن/الرصيد).
 *   - صف رصيد افتتاحي (إن وُجد).
 *   - بنود الحركات مع رصيد جارٍ بعملة السطر ورصيد مقوَّم بالعملة الأساسية.
 *   - فوتر إجمالي العملة.
 * في الأسفل بطاقة "الإجمالي المُقوَّم بالعملة الأساسية" (افتتاحي/مدين/دائن/ختامي).
 */
export function printAccountStatement(
  data: AccountStatementDto,
  company: CompanySettingsDto | null | undefined
) {
  const printedAt = new Date().toLocaleString('ar-IQ');
  const isAll = data.isAllAccounts;
  const base = data.baseCurrency || 'IQD';

  const accountLine = isAll
    ? 'جميع الحسابات'
    : `${data.accountCode ?? ''} - ${data.accountName ?? ''}`;

  // ── 1) العملات الموجودة فعلاً مرتبة (تتبع نفس منطق الواجهة)
  const seen = new Set<string>();
  for (const r of data.rows) seen.add((r.currency || 'IQD').toUpperCase());
  const currenciesPresent = Array.from(seen);

  // ── 2) مُضاعِفات التحويل لكل عملة (Backend أولاً ثم استنباط من الصفوف)
  const multipliers = new Map<string, number>();
  if (data.currencyMultipliers) {
    for (const [k, v] of Object.entries(data.currencyMultipliers)) {
      if (Number.isFinite(v) && v > 0) multipliers.set(k.toUpperCase(), v);
    }
  }
  if (data.rows?.length) {
    let prevValuated = data.openingBalanceValuated ?? 0;
    for (const r of data.rows) {
      const cur = (r.currency || 'IQD').toUpperCase();
      const delta = (r.debit ?? 0) - (r.credit ?? 0);
      if (delta !== 0 && !multipliers.has(cur)) {
        const mult = (r.balanceValuated - prevValuated) / delta;
        if (Number.isFinite(mult) && mult > 0) multipliers.set(cur, mult);
      }
      prevValuated = r.balanceValuated;
    }
  }

  // ── 3) الافتتاحي لكل عملة (Backend مباشرةً)
  const openingByCurrency = new Map<string, number>();
  if (data.openingByCurrency) {
    for (const [k, v] of Object.entries(data.openingByCurrency)) {
      openingByCurrency.set(k.toUpperCase(), v ?? 0);
    }
  }

  // ── 4) صفوف لكل عملة + إعادة احتساب الرصيد الجاري (محلي + مقوَّم)
  type EnrichedRow = AccountStatementDto['rows'][number] & {
    runningBalance: number;
    runningValuated: number;
  };
  const rowsByCurrency = new Map<string, EnrichedRow[]>();
  const grouped = new Map<string, AccountStatementDto['rows']>();
  for (const r of data.rows) {
    const cur = (r.currency || 'IQD').toUpperCase();
    if (!grouped.has(cur)) grouped.set(cur, []);
    grouped.get(cur)!.push(r);
  }
  for (const [cur, arr] of grouped) {
    const opening = openingByCurrency.get(cur) ?? 0;
    const mult = multipliers.get(cur) ?? 1;
    let bal = opening;
    let balV = opening * mult;
    rowsByCurrency.set(
      cur,
      arr.map(r => {
        const delta = (r.debit ?? 0) - (r.credit ?? 0);
        bal += delta;
        balV += delta * mult;
        return { ...r, runningBalance: bal, runningValuated: balV };
      })
    );
  }

  // ── 5) إجماليات لكل عملة
  type Totals = {
    currency: string;
    debit: number;
    credit: number;
    balance: number;
    balanceValuated: number;
    opening: number;
    openingValuated: number;
  };
  const totalsByCurrency: Totals[] = [];
  for (const cur of currenciesPresent) {
    const arr = rowsByCurrency.get(cur) ?? [];
    let debit = 0;
    let credit = 0;
    for (const r of arr) {
      debit += r.debit ?? 0;
      credit += r.credit ?? 0;
    }
    const opening = openingByCurrency.get(cur) ?? 0;
    const mult = multipliers.get(cur) ?? 1;
    const balance = opening + debit - credit;
    totalsByCurrency.push({
      currency: cur,
      debit,
      credit,
      balance,
      balanceValuated: balance * mult,
      opening,
      openingValuated: opening * mult,
    });
  }

  // ── 6) تركيب الـ HTML
  const metaItems = [
    { label: 'من تاريخ', value: formatDate(data.fromDate) },
    { label: 'إلى تاريخ', value: formatDate(data.toDate) },
    { label: 'الحساب', value: escapeHtml(accountLine) },
    { label: 'فلتر العرض', value: escapeHtml(data.currency || 'الكل') },
    { label: 'العملة الأساسية (تقييم)', value: escapeHtml(base) },
  ];
  const metaHtml = metaItems
    .map(m => `<div class="item"><span class="label">${m.label}</span><span class="value">${m.value}</span></div>`)
    .join('');

  // ── 7) جدول واحد لكل عملة
  const buildCurrencyTable = (cur: string, rows: EnrichedRow[], totals: Totals): string => {
    const showOpeningRow = totals.opening !== 0 || totals.openingValuated !== 0;
    const colspan = isAll ? 5 : 4; // # / تاريخ / سند [/ حساب] / بيان

    const openingRow = showOpeningRow
      ? `<tr class="opening-row">
           <td class="center">—</td>
           <td>${formatDate(data.fromDate)}</td>
           <td class="center">—</td>
           ${isAll ? '<td>—</td>' : ''}
           <td><em>رصيد افتتاحي</em></td>
           <td class="left num">—</td>
           <td class="left num">—</td>
           <td class="left num">${totals.opening !== 0 ? formatAmount(totals.opening) : '—'}</td>
           <td class="left num">${formatAmount(totals.openingValuated)}</td>
           <td class="center">${escapeHtml(cur)}</td>
         </tr>`
      : '';

    const rowsHtml = rows
      .map((r, idx) => {
        const entryCell = r.voucherNumber
          ? `<strong class="num">${escapeHtml(r.voucherNumber)}</strong><br><span class="num" style="font-size:9px;color:#777">#${escapeHtml(r.entryNumber)}</span>`
          : `<span class="num">#${escapeHtml(r.entryNumber)}</span>`;
        return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${formatDate(r.date)}</td>
        <td class="center">${entryCell}</td>
        ${isAll ? `<td><span class="num">${escapeHtml(r.accountCode)}</span> - ${escapeHtml(r.accountName)}</td>` : ''}
        <td>${escapeHtml(r.lineDescription || r.description || '—')}</td>
        <td class="left num">${r.debit > 0 ? formatAmount(r.debit) : '—'}</td>
        <td class="left num">${r.credit > 0 ? formatAmount(r.credit) : '—'}</td>
        <td class="left num"><strong>${formatAmount(r.runningBalance)}</strong></td>
        <td class="left num"><strong>${formatAmount(r.runningValuated)}</strong></td>
        <td class="center">${escapeHtml(r.currency)}</td>
      </tr>`;
      })
      .join('');

    const labelText = totals.opening
      ? `الإجمالي (شامل افتتاحي ${formatAmount(totals.opening)})`
      : 'الإجمالي';

    return `
      <section class="ccy-block">
        <header class="ccy-head">
          <div class="ccy-head-left">
            <span class="ccy-badge">${escapeHtml(cur)}</span>
            <span class="ccy-title">حركات العملة • ${escapeHtml(cur)}</span>
            <span class="ccy-count">(${rows.length} حركة)</span>
          </div>
          <div class="ccy-summary">
            <span>مدين: <b class="num c-debit">${formatAmount(totals.debit)}</b></span>
            <span>دائن: <b class="num c-credit">${formatAmount(totals.credit)}</b></span>
            <span>الرصيد: <b class="num c-balance">${formatAmount(totals.balance)}</b></span>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:30px">#</th>
              <th style="width:80px">التاريخ</th>
              <th class="center" style="width:90px">السند / القيد</th>
              ${isAll ? '<th>الحساب</th>' : ''}
              <th>البيان</th>
              <th class="left" style="width:90px">مدين</th>
              <th class="left" style="width:90px">دائن</th>
              <th class="left" style="width:100px">الرصيد</th>
              <th class="left" style="width:110px">رصيد مقوم (${escapeHtml(base)})</th>
              <th class="center" style="width:50px">العملة</th>
            </tr>
          </thead>
          <tbody>
            ${openingRow}
            ${rowsHtml || `<tr><td colspan="${colspan + 5}" class="center" style="padding:18px;color:#888">لا توجد حركات</td></tr>`}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <th colspan="${colspan}" class="right">${labelText}</th>
              <th class="left num c-debit">${formatAmount(totals.debit)}</th>
              <th class="left num c-credit">${formatAmount(totals.credit)}</th>
              <th class="left num c-balance">${formatAmount(totals.balance)}</th>
              <th class="left num c-valuated">${formatAmount(totals.balanceValuated)}</th>
              <th class="center"><b>${escapeHtml(cur)}</b></th>
            </tr>
          </tfoot>
        </table>
      </section>`;
  };

  const ccyTablesHtml = currenciesPresent.length
    ? currenciesPresent
        .map(cur =>
          buildCurrencyTable(
            cur,
            rowsByCurrency.get(cur) ?? [],
            totalsByCurrency.find(t => t.currency === cur) ?? {
              currency: cur,
              debit: 0,
              credit: 0,
              balance: 0,
              balanceValuated: 0,
              opening: 0,
              openingValuated: 0,
            }
          )
        )
        // ‎فاصل بصري بارز بين كل كتلتي عملة
        .join('<hr class="ccy-divider" />\n')
    : `<div style="padding:18px;text-align:center;color:#888;border:1px dashed #ccc;border-radius:6px">لا توجد حركات للمعايير المحددة</div>`;

  const fxWarn = data.fxUsedFallback
    ? `<div style="margin-top:10px;font-size:10px;color:#856404;background:#fff3cd;padding:8px;border-radius:4px;border:1px solid #ffeeba">تنبيه: استُخدم مضاعف 1 لعملات دون سعر صرف في إعدادات الشركة.</div>`
    : '';

  // بطاقة الإجمالي المُقوَّم بالعملة الأساسية (مطابقة لشكل الواجهة)
  const baseTotalsHtml = `
    <section class="base-summary">
      <header class="base-summary-head">
        <span>⚖️ الإجمالي المُقوَّم بالعملة الأساسية (${escapeHtml(base)})</span>
      </header>
      <div class="base-summary-grid">
        <div class="bs-cell">
          <div class="bs-label">الرصيد الافتتاحي</div>
          <div class="bs-value num c-opening">${formatAmount(data.openingBalanceValuated ?? data.openingBalance)}</div>
        </div>
        <div class="bs-cell">
          <div class="bs-label">إجمالي المدين</div>
          <div class="bs-value num c-debit">${formatAmount(data.totalDebitValuated ?? data.totalDebit)}</div>
        </div>
        <div class="bs-cell">
          <div class="bs-label">إجمالي الدائن</div>
          <div class="bs-value num c-credit">${formatAmount(data.totalCreditValuated ?? data.totalCredit)}</div>
        </div>
        <div class="bs-cell highlight">
          <div class="bs-label">الرصيد الختامي</div>
          <div class="bs-value num c-balance"><b>${formatAmount(data.closingBalanceValuated ?? data.closingBalance)}</b></div>
        </div>
      </div>
      ${
        currenciesPresent.length > 1
          ? `<div class="base-summary-foot">
               تم تجميع المجاميع من <b>${currenciesPresent.length}</b> عملات مختلفة وتقويمها بالعملة الأساسية${
                 data.fxBulletinName ? ` باستخدام نشرة <b>${escapeHtml(data.fxBulletinName)}</b>` : ''
               }.
             </div>`
          : ''
      }
    </section>`;

  const styles = `
    /* فاصل واضح بين كتل العملات + هامش أكبر + ظل */
    .ccy-block { margin: 22px 0; border: 2px solid #1d4ed8; border-radius: 10px; overflow: hidden; page-break-inside: avoid; box-shadow: 0 2px 8px rgba(29,78,216,.08); }
    .ccy-block + .ccy-block { margin-top: 28px; page-break-before: auto; }
    /* فاصل أفقي ظاهر بين العملات (نحت مزخرف) */
    .ccy-divider { height: 0; margin: 26px 0 0; border: 0; border-top: 3px double #1d4ed8; position: relative; }
    .ccy-divider::after { content: '◆'; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff; color: #1d4ed8; padding: 0 8px; font-size: 14px; }
    .ccy-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 8px 12px; background: linear-gradient(180deg,#dbe7ff 0%, #c8d8f8 100%); border-bottom: 2px solid #1d4ed8; flex-wrap: wrap; }
    .ccy-head-left { display:flex; align-items:center; gap:10px; }
    .ccy-badge { display:inline-flex; align-items:center; padding: 5px 14px; border-radius:6px; background:#1d4ed8; color:#fff; font-weight:800; font-size: 13px; letter-spacing: 1px; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    .ccy-title { font-size: 12px; font-weight: 700; color:#1d4ed8; }
    .ccy-count { font-size: 10.5px; color:#445; }
    .ccy-summary { display:flex; gap:12px; font-size: 10.5px; color:#345; }
    .ccy-summary b.num { font-weight: 700; }
    .ccy-block table { margin: 0; width:100%; border-collapse: collapse; }
    /* color: #1a242f مطلوب لتجاوز color:#fff الموروثة من thead th العامة في PRINT_STYLES */
    .ccy-block table thead th { background:#f6f8fa; color:#1a242f; border-bottom: 1.5px solid #c8d0d8; padding: 6px 5px; font-size: 10.5px; font-weight: 700; }
    .ccy-block table tbody td { padding: 4px 5px; border-bottom: 1px dashed #e5e9ee; font-size: 10.5px; }
    .ccy-block table tbody tr:nth-child(even) td { background:#fafbfc; }
    .ccy-block .opening-row td { background:#f0f3f6 !important; font-weight: 600; }
    .ccy-block .totals-row th { background:#e8eef5; color:#1a242f; border-top: 2px solid #c8d0d8; padding: 7px 5px; font-size: 11px; }
    .num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
    .c-debit { color:#0d8050; }
    .c-credit { color:#b3262a; }
    .c-balance { color:#1f6feb; }
    .c-valuated { color:#7a4f01; }
    .c-opening { color:#1d4ed8; }

    .base-summary { margin-top: 16px; border: 1.5px solid #1f6feb; border-radius: 8px; overflow: hidden; background:#f0f6ff; page-break-inside: avoid; }
    .base-summary-head { padding: 7px 12px; background:#dbe7ff; color:#1d4ed8; font-weight: 700; font-size: 11.5px; border-bottom: 1px solid #c4d4ff; }
    .base-summary-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px; }
    .bs-cell { background:#fff; border: 1px solid #d6dde5; border-radius: 6px; padding: 7px 9px; }
    .bs-cell.highlight { border-color:#1d4ed8; box-shadow: inset 0 0 0 1px #c4d4ff; background:#f5faff; }
    .bs-label { font-size: 9.5px; color:#566; }
    .bs-value { font-size: 14px; font-weight: 700; margin-top: 2px; }
    .base-summary-foot { padding: 6px 12px; background:#e8eeff; border-top: 1px solid #c4d4ff; font-size: 9.5px; color:#345; }

    @media print {
      .ccy-block, .base-summary { box-shadow: none; }
    }
  `;

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">كشف حساب</div>
    <div class="doc-meta">${metaHtml}</div>

    <style>${styles}</style>

    ${ccyTablesHtml}

    ${fxWarn}

    ${baseTotalsHtml}

    ${buildFooter(company, 'كشف حساب')}
  `;

  openPrintWindow(html, `كشف حساب - ${accountLine}`);
}

/* ────────────────────────────────────────────────────────────
   طباعة سند منفرد (قبض / دفع) — ورقة A4 مقسَّمة لنسختين
   ──────────────────────────────────────────────────────────── */

export interface PrintSingleVoucherInput {
  entry: JournalEntryDto;
  voucherTypeName: string;
  voucherNature: 'Debit' | 'Credit' | 'Mixed';
  cashBoxName: string;
  counterAccountName: string;
  counterAccountCode?: string | null;
  company: CompanySettingsDto | null;
}

const SINGLE_VOUCHER_STYLES = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { background: #e9ecef; }
  body { font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif; margin: 0; padding: 0; color: #111; direction: rtl; }

  .preview-toolbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #2c3e50; color: #fff; padding: 8px 16px; border-bottom: 2px solid #1a242f; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .preview-toolbar .title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .preview-toolbar .actions { display: flex; gap: 8px; }
  .preview-toolbar button { background: #fff; color: #2c3e50; border: 0; border-radius: 4px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
  .preview-toolbar button:hover { background: #ecf0f1; transform: translateY(-1px); }
  .preview-toolbar button.primary { background: #27ae60; color: #fff; }
  .preview-toolbar button.primary:hover { background: #229954; }
  .preview-toolbar button.danger { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); }
  .preview-toolbar button.danger:hover { background: rgba(255,255,255,.1); }
  .preview-toolbar svg { width: 14px; height: 14px; }

  .a4-sheet {
    width: 210mm; min-height: 297mm; margin: 16px auto;
    background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.12);
    display: flex; flex-direction: column;
  }
  .voucher-copy {
    height: 148.5mm; padding: 8mm 10mm;
    display: flex; flex-direction: column; position: relative;
  }
  .copy-divider {
    border: 0; border-top: 2px dashed #333; margin: 0;
    position: relative; text-align: center;
  }
  .copy-divider::after {
    content: '\\2702  قص هنا  \\2702';
    position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
    background: #fff; padding: 0 12px; color: #555; font-size: 11px; letter-spacing: 1px;
  }

  .v-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1.5px solid #222; padding-bottom: 6px; }
  .v-head .brand { display: flex; align-items: center; gap: 10px; flex: 1; }
  .v-head .brand img.logo { width: 48px; height: 48px; object-fit: contain; }
  .v-head .brand .titles h1 { margin: 0; font-size: 14px; font-weight: 700; }
  .v-head .brand .titles .sub-en { font-size: 9px; color: #666; margin-top: 1px; }
  .v-head .brand .titles .contact { margin-top: 3px; font-size: 9px; color: #555; }
  .v-head .brand .titles .contact span + span { margin-right: 6px; }
  .v-head .v-head-right { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .v-head .copy-label {
    border: 1.5px solid #2c3e50; color: #2c3e50; border-radius: 4px;
    padding: 4px 10px; font-size: 11px; font-weight: 700; white-space: nowrap;
  }
  .v-head .copy-label.customer { color: #8e44ad; border-color: #8e44ad; }
  .v-head .printed-at {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 9px; color: #666; white-space: nowrap;
    background: #f5f5f5; border: 1px dashed #bbb; border-radius: 3px;
    padding: 2px 6px;
  }
  .v-head .printed-at .lbl { color: #888; }
  .v-head .printed-at .val { font-family: 'Consolas', 'Menlo', monospace; color: #333; font-weight: 600; }

  .v-title-row { display: flex; align-items: center; justify-content: space-between; margin: 6mm 0 4mm; gap: 8px; }
  .v-title-row .v-title {
    font-size: 22px; font-weight: 800; color: #1a242f; padding: 4px 18px;
    border: 2px solid #1a242f; border-radius: 6px; letter-spacing: 1px;
  }
  .v-title-row .v-title.receipt { color: #155724; border-color: #155724; background: #eafaf0; }
  .v-title-row .v-title.payment { color: #721c24; border-color: #721c24; background: #fcecee; }
  .v-title-row .v-meta { display: flex; gap: 14px; font-size: 12px; }
  .v-title-row .v-meta .item { background: #f5f5f5; padding: 4px 10px; border-radius: 4px; }
  .v-title-row .v-meta .item .lbl { color: #555; font-size: 10px; margin-left: 4px; }

  .v-statement { margin: 2mm 0 3mm; font-size: 13px; line-height: 1.8; }
  .v-statement .field {
    display: inline-block; min-width: 120mm; border-bottom: 1px dotted #777;
    padding: 0 6px; font-weight: 700; margin: 0 4px;
  }
  .v-amount-box {
    background: #fff8e1; border: 1.5px solid #d4a017; border-radius: 6px;
    padding: 6px 12px; display: inline-flex; align-items: center; gap: 10px;
    font-size: 15px; font-weight: 700; margin: 0 4px;
  }
  .v-amount-box .currency { font-size: 11px; color: #555; }

  .v-amount-words {
    margin: 2mm 0 3mm; padding: 5px 10px;
    background: #fff8e1; border-right: 3px solid #d4a017; border-radius: 4px;
    font-size: 12px; line-height: 1.7;
  }
  .v-amount-words .lbl { color: #8a6d00; font-weight: 600; margin-left: 6px; }
  .v-amount-words .val { font-weight: 700; color: #333; }

  .v-info-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4mm;
    margin: 3mm 0; font-size: 11px;
  }
  .v-info-grid .cell {
    background: #f5f7fa; padding: 5px 8px; border-radius: 4px;
    border-right: 3px solid #2c3e50;
  }
  .v-info-grid .cell .lbl { color: #555; font-size: 10px; display: block; margin-bottom: 2px; }
  .v-info-grid .cell .val { font-weight: 600; font-size: 12px; }

  .v-desc {
    background: #f8f9fa; border-right: 3px solid #555; padding: 5px 10px;
    font-size: 11px; margin: 2mm 0; min-height: 16mm;
  }
  .v-desc .lbl { color: #555; font-size: 10px; margin-bottom: 2px; display: block; }
  .v-desc .val { font-weight: 500; }

  .v-signatures {
    margin-top: auto; padding-top: 6mm; display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 16mm; font-size: 11px; text-align: center;
  }
  .v-signatures .sig { border-top: 1.5px solid #444; padding-top: 4px; }
  .v-signatures .sig .role { font-weight: 700; color: #2c3e50; font-size: 11px; }
  .v-signatures .sig .name { font-size: 10px; color: #555; margin-top: 2px; min-height: 12px; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; margin: 0; padding: 0; width: 210mm; }
    .preview-toolbar { display: none !important; }
    /* ‎الورقة بالضبط حجم صفحة A4 — overflow:hidden يقص أي fraction يدفع
       ‎المحتوى لصفحة ثانية فارغة (مشكلة شائعة في iOS Safari) */
    .a4-sheet {
      margin: 0; box-shadow: none;
      width: 210mm; height: 297mm; max-height: 297mm;
      overflow: hidden;
      page-break-after: avoid; break-after: avoid-page;
    }
    .voucher-copy {
      height: 148.5mm; max-height: 148.5mm;
      page-break-inside: avoid; break-inside: avoid-page;
      overflow: hidden;
    }
    .copy-divider { page-break-after: avoid; break-after: avoid; }
    /* ‎عنصر آخر في الجسم لا يدفع لصفحة ثالثة */
    body > *:last-child { page-break-after: avoid; break-after: avoid-page; }
  }

  /* ‎شاشات ضيقة (موبايل): الورقة A4 لا تتسع 210mm فيُقطع المحتوى من الجوانب.
     ‎الحل: عرض كامل + تخفيض الهوامش الداخلية + تكييف الشبكات. */
  @media screen and (max-width: 800px) {
    body { background: #f1f3f5; }
    .a4-sheet { width: 100%; min-height: 0; margin: 8px 0; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    .voucher-copy { height: auto; padding: 4mm 4mm; }
    .v-head { flex-wrap: wrap; gap: 6px; }
    .v-head .brand { min-width: 0; }
    .v-head .brand .titles h1 { font-size: 13px; }
    .v-head .brand img.logo { width: 36px; height: 36px; }
    .v-title-row { flex-wrap: wrap; gap: 6px; margin: 4mm 0 3mm; }
    .v-title-row .v-title { font-size: 18px; padding: 4px 12px; }
    .v-title-row .v-meta { gap: 6px; flex-wrap: wrap; }
    .v-statement { font-size: 12px; line-height: 1.7; }
    .v-statement .field { min-width: 0; display: inline; word-break: break-word; }
    .v-amount-box { font-size: 13px; padding: 4px 8px; }
    .v-info-grid { grid-template-columns: 1fr; gap: 2mm; }
    .v-signatures { grid-template-columns: 1fr 1fr; gap: 6mm; padding-top: 4mm; }
    .v-desc { min-height: 10mm; }
  }
`;

function openSingleVoucherWindow(html: string, title: string) {
  const fullDoc = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${SINGLE_VOUCHER_STYLES}</style>
</head>
<body>
  ${html}
</body>
</html>`;
  openPrintPreview(fullDoc, title);
}

function buildVoucherMiniHeader(
  company: CompanySettingsDto | null,
  copyLabel: string,
  copyKind: 'company' | 'customer',
  printedAt: string,
): string {
  const c = company || ({} as CompanySettingsDto);
  const heading = c.printHeader || c.nameAr || 'الشركة';
  const logo = c.logoBase64 ? `<img class="logo" src="${escapeHtml(c.logoBase64)}" alt="logo">` : '';
  const contactBits: string[] = [];
  if (c.address) contactBits.push(`<span>${escapeHtml(c.address)}</span>`);
  if (c.phone) contactBits.push(`<span>هاتف: ${escapeHtml(c.phone)}</span>`);
  const contact = contactBits.length ? `<div class="contact">${contactBits.join(' • ')}</div>` : '';
  const subEn = c.nameEn ? `<div class="sub-en">${escapeHtml(c.nameEn)}</div>` : '';

  return `
    <div class="v-head">
      <div class="brand">
        ${logo}
        <div class="titles">
          <h1>${escapeHtml(heading)}</h1>
          ${subEn}
          ${contact}
        </div>
      </div>
      <div class="v-head-right">
        <div class="copy-label ${copyKind}">${escapeHtml(copyLabel)}</div>
        <div class="printed-at" title="تاريخ ووقت طباعة هذا السند">
          <span class="lbl">طُبع في:</span>
          <span class="val">${escapeHtml(printedAt)}</span>
        </div>
      </div>
    </div>
  `;
}

function buildVoucherCopy(
  input: PrintSingleVoucherInput,
  copyLabel: string,
  copyKind: 'company' | 'customer',
  printedAt: string,
): string {
  const { entry, voucherTypeName, voucherNature, cashBoxName, counterAccountName, counterAccountCode, company } = input;

  // ‎الصياغة تعتمد على جانب الصندوق في القيد:
  //   • سند قبض (nature = Debit  / مدين على الصندوق) → استلمنا من السيد  (المال يدخل الصندوق — أخضر)
  //   • سند دفع (nature = Credit / دائن من الصندوق) → صرفنا للسيد        (المال يخرج من الصندوق — أحمر)
  //
  // ‎ملاحظة: nature في النظام تُمثّل جانب الصندوق (الحساب الافتراضي) لا الطرف المقابل.

  const amount = entry.totalDebit || entry.totalCredit;
  const currency = entry.currency || 'IQD';

  const isReceipt = voucherNature === 'Debit';   // سند قبض: الصندوق مدين
  const isPayment = voucherNature === 'Credit';  // سند دفع: الصندوق دائن

  const titleCls = isReceipt ? 'receipt' : isPayment ? 'payment' : '';
  const statementVerb =
    isReceipt ? 'استلمنا من السيِّد / السادة:' :
    isPayment ? 'صرفنا للسيِّد / السادة:' :
    'الطرف الآخر:';

  // ‎تفقيط المبلغ بالعربية: مثلاً "فقط مئة ألف دينار عراقي لا غير"
  const amountInWords = tafqeet(amount, { currency });

  // الطرف الآخر:
  //   • قبض: العميل/المصدر هو "المسلِّم" (سلّمنا المال)
  //   • دفع: العميل/المستفيد هو "المستلِم" (استلم منّا المال)
  const counterRoleAr =
    isReceipt ? 'المسلِّم' :
    isPayment ? 'المستلِم' :
    'الطرف الآخر';

  const counterFull = counterAccountCode
    ? `${counterAccountCode} — ${counterAccountName}`
    : counterAccountName;

  return `
    <section class="voucher-copy">
      ${buildVoucherMiniHeader(company, copyLabel, copyKind, printedAt)}

      <div class="v-title-row">
        <div class="v-title ${titleCls}">${escapeHtml(voucherTypeName)}</div>
        <div class="v-meta">
          ${entry.voucherNumber
            ? `<div class="item"><span class="lbl">رقم السند:</span><strong class="num" style="font-size:15px">${escapeHtml(entry.voucherNumber)}</strong></div>
               <div class="item"><span class="lbl">رقم القيد:</span><strong class="num" style="color:#666">#${escapeHtml(entry.entryNumber)}</strong></div>`
            : `<div class="item"><span class="lbl">رقم السند:</span><strong class="num">${escapeHtml(entry.entryNumber)}</strong></div>`
          }
          <div class="item"><span class="lbl">تاريخ القيد:</span><strong>${formatDate(entry.entryDate)}</strong></div>
        </div>
      </div>

      <div class="v-statement">
        ${escapeHtml(statementVerb)}
        <span class="field">${escapeHtml(counterFull)}</span>
        <br/>
        مبلغاً وقدره:
        <span class="v-amount-box">
          <span class="num">${formatAmount(amount)}</span>
          <span class="currency">${escapeHtml(currency)}</span>
        </span>
      </div>

      <div class="v-amount-words">
        <span class="lbl">المبلغ كتابةً:</span>
        <span class="val">${escapeHtml(amountInWords)}</span>
      </div>

      <div class="v-info-grid">
        <div class="cell">
          <span class="lbl">نوع القيد</span>
          <span class="val">${escapeHtml(voucherTypeName)}</span>
        </div>
        <div class="cell">
          <span class="lbl">الصندوق</span>
          <span class="val">${escapeHtml(cashBoxName)}</span>
        </div>
      </div>

      <div class="v-desc">
        <span class="lbl">وذلك عن (البيان):</span>
        <span class="val">${escapeHtml(entry.description) || '—'}</span>
      </div>

      <div class="v-signatures">
        <div class="sig">
          <div class="role">أمين الصندوق</div>
          <div class="name">${escapeHtml(cashBoxName)}</div>
        </div>
        <div class="sig">
          <div class="role">${escapeHtml(counterRoleAr)}</div>
          <div class="name">${escapeHtml(counterAccountName)}</div>
        </div>
        <div class="sig">
          <div class="role">المدير العام</div>
          <div class="name">&nbsp;</div>
        </div>
      </div>
    </section>
  `;
}

export function printSingleVoucher(input: PrintSingleVoucherInput) {
  const { entry, voucherTypeName } = input;
  // وقت الطباعة موحَّد للنسختين (الشركة والزبون) — لضمان توافقهما حتى لو طُبعتا
  // بفارق ميلي‑ثانية، ولكي تتطابق العلامة الزمنية على ورقة واحدة.
  const printedAt = new Date().toLocaleString('ar-IQ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const html = `
    <div class="a4-sheet">
      ${buildVoucherCopy(input, 'نسخة الشركة', 'company', printedAt)}
      <hr class="copy-divider" />
      ${buildVoucherCopy(input, 'نسخة الزبون', 'customer', printedAt)}
    </div>
  `;

  // ‎عنوان النافذة/التبويب يفضّل رقم السند المخصّص (مثل RV-2) لسهولة التمييز،
  // ‎ويُلحَق رقم القيد الداخلي بين قوسين كمرجع.
  const titleNumber = entry.voucherNumber
    ? `${entry.voucherNumber} (قيد #${entry.entryNumber})`
    : `رقم ${entry.entryNumber}`;
  openSingleVoucherWindow(html, `${voucherTypeName} ${titleNumber}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// طباعة ميزان المراجعة (Trial Balance)
// ═══════════════════════════════════════════════════════════════════════════

const TRIAL_BALANCE_TYPE_LABELS: Record<string, string> = {
  Asset: 'أصول',
  Liability: 'خصوم',
  Equity: 'حقوق ملكية',
  Revenue: 'إيرادات',
  Expense: 'مصاريف',
};

const TRIAL_BALANCE_TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Asset:     { bg: '#dbeafe', fg: '#1d4ed8' },
  Liability: { bg: '#fef3c7', fg: '#a16207' },
  Equity:    { bg: '#ede9fe', fg: '#6d28d9' },
  Revenue:   { bg: '#d1fae5', fg: '#047857' },
  Expense:   { bg: '#fee2e2', fg: '#b91c1c' },
};

/** تنسيق رقم محاسبي للطباعة: 0 → "—" والسالب بين قوسين. */
function tbFmt(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  return formatAmount(n, 2);
}

export function printTrialBalance(
  data: TrialBalanceDto,
  company: CompanySettingsDto | null = null,
) {
  const printedAt = new Date().toLocaleString('ar-IQ');
  const displayUnit = data.currency
    ? data.currency
    : (data.valuated ? (data.baseCurrency || 'IQD') : 'متعددة');

  const isBalanced = Math.abs(data.totalClosingDebit - data.totalClosingCredit) < 0.01;

  const rows = data.rows.map(r => {
    const indent = Math.max(0, (r.level - 1)) * 10;
    const colors = TRIAL_BALANCE_TYPE_COLORS[r.accountType] ?? { bg: '#e5e7eb', fg: '#374151' };
    const typeLabel = TRIAL_BALANCE_TYPE_LABELS[r.accountType] ?? r.accountType;
    const rowBg = r.isLeaf ? '' : 'background:#f3f4f6;font-weight:600;';
    return `
      <tr style="${rowBg}">
        <td class="center num" style="white-space:nowrap;">${escapeHtml(r.accountCode)}</td>
        <td><span style="padding-inline-start:${indent}px;">${escapeHtml(r.accountName)}</span></td>
        <td class="center">
          <span class="badge" style="background:${colors.bg};color:${colors.fg};border:1px solid ${colors.fg}33;">${escapeHtml(typeLabel)}</span>
        </td>
        <td class="left num" style="border-right:1px solid #aaa;">${tbFmt(r.openingDebit)}</td>
        <td class="left num">${tbFmt(r.openingCredit)}</td>
        <td class="left num" style="border-right:1px solid #aaa;">${tbFmt(r.periodDebit)}</td>
        <td class="left num">${tbFmt(r.periodCredit)}</td>
        <td class="left num" style="border-right:1px solid #aaa;color:#047857;font-weight:600;">${tbFmt(r.closingDebit)}</td>
        <td class="left num" style="color:#b45309;font-weight:600;">${tbFmt(r.closingCredit)}</td>
      </tr>
    `;
  }).join('');

  const profitLabel = data.netIncome >= 0 ? 'صافي الربح' : 'صافي الخسارة';
  const profitColor = data.netIncome >= 0 ? '#047857' : '#b91c1c';
  const profitInWords = tafqeet(Math.abs(data.netIncome), {
    currency: displayUnit === 'متعددة' ? (data.baseCurrency || 'IQD') : displayUnit,
  });

  const filterChips: string[] = [];
  filterChips.push(`<span class="chip">من <strong class="num">${escapeHtml(formatDate(data.fromDate))}</strong></span>`);
  filterChips.push(`<span class="chip">إلى <strong class="num">${escapeHtml(formatDate(data.toDate))}</strong></span>`);
  filterChips.push(`<span class="chip">العملة: <strong>${escapeHtml(displayUnit)}</strong></span>`);
  if (data.leavesOnly) filterChips.push(`<span class="chip">الأبناء فقط</span>`);
  if (data.maxLevel != null) filterChips.push(`<span class="chip">حتى مستوى ${data.maxLevel}</span>`);
  if (data.valuated && !data.currency) {
    filterChips.push(`<span class="chip" style="background:#d1fae5;color:#047857;">مبالغ مقوَّمة</span>`);
  }
  if (data.fxBulletinName) {
    filterChips.push(`<span class="chip" style="background:#eef2ff;color:#4338ca;">نشرة: ${escapeHtml(data.fxBulletinName)}</span>`);
  }

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">ميزان المراجعة — الأرصدة المدينة والدائنة</div>

    <div class="tb-filters">${filterChips.join(' ')}</div>

    ${data.fxUsedFallback ? `
      <div class="tb-alert">
        ⚠ عملة واحدة على الأقل لا تملك سعر صرف في النشرة المنشورة — استُعمل مضاعف 1 لها (قد لا تكون الأرقام دقيقة).
      </div>
    ` : ''}

    <table class="tb-table">
      <thead>
        <tr>
          <th rowspan="2" class="center" style="width:60px;">الكود</th>
          <th rowspan="2" class="right">الحساب</th>
          <th rowspan="2" class="center" style="width:80px;">النوع</th>
          <th colspan="2" class="center" style="background:#475569;">الفترة السابقة (الافتتاحي)</th>
          <th colspan="2" class="center" style="background:#1d4ed8;">حركة الفترة الحالية</th>
          <th colspan="2" class="center" style="background:#b45309;">الرصيد النهائي</th>
        </tr>
        <tr>
          <th class="center" style="background:#64748b;">مدين</th>
          <th class="center" style="background:#64748b;">دائن</th>
          <th class="center" style="background:#2563eb;">مدين</th>
          <th class="center" style="background:#2563eb;">دائن</th>
          <th class="center" style="background:#d97706;">مدين</th>
          <th class="center" style="background:#d97706;">دائن</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="center" style="background:#ecf0f1;">الإجمالي</th>
          <th class="left num" style="border-right:1px solid #aaa;">${tbFmt(data.totalOpeningDebit)}</th>
          <th class="left num">${tbFmt(data.totalOpeningCredit)}</th>
          <th class="left num" style="border-right:1px solid #aaa;">${tbFmt(data.totalPeriodDebit)}</th>
          <th class="left num">${tbFmt(data.totalPeriodCredit)}</th>
          <th class="left num" style="border-right:1px solid #aaa;color:#047857;">${tbFmt(data.totalClosingDebit)}</th>
          <th class="left num" style="color:#b45309;">${tbFmt(data.totalClosingCredit)}</th>
        </tr>
      </tfoot>
    </table>

    <div class="tb-balance-badge">
      ${isBalanced
        ? '<span style="background:#d1fae5;color:#047857;">✓ الميزان متوازن</span>'
        : '<span style="background:#fee2e2;color:#b91c1c;">× الميزان غير متوازن</span>'}
    </div>

    <div class="tb-profit-card">
      <div class="tb-profit-title">نتيجة الفترة (طريقة احتساب الأرباح)</div>
      <table class="tb-profit-grid">
        <tr>
          <td class="lbl">إجمالي الإيرادات</td>
          <td class="val num" style="color:#047857;">${formatAmount(data.totalRevenue, 2)}</td>
          <td class="lbl">إجمالي المصاريف</td>
          <td class="val num" style="color:#b91c1c;">${formatAmount(data.totalExpense, 2)}</td>
          <td class="lbl">${profitLabel}</td>
          <td class="val num" style="color:${profitColor};font-size:14px;">${formatAmount(Math.abs(data.netIncome), 2)}</td>
        </tr>
      </table>
      <div class="tb-profit-words">
        <span class="lbl">المبلغ كتابةً:</span>
        <span class="val">${escapeHtml(profitInWords)}</span>
      </div>
      <div class="tb-formula">
        المعادلة: صافي الربح = Σ(دائن − مدين) للإيرادات − Σ(مدين − دائن) للمصاريف
      </div>
    </div>

    <div class="signatures">
      <div class="sig">المحاسب</div>
      <div class="sig">المدقّق</div>
      <div class="sig">المدير المالي</div>
    </div>

    ${buildFooter(company, 'ميزان المراجعة — مولَّد إلكترونياً')}
  `;

  // ‎ستايلات إضافية للطباعة (تنسيقات خاصة بميزان المراجعة)
  const extraStyles = `
    .tb-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
    .tb-filters .chip { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 999px; padding: 3px 10px; font-size: 11px; color: #374151; }
    .tb-alert { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 11px; color: #92400e; }
    .tb-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 6px; }
    .tb-table th, .tb-table td { border: 1px solid #94a3b8; padding: 4px 6px; }
    .tb-table thead th { color: #fff; font-weight: 600; font-size: 11px; }
    .tb-table tfoot th { background: #ecf0f1; color: #111; font-weight: 700; }
    .tb-balance-badge { text-align: center; margin: 10px 0; }
    .tb-balance-badge span { display: inline-block; padding: 4px 16px; border-radius: 999px; font-weight: 700; font-size: 12px; }
    .tb-profit-card { margin-top: 14px; border: 2px solid #d4a017; background: #fffbeb; border-radius: 6px; padding: 10px 12px; }
    .tb-profit-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; text-align: center; border-bottom: 1px dashed #d4a017; padding-bottom: 4px; }
    .tb-profit-grid { width: 100%; border-collapse: separate; border-spacing: 6px 2px; font-size: 11px; }
    .tb-profit-grid .lbl { color: #555; font-weight: 600; white-space: nowrap; }
    .tb-profit-grid .val { font-weight: 700; text-align: left; padding-inline-end: 8px; }
    .tb-profit-words { margin-top: 8px; background: #fff; border-right: 3px solid #d4a017; padding: 6px 10px; border-radius: 4px; font-size: 11.5px; line-height: 1.7; }
    .tb-profit-words .lbl { color: #92400e; font-weight: 600; margin-left: 6px; }
    .tb-profit-words .val { font-weight: 700; color: #1f2937; }
    .tb-formula { margin-top: 6px; text-align: center; font-size: 10px; color: #6b7280; font-style: italic; }
  `;

  openTrialBalanceWindow(html, 'ميزان المراجعة', extraStyles);
}

/** نافذة طباعة خاصة بميزان المراجعة — تشمل ستايلاته المخصّصة. */
function openTrialBalanceWindow(html: string, title: string, extraStyles: string) {
  const fullDoc = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}${extraStyles}
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 297mm; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;
  openPrintPreview(fullDoc, title);
}

// ═══════════════════════════════════════════════════════════════════════════
// طباعة أرصدة الصناديق (Cash Box Balances)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * شكل بيانات رصيد الصندوق المتوقَّع من الـ API. مكرَّر هنا بدلاً من استيراده
 * من ملف الـ API لتجنُّب اعتماد دائري بين utilities و api layer.
 */
export interface PrintCashBoxBalance {
  cashBoxId: number;
  code: string;
  nameAr: string;
  accountId: number;
  accountCode?: string | null;
  accountName?: string | null;
  currency: string;
  debit: number;
  credit: number;
  balance: number;
  debitLimit?: number | null;
  creditLimit?: number | null;
}

export function printCashBoxBalances(
  balances: PrintCashBoxBalance[],
  company: CompanySettingsDto | null = null,
) {
  const printedAt = new Date().toLocaleString('ar-IQ');

  // ‎تجميع الأرصدة حسب الصندوق ليُظهر الصندوق مرة واحدة بصفّ مع عدّة عملات داخله.
  const grouped = new Map<number, { box: PrintCashBoxBalance; rows: PrintCashBoxBalance[] }>();
  for (const r of balances) {
    const existing = grouped.get(r.cashBoxId);
    if (existing) existing.rows.push(r);
    else grouped.set(r.cashBoxId, { box: r, rows: [r] });
  }

  // ‎الإجماليات حسب العملة عبر كل الصناديق.
  const totalsByCurrency = new Map<
    string,
    { currency: string; balance: number; debit: number; credit: number; boxCount: number }
  >();
  for (const r of balances) {
    const cur = (r.currency || 'IQD').toUpperCase();
    const t = totalsByCurrency.get(cur);
    if (t) {
      t.balance += r.balance;
      t.debit += r.debit;
      t.credit += r.credit;
      t.boxCount += 1;
    } else {
      totalsByCurrency.set(cur, { currency: cur, balance: r.balance, debit: r.debit, credit: r.credit, boxCount: 1 });
    }
  }
  const totalsList = Array.from(totalsByCurrency.values())
    .sort((a, b) => a.currency.localeCompare(b.currency));

  // ‎صفوف الجدول الرئيسي: rowSpan على عمودَي الصندوق والحساب لعرض عدّة عملات
  // ‎في صناديق متعددة العملات بصفوف متتالية تحت نفس الصندوق.
  const bodyRows = Array.from(grouped.values()).map(({ box, rows }, gi) => {
    return rows.map((r, i) => {
      const exceedsDebit = r.debitLimit != null && r.balance > r.debitLimit;
      const exceedsCredit = r.creditLimit != null && r.balance < -r.creditLimit;
      const isBoxStart = i === 0;
      // ‎فاصل ذهبي بين الصناديق المختلفة (حد علوي بارز فقط لأول صفّ في الصندوق)
      const rowStyle = isBoxStart && gi > 0 ? 'border-top:2px solid #d4a017;' : '';

      const balanceColor = r.balance > 0 ? '#047857' : r.balance < 0 ? '#b91c1c' : '#6b7280';
      const limitsParts: string[] = [];
      if (r.debitLimit != null) {
        const cls = exceedsDebit ? 'color:#b91c1c;font-weight:700;' : 'color:#047857;';
        limitsParts.push(`<div style="${cls}">مدين ≤ ${formatAmount(r.debitLimit)}</div>`);
      }
      if (r.creditLimit != null) {
        const cls = exceedsCredit ? 'color:#b91c1c;font-weight:700;' : 'color:#92400e;';
        limitsParts.push(`<div style="${cls}">دائن ≤ ${formatAmount(r.creditLimit)}</div>`);
      }
      const limitsCell = limitsParts.length
        ? `<div class="num" style="font-size:9.5px;line-height:1.5;">${limitsParts.join('')}</div>`
        : '<span style="color:#aaa">—</span>';

      const boxCells = isBoxStart
        ? `
          <td rowspan="${rows.length}" style="${rowStyle}vertical-align:top;">
            <div style="font-weight:700">${escapeHtml(box.nameAr)}</div>
            <code class="num" style="display:inline-block;margin-top:2px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;">${escapeHtml(box.code)}</code>
          </td>
          <td rowspan="${rows.length}" style="${rowStyle}vertical-align:top;font-size:10.5px;">
            ${box.accountCode ? `<span class="num" style="color:#1f6f43;font-weight:600">${escapeHtml(box.accountCode)}</span>` : ''}
            ${box.accountName ? `<span style="color:#555"> - ${escapeHtml(box.accountName)}</span>` : ''}
          </td>
        `
        : '';

      return `
        <tr style="${rowStyle}">
          ${boxCells}
          <td class="center num" style="font-weight:700;">${escapeHtml(r.currency)}</td>
          <td class="left num" style="font-weight:700;color:${balanceColor};">${formatAmount(r.balance)}</td>
          <td class="left num">${formatAmount(r.debit)}</td>
          <td class="left num">${formatAmount(r.credit)}</td>
          <td class="center" style="font-size:10px;">${limitsCell}</td>
        </tr>
      `;
    }).join('');
  }).join('');

  const totalsRows = totalsList.length === 0
    ? ''
    : totalsList.map((t, idx) => {
        const balanceColor = t.balance > 0 ? '#047857' : t.balance < 0 ? '#b91c1c' : '#6b7280';
        return `
          <tr>
            ${idx === 0
              ? `<th rowspan="${totalsList.length}" colspan="2" class="right" style="background:#fef3c7;color:#92400e;">الإجمالي حسب العملة</th>`
              : ''}
            <td class="center num" style="font-weight:700;color:#92400e;background:#fffbeb;">${escapeHtml(t.currency)}</td>
            <td class="left num" style="font-weight:700;color:${balanceColor};background:#fffbeb;">${formatAmount(t.balance)}</td>
            <td class="left num" style="background:#fffbeb;">${formatAmount(t.debit)}</td>
            <td class="left num" style="background:#fffbeb;">${formatAmount(t.credit)}</td>
            <td class="center" style="background:#fffbeb;color:#6b7280;font-size:10px;">${t.boxCount} صندوق</td>
          </tr>
        `;
      }).join('');

  // ‎شارات العملات في الأعلى (نفس عرض الواجهة).
  const currencyChips = totalsList.map(t => {
    const balanceColor = t.balance > 0 ? '#047857' : t.balance < 0 ? '#b91c1c' : '#6b7280';
    const bg = t.balance > 0 ? '#d1fae5' : t.balance < 0 ? '#fee2e2' : '#f3f4f6';
    return `
      <div style="display:inline-flex;align-items:center;gap:8px;background:${bg};border:1px solid ${balanceColor}33;border-radius:6px;padding:6px 10px;">
        <span class="num" style="background:#fff;border:1px solid ${balanceColor}55;color:${balanceColor};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;">${escapeHtml(t.currency)}</span>
        <div style="display:flex;flex-direction:column;line-height:1.1;">
          <span class="num" style="font-size:13px;font-weight:700;color:${balanceColor};">${formatAmount(t.balance)}</span>
          <span style="font-size:9px;color:#666;">${t.boxCount} صندوق</span>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">أرصدة الصناديق</div>
    <div style="text-align:center;font-size:10.5px;color:#555;margin:0 0 8px;">
      محسوبة من سطور القيود المرحَّلة فقط — السقوف الحمراء تعني تجاوز السقف المعرَّف للصندوق.
    </div>

    ${currencyChips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px;">${currencyChips}</div>` : ''}

    <div class="doc-meta" style="grid-template-columns:repeat(3,1fr);">
      <div class="item"><span class="label">عدد الصناديق</span><span class="value num">${grouped.size}</span></div>
      <div class="item"><span class="label">عدد العملات</span><span class="value num">${totalsList.length}</span></div>
      <div class="item"><span class="label">عدد الأسطر</span><span class="value num">${balances.length}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="right" style="width:20%;">الصندوق</th>
          <th class="right" style="width:25%;">الحساب المحاسبي</th>
          <th class="center" style="width:8%;">العملة</th>
          <th class="left" style="width:14%;">الرصيد</th>
          <th class="left" style="width:12%;">المدين</th>
          <th class="left" style="width:12%;">الدائن</th>
          <th class="center" style="width:9%;">السقوف</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows || '<tr><td colspan="7" class="center" style="padding:18px;color:#888">لا توجد أرصدة بعد — أنشئ صناديق أو أضف حركات.</td></tr>'}
      </tbody>
      ${totalsRows ? `<tfoot>${totalsRows}</tfoot>` : ''}
    </table>

    <div class="signatures">
      <div class="sig">أمين الصندوق</div>
      <div class="sig">المحاسب</div>
      <div class="sig">المدير المالي</div>
    </div>

    ${buildFooter(company, 'تقرير أرصدة الصناديق')}
  `;

  openPrintWindow(html, `أرصدة الصناديق - ${company?.nameAr ?? ''}`.trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// طباعة سند مناقلة بين صندوقَين (Cash Box Transfer)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * شكل بيانات المناقلة المتوقَّع للطباعة. مكرَّر هنا (بدل الاعتماد المباشر
 * على cashBoxes API) لإبقاء utilities الطباعة بدون اعتمادات دائرية.
 */
export interface PrintCashBoxTransfer {
  id: number;
  transferNumber: string;
  fromCashBoxName: string;
  fromCashBoxCode?: string | null;
  toCashBoxName: string;
  toCashBoxCode?: string | null;
  transitAccountCode?: string | null;
  transitAccountName?: string | null;
  currency: string;
  amount: number;
  sendDate: string;
  receiveDate?: string | null;
  description?: string | null;
  referenceNumber?: string | null;
  sendEntryNumber?: string | null;
  sendJournalEntryId?: number | null;
  receiveEntryNumber?: string | null;
  receiveJournalEntryId?: number | null;
  reversalEntryNumber?: string | null;
  reversalJournalEntryId?: number | null;
  status: 'PendingReceive' | 'Received' | 'Cancelled';
  receivedByUserId?: string | null;
  receivedAt?: string | null;
  receiveNotes?: string | null;
  cancelledByUserId?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt?: string | null;
}

function transferStatusLabel(s: PrintCashBoxTransfer['status']): { label: string; bg: string; fg: string } {
  if (s === 'Received') return { label: 'مستلَمة', bg: '#d1fae5', fg: '#047857' };
  if (s === 'Cancelled') return { label: 'ملغاة', bg: '#fee2e2', fg: '#b91c1c' };
  return { label: 'بانتظار الاستلام', bg: '#fef3c7', fg: '#92400e' };
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    // ‎ثبَّت العرض على توقيت بغداد (UTC+3 بلا DST) لتطابق ما يراه أمين
    // ‎الصندوق في الواجهة، ولا يتغيَّر بحسب منطقة جهاز الطباعة.
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return '—'; }
}

export function printCashBoxTransfer(
  t: PrintCashBoxTransfer,
  company: CompanySettingsDto | null = null,
) {
  const printedAt = new Date().toLocaleString('ar-IQ');
  const status = transferStatusLabel(t.status);
  const amountWords = tafqeet(Math.abs(t.amount), { currency: t.currency });

  // ─── طرف الإرسال (موجود دائماً)
  const sendCard = `
    <div class="ct-side ct-side--out">
      <div class="ct-side__head">
        <span class="ct-side__icon">⬅</span>
        <span>طرف الإرسال (صادر)</span>
      </div>
      <div class="ct-side__row"><span class="lbl">من صندوق</span><span class="val">${escapeHtml(t.fromCashBoxName)} ${t.fromCashBoxCode ? `<code class="num">${escapeHtml(t.fromCashBoxCode)}</code>` : ''}</span></div>
      <div class="ct-side__row"><span class="lbl">تاريخ ووقت الإرسال</span><span class="val num">${fmtDateTime(t.sendDate)}</span></div>
      <div class="ct-side__row"><span class="lbl">قيد الإرسال</span><span class="val num">${t.sendEntryNumber ? `#${escapeHtml(t.sendEntryNumber)}` : (t.sendJournalEntryId ? `#${t.sendJournalEntryId}` : '—')}</span></div>
      <div class="ct-side__row"><span class="lbl">المبلغ المُرسَل</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
    </div>
  `;

  // ─── طرف الاستلام: قد يكون مستلماً، أو بانتظار، أو ملغى
  let receiveCard = '';
  if (t.status === 'Received' && (t.receiveJournalEntryId || t.receiveEntryNumber)) {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--ok">
        <div class="ct-side__head">
          <span class="ct-side__icon">➡</span>
          <span>طرف الاستلام (وارد)</span>
        </div>
        <div class="ct-side__row"><span class="lbl">إلى صندوق</span><span class="val">${escapeHtml(t.toCashBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">تاريخ ووقت الاستلام</span><span class="val num">${fmtDateTime(t.receiveDate)}</span></div>
        <div class="ct-side__row"><span class="lbl">قيد الاستلام</span><span class="val num">${t.receiveEntryNumber ? `#${escapeHtml(t.receiveEntryNumber)}` : (t.receiveJournalEntryId ? `#${t.receiveJournalEntryId}` : '—')}</span></div>
        <div class="ct-side__row"><span class="lbl">المبلغ المستلَم</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
        ${t.receivedByUserId ? `<div class="ct-side__row"><span class="lbl">اعتمد الاستلام</span><span class="val">${escapeHtml(t.receivedByUserId)}</span></div>` : ''}
        ${t.receivedAt ? `<div class="ct-side__row"><span class="lbl">وقت الاعتماد</span><span class="val num">${fmtDateTime(t.receivedAt)}</span></div>` : ''}
        ${t.receiveNotes ? `<div class="ct-side__row ct-side__notes"><span class="lbl">ملاحظات</span><span class="val">${escapeHtml(t.receiveNotes)}</span></div>` : ''}
      </div>
    `;
  } else if (t.status === 'Cancelled') {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--cancel">
        <div class="ct-side__head">
          <span class="ct-side__icon">⛔</span>
          <span>طرف الاستلام — ألغيت قبل الاستلام</span>
        </div>
        <div class="ct-side__row"><span class="lbl">الصندوق المستهدَف</span><span class="val">${escapeHtml(t.toCashBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">قيد عكس الإرسال</span><span class="val num">${t.reversalEntryNumber ? `#${escapeHtml(t.reversalEntryNumber)}` : (t.reversalJournalEntryId ? `#${t.reversalJournalEntryId}` : '—')}</span></div>
        ${t.cancelledByUserId ? `<div class="ct-side__row"><span class="lbl">ألغاها</span><span class="val">${escapeHtml(t.cancelledByUserId)}</span></div>` : ''}
        ${t.cancelledAt ? `<div class="ct-side__row"><span class="lbl">وقت الإلغاء</span><span class="val num">${fmtDateTime(t.cancelledAt)}</span></div>` : ''}
        ${t.cancellationReason ? `<div class="ct-side__row ct-side__notes"><span class="lbl">سبب الإلغاء</span><span class="val">${escapeHtml(t.cancellationReason)}</span></div>` : ''}
      </div>
    `;
  } else {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--pending">
        <div class="ct-side__head">
          <span class="ct-side__icon">⏳</span>
          <span>طرف الاستلام — بانتظار الاعتماد</span>
        </div>
        <div class="ct-side__row"><span class="lbl">إلى صندوق</span><span class="val">${escapeHtml(t.toCashBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">تاريخ الاستلام المتوقَّع</span><span class="val num">${fmtDateTime(t.receiveDate)}</span></div>
        <div class="ct-side__row"><span class="lbl">قيد الاستلام</span><span class="val num" style="color:#92400e">سيُولَّد عند موافقة الصندوق المستلم</span></div>
        <div class="ct-side__row"><span class="lbl">المبلغ المتوقَّع</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
      </div>
    `;
  }

  const transitInfo = (t.transitAccountCode || t.transitAccountName)
    ? `<div class="item"><span class="label">الحساب الوسيط</span><span class="value">${t.transitAccountCode ? `<span class="num" style="color:#1f6f43;font-weight:600">${escapeHtml(t.transitAccountCode)}</span>` : ''}${t.transitAccountName ? ` ${escapeHtml(t.transitAccountName)}` : ''}</span></div>`
    : '';

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">سند مناقلة بين صندوقَين</div>

    <div class="ct-banner" style="background:${status.bg};color:${status.fg};">
      <div class="ct-banner__num">
        <span style="font-size:10px;opacity:.8;">رقم المناقلة</span>
        <span class="num" style="font-size:16px;font-weight:800;">${escapeHtml(t.transferNumber)}</span>
      </div>
      <div class="ct-banner__status">
        <span style="font-size:10px;opacity:.8;">الحالة</span>
        <span style="font-size:13px;font-weight:700;">${escapeHtml(status.label)}</span>
      </div>
      <div class="ct-banner__amt">
        <span style="font-size:10px;opacity:.8;">المبلغ</span>
        <span class="num" style="font-size:18px;font-weight:800;">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span>
      </div>
    </div>

    <div class="doc-meta" style="grid-template-columns:repeat(3,1fr);">
      <div class="item"><span class="label">العملة</span><span class="value num">${escapeHtml(t.currency)}</span></div>
      ${transitInfo}
      ${t.referenceNumber ? `<div class="item"><span class="label">المرجع الخارجي</span><span class="value num">${escapeHtml(t.referenceNumber)}</span></div>` : ''}
      ${t.createdAt ? `<div class="item"><span class="label">تاريخ الإنشاء</span><span class="value num">${fmtDateTime(t.createdAt)}</span></div>` : ''}
    </div>

    ${t.description ? `<div class="ct-desc"><span class="lbl">البيان:</span> ${escapeHtml(t.description)}</div>` : ''}

    <div class="ct-grid">
      ${sendCard}
      ${receiveCard}
    </div>

    <div class="ct-words">
      <span class="lbl">المبلغ كتابةً:</span>
      <span class="val">${escapeHtml(amountWords)}</span>
    </div>

    <div class="signatures">
      <div class="sig">أمين الصندوق المُرسِل</div>
      <div class="sig">أمين الصندوق المستلم</div>
      <div class="sig">المحاسب / المراجع</div>
    </div>

    ${buildFooter(company, 'سند مناقلة بين صندوقَين — مولَّد إلكترونياً')}
  `;

  const extraStyles = `
    .ct-banner { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; align-items:center; padding:10px 14px; border-radius:6px; margin: 6px 0 10px; border:1px solid currentColor; }
    .ct-banner > div { display:flex; flex-direction:column; gap:1px; }
    .ct-banner__num { text-align:right; }
    .ct-banner__status { text-align:center; }
    .ct-banner__amt { text-align:left; }
    .ct-desc { background:#f8fafc; border-right:3px solid #2563eb; padding:6px 10px; border-radius:4px; font-size:11.5px; line-height:1.6; margin: 4px 0 10px; color:#1f2937; }
    .ct-desc .lbl { color:#2563eb; font-weight:700; margin-left:4px; }
    .ct-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
    .ct-side { border: 1.5px solid #94a3b8; border-radius: 6px; padding: 8px 10px; background: #fff; }
    .ct-side--out { border-color: #b45309; background: #fffbeb; }
    .ct-side--in.ct-side--ok { border-color: #047857; background: #ecfdf5; }
    .ct-side--in.ct-side--pending { border-color: #d4a017; background: #fefce8; }
    .ct-side--in.ct-side--cancel { border-color: #b91c1c; background: #fef2f2; }
    .ct-side__head { display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; padding-bottom:6px; margin-bottom:6px; border-bottom: 1px dashed #aaa3; }
    .ct-side--out .ct-side__head { color: #92400e; border-bottom-color: #d4a01799; }
    .ct-side--in.ct-side--ok .ct-side__head { color: #047857; border-bottom-color: #04785799; }
    .ct-side--in.ct-side--pending .ct-side__head { color: #92400e; border-bottom-color: #d4a01799; }
    .ct-side--in.ct-side--cancel .ct-side__head { color: #b91c1c; border-bottom-color: #b91c1c99; }
    .ct-side__icon { font-size: 14px; }
    .ct-side__row { display:flex; justify-content:space-between; gap:8px; font-size:11px; padding: 3px 0; border-bottom: 1px dotted #ccc; }
    .ct-side__row:last-child { border-bottom: 0; }
    .ct-side__row .lbl { color:#555; min-width: 100px; }
    .ct-side__row .val { font-weight:600; text-align:left; }
    .ct-side__row .val code { background:#fff; border:1px solid #aaa; padding:0 4px; border-radius:3px; font-size:10px; margin-inline-start:3px; }
    .ct-side__notes { flex-direction: column; align-items: flex-start; }
    .ct-side__notes .val { font-weight: 500; text-align: right; }
    .ct-amount { color:#1f6f43; font-size:13px; }
    .ct-side--in.ct-side--cancel .ct-amount { color: #b91c1c; text-decoration: line-through; }
    .ct-words { margin-top: 12px; background:#fffbeb; border-right: 3px solid #d4a017; padding: 6px 10px; border-radius: 4px; font-size: 11.5px; line-height: 1.7; }
    .ct-words .lbl { color:#92400e; font-weight: 600; margin-left: 6px; }
    .ct-words .val { font-weight: 700; color:#1f2937; }

    @media screen and (max-width: 800px) {
      .ct-banner { grid-template-columns: 1fr; gap: 4px; padding: 8px 10px; }
      .ct-banner__num, .ct-banner__status, .ct-banner__amt { text-align: center; }
      .ct-grid { grid-template-columns: 1fr; gap: 6px; }
    }
  `;

  const fullDoc = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(`مناقلة ${t.transferNumber}`)}</title>
  <style>${PRINT_STYLES}${extraStyles}</style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;
  openPrintPreview(fullDoc, `سند مناقلة ${t.transferNumber}`);
}
