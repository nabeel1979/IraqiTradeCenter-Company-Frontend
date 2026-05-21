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
         <td class="center">—</td>
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
      (r, idx) => {
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
      <td class="left num"><strong>${formatAmount(r.balance)}</strong></td>
      <td class="left num"><strong>${formatAmount(r.balanceValuated ?? r.balance)}</strong></td>
      <td class="center">${escapeHtml(r.currency)}</td>
    </tr>
  `;
      }
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
          <th class="center" style="width:80px">السند / القيد</th>
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
    html, body { background: #fff; }
    .preview-toolbar { display: none !important; }
    .a4-sheet { margin: 0; box-shadow: none; width: 210mm; height: 297mm; }
    .voucher-copy { page-break-inside: avoid; }
  }
`;

function openSingleVoucherWindow(html: string, title: string) {
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
<style>${SINGLE_VOUCHER_STYLES}</style>
</head>
<body>
  <div class="preview-toolbar">
    <div class="title">
      ${PRINTER_ICON}
      <span>معاينة الطباعة - ${escapeHtml(title)}</span>
    </div>
    <div class="actions">
      <button class="primary" onclick="window.print()" type="button">${PRINTER_ICON} طباعة</button>
      <button class="danger" onclick="window.close()" type="button">${CLOSE_ICON} إغلاق</button>
    </div>
  </div>
  ${html}
</body>
</html>`);
  w.document.close();
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
  const w = window.open('', '_blank', 'width=1200,height=820');
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
  <style>${PRINT_STYLES}${extraStyles}
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 297mm; }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="title">${PRINTER_ICON}<span>معاينة الطباعة - ${escapeHtml(title)}</span></div>
    <div class="actions">
      <button class="primary" onclick="window.print()" type="button">${PRINTER_ICON}طباعة</button>
      <button class="danger" onclick="window.close()" type="button">${CLOSE_ICON}إغلاق</button>
    </div>
  </div>
  <div class="preview-page">${html}</div>
</body>
</html>`);
  w.document.close();
}
