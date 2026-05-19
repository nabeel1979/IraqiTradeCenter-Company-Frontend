import type { AccountStatementDto, JournalEntryDto } from '@/types/api';
import type { CompanySettingsDto } from '@/lib/api/companySettings';
import { formatAmount, formatDate } from '@/lib/utils';

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
  if (status === 'Draft') return 'مسودة';
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
`;

function openPrintWindow(html: string, title: string) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) {
    alert('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة');
    return;
  }

  const PRINTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';
  const CLOSE_ICON   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="title">
      ${PRINTER_ICON}
      <span>معاينة الطباعة - ${escapeHtml(title)}</span>
    </div>
    <div class="actions">
      <button class="primary" onclick="window.print()" type="button">
        ${PRINTER_ICON}
        طباعة
      </button>
      <button class="danger" onclick="window.close()" type="button">
        ${CLOSE_ICON}
        إغلاق
      </button>
    </div>
  </div>
  <div class="preview-page">
    ${html}
  </div>
</body>
</html>`);
  w.document.close();
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

  const rows = entries.map((e, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="center num">${escapeHtml(e.entryNumber)}</td>
      <td class="center">${formatDate(e.entryDate)}</td>
      <td>${escapeHtml(e.description)} ${e.entryType === 'Opening' ? '<span class="badge badge-opening">افتتاحي</span>' : ''}</td>
      <td class="left num">${formatAmount(e.totalDebit)}</td>
      <td class="left num">${formatAmount(e.totalCredit)}</td>
      <td class="center">${escapeHtml(e.currency || 'IQD')}</td>
      <td class="center">${statusBadgeHtml(e.status)}</td>
    </tr>
  `).join('');

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
          <th class="center" style="width:60px">رقم القيد</th>
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

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">قيد محاسبي</div>
    <div class="doc-meta">
      <div class="item"><span class="label">رقم القيد</span><span class="value num">${escapeHtml(e.entryNumber)}</span></div>
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
 * طباعة كشف حساب
 */
export function printAccountStatement(
  data: AccountStatementDto,
  company: CompanySettingsDto | null | undefined
) {
  const printedAt = new Date().toLocaleString('ar-IQ');
  const isAll = data.isAllAccounts;

  const accountLine = isAll
    ? 'جميع الحسابات'
    : `${data.accountCode ?? ''} - ${data.accountName ?? ''}`;

  const metaItems = [
    { label: 'من تاريخ', value: formatDate(data.fromDate) },
    { label: 'إلى تاريخ', value: formatDate(data.toDate) },
    { label: 'الحساب', value: escapeHtml(accountLine) },
    { label: 'فلتر العرض', value: escapeHtml(data.currency || 'الكل') },
    { label: 'العملة الأساسية (تقييم)', value: escapeHtml(data.baseCurrency || 'IQD') },
  ];

  const metaHtml = metaItems
    .map(m => `<div class="item"><span class="label">${m.label}</span><span class="value">${m.value}</span></div>`)
    .join('');

  const base = data.baseCurrency || 'IQD';
  const openingRow =
    data.openingBalance !== 0 || (data.openingBalanceValuated ?? 0) !== 0
      ? `<tr style="background:#f0f3f6;font-weight:600">
         <td class="center">—</td>
         <td>${formatDate(data.fromDate)}</td>
         <td class="num">—</td>
         ${isAll ? '<td>—</td>' : ''}
         <td><em>رصيد افتتاحي</em></td>
         <td class="left num">—</td>
         <td class="left num">—</td>
         <td class="left num">${data.openingBalance !== 0 ? formatAmount(data.openingBalance) : '—'}</td>
         <td class="left num">${formatAmount(data.openingBalanceValuated ?? 0)}</td>
         <td class="center">—</td>
       </tr>`
      : '';

  const rowsHtml = data.rows
    .map(
      (r, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${formatDate(r.date)}</td>
      <td class="num">${escapeHtml(r.entryNumber)}</td>
      ${isAll ? `<td><span class="num">${escapeHtml(r.accountCode)}</span> - ${escapeHtml(r.accountName)}</td>` : ''}
      <td>${escapeHtml(r.lineDescription || r.description || '—')}</td>
      <td class="left num">${r.debit > 0 ? formatAmount(r.debit) : '—'}</td>
      <td class="left num">${r.credit > 0 ? formatAmount(r.credit) : '—'}</td>
      <td class="left num"><strong>${formatAmount(r.balance)}</strong></td>
      <td class="left num"><strong>${formatAmount(r.balanceValuated ?? r.balance)}</strong></td>
      <td class="center">${escapeHtml(r.currency)}</td>
    </tr>
  `
    )
    .join('');

  const colspan = isAll ? 5 : 4;
  const distCcy = new Set(data.rows.map(r => r.currency)).size > 1;
  const naiveDash = distCcy ? '—' : formatAmount(data.totalDebit);
  const nativeCrDash = distCcy ? '—' : formatAmount(data.totalCredit);
  const nativeBalDash = distCcy ? '—' : formatAmount(data.closingBalance);

  const fxWarn = data.fxUsedFallback
    ? `<div style="margin-top:10px;font-size:10px;color:#856404;background:#fff3cd;padding:8px;border-radius:4px;border:1px solid #ffeeba">تنبيه: استُخدم مضاعف 1 لعملات دون سعر صرف في إعدادات الشركة.</div>`
    : '';

  const html = `
    ${buildBrandHeader(company, printedAt)}
    <div class="report-title">كشف حساب</div>
    <div class="doc-meta">${metaHtml}</div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">#</th>
          <th style="width:80px">التاريخ</th>
          <th style="width:70px">رقم القيد</th>
          ${isAll ? '<th>الحساب</th>' : ''}
          <th>البيان</th>
          <th class="left" style="width:90px">مدين</th>
          <th class="left" style="width:90px">دائن</th>
          <th class="left" style="width:100px">الرصيد</th>
          <th class="left" style="width:100px">رصيد مقوم (${escapeHtml(base)})</th>
          <th class="center" style="width:50px">العملة</th>
        </tr>
      </thead>
      <tbody>
        ${openingRow}
        ${rowsHtml.length ? rowsHtml : `<tr><td colspan="${colspan + 5}" class="center" style="padding:18px;color:#888">لا توجد حركات</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="background:#ecf0f1">
          <th colspan="${colspan}" class="right">الإجمالي بحسب عملة السطر</th>
          <th class="left num">${naiveDash}</th>
          <th class="left num">${nativeCrDash}</th>
          <th class="left num">${nativeBalDash}</th>
          <th class="left num">—</th>
          <th></th>
        </tr>
        <tr style="background:#e8eef5;font-weight:700">
          <th colspan="${colspan}" class="right">الإجمالي المقوّم (${escapeHtml(base)})</th>
          <th class="left num">${formatAmount(data.totalDebitValuated ?? data.totalDebit)}</th>
          <th class="left num">${formatAmount(data.totalCreditValuated ?? data.totalCredit)}</th>
          <th class="left num">—</th>
          <th class="left num">${formatAmount(data.closingBalanceValuated ?? data.closingBalance)}</th>
          <th class="center">${escapeHtml(base)}</th>
        </tr>
      </tfoot>
    </table>

    ${fxWarn}

    <div style="margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:11px">
      <div class="doc-meta" style="margin:0"><div class="item"><span class="label">الرصيد الافتتاحي (مقيم)</span><span class="value num">${formatAmount(data.openingBalanceValuated ?? data.openingBalance)}</span></div></div>
      <div class="doc-meta" style="margin:0"><div class="item"><span class="label">إجمالي المدين (مقيم)</span><span class="value num">${formatAmount(data.totalDebitValuated ?? data.totalDebit)}</span></div></div>
      <div class="doc-meta" style="margin:0"><div class="item"><span class="label">إجمالي الدائن (مقيم)</span><span class="value num">${formatAmount(data.totalCreditValuated ?? data.totalCredit)}</span></div></div>
      <div class="doc-meta" style="margin:0"><div class="item"><span class="label">الرصيد الختامي (مقيم)</span><span class="value num"><strong>${formatAmount(data.closingBalanceValuated ?? data.closingBalance)}</strong></span></div></div>
    </div>

    ${buildFooter(company, 'كشف حساب')}
  `;

  openPrintWindow(html, `كشف حساب - ${accountLine}`);
}
