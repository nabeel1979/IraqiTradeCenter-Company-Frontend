import type {
  AccountBalancesDto,
  AccountStatementDto,
  JournalEntryDto,
  SalesInvoiceDto,
  TrialBalanceDto,
} from '@/types/api';
import type { CompanySettingsDto } from '@/lib/api/companySettings';
import { formatAmount, formatAmountFixed2, formatDate } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';
import {
  getPrintI18n,
  getPrintLocale,
  getPrintDir,
  formatPrintedAt,
  type PrintI18n,
  type PrintLocale,
} from '@/lib/i18n/printDictionary';

export type { PrintLocale };

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status: string, i18n: PrintI18n): string {
  if (status === 'Posted')   return i18n.status.posted;
  if (status === 'Draft')    return i18n.status.draft;
  if (status === 'Reversed') return i18n.status.reversed;
  return status;
}

function typeLabel(t: string | undefined, i18n: PrintI18n): string {
  return t === 'Opening' ? i18n.entryType.opening : i18n.entryType.regular;
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
  @media (max-width: 600px) {
    .preview-page { padding: 4mm; margin: 4px auto; }
    .doc-meta { grid-template-columns: repeat(2, 1fr); }
    .doc-header { flex-direction: column; gap: 8px; }
    .doc-header .meta { text-align: start; }
    .preview-toolbar .actions { flex-wrap: wrap; gap: 4px; }
    .preview-toolbar button span { display: none; }
    table { font-size: 10px; }
    th, td { padding: 3px 4px; }
  }
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
const PDF_SVG     = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;width:14px;height:14px;display:inline-block"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line><polyline points="9 9 10 9"></polyline></svg>';

const OVERLAY_STYLES = `
  position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column;
  background: #374151; color: #fff;
`;
const TOOLBAR_STYLES_BASE = `
  display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; background: #1e293b; border-bottom: 2px solid #0f172a; box-shadow: 0 2px 8px rgba(0,0,0,.4);
  font-family: 'Segoe UI', Tahoma, Arial, sans-serif; min-height: 48px; flex-shrink: 0;
`;
const toolbarStyles = (dir: 'rtl' | 'ltr') => `${TOOLBAR_STYLES_BASE} direction: ${dir};`;
const TOOLBAR_TITLE_STYLES = `font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; overflow: hidden;`;
const TOOLBAR_TITLE_TEXT_STYLES = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; max-width: 180px;`;
const TOOLBAR_ACTIONS_STYLES = `display: flex; gap: 4px; flex-shrink: 0; align-items: center; flex-wrap: wrap;`;
const BTN_BASE_STYLES = `border: 0; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-family: inherit; transition: opacity .15s; touch-action: manipulation; -webkit-tap-highlight-color: transparent;`;
const BTN_PRIMARY_STYLES = `${BTN_BASE_STYLES} background: #16a34a; color: #fff;`;
const BTN_PDF_STYLES     = `${BTN_BASE_STYLES} background: #2563eb; color: #fff;`;
const BTN_DANGER_STYLES  = `${BTN_BASE_STYLES} background: rgba(255,255,255,.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,.2);`;
const BTN_ZOOM_STYLES    = `${BTN_BASE_STYLES} background: rgba(255,255,255,.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,.2); padding: 7px 9px; font-size: 14px; min-width: 34px; justify-content: center;`;
const IFRAME_STYLES = `flex: 1; width: 100%; border: 0; background: #4b5563; display: block;`;

// ── كشف الأجهزة المحمولة والـ Android ──────────────────────────────────────
const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isAndroid = () => /Android/i.test(navigator.userAgent);
const isPWAStandalone = () =>
  ('standalone' in window.navigator && (window.navigator as any).standalone === true) ||
  window.matchMedia('(display-mode: standalone)').matches;

/**
 * تفتح معاينة طباعة كاملة الشاشة داخل الصفحة الحالية باستخدام iframe.
 * تعمل في كل البيئات (موبايل/ديسكتوب/PWA standalone) دون الحاجة لـ popups.
 *
 * @param fullHtmlDocument محتوى HTML كامل (DOCTYPE + html + head + body) يُحقن في iframe عبر srcdoc.
 * @param title عنوان يظهر في شريط الأدوات.
 */
function openPrintPreview(fullHtmlDocument: string, title: string, locale: PrintLocale = getPrintLocale()) {
  const i18n = getPrintI18n(locale);
  const dir = getPrintDir(locale);
  // ‎احذف أي معاينة سابقة قد تكون مفتوحة
  const existing = document.getElementById('itc-print-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'itc-print-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${i18n.preview.titlePrefix} - ${title}`);
  overlay.style.cssText = OVERLAY_STYLES;

  // ‎حاجز CSS قوي: يمنع أي svg داخل الـ overlay من التمدد لكامل الـ viewport
  const guardStyle = document.createElement('style');
  guardStyle.textContent = `
    #itc-print-overlay svg { width: 14px !important; height: 14px !important; max-width: 14px !important; max-height: 14px !important; flex: none !important; }
    #itc-print-overlay button { white-space: nowrap; line-height: 1; }
  `;
  overlay.appendChild(guardStyle);

  const mobile = isMobile();
  const android = isAndroid();
  const pwa = isPWAStandalone();

  // ── على الموبايل: نُخفي أزرار الزوم ونُقلّل النصوص توفيراً للمساحة
  const zoomSection = mobile
    ? ''
    : `<button type="button" data-act="zoom-out"  style="${BTN_ZOOM_STYLES}" title="تصغير">−</button>
       <span   data-act="zoom-label" style="font-size:11px;color:#94a3b8;min-width:36px;text-align:center;user-select:none;">100%</span>
       <button type="button" data-act="zoom-in"   style="${BTN_ZOOM_STYLES}" title="تكبير">＋</button>`;

  // ── نص الأزرار: نُقلّله على الشاشات الضيقة
  const printBtnText = mobile ? '' : `<span>${escapeHtml(i18n.preview.print)}</span>`;
  const pdfBtnText   = mobile ? '' : `<span>${escapeHtml(i18n.preview.exportPdf)}</span>`;
  const closeBtnText = `<span>${escapeHtml(i18n.preview.close)}</span>`;

  const toolbar = document.createElement('div');
  toolbar.style.cssText = toolbarStyles(dir);
  toolbar.innerHTML = `
    <div style="${TOOLBAR_TITLE_STYLES}">
      ${PRINTER_SVG}
      <span style="${TOOLBAR_TITLE_TEXT_STYLES}">${escapeHtml(title)}</span>
    </div>
    <div style="${TOOLBAR_ACTIONS_STYLES}">
      ${zoomSection}
      <button type="button" data-act="pdf"   style="${BTN_PDF_STYLES}"    title="${escapeHtml(i18n.preview.exportPdfTitle)}">${PDF_SVG}${pdfBtnText}</button>
      <button type="button" data-act="print" style="${BTN_PRIMARY_STYLES}" title="${escapeHtml(i18n.preview.print)}">${PRINTER_SVG}${printBtnText}</button>
      <button type="button" data-act="close" style="${BTN_DANGER_STYLES}">${CLOSE_SVG}${closeBtnText}</button>
    </div>
  `;

  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.style.cssText = IFRAME_STYLES;
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
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  window.addEventListener('keydown', onKey);

  toolbar.querySelector<HTMLButtonElement>('[data-act="close"]')?.addEventListener('click', close);

  // ── تحكم التكبير / التصغير
  let zoomLevel = 100;
  const ZOOM_STEPS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];
  const zoomLabel = toolbar.querySelector<HTMLSpanElement>('[data-act="zoom-label"]');
  const applyZoom = () => {
    if (zoomLabel) zoomLabel.textContent = `${zoomLevel}%`;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.body) {
        (doc.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(zoomLevel / 100);
      }
    } catch { /* cross-origin guard */ }
  };
  toolbar.querySelector<HTMLButtonElement>('[data-act="zoom-in"]')?.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(zoomLevel);
    if (idx < ZOOM_STEPS.length - 1) { zoomLevel = ZOOM_STEPS[idx + 1]; applyZoom(); }
  });
  toolbar.querySelector<HTMLButtonElement>('[data-act="zoom-out"]')?.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(zoomLevel);
    if (idx > 0) { zoomLevel = ZOOM_STEPS[idx - 1]; applyZoom(); }
  });
  iframe.addEventListener('load', () => applyZoom());

  toolbar.querySelector<HTMLButtonElement>('[data-act="print"]')?.addEventListener('click', () => {
    // ── على Android/PWA: نفتح ملف HTML قابل للطباعة مباشرةً (لأن print() لا تعمل داخل iframe في Android)
    if (android || pwa) {
      triggerHtmlDownload(fullHtmlDocument, title);
      return;
    }
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  });

  // ── زر تصدير/تنزيل:
  //    يُنزّل ملف HTML جاهز للطباعة إلى مجلد التنزيلات (Downloads).
  //    على Android/PWA: يُنزّل مباشرةً.
  //    على الديسكتوب: ينزّل HTML يمكن فتحه وطباعته كـ PDF بـ Ctrl+P.
  toolbar.querySelector<HTMLButtonElement>('[data-act="pdf"]')?.addEventListener('click', () => {
    triggerHtmlDownload(fullHtmlDocument, title);
  });
}

/**
 * يُولّد ملف HTML جاهز للطباعة ويُنزّله إلى جهاز المستخدم.
 * يعمل على الأندرويد والـ PWA والمتصفحات العادية.
 */
function triggerHtmlDownload(fullHtmlDocument: string, title: string) {
  const printReadyHtml = fullHtmlDocument.replace(
    '</head>',
    `<style>
      .preview-toolbar, .no-print { display: none !important; }
      @page { size: A4; margin: 10mm; }
      html, body { background: #fff !important; }
      .preview-page { margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; max-width: none !important; }
      @media screen { body { padding: 8px; } }
    </style>
    <script>
      window.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.preview-toolbar,.no-print').forEach(function(el){ el.style.display='none'; });
        // على الأجهزة المحمولة: اطبع تلقائياً عند الفتح
        if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          setTimeout(function(){ window.print(); }, 600);
        }
      });
    </script>
    </head>`
  );
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'document';
  const blob = new Blob([printReadyHtml], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${safeTitle}.html`;
  a.rel      = 'noopener';
  // ── للـ Android/PWA: نستخدم target="_blank" بدل download إن لزم الأمر
  if (isAndroid() || isPWAStandalone()) {
    a.target = '_blank';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function openPrintWindow(html: string, title: string, locale: PrintLocale = getPrintLocale()) {
  const dir = getPrintDir(locale);
  // ‎حقن `body { direction: <dir> }` ديناميكياً ليُعكس اتجاه النص في الجداول وأعمدة text-align
  const bodyDirStyle = `<style>body { direction: ${dir}; }</style>`;
  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
${bodyDirStyle}
</head>
<body>
  <div class="preview-page">
    ${html}
  </div>
</body>
</html>`;
  openPrintPreview(fullDoc, title, locale);
}

function statusBadgeHtml(status: string, i18n: PrintI18n): string {
  const cls =
    status === 'Posted' ? 'badge-posted' :
    status === 'Reversed' ? 'badge-reversed' : 'badge-draft';
  return `<span class="badge ${cls}">${statusLabel(status, i18n)}</span>`;
}

/** يبني الترويسة الموحَّدة (لوكو + اسم + اتصال) من إعدادات الشركة */
function buildBrandHeader(
  company: CompanySettingsDto | null | undefined,
  printedAt: string,
  i18n: PrintI18n,
  locale: PrintLocale,
): string {
  const c = company || ({} as CompanySettingsDto);
  // ‎في EN نُفضّل nameEn → printHeader → nameAr → الافتراضي
  const heading = locale === 'en'
    ? (c.nameEn || c.printHeader || c.nameAr || i18n.brand.defaultCompanyName)
    : (c.printHeader || c.nameAr || i18n.brand.defaultCompanyName);
  const logo = c.logoBase64
    ? `<img class="logo" src="${escapeHtml(c.logoBase64)}" alt="logo">`
    : '';
  const contactBits: string[] = [];
  // ‎اختيار العنوان بحسب اللغة: في EN نُفضّل addressEn → address، وفي AR العكس.
  const displayAddress = locale === 'en' ? (c.addressEn || c.address) : (c.address || c.addressEn);
  if (displayAddress) contactBits.push(`<span>${escapeHtml(displayAddress)}</span>`);
  if (c.phone) contactBits.push(`<span>${escapeHtml(i18n.brand.phone)} ${escapeHtml(c.phone)}</span>`);
  if (c.email) contactBits.push(`<span>${escapeHtml(c.email)}</span>`);
  if (c.website) contactBits.push(`<span>${escapeHtml(c.website)}</span>`);
  const contact = contactBits.length
    ? `<div class="contact">${contactBits.join(' • ')}</div>`
    : '';

  // ‎لا نعرض الاسم في اللغة الأخرى كنص فرعي — نطبع الاسم وفق اللغة فقط.

  const metaBits: string[] = [];
  metaBits.push(`<div>${escapeHtml(i18n.brand.printedAt)}</div><div>${escapeHtml(printedAt)}</div>`);
  if (c.taxNumber) metaBits.push(`<div style="margin-top:4px">${escapeHtml(i18n.brand.taxNumber)}</div><div>${escapeHtml(c.taxNumber)}</div>`);

  return `
    <div class="doc-header">
      <div class="brand">
        ${logo}
        <div class="titles">
          <h1>${escapeHtml(heading)}</h1>
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
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  const totalDebit = entries.reduce((s, e) => s + (e.totalDebit || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.totalCredit || 0), 0);

  const rows = entries.map((e, idx) => {
    // ‎خلية رقم القيد تجمع: رقم السند (PV-1) إن وُجد، رقم القيد الداخلي (#29)،
    // ‎والرقم اليدوي (CHK-123…) إن سجّله المستخدم — يُعرض بلون كهرماني صغير
    // ‎ليتميّز بصرياً عن المسلسلات النظامية.
    const manualLine = e.manualNumber
      ? `<br><span class="num" style="font-size:9px;color:#b45309;direction:ltr">#${escapeHtml(e.manualNumber)}</span>`
      : '';
    const entryCell = e.voucherNumber
      ? `<strong class="num">${escapeHtml(e.voucherNumber)}</strong><br><span class="num" style="font-size:9px;color:#777">#${escapeHtml(e.entryNumber)}</span>${manualLine}`
      : `<span class="num">#${escapeHtml(e.entryNumber)}</span>${manualLine}`;
    return `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="center">${entryCell}</td>
      <td class="center">${formatDate(e.entryDate)}</td>
      <td>${escapeHtml(e.description)} ${e.entryType === 'Opening' ? `<span class="badge badge-opening">${escapeHtml(i18n.entryType.openingBadge)}</span>` : ''}</td>
      <td class="left num">${formatAmountFixed2(e.totalDebit)}</td>
      <td class="left num">${formatAmountFixed2(e.totalCredit)}</td>
      <td class="center">${escapeHtml(e.currency || 'IQD')}</td>
      <td class="center">${statusBadgeHtml(e.status, i18n)}</td>
    </tr>
  `;
  }).join('');

  const fromTxt = filters.fromDate ? formatDate(filters.fromDate) : '—';
  const toTxt = filters.toDate ? formatDate(filters.toDate) : '—';
  const statusTxt = filters.status ? statusLabel(filters.status, i18n) : i18n.journalList.all;
  const printedAt = formatPrintedAt(locale);
  const headerCompanyName = locale === 'en' ? (company?.nameEn || company?.nameAr || '') : (company?.nameAr || '');

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.journalList.title)}</div>
    <div class="doc-meta">
      <div class="item"><span class="label">${escapeHtml(i18n.journalList.fromDate)}</span><span class="value">${fromTxt}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.journalList.toDate)}</span><span class="value">${toTxt}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.journalList.status)}</span><span class="value">${escapeHtml(statusTxt)}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.journalList.entriesCount)}</span><span class="value">${entries.length}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">${escapeHtml(i18n.journalList.colNo)}</th>
          <th class="center" style="width:80px">${escapeHtml(i18n.journalList.colVoucherOrEntry)}</th>
          <th class="center" style="width:80px">${escapeHtml(i18n.journalList.colDate)}</th>
          <th>${escapeHtml(i18n.journalList.colDescription)}</th>
          <th class="left" style="width:90px">${escapeHtml(i18n.journalList.colDebit)}</th>
          <th class="left" style="width:90px">${escapeHtml(i18n.journalList.colCredit)}</th>
          <th class="center" style="width:50px">${escapeHtml(i18n.journalList.colCurrency)}</th>
          <th class="center" style="width:60px">${escapeHtml(i18n.journalList.colStatus)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="8" class="center" style="padding:20px;color:#888">${escapeHtml(i18n.journalList.empty)}</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="4" class="right">${escapeHtml(i18n.journalList.totals)}</th>
          <th class="left num">${formatAmountFixed2(totalDebit)}</th>
          <th class="left num">${formatAmountFixed2(totalCredit)}</th>
          <th colspan="2"></th>
        </tr>
      </tfoot>
    </table>
    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.reviewer)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>
    ${buildFooter(company, i18n.journalList.title)}
  `;

  openPrintWindow(html, `${i18n.journalList.previewTitle} - ${headerCompanyName}`.trim(), locale);
}

function invoiceStatusLabel(status: string, locale: PrintLocale): string {
  const ar: Record<string, string> = {
    Paid: 'مدفوعة',
    PartiallyPaid: 'جزئياً',
    Issued: 'مصدرة',
    Draft: 'مسودة',
    Cancelled: 'ملغاة',
  };
  const en: Record<string, string> = {
    Paid: 'Paid',
    PartiallyPaid: 'Partial',
    Issued: 'Issued',
    Draft: 'Draft',
    Cancelled: 'Cancelled',
  };
  const map = locale === 'en' ? en : ar;
  return map[status] ?? status;
}

export interface InvoicesListPrintOptions {
  title: string;
  partyColumnLabel: string;
  filters?: PrintListFilters;
}

export function printInvoicesList(
  invoices: SalesInvoiceDto[],
  options: InvoicesListPrintOptions,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
) {
  const filters = options.filters ?? {};
  const totalAmount = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalRemaining = invoices.reduce((s, i) => s + (i.remainingAmount || 0), 0);

  const rows = invoices.map((inv, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="center"><strong class="num">${escapeHtml(inv.invoiceNumber)}</strong></td>
      <td class="center">${formatDate(inv.invoiceDate)}</td>
      <td>${escapeHtml(inv.customerName ?? '—')}</td>
      <td class="center">${escapeHtml(inv.currency || 'IQD')}</td>
      <td class="left num">${formatAmountFixed2(inv.totalAmount)}</td>
      <td class="left num">${formatAmountFixed2(inv.paidAmount)}</td>
      <td class="left num">${formatAmountFixed2(inv.remainingAmount)}</td>
      <td class="center">${escapeHtml(invoiceStatusLabel(inv.status, locale))}</td>
    </tr>
  `).join('');

  const fromTxt = filters.fromDate ? formatDate(filters.fromDate) : '—';
  const toTxt = filters.toDate ? formatDate(filters.toDate) : '—';
  const statusTxt = filters.status ? invoiceStatusLabel(filters.status, locale) : (locale === 'en' ? 'All' : 'الكل');
  const printedAt = formatPrintedAt(locale);
  const headerCompanyName = locale === 'en' ? (company?.nameEn || company?.nameAr || '') : (company?.nameAr || '');
  const colParty = escapeHtml(options.partyColumnLabel);
  const listTitle = escapeHtml(options.title);
  const emptyMsg = locale === 'en' ? 'No invoices' : 'لا توجد فواتير';
  const totalsLbl = locale === 'en' ? 'Totals' : 'الإجماليات';

  const html = `
    ${buildBrandHeader(company, printedAt, getPrintI18n(locale), locale)}
    <div class="report-title">${listTitle}</div>
    <div class="doc-meta">
      <div class="item"><span class="label">${locale === 'en' ? 'From' : 'من'}</span><span class="value">${fromTxt}</span></div>
      <div class="item"><span class="label">${locale === 'en' ? 'To' : 'إلى'}</span><span class="value">${toTxt}</span></div>
      <div class="item"><span class="label">${locale === 'en' ? 'Status' : 'الحالة'}</span><span class="value">${escapeHtml(statusTxt)}</span></div>
      <div class="item"><span class="label">${locale === 'en' ? 'Count' : 'العدد'}</span><span class="value">${invoices.length}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">#</th>
          <th class="center" style="width:90px">${locale === 'en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
          <th class="center" style="width:80px">${locale === 'en' ? 'Date' : 'التاريخ'}</th>
          <th>${colParty}</th>
          <th class="center" style="width:50px">${locale === 'en' ? 'Currency' : 'العملة'}</th>
          <th class="left" style="width:90px">${locale === 'en' ? 'Total' : 'الإجمالي'}</th>
          <th class="left" style="width:90px">${locale === 'en' ? 'Paid' : 'المدفوع'}</th>
          <th class="left" style="width:90px">${locale === 'en' ? 'Remaining' : 'المتبقي'}</th>
          <th class="center" style="width:60px">${locale === 'en' ? 'Status' : 'الحالة'}</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="9" class="center" style="padding:20px;color:#888">${emptyMsg}</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="5" class="right">${totalsLbl}</th>
          <th class="left num">${formatAmountFixed2(totalAmount)}</th>
          <th class="left num">${formatAmountFixed2(totalPaid)}</th>
          <th class="left num">${formatAmountFixed2(totalRemaining)}</th>
          <th></th>
        </tr>
      </tfoot>
    </table>
    <div class="signatures">
      <div class="sig">${locale === 'en' ? 'Accountant' : 'المحاسب'}</div>
      <div class="sig">${locale === 'en' ? 'Reviewer' : 'المراجع'}</div>
      <div class="sig">${locale === 'en' ? 'Financial Manager' : 'المدير المالي'}</div>
    </div>
    ${buildFooter(company, listTitle)}
  `;

  openPrintWindow(html, `${listTitle} - ${headerCompanyName}`.trim(), locale);
}

export function printSingleJournalEntry(
  e: JournalEntryDto,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  // ‎اسم الحساب بحسب اللغة: نُفضّل accountNameEn في EN ثم accountName كاحتياط.
  const accountDisplayName = (l: JournalEntryDto['lines'][number]): string => {
    if (locale === 'en') {
      return (l.accountNameEn?.trim()) || (l.accountName?.trim()) || (l.accountNameAr?.trim()) || `#${l.accountId}`;
    }
    return (l.accountNameAr?.trim()) || (l.accountName?.trim()) || `#${l.accountId}`;
  };
  const lines = e.lines.map((l, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(accountDisplayName(l))}</td>
      <td>${escapeHtml(l.description ?? '')}</td>
      <td class="left num">${l.isDebit ? formatAmountFixed2(l.amount) : '—'}</td>
      <td class="left num">${!l.isDebit ? formatAmountFixed2(l.amount) : '—'}</td>
    </tr>
  `).join('');

  const printedAt = formatPrintedAt(locale);

  const voucherHeader = e.voucherNumber
    ? `<div class="item"><span class="label">${escapeHtml(i18n.singleEntry.voucherNumber)}</span><span class="value num" style="color:#1f6f43;font-size:14px">${escapeHtml(e.voucherNumber)}</span></div>
       <div class="item"><span class="label">${escapeHtml(i18n.singleEntry.entryNumber)}</span><span class="value num">#${escapeHtml(e.entryNumber)}</span></div>`
    : `<div class="item"><span class="label">${escapeHtml(i18n.singleEntry.entryNumber)}</span><span class="value num">${escapeHtml(e.entryNumber)}</span></div>`;
  // ‎الرقم اليدوي (شيك / مرجع خارجي) — يظهر كخلية إضافية في الميتا، فقط
  // ‎إن وُجد على القيد. يُطبع بلون مميّز (كهرماني) ليُسهل تمييزه بصرياً.
  const manualNumberCell = e.manualNumber
    ? `<div class="item"><span class="label">${escapeHtml(i18n.singleEntry.manualNumber)}</span><span class="value num" style="color:#b45309;direction:ltr;text-align:start">${escapeHtml(e.manualNumber)}</span></div>`
    : '';
  const metaCols = (e.voucherNumber ? 5 : 4) + (e.manualNumber ? 1 : 0);

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.singleEntry.title)}</div>
    <div class="doc-meta" style="grid-template-columns: repeat(${metaCols}, 1fr)">
      ${voucherHeader}
      ${manualNumberCell}
      <div class="item"><span class="label">${escapeHtml(i18n.singleEntry.date)}</span><span class="value">${formatDate(e.entryDate)}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.singleEntry.type)}</span><span class="value">${escapeHtml(typeLabel(e.entryType, i18n))}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.singleEntry.currency)}</span><span class="value">${escapeHtml(e.currency || 'IQD')}</span></div>
    </div>
    <div style="background:#f8f9fa;padding:8px 10px;border-${locale === 'en' ? 'left' : 'right'}:3px solid #2c3e50;margin-bottom:10px;font-size:12px">
      <div style="font-size:10px;color:#555;margin-bottom:2px">${escapeHtml(i18n.singleEntry.generalDescription)}</div>
      <div style="font-weight:600">${escapeHtml(e.description) || '—'}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:30px">${escapeHtml(i18n.singleEntry.colNo)}</th>
          <th>${escapeHtml(i18n.singleEntry.colAccount)}</th>
          <th>${escapeHtml(i18n.singleEntry.colDescription)}</th>
          <th class="left" style="width:120px">${escapeHtml(i18n.singleEntry.colDebit)}</th>
          <th class="left" style="width:120px">${escapeHtml(i18n.singleEntry.colCredit)}</th>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="right">${escapeHtml(i18n.singleEntry.total)}</th>
          <th class="left num">${formatAmountFixed2(e.totalDebit)}</th>
          <th class="left num">${formatAmountFixed2(e.totalCredit)}</th>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:14px;padding:6px 10px;background:#f1f8ff;border:1px solid #b3d7ff;border-radius:4px;font-size:11px">
      <strong>${escapeHtml(i18n.singleEntry.statusLabel)}</strong> ${statusBadgeHtml(e.status, i18n)}
    </div>
    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.reviewer)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>
    ${buildFooter(company, i18n.singleEntry.footer(escapeHtml(e.entryNumber)))}
  `;

  openPrintWindow(html, i18n.singleEntry.previewTitle(e.entryNumber), locale);
}

/**
 * طباعة كشف حساب — جدول مستقل لكل عملة بنفس تخطيط الواجهة:
 *   - رأس مُلوَّن باسم العملة + ملخّص (مدين/دائن/الرصيد).
 *   - صف رصيد افتتاحي (إن وُجد).
 *   - بنود الحركات مع رصيد جارٍ بعملة السطر ورصيد مقوَّم بالعملة الأساسية.
 *   - فوتر إجمالي العملة.
 * في الأسفل بطاقة "الإجمالي المُقوَّم بالعملة الأساسية" (افتتاحي/مدين/دائن/ختامي).
 */
/** تكوين أعمدة كشف الحساب كما يراها المستخدم لحظة الطباعة */
export interface StatementPrintColConfig {
  order:  string[];                  // StatementColKey[] بالترتيب الفعلي
  hidden: string[];                  // الأعمدة المخفية
  widths: Record<string, number>;    // عرض كل عمود بالـ px
}

/** خيارات إضافية لطباعة كشف الحساب — للأسماء بالإنجليزية وغيرها. */
export interface StatementPrintExtra {
  /** اسم الحساب بالإنجليزية للعرض الرئيسي عند locale='en' (اختياري). */
  accountNameEn?: string | null;
  /** خريطة code → nameEn لأسماء الحسابات في صفوف «جميع الحسابات». */
  accountNamesEn?: Record<string, string>;
}

export function printAccountStatement(
  data: AccountStatementDto,
  company: CompanySettingsDto | null | undefined,
  colConfig?: StatementPrintColConfig,
  locale: PrintLocale = getPrintLocale(),
  extra: StatementPrintExtra = {},
) {
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const isAll = data.isAllAccounts;
  const base = data.baseCurrency || 'IQD';

  const rowAccountName = (code: string, nameAr: string): string => {
    if (locale === 'en') {
      return extra.accountNamesEn?.[code]?.trim() || nameAr || '';
    }
    return nameAr || '';
  };

  // ‎اسم الحساب المعروض: عند EN نُفضّل accountNameEn ثم accountName.
  const displayAccountName = locale === 'en'
    ? (extra.accountNameEn?.trim() || data.accountName || '')
    : (data.accountName || '');
  const accountLine = isAll
    ? i18n.statement.allAccounts
    : `${data.accountCode ?? ''} - ${displayAccountName}`;

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
    { label: i18n.statement.fromDate, value: formatDate(data.fromDate) },
    { label: i18n.statement.toDate, value: formatDate(data.toDate) },
    { label: i18n.statement.account, value: escapeHtml(accountLine) },
    { label: i18n.statement.displayFilter, value: escapeHtml(data.currency || i18n.statement.all) },
    { label: i18n.statement.baseCurrency, value: escapeHtml(base) },
  ];
  const metaHtml = metaItems
    .map(m => `<div class="item"><span class="label">${escapeHtml(m.label)}</span><span class="value">${m.value}</span></div>`)
    .join('');

  // ── 7) حساب الأعمدة الفعلية من colConfig (أو الافتراضية)
  const PRINTABLE_COLS = ['idx','date','entry','account','desc','debit','credit','balance','valBalance','currency'] as const;
  type PrintCol = typeof PRINTABLE_COLS[number];

  const COL_LABEL_PRINT: Record<PrintCol, string> = {
    idx: i18n.statement.colIdx, date: i18n.statement.colDate, entry: i18n.statement.colEntry, account: i18n.statement.colAccount,
    desc: i18n.statement.colDesc, debit: i18n.statement.colDebit, credit: i18n.statement.colCredit, balance: i18n.statement.colBalance,
    valBalance: i18n.statement.colValBalance(escapeHtml(base)), currency: i18n.statement.colCurrency,
  };

  const COL_DEFAULT_PX: Record<PrintCol, number> = {
    idx: 50, date: 110, entry: 110, account: 240, desc: 280,
    debit: 130, credit: 130, balance: 140, valBalance: 150, currency: 70,
  };

  // الأعمدة المرئية = نفس الأعمدة المعروضة على الشاشة بالترتيب نفسه.
  // الواجهة تمرّر بالفعل visibleCols.filter(k !== 'actions')، لذا نحترمها
  // كما هي ولا نُعيد فلترتها. نتأكد فقط أن المفاتيح ضمن الأعمدة القابلة للطباعة.
  const visibleCols: PrintCol[] = (() => {
    const requested = (colConfig?.order ?? [])
      .filter((k): k is PrintCol => (PRINTABLE_COLS as readonly string[]).includes(k));
    if (requested.length > 0) {
      // احترام الترتيب والإخفاء كما حدّدته الواجهة (بدون إعادة فلترة)
      return requested;
    }
    // لا يوجد colConfig: ارجع للترتيب الافتراضي مع احترام isAll
    const def = [...PRINTABLE_COLS];
    return isAll ? def : def.filter(k => k !== 'account');
  })();

  // عرض كل عمود بالـ px من colConfig أو الافتراضي
  const pxWidths: Record<PrintCol, number> = {} as Record<PrintCol, number>;
  for (const k of PRINTABLE_COLS) {
    pxWidths[k] = colConfig?.widths[k] ?? COL_DEFAULT_PX[k];
  }

  // إجمالي عرض الأعمدة المرئية (لحساب النسب)
  const totalPx = visibleCols.reduce((s, k) => s + pxWidths[k], 0);
  // A4 landscape ≈ 277mm صالحة
  const LANDSCAPE_MM = 277;

  // تحويل px → mm (نسبياً) مع إعطاء desc مرونة auto
  function colWidthStyle(k: PrintCol): string {
    if (k === 'desc') return ''; // auto / flex
    const mm = (pxWidths[k] / totalPx) * LANDSCAPE_MM;
    return `width:${mm.toFixed(1)}mm`;
  }

  // ── 8) جدول واحد لكل عملة
  const buildCurrencyTable = (cur: string, rows: EnrichedRow[], totals: Totals): string => {
    const showOpeningRow = totals.opening !== 0 || totals.openingValuated !== 0;
    const colspan = visibleCols.indexOf('desc') + 1 || visibleCols.length - 5;

    // colgroup
    const colgroup = `<colgroup>${
      visibleCols.map(k => `<col${colWidthStyle(k) ? ` style="${colWidthStyle(k)}"` : ''}>`).join('')
    }</colgroup>`;

    // رأس الجدول
    const headCells = visibleCols.map(k => {
      const align = ['debit','credit','balance','valBalance'].includes(k) ? 'left'
                  : k === 'idx' || k === 'currency' || k === 'entry' ? 'center' : 'right';
      return `<th class="${align}">${COL_LABEL_PRINT[k]}</th>`;
    }).join('');

    // صف الافتتاحي
    const openingCells = visibleCols.map(k => {
      if (k === 'idx') return `<td class="center">—</td>`;
      if (k === 'date') return `<td class="num">${formatDate(data.fromDate)}</td>`;
      if (k === 'entry') return `<td class="center">—</td>`;
      if (k === 'account') return `<td>—</td>`;
      if (k === 'desc') return `<td><em>${escapeHtml(i18n.statement.openingBalance)}</em></td>`;
      if (k === 'debit') return `<td class="left num">—</td>`;
      if (k === 'credit') return `<td class="left num">—</td>`;
      if (k === 'balance') return `<td class="left num">${totals.opening !== 0 ? formatAmountFixed2(totals.opening) : '—'}</td>`;
      if (k === 'valBalance') return `<td class="left num">${formatAmountFixed2(totals.openingValuated)}</td>`;
      if (k === 'currency') return `<td class="center">${escapeHtml(cur)}</td>`;
      return '<td>—</td>';
    }).join('');
    const openingRow = showOpeningRow
      ? `<tr class="opening-row">${openingCells}</tr>`
      : '';

    // صفوف البيانات
    const rowsHtml = rows.map((r, idx) => {
      // ‎الرقم اليدوي (إن وُجد) يُلصق أسفل رقم القيد بلون كهرماني خفيف ليتميّز
      // ‎عن الأرقام النظامية في كشف الحساب.
      const manualLine = r.manualNumber
        ? `<br><span class="num" style="font-size:8.5px;color:#b45309;direction:ltr">#${escapeHtml(r.manualNumber)}</span>`
        : '';
      const entryCell = r.voucherNumber
        ? `<strong class="num">${escapeHtml(r.voucherNumber)}</strong><br><span class="num" style="font-size:8.5px;color:#777">#${escapeHtml(r.entryNumber)}</span>${manualLine}`
        : `<span class="num">#${escapeHtml(r.entryNumber)}</span>${manualLine}`;

      const cells = visibleCols.map(k => {
        if (k === 'idx')       return `<td class="center">${idx + 1}</td>`;
        if (k === 'date')      return `<td class="num">${formatDate(r.date)}</td>`;
        if (k === 'entry')     return `<td class="center">${entryCell}</td>`;
        if (k === 'account')   return `<td style="font-size:9.5px"><span class="num" style="color:#1f6f43">${escapeHtml(r.accountCode)}</span> ${escapeHtml(rowAccountName(r.accountCode, r.accountName))}</td>`;
        if (k === 'desc')      return `<td style="font-size:9.5px">${escapeHtml(r.lineDescription || r.description || '—')}</td>`;
        if (k === 'debit')     return `<td class="left num">${r.debit > 0 ? formatAmountFixed2(r.debit) : '<span style="color:#bbb">—</span>'}</td>`;
        if (k === 'credit')    return `<td class="left num">${r.credit > 0 ? formatAmountFixed2(r.credit) : '<span style="color:#bbb">—</span>'}</td>`;
        if (k === 'balance')   return `<td class="left num"><strong class="c-balance">${formatAmountFixed2(r.runningBalance)}</strong></td>`;
        if (k === 'valBalance')return `<td class="left num" style="color:#7a4f01"><strong>${formatAmountFixed2(r.runningValuated)}</strong></td>`;
        if (k === 'currency')  return `<td class="center" style="font-weight:700;color:#1d4ed8">${escapeHtml(r.currency)}</td>`;
        return '<td>—</td>';
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    // صف الإجماليات — يحترم ترتيب الأعمدة المرئية ويملأ غير المبلغية بخلية فارغة
    const labelText = i18n.statement.totalsRowLabel(
      totals.opening ? formatAmountFixed2(totals.opening) : null
    );
    const amountSet = new Set(['debit','credit','balance','valBalance','currency']);
    const firstAmtIdx = visibleCols.findIndex(c => amountSet.has(c));
    const leadingNonAmt = firstAmtIdx >= 0 ? firstAmtIdx : visibleCols.length;

    const totalParts: string[] = [];
    if (leadingNonAmt > 0) {
      totalParts.push(`<th colspan="${leadingNonAmt}" class="right">${labelText}</th>`);
    }
    for (let i = leadingNonAmt; i < visibleCols.length; i++) {
      const k = visibleCols[i];
      if (k === 'debit')           totalParts.push(`<th class="left num c-debit">${formatAmountFixed2(totals.debit)}</th>`);
      else if (k === 'credit')     totalParts.push(`<th class="left num c-credit">${formatAmountFixed2(totals.credit)}</th>`);
      else if (k === 'balance')    totalParts.push(`<th class="left num c-balance">${formatAmountFixed2(totals.balance)}</th>`);
      else if (k === 'valBalance') totalParts.push(`<th class="left num c-valuated">${formatAmountFixed2(totals.balanceValuated)}</th>`);
      else if (k === 'currency')   totalParts.push(`<th class="center"><b>${escapeHtml(cur)}</b></th>`);
      else                          totalParts.push(`<th>&nbsp;</th>`); // خلية فارغة للمحافظة على الترتيب
    }
    const totalCells = totalParts.join('');

    return `
      <section class="ccy-block">
        <header class="ccy-head">
          <div class="ccy-head-left">
            <span class="ccy-badge">${escapeHtml(cur)}</span>
            <span class="ccy-title">${escapeHtml(i18n.statement.currencyMovements(cur))}</span>
            <span class="ccy-count">${escapeHtml(i18n.statement.movementsCount(rows.length))}</span>
          </div>
          <div class="ccy-summary">
            <span>${escapeHtml(i18n.statement.debitLbl)} <b class="num c-debit">${formatAmountFixed2(totals.debit)}</b></span>
            <span>${escapeHtml(i18n.statement.creditLbl)} <b class="num c-credit">${formatAmountFixed2(totals.credit)}</b></span>
            <span>${escapeHtml(i18n.statement.balanceLbl)} <b class="num c-balance">${formatAmountFixed2(totals.balance)}</b></span>
          </div>
        </header>
        <table>
          ${colgroup}
          <thead><tr>${headCells}</tr></thead>
          <tbody>
            ${openingRow}
            ${rowsHtml || `<tr><td colspan="${colspan + 5}" class="center" style="padding:18px;color:#888">${escapeHtml(i18n.statement.noMovements)}</td></tr>`}
          </tbody>
          <tfoot><tr>${totalCells}</tr></tfoot>
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
        .join('<hr class="ccy-divider" />\n')
    : `<div style="padding:18px;text-align:center;color:#888;border:1px dashed #ccc;border-radius:6px">${escapeHtml(i18n.statement.noMovementsCriteria)}</div>`;

  const fxWarn = data.fxUsedFallback
    ? `<div style="margin-top:10px;font-size:10px;color:#856404;background:#fff3cd;padding:8px;border-radius:4px;border:1px solid #ffeeba">${escapeHtml(i18n.statement.fxFallbackWarn)}</div>`
    : '';

  // بطاقة الإجمالي المُقوَّم بالعملة الأساسية (مطابقة لشكل الواجهة)
  const baseTotalsHtml = `
    <section class="base-summary">
      <header class="base-summary-head">
        <span>${escapeHtml(i18n.statement.grandTotalTitle(base))}</span>
      </header>
      <div class="base-summary-grid">
        <div class="bs-cell">
          <div class="bs-label">${escapeHtml(i18n.statement.openingBalanceLbl)}</div>
          <div class="bs-value num c-opening">${formatAmountFixed2(data.openingBalanceValuated ?? data.openingBalance)}</div>
        </div>
        <div class="bs-cell">
          <div class="bs-label">${escapeHtml(i18n.statement.totalDebitLbl)}</div>
          <div class="bs-value num c-debit">${formatAmountFixed2(data.totalDebitValuated ?? data.totalDebit)}</div>
        </div>
        <div class="bs-cell">
          <div class="bs-label">${escapeHtml(i18n.statement.totalCreditLbl)}</div>
          <div class="bs-value num c-credit">${formatAmountFixed2(data.totalCreditValuated ?? data.totalCredit)}</div>
        </div>
        <div class="bs-cell highlight">
          <div class="bs-label">${escapeHtml(i18n.statement.closingBalanceLbl)}</div>
          <div class="bs-value num c-balance"><b>${formatAmountFixed2(data.closingBalanceValuated ?? data.closingBalance)}</b></div>
        </div>
      </div>
      ${
        currenciesPresent.length > 1
          ? `<div class="base-summary-foot">${i18n.statement.multiCurrencyFoot(currenciesPresent.length, data.fxBulletinName ? escapeHtml(data.fxBulletinName) : null)}</div>`
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

    /* A4 أفقي للكشف — يمنح مساحة كافية للأعمدة العشرة */
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 277mm; }

    @media print {
      .ccy-block, .base-summary { box-shadow: none; }
    }
  `;

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.statement.title)}</div>
    <div class="doc-meta">${metaHtml}</div>

    <style>${styles}</style>

    ${ccyTablesHtml}

    ${fxWarn}

    ${baseTotalsHtml}

    ${buildFooter(company, i18n.statement.title)}
  `;

  openPrintWindow(html, `${i18n.statement.previewTitle} - ${accountLine}`, locale);
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
    background: #fff8e1; border-inline-start: 3px solid #d4a017; border-radius: 4px;
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
    border-inline-start: 3px solid #2c3e50;
  }
  .v-info-grid .cell .lbl { color: #555; font-size: 10px; display: block; margin-bottom: 2px; }
  .v-info-grid .cell .val { font-weight: 600; font-size: 12px; }

  .v-desc {
    background: #f8f9fa; border-inline-start: 3px solid #555; padding: 5px 10px;
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

function openSingleVoucherWindow(html: string, title: string, locale: PrintLocale = getPrintLocale()) {
  const i18n = getPrintI18n(locale);
  const dir = getPrintDir(locale);
  const cutContent = `\\2702  ${i18n.voucher.cutHere}  \\2702`.replace(/'/g, "\\'");
  const bodyDirStyle = `<style>
    body { direction: ${dir}; }
    .copy-divider::after { content: '${cutContent}'; }
  </style>`;
  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${SINGLE_VOUCHER_STYLES}</style>
${bodyDirStyle}
</head>
<body>
  ${html}
</body>
</html>`;
  openPrintPreview(fullDoc, title, locale);
}

function buildVoucherMiniHeader(
  company: CompanySettingsDto | null,
  copyLabel: string,
  copyKind: 'company' | 'customer',
  printedAt: string,
  i18n: PrintI18n,
  locale: PrintLocale,
): string {
  const c = company || ({} as CompanySettingsDto);
  const heading = locale === 'en'
    ? (c.nameEn || c.printHeader || c.nameAr || i18n.brand.defaultCompanyName)
    : (c.printHeader || c.nameAr || i18n.brand.defaultCompanyName);
  const logo = c.logoBase64 ? `<img class="logo" src="${escapeHtml(c.logoBase64)}" alt="logo">` : '';
  const contactBits: string[] = [];
  const displayAddress = locale === 'en' ? (c.addressEn || c.address) : (c.address || c.addressEn);
  if (displayAddress) contactBits.push(`<span>${escapeHtml(displayAddress)}</span>`);
  if (c.phone) contactBits.push(`<span>${escapeHtml(i18n.brand.phone)} ${escapeHtml(c.phone)}</span>`);
  const contact = contactBits.length ? `<div class="contact">${contactBits.join(' • ')}</div>` : '';

  return `
    <div class="v-head">
      <div class="brand">
        ${logo}
        <div class="titles">
          <h1>${escapeHtml(heading)}</h1>
          ${contact}
        </div>
      </div>
      <div class="v-head-right">
        <div class="copy-label ${copyKind}">${escapeHtml(copyLabel)}</div>
        <div class="printed-at">
          <span class="lbl">${escapeHtml(i18n.voucher.printedAtLbl)}</span>
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
  i18n: PrintI18n,
  locale: PrintLocale,
): string {
  const { entry, voucherTypeName, voucherNature, cashBoxName, counterAccountName, counterAccountCode, company } = input;

  const amount = entry.totalDebit || entry.totalCredit;
  const currency = entry.currency || 'IQD';

  const isReceipt = voucherNature === 'Debit';
  const isPayment = voucherNature === 'Credit';

  const titleCls = isReceipt ? 'receipt' : isPayment ? 'payment' : '';
  const statementVerb =
    isReceipt ? i18n.voucher.receiptVerb :
    isPayment ? i18n.voucher.paymentVerb :
    i18n.voucher.otherSideVerb;

  // ‎التفقيط مدعوم بالعربية فقط حالياً (مكتبة tafqeet). في وضع EN نَعرض المبلغ
  // ‎رقمياً + العملة فقط (لا تفقيط إنجليزي).
  const amountInWords = locale === 'en' ? '' : tafqeet(amount, { currency });

  const counterRole =
    isReceipt ? i18n.voucher.counterRoleReceipt :
    isPayment ? i18n.voucher.counterRolePayment :
    i18n.voucher.counterRoleOther;

  const counterFull = counterAccountCode
    ? `${counterAccountCode} — ${counterAccountName}`
    : counterAccountName;

  return `
    <section class="voucher-copy">
      ${buildVoucherMiniHeader(company, copyLabel, copyKind, printedAt, i18n, locale)}

      <div class="v-title-row">
        <div class="v-title ${titleCls}">${escapeHtml(voucherTypeName)}</div>
        <div class="v-meta">
          ${entry.voucherNumber
            ? `<div class="item"><span class="lbl">${escapeHtml(i18n.voucher.voucherNumber)}</span><strong class="num" style="font-size:15px">${escapeHtml(entry.voucherNumber)}</strong></div>
               <div class="item"><span class="lbl">${escapeHtml(i18n.voucher.entryNumber)}</span><strong class="num" style="color:#666">#${escapeHtml(entry.entryNumber)}</strong></div>`
            : `<div class="item"><span class="lbl">${escapeHtml(i18n.voucher.voucherNumber)}</span><strong class="num">${escapeHtml(entry.entryNumber)}</strong></div>`
          }
          ${entry.manualNumber ? `<div class="item"><span class="lbl">${escapeHtml(i18n.singleEntry.manualNumber)}</span><strong class="num" style="color:#b45309;direction:ltr">${escapeHtml(entry.manualNumber)}</strong></div>` : ''}
          <div class="item"><span class="lbl">${escapeHtml(i18n.voucher.entryDate)}</span><strong>${formatDate(entry.entryDate)}</strong></div>
        </div>
      </div>

      <div class="v-statement">
        ${escapeHtml(statementVerb)}
        <span class="field">${escapeHtml(counterFull)}</span>
        <br/>
        ${escapeHtml(i18n.voucher.amountIs)}
        <span class="v-amount-box">
          <span class="num">${formatAmountFixed2(amount)}</span>
          <span class="currency">${escapeHtml(currency)}</span>
        </span>
      </div>

      ${amountInWords ? `
      <div class="v-amount-words">
        <span class="lbl">${escapeHtml(i18n.voucher.amountInWords)}</span>
        <span class="val">${escapeHtml(amountInWords)}</span>
      </div>` : ''}

      <div class="v-info-grid">
        <div class="cell">
          <span class="lbl">${escapeHtml(i18n.voucher.entryType)}</span>
          <span class="val">${escapeHtml(voucherTypeName)}</span>
        </div>
        <div class="cell">
          <span class="lbl">${escapeHtml(i18n.voucher.cashBox)}</span>
          <span class="val">${escapeHtml(cashBoxName)}</span>
        </div>
      </div>

      <div class="v-desc">
        <span class="lbl">${escapeHtml(i18n.voucher.description)}</span>
        <span class="val">${escapeHtml(entry.description) || '—'}</span>
      </div>

      <div class="v-signatures">
        <div class="sig">
          <div class="role">${escapeHtml(i18n.signatures.cashier)}</div>
          <div class="name">${escapeHtml(cashBoxName)}</div>
        </div>
        <div class="sig">
          <div class="role">${escapeHtml(counterRole)}</div>
          <div class="name">${escapeHtml(counterAccountName)}</div>
        </div>
        <div class="sig">
          <div class="role">${escapeHtml(i18n.signatures.generalManager)}</div>
          <div class="name">&nbsp;</div>
        </div>
      </div>
    </section>
  `;
}

export function printSingleVoucher(input: PrintSingleVoucherInput, locale: PrintLocale = getPrintLocale()) {
  const i18n = getPrintI18n(locale);
  const { entry, voucherTypeName } = input;
  const printedAt = formatPrintedAt(locale);

  const html = `
    <div class="a4-sheet">
      ${buildVoucherCopy(input, i18n.voucher.companyCopy, 'company', printedAt, i18n, locale)}
      <hr class="copy-divider" />
      ${buildVoucherCopy(input, i18n.voucher.customerCopy, 'customer', printedAt, i18n, locale)}
    </div>
  `;

  const titleNumber = entry.voucherNumber
    ? `${entry.voucherNumber} (#${entry.entryNumber})`
    : i18n.voucher.titleSuffix(entry.entryNumber);
  openSingleVoucherWindow(html, i18n.voucher.previewTitle(voucherTypeName, titleNumber), locale);
}

// ═══════════════════════════════════════════════════════════════════════════
// طباعة ميزان المراجعة (Trial Balance)
// ═══════════════════════════════════════════════════════════════════════════

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
  return formatAmountFixed2(n);
}

/** خيارات إضافية لطباعة ميزان المراجعة. */
export interface TrialBalancePrintExtra {
  /** خرائط (accountCode → nameEn) لاستعمالها في وضع EN عند انعدام الاسم الإنجليزي بالـ DTO. */
  accountNamesEn?: Record<string, string>;
  /** إظهار حسابات الميزانية (Asset/Liability/Equity). افتراضي: true. */
  showBalanceSheet?: boolean;
  /** إظهار حسابات الأرباح والخسارة في الجدول. افتراضي: false. */
  showProfitLoss?: boolean;
  /** إظهار بطاقة احتساب الأرباح. افتراضي: true. */
  showProfitCalculation?: boolean;
}

const TB_PROFIT_LOSS_TYPES = new Set(['Revenue', 'Expense']);
const TB_BALANCE_SHEET_TYPES = new Set(['Asset', 'Liability', 'Equity']);

function tbIsProfitLossRow(r: TrialBalanceDto['rows'][number]): boolean {
  return TB_PROFIT_LOSS_TYPES.has(r.accountType);
}

function tbIsBalanceSheetRow(r: TrialBalanceDto['rows'][number]): boolean {
  return TB_BALANCE_SHEET_TYPES.has(r.accountType);
}

function computePrintTrialBalanceTotals(
  data: TrialBalanceDto,
  showBalanceSheet: boolean,
  showProfitLoss: boolean,
) {
  let leaves = data.rows.filter(r => r.isLeaf);
  if (!showBalanceSheet) leaves = leaves.filter(r => !tbIsBalanceSheetRow(r));
  if (!showProfitLoss) leaves = leaves.filter(r => !tbIsProfitLossRow(r));
  if (showBalanceSheet && showProfitLoss) {
    return {
      totalOpeningDebit: data.totalOpeningDebit,
      totalOpeningCredit: data.totalOpeningCredit,
      totalPeriodDebit: data.totalPeriodDebit,
      totalPeriodCredit: data.totalPeriodCredit,
      totalClosingDebit: data.totalClosingDebit,
      totalClosingCredit: data.totalClosingCredit,
    };
  }
  return leaves.reduce(
    (t, r) => ({
      totalOpeningDebit: t.totalOpeningDebit + (r.openingDebit ?? 0),
      totalOpeningCredit: t.totalOpeningCredit + (r.openingCredit ?? 0),
      totalPeriodDebit: t.totalPeriodDebit + (r.periodDebit ?? 0),
      totalPeriodCredit: t.totalPeriodCredit + (r.periodCredit ?? 0),
      totalClosingDebit: t.totalClosingDebit + (r.closingDebit ?? 0),
      totalClosingCredit: t.totalClosingCredit + (r.closingCredit ?? 0),
    }),
    {
      totalOpeningDebit: 0,
      totalOpeningCredit: 0,
      totalPeriodDebit: 0,
      totalPeriodCredit: 0,
      totalClosingDebit: 0,
      totalClosingCredit: 0,
    },
  );
}

export function printTrialBalance(
  data: TrialBalanceDto,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
  extra: TrialBalancePrintExtra = {},
) {
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const displayUnit = data.currency
    ? data.currency
    : (data.valuated ? (data.baseCurrency || 'IQD') : i18n.trialBalance.multiCurrency);

  const showBalanceSheet = extra.showBalanceSheet !== false;
  const showProfitLoss = extra.showProfitLoss === true;
  const showProfitCalculation = extra.showProfitCalculation !== false;

  let tableRows = data.rows;
  if (!showBalanceSheet) tableRows = tableRows.filter(r => !tbIsBalanceSheetRow(r));
  if (!showProfitLoss) tableRows = tableRows.filter(r => !tbIsProfitLossRow(r));

  const totals = computePrintTrialBalanceTotals(data, showBalanceSheet, showProfitLoss);

  const isBalanced = Math.abs(totals.totalClosingDebit - totals.totalClosingCredit) < 0.01;

  const rowName = (r: TrialBalanceDto['rows'][number]): string => {
    if (locale === 'en') {
      const fromMap = extra.accountNamesEn?.[r.accountCode];
      return fromMap?.trim() || (r as { accountNameEn?: string }).accountNameEn || r.accountName || '';
    }
    return r.accountName || '';
  };

  const rows = tableRows.map(r => {
    const indent = Math.max(0, (r.level - 1)) * 10;
    const colors = TRIAL_BALANCE_TYPE_COLORS[r.accountType] ?? { bg: '#e5e7eb', fg: '#374151' };
    const typeLbl = i18n.accountType[r.accountType as keyof typeof i18n.accountType] ?? r.accountType;
    const rowBg = r.isLeaf ? '' : 'background:#f3f4f6;font-weight:600;';
    return `
      <tr style="${rowBg}">
        <td class="center num" style="white-space:nowrap;">${escapeHtml(r.accountCode)}</td>
        <td><span style="padding-inline-start:${indent}px;">${escapeHtml(rowName(r))}</span></td>
        <td class="center">
          <span class="badge" style="background:${colors.bg};color:${colors.fg};border:1px solid ${colors.fg}33;">${escapeHtml(typeLbl)}</span>
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

  const profitLabel = data.netIncome >= 0 ? i18n.trialBalance.netProfit : i18n.trialBalance.netLoss;
  const profitColor = data.netIncome >= 0 ? '#047857' : '#b91c1c';
  // ‎التفقيط بالعربية فقط حالياً (مكتبة tafqeet). في EN نُخفيه.
  const profitInWords = locale === 'en' ? '' : tafqeet(Math.abs(data.netIncome), {
    currency: displayUnit === i18n.trialBalance.multiCurrency ? (data.baseCurrency || 'IQD') : displayUnit,
  });

  const filterChips: string[] = [];
  filterChips.push(`<span class="chip">${escapeHtml(i18n.trialBalance.fromDate)} <strong class="num">${escapeHtml(formatDate(data.fromDate))}</strong></span>`);
  filterChips.push(`<span class="chip">${escapeHtml(i18n.trialBalance.toDate)} <strong class="num">${escapeHtml(formatDate(data.toDate))}</strong></span>`);
  filterChips.push(`<span class="chip">${escapeHtml(i18n.trialBalance.currencyChip)} <strong>${escapeHtml(displayUnit)}</strong></span>`);
  if (data.leavesOnly) filterChips.push(`<span class="chip">${escapeHtml(i18n.trialBalance.leavesOnly)}</span>`);
  if (data.maxLevel != null) filterChips.push(`<span class="chip">${escapeHtml(i18n.trialBalance.maxLevel(data.maxLevel))}</span>`);
  if (data.valuated && !data.currency) {
    filterChips.push(`<span class="chip" style="background:#d1fae5;color:#047857;">${escapeHtml(i18n.trialBalance.valuated)}</span>`);
  }
  if (data.fxBulletinName) {
    filterChips.push(`<span class="chip" style="background:#eef2ff;color:#4338ca;">${escapeHtml(i18n.trialBalance.bulletin(data.fxBulletinName))}</span>`);
  }

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.trialBalance.title)}</div>

    <div class="tb-filters">${filterChips.join(' ')}</div>

    ${data.fxUsedFallback ? `
      <div class="tb-alert">
        ${escapeHtml(i18n.trialBalance.fxWarn)}
      </div>
    ` : ''}

    <table class="tb-table">
      <thead>
        <tr>
          <th rowspan="2" class="center" style="width:60px;">${escapeHtml(i18n.trialBalance.code)}</th>
          <th rowspan="2" class="right">${escapeHtml(i18n.trialBalance.account)}</th>
          <th rowspan="2" class="center" style="width:80px;">${escapeHtml(i18n.trialBalance.type)}</th>
          <th colspan="2" class="center" style="background:#475569;">${escapeHtml(i18n.trialBalance.prevPeriod)}</th>
          <th colspan="2" class="center" style="background:#1d4ed8;">${escapeHtml(i18n.trialBalance.currentMovement)}</th>
          <th colspan="2" class="center" style="background:#b45309;">${escapeHtml(i18n.trialBalance.closingBalance)}</th>
        </tr>
        <tr>
          <th class="center" style="background:#64748b;">${escapeHtml(i18n.trialBalance.debit)}</th>
          <th class="center" style="background:#64748b;">${escapeHtml(i18n.trialBalance.credit)}</th>
          <th class="center" style="background:#2563eb;">${escapeHtml(i18n.trialBalance.debit)}</th>
          <th class="center" style="background:#2563eb;">${escapeHtml(i18n.trialBalance.credit)}</th>
          <th class="center" style="background:#d97706;">${escapeHtml(i18n.trialBalance.debit)}</th>
          <th class="center" style="background:#d97706;">${escapeHtml(i18n.trialBalance.credit)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="center" style="background:#ecf0f1;">${escapeHtml(i18n.trialBalance.total)}</th>
          <th class="left num" style="border-right:1px solid #aaa;">${tbFmt(totals.totalOpeningDebit)}</th>
          <th class="left num">${tbFmt(totals.totalOpeningCredit)}</th>
          <th class="left num" style="border-right:1px solid #aaa;">${tbFmt(totals.totalPeriodDebit)}</th>
          <th class="left num">${tbFmt(totals.totalPeriodCredit)}</th>
          <th class="left num" style="border-right:1px solid #aaa;color:#047857;">${tbFmt(totals.totalClosingDebit)}</th>
          <th class="left num" style="color:#b45309;">${tbFmt(totals.totalClosingCredit)}</th>
        </tr>
      </tfoot>
    </table>

    <div class="tb-balance-badge">
      ${isBalanced
        ? `<span style="background:#d1fae5;color:#047857;">${escapeHtml(i18n.trialBalance.balanced)}</span>`
        : `<span style="background:#fee2e2;color:#b91c1c;">${escapeHtml(i18n.trialBalance.unbalanced)}</span>`}
    </div>

    ${showProfitCalculation ? `
    <div class="tb-profit-card">
      <div class="tb-profit-title">${escapeHtml(i18n.trialBalance.profitTitle)}</div>
      <table class="tb-profit-grid">
        <tr>
          <td class="lbl">${escapeHtml(i18n.trialBalance.totalRevenue)}</td>
          <td class="val num" style="color:#047857;">${formatAmountFixed2(data.totalRevenue)}</td>
          <td class="lbl">${escapeHtml(i18n.trialBalance.totalExpense)}</td>
          <td class="val num" style="color:#b91c1c;">${formatAmountFixed2(data.totalExpense)}</td>
          <td class="lbl">${escapeHtml(profitLabel)}</td>
          <td class="val num" style="color:${profitColor};font-size:14px;">${formatAmountFixed2(Math.abs(data.netIncome))}</td>
        </tr>
      </table>
      ${profitInWords ? `
      <div class="tb-profit-words">
        <span class="lbl">${escapeHtml(i18n.trialBalance.amountInWords)}</span>
        <span class="val">${escapeHtml(profitInWords)}</span>
      </div>` : ''}
      <div class="tb-formula">
        ${escapeHtml(i18n.trialBalance.formula)}
      </div>
    </div>
    ` : ''}

    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.auditor)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>

    ${buildFooter(company, i18n.trialBalance.footerText)}
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

  openTrialBalanceWindow(html, i18n.trialBalance.previewTitle, extraStyles, locale);
}

/** نافذة طباعة خاصة بميزان المراجعة — تشمل ستايلاته المخصّصة. */
function openTrialBalanceWindow(html: string, title: string, extraStyles: string, locale: PrintLocale = getPrintLocale()) {
  const dir = getPrintDir(locale);
  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}${extraStyles}
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 297mm; }
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;
  openPrintPreview(fullDoc, title, locale);
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
  /** الاسم الإنجليزي للصندوق (اختياري). يُستخدَم عند locale='en'. */
  nameEn?: string | null;
  accountId: number;
  accountCode?: string | null;
  accountName?: string | null;
  /** الاسم الإنجليزي للحساب المرتبط (اختياري). يُستخدَم عند locale='en'. */
  accountNameEn?: string | null;
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
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const headerCompanyName = locale === 'en' ? (company?.nameEn || company?.nameAr || '') : (company?.nameAr || '');
  // ‎اختيار اسم الصندوق/الحساب بحسب اللغة:
  const boxName = (b: PrintCashBoxBalance) =>
    locale === 'en' ? (b.nameEn?.trim() || b.nameAr) : b.nameAr;
  const accountName = (b: PrintCashBoxBalance) =>
    locale === 'en' ? (b.accountNameEn?.trim() || b.accountName || '') : (b.accountName || '');

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
        limitsParts.push(`<div style="${cls}">${escapeHtml(i18n.cashBoxes.debitLimitPrefix)} ${formatAmount(r.debitLimit)}</div>`);
      }
      if (r.creditLimit != null) {
        const cls = exceedsCredit ? 'color:#b91c1c;font-weight:700;' : 'color:#92400e;';
        limitsParts.push(`<div style="${cls}">${escapeHtml(i18n.cashBoxes.creditLimitPrefix)} ${formatAmount(r.creditLimit)}</div>`);
      }
      const limitsCell = limitsParts.length
        ? `<div class="num" style="font-size:9.5px;line-height:1.5;">${limitsParts.join('')}</div>`
        : '<span style="color:#aaa">—</span>';

      const boxCells = isBoxStart
        ? `
          <td rowspan="${rows.length}" style="${rowStyle}vertical-align:top;">
            <div style="font-weight:700">${escapeHtml(boxName(box))}</div>
            <code class="num" style="display:inline-block;margin-top:2px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;">${escapeHtml(box.code)}</code>
          </td>
          <td rowspan="${rows.length}" style="${rowStyle}vertical-align:top;font-size:10.5px;">
            ${box.accountCode ? `<span class="num" style="color:#1f6f43;font-weight:600">${escapeHtml(box.accountCode)}</span>` : ''}
            ${accountName(box) ? `<span style="color:#555"> - ${escapeHtml(accountName(box))}</span>` : ''}
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
              ? `<th rowspan="${totalsList.length}" colspan="2" class="right" style="background:#fef3c7;color:#92400e;">${escapeHtml(i18n.cashBoxes.totalByCurrency)}</th>`
              : ''}
            <td class="center num" style="font-weight:700;color:#92400e;background:#fffbeb;">${escapeHtml(t.currency)}</td>
            <td class="left num" style="font-weight:700;color:${balanceColor};background:#fffbeb;">${formatAmount(t.balance)}</td>
            <td class="left num" style="background:#fffbeb;">${formatAmount(t.debit)}</td>
            <td class="left num" style="background:#fffbeb;">${formatAmount(t.credit)}</td>
            <td class="center" style="background:#fffbeb;color:#6b7280;font-size:10px;">${t.boxCount} ${escapeHtml(i18n.cashBoxes.boxesSuffix)}</td>
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
          <span style="font-size:9px;color:#666;">${t.boxCount} ${escapeHtml(i18n.cashBoxes.boxesSuffix)}</span>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.cashBoxes.title)}</div>
    <div style="text-align:center;font-size:10.5px;color:#555;margin:0 0 8px;">
      ${escapeHtml(i18n.cashBoxes.subtitle)}
    </div>

    ${currencyChips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px;">${currencyChips}</div>` : ''}

    <div class="doc-meta" style="grid-template-columns:repeat(3,1fr);">
      <div class="item"><span class="label">${escapeHtml(i18n.cashBoxes.cashBoxesCount)}</span><span class="value num">${grouped.size}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.cashBoxes.currenciesCount)}</span><span class="value num">${totalsList.length}</span></div>
      <div class="item"><span class="label">${escapeHtml(i18n.cashBoxes.rowsCount)}</span><span class="value num">${balances.length}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="right" style="width:20%;">${escapeHtml(i18n.cashBoxes.cashBoxLabel)}</th>
          <th class="right" style="width:25%;">${escapeHtml(i18n.cashBoxes.accountLabel)}</th>
          <th class="center" style="width:8%;">${escapeHtml(i18n.cashBoxes.currencyLabel)}</th>
          <th class="left" style="width:14%;">${escapeHtml(i18n.cashBoxes.balance)}</th>
          <th class="left" style="width:12%;">${escapeHtml(i18n.cashBoxes.debit)}</th>
          <th class="left" style="width:12%;">${escapeHtml(i18n.cashBoxes.credit)}</th>
          <th class="center" style="width:9%;">${escapeHtml(i18n.cashBoxes.limits)}</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="7" class="center" style="padding:18px;color:#888">${escapeHtml(i18n.cashBoxes.empty)}</td></tr>`}
      </tbody>
      ${totalsRows ? `<tfoot>${totalsRows}</tfoot>` : ''}
    </table>

    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.cashier)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>

    ${buildFooter(company, i18n.cashBoxes.footerText)}
  `;

  openPrintWindow(html, `${i18n.cashBoxes.previewTitle} - ${headerCompanyName}`.trim(), locale);
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

function transferStatusLabel(s: PrintCashBoxTransfer['status'], i18n: PrintI18n): { label: string; bg: string; fg: string } {
  if (s === 'Received')  return { label: i18n.transfer.statusReceived, bg: '#d1fae5', fg: '#047857' };
  if (s === 'Cancelled') return { label: i18n.transfer.statusCancelled, bg: '#fee2e2', fg: '#b91c1c' };
  return                       { label: i18n.transfer.statusPending, bg: '#fef3c7', fg: '#92400e' };
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

/** خيارات إضافية لطباعة المناقلة — لتمرير الأسماء الإنجليزية المعروفة. */
export interface PrintCashBoxTransferExtra {
  fromCashBoxNameEn?: string | null;
  toCashBoxNameEn?: string | null;
  transitAccountNameEn?: string | null;
}

export function printCashBoxTransfer(
  t: PrintCashBoxTransfer,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
  extra: PrintCashBoxTransferExtra = {},
) {
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const status = transferStatusLabel(t.status, i18n);
  const amountWords = locale === 'en' ? '' : tafqeet(Math.abs(t.amount), { currency: t.currency });

  const fromBoxName = locale === 'en' ? (extra.fromCashBoxNameEn?.trim() || t.fromCashBoxName) : t.fromCashBoxName;
  const toBoxName = locale === 'en' ? (extra.toCashBoxNameEn?.trim() || t.toCashBoxName) : t.toCashBoxName;
  const transitName = locale === 'en' ? (extra.transitAccountNameEn?.trim() || t.transitAccountName || '') : (t.transitAccountName || '');

  // ─── طرف الإرسال (موجود دائماً)
  const sendCard = `
    <div class="ct-side ct-side--out">
      <div class="ct-side__head">
        <span class="ct-side__icon">⬅</span>
        <span>${escapeHtml(i18n.transfer.sendSideTitle)}</span>
      </div>
      <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.fromCashBox)}</span><span class="val">${escapeHtml(fromBoxName)} ${t.fromCashBoxCode ? `<code class="num">${escapeHtml(t.fromCashBoxCode)}</code>` : ''}</span></div>
      <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.sendDateTime)}</span><span class="val num">${fmtDateTime(t.sendDate)}</span></div>
      <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.sendEntry)}</span><span class="val num">${t.sendEntryNumber ? `#${escapeHtml(t.sendEntryNumber)}` : (t.sendJournalEntryId ? `#${t.sendJournalEntryId}` : '—')}</span></div>
      <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.sentAmount)}</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
    </div>
  `;

  // ─── طرف الاستلام: قد يكون مستلماً، أو بانتظار، أو ملغى
  let receiveCard = '';
  if (t.status === 'Received' && (t.receiveJournalEntryId || t.receiveEntryNumber)) {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--ok">
        <div class="ct-side__head">
          <span class="ct-side__icon">➡</span>
          <span>${escapeHtml(i18n.transfer.receiveSideTitle)}</span>
        </div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.toCashBox)}</span><span class="val">${escapeHtml(toBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.receiveDateTime)}</span><span class="val num">${fmtDateTime(t.receiveDate)}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.receiveEntry)}</span><span class="val num">${t.receiveEntryNumber ? `#${escapeHtml(t.receiveEntryNumber)}` : (t.receiveJournalEntryId ? `#${t.receiveJournalEntryId}` : '—')}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.receivedAmount)}</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
        ${t.receivedByUserId ? `<div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.approvedBy)}</span><span class="val">${escapeHtml(t.receivedByUserId)}</span></div>` : ''}
        ${t.receivedAt ? `<div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.approvalTime)}</span><span class="val num">${fmtDateTime(t.receivedAt)}</span></div>` : ''}
        ${t.receiveNotes ? `<div class="ct-side__row ct-side__notes"><span class="lbl">${escapeHtml(i18n.transfer.notes)}</span><span class="val">${escapeHtml(t.receiveNotes)}</span></div>` : ''}
      </div>
    `;
  } else if (t.status === 'Cancelled') {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--cancel">
        <div class="ct-side__head">
          <span class="ct-side__icon">⛔</span>
          <span>${escapeHtml(i18n.transfer.cancelSideTitle)}</span>
        </div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.targetCashBox)}</span><span class="val">${escapeHtml(toBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.reversalEntry)}</span><span class="val num">${t.reversalEntryNumber ? `#${escapeHtml(t.reversalEntryNumber)}` : (t.reversalJournalEntryId ? `#${t.reversalJournalEntryId}` : '—')}</span></div>
        ${t.cancelledByUserId ? `<div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.cancelledBy)}</span><span class="val">${escapeHtml(t.cancelledByUserId)}</span></div>` : ''}
        ${t.cancelledAt ? `<div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.cancelTime)}</span><span class="val num">${fmtDateTime(t.cancelledAt)}</span></div>` : ''}
        ${t.cancellationReason ? `<div class="ct-side__row ct-side__notes"><span class="lbl">${escapeHtml(i18n.transfer.cancelReason)}</span><span class="val">${escapeHtml(t.cancellationReason)}</span></div>` : ''}
      </div>
    `;
  } else {
    receiveCard = `
      <div class="ct-side ct-side--in ct-side--pending">
        <div class="ct-side__head">
          <span class="ct-side__icon">⏳</span>
          <span>${escapeHtml(i18n.transfer.pendingSideTitle)}</span>
        </div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.toCashBox)}</span><span class="val">${escapeHtml(toBoxName)} ${t.toCashBoxCode ? `<code class="num">${escapeHtml(t.toCashBoxCode)}</code>` : ''}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.expectedReceiveDate)}</span><span class="val num">${fmtDateTime(t.receiveDate)}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.receiveEntry)}</span><span class="val num" style="color:#92400e">${escapeHtml(i18n.transfer.pendingReceiveText)}</span></div>
        <div class="ct-side__row"><span class="lbl">${escapeHtml(i18n.transfer.expectedAmount)}</span><span class="val num ct-amount">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span></div>
      </div>
    `;
  }

  const transitInfo = (t.transitAccountCode || transitName)
    ? `<div class="item"><span class="label">${escapeHtml(i18n.transfer.transitAccount)}</span><span class="value">${t.transitAccountCode ? `<span class="num" style="color:#1f6f43;font-weight:600">${escapeHtml(t.transitAccountCode)}</span>` : ''}${transitName ? ` ${escapeHtml(transitName)}` : ''}</span></div>`
    : '';

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.transfer.title)}</div>

    <div class="ct-banner" style="background:${status.bg};color:${status.fg};">
      <div class="ct-banner__num">
        <span style="font-size:10px;opacity:.8;">${escapeHtml(i18n.transfer.transferNumber)}</span>
        <span class="num" style="font-size:16px;font-weight:800;">${escapeHtml(t.transferNumber)}</span>
      </div>
      <div class="ct-banner__status">
        <span style="font-size:10px;opacity:.8;">${escapeHtml(i18n.transfer.status)}</span>
        <span style="font-size:13px;font-weight:700;">${escapeHtml(status.label)}</span>
      </div>
      <div class="ct-banner__amt">
        <span style="font-size:10px;opacity:.8;">${escapeHtml(i18n.transfer.amount)}</span>
        <span class="num" style="font-size:18px;font-weight:800;">${formatAmount(t.amount)} ${escapeHtml(t.currency)}</span>
      </div>
    </div>

    <div class="doc-meta" style="grid-template-columns:repeat(3,1fr);">
      <div class="item"><span class="label">${escapeHtml(i18n.transfer.currency)}</span><span class="value num">${escapeHtml(t.currency)}</span></div>
      ${transitInfo}
      ${t.referenceNumber ? `<div class="item"><span class="label">${escapeHtml(i18n.transfer.externalRef)}</span><span class="value num">${escapeHtml(t.referenceNumber)}</span></div>` : ''}
      ${t.createdAt ? `<div class="item"><span class="label">${escapeHtml(i18n.transfer.createdAt)}</span><span class="value num">${fmtDateTime(t.createdAt)}</span></div>` : ''}
    </div>

    ${t.description ? `<div class="ct-desc"><span class="lbl">${escapeHtml(i18n.transfer.description)}</span> ${escapeHtml(t.description)}</div>` : ''}

    <div class="ct-grid">
      ${sendCard}
      ${receiveCard}
    </div>

    ${amountWords ? `
    <div class="ct-words">
      <span class="lbl">${escapeHtml(i18n.transfer.amountInWords)}</span>
      <span class="val">${escapeHtml(amountWords)}</span>
    </div>` : ''}

    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.sendingCashier)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.receivingCashier)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.accountantReviewer)}</div>
    </div>

    ${buildFooter(company, i18n.transfer.footerText)}
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

  const dir = getPrintDir(locale);
  const previewTitle = i18n.transfer.previewTitle(t.transferNumber);
  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(previewTitle)}</title>
  <style>${PRINT_STYLES}${extraStyles}
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;
  openPrintPreview(fullDoc, previewTitle, locale);
}

// ═══════════════════════════════════════════════════════════════════════════
// طباعة أرصدة الحسابات (Account Balances) — جدول ديناميكي
// ═══════════════════════════════════════════════════════════════════════════
//
// يبني تقريراً HTML يتكيّف مع البيانات والإعدادات:
//   - يُظهر/يُخفي عمودَي «مقوّم» تلقائياً حسب data.valuated.
//   - يَخفي عمود «العملة» إذا كل الصفوف بنفس عملة واحدة.
//   - يحترم ترتيب وإخفاء وعرض الأعمدة المُمَرَّر من الواجهة (colConfig)
//     ليُطابق ما يراه المستخدم على الشاشة بالضبط.
//   - يدعم تمرير `searchFilter` للإشارة إلى أن المعروض هو نتيجة بحث.

const ACCOUNT_BALANCES_TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Asset:     { bg: '#dbeafe', fg: '#1d4ed8' },
  Liability: { bg: '#fef3c7', fg: '#a16207' },
  Equity:    { bg: '#ede9fe', fg: '#6d28d9' },
  Revenue:   { bg: '#d1fae5', fg: '#047857' },
  Expense:   { bg: '#fee2e2', fg: '#b91c1c' },
};

/** نفس قاعدة tbFmt: 0 → "—" */
function abFmt(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  return formatAmountFixed2(n);
}

const FM_PARTY_KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  Supplier:       { bg: '#dbeafe', fg: '#1d4ed8' },
  Customer:       { bg: '#d1fae5', fg: '#047857' },
  Bank:           { bg: '#ede9fe', fg: '#6d28d9' },
  CashBox:        { bg: '#fef3c7', fg: '#a16207' },
  PaymentCompany: { bg: '#cffafe', fg: '#0e7490' },
};

export type AccountBalancesPrintCol =
  | 'idx'
  | 'code'
  | 'name'
  | 'type'
  | 'fmParty'
  | 'currency'
  | 'debit'
  | 'credit'
  | 'valDebit'
  | 'valCredit';

export interface AccountBalancesPrintPartyInfo {
  kind: string;
  categoryNameAr: string;
  categoryNameEn?: string | null;
}

export interface AccountBalancesPrintColConfig {
  order?: AccountBalancesPrintCol[];
  hidden?: AccountBalancesPrintCol[];
  widths?: Partial<Record<AccountBalancesPrintCol, number>>;
  searchFilter?: string;
  accountLabel?: string;
  /** خرائط (accountCode → nameEn) للاستخدام في وضع EN حين لا يوفّر الـ DTO الاسم الإنجليزي. */
  accountNamesEn?: Record<string, string>;
  /** إظهار عمود نوع الطرف (الإدارة المالية). */
  showFmPartyTypes?: boolean;
  /** عرض الأطراف فقط في التقرير. */
  partiesOnly?: boolean;
  /** أنواع الأطراف الفرعية المفعّلة (لشارة الفلتر). */
  fmCategoriesEnabled?: string[];
  /** إجمالي أنواع الأطراف الفرعية. */
  fmCategoriesTotal?: number;
  /** @deprecated استخدم fmCategoriesEnabled */
  fmKindsEnabled?: string[];
  /** accountId → بيانات الطرف المالي. */
  partiesByAccountId?: Record<number, AccountBalancesPrintPartyInfo>;
}

export function printAccountBalances(
  data: AccountBalancesDto,
  company: CompanySettingsDto | null = null,
  colConfig: AccountBalancesPrintColConfig = {},
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const base = data.baseCurrency || 'IQD';
  const isValuated = data.valuated;

  const showPartyTypeInTypeCol = colConfig.partiesOnly === true;
  const showFmPartyCol = colConfig.showFmPartyTypes === true && !showPartyTypeInTypeCol;

  const typeColLabel = showPartyTypeInTypeCol
    ? i18n.accountBalances.fmPartyKind
    : i18n.accountBalances.type;

  // ── 1) تحديد الأعمدة المتاحة + الترتيب
  const ALL_COLS: AccountBalancesPrintCol[] =
    ['idx', 'code', 'name', 'type', 'fmParty', 'currency', 'debit', 'credit', 'valDebit', 'valCredit'];

  const COL_LABEL: Record<AccountBalancesPrintCol, string> = {
    idx: i18n.accountBalances.idx,
    code: i18n.accountBalances.code,
    name: i18n.accountBalances.account,
    type: i18n.accountBalances.type,
    fmParty: i18n.accountBalances.fmPartyKind,
    currency: i18n.accountBalances.currency,
    debit: i18n.accountBalances.debit,
    credit: i18n.accountBalances.credit,
    valDebit: i18n.accountBalances.valDebit(base),
    valCredit: i18n.accountBalances.valCredit(base),
  };

  const COL_DEFAULT_PX: Record<AccountBalancesPrintCol, number> = {
    idx: 40, code: 70, name: 220, type: 72, fmParty: 88, currency: 60,
    debit: 110, credit: 110, valDebit: 120, valCredit: 120,
  };

  // العملات الموجودة في الصفوف — لو واحدة فقط نُخفي عمود العملة
  const distinctCurrencies = new Set<string>();
  for (const r of data.rows) distinctCurrencies.add((r.currency || '').toUpperCase());
  const showCurrencyCol = distinctCurrencies.size > 1;

  const hiddenSet = new Set<AccountBalancesPrintCol>(colConfig.hidden ?? []);

  function isColAllowed(k: AccountBalancesPrintCol): boolean {
    if (hiddenSet.has(k)) return false;
    if (k === 'fmParty' && !showFmPartyCol) return false;
    if (!isValuated && (k === 'valDebit' || k === 'valCredit')) return false;
    if (!showCurrencyCol && k === 'currency') return false;
    return true;
  }

  // ابدأ من الترتيب المُمَرَّر (إن وُجد) ثم أكمل بالأعمدة المتبقية، ثم فلتر بالمسموح.
  const requestedOrder = colConfig.order && colConfig.order.length > 0
    ? colConfig.order
    : ALL_COLS;
  const seenOrder = new Set<AccountBalancesPrintCol>();
  const orderedAll: AccountBalancesPrintCol[] = [];
  for (const k of requestedOrder) {
    if (!seenOrder.has(k) && ALL_COLS.includes(k)) {
      orderedAll.push(k);
      seenOrder.add(k);
    }
  }
  for (const k of ALL_COLS) {
    if (!seenOrder.has(k)) orderedAll.push(k);
  }
  const visibleCols: AccountBalancesPrintCol[] = orderedAll.filter(isColAllowed);

  // عرض الأعمدة بالـ px
  const pxWidths: Record<AccountBalancesPrintCol, number> = { ...COL_DEFAULT_PX };
  if (colConfig.widths) {
    for (const k of ALL_COLS) {
      const w = colConfig.widths[k];
      if (typeof w === 'number' && w > 0) pxWidths[k] = w;
    }
  }
  const totalPx = visibleCols.reduce((s, k) => s + pxWidths[k], 0);
  const LANDSCAPE_MM = 277;
  function colWidthStyle(k: AccountBalancesPrintCol): string {
    if (k === 'name') return ''; // الاسم مرن — auto
    const mm = (pxWidths[k] / totalPx) * LANDSCAPE_MM;
    return `width:${mm.toFixed(1)}mm`;
  }

  // ── 2) صف الجدول
  const renderHeadCell = (k: AccountBalancesPrintCol): string => {
    const align = (k === 'debit' || k === 'credit' || k === 'valDebit' || k === 'valCredit') ? 'left'
                : (k === 'idx' || k === 'currency' || k === 'type' || k === 'fmParty') ? 'center'
                : 'right';
    const label = k === 'type' ? typeColLabel : COL_LABEL[k];
    return `<th class="${align}">${escapeHtml(label)}</th>`;
  };

  const renderRowCell = (
    k: AccountBalancesPrintCol,
    r: AccountBalancesDto['rows'][number],
    idx: number,
  ): string => {
    switch (k) {
      case 'idx':
        return `<td class="center" style="color:#888">${idx + 1}</td>`;
      case 'code':
        return `<td class="center num" style="white-space:nowrap;color:#1f6f43;font-weight:600">${escapeHtml(r.accountCode)}</td>`;
      case 'name': {
        const indent = Math.max(0, (r.level - 1)) * 10;
        const nameStyle = !r.isLeaf ? 'font-weight:700;background:#f8f9fa;' : '';
        // ‎اسم الحساب: في EN نُفضّل colConfig.accountNamesEn[code] ثم accountNameEn من الـ DTO ثم accountName.
        const displayName = locale === 'en'
          ? (colConfig.accountNamesEn?.[r.accountCode]?.trim()
              || (r as { accountNameEn?: string }).accountNameEn
              || r.accountName)
          : r.accountName;
        return `<td style="${nameStyle}"><span style="padding-inline-start:${indent}px;">${escapeHtml(displayName)}</span></td>`;
      }
      case 'type': {
        if (showPartyTypeInTypeCol) {
          const party = colConfig.partiesByAccountId?.[r.accountId];
          if (!party) return `<td class="center" style="color:#aaa">—</td>`;
          const colors = FM_PARTY_KIND_COLORS[party.kind] ?? { bg: '#e5e7eb', fg: '#374151' };
          const catName = locale === 'en'
            ? (party.categoryNameEn?.trim() || party.categoryNameAr)
            : party.categoryNameAr;
          return `<td class="center">
            <span class="badge" style="display:inline-block;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.fg}33;font-size:9px;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(catName)}">${escapeHtml(catName)}</span>
          </td>`;
        }
        const colors = ACCOUNT_BALANCES_TYPE_COLORS[r.accountType] ?? { bg: '#e5e7eb', fg: '#374151' };
        const lbl = i18n.accountType[r.accountType as keyof typeof i18n.accountType] ?? r.accountType;
        return `<td class="center"><span class="badge" style="background:${colors.bg};color:${colors.fg};border:1px solid ${colors.fg}33;">${escapeHtml(lbl)}</span></td>`;
      }
      case 'fmParty': {
        const party = colConfig.partiesByAccountId?.[r.accountId];
        if (!party) return `<td class="center" style="color:#aaa">—</td>`;
        const colors = FM_PARTY_KIND_COLORS[party.kind] ?? { bg: '#e5e7eb', fg: '#374151' };
        const catName = locale === 'en'
          ? (party.categoryNameEn?.trim() || party.categoryNameAr)
          : party.categoryNameAr;
        return `<td class="center">
          <span class="badge" style="display:inline-block;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.fg}33;font-size:9px;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(catName)}">${escapeHtml(catName)}</span>
        </td>`;
      }
      case 'currency':
        return `<td class="center"><span class="num" style="background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:3px;font-weight:600;font-size:10px;">${escapeHtml(r.currency || '—')}</span></td>`;
      case 'debit':
        return `<td class="left num" style="${r.debitBalance > 0 ? 'color:#047857;font-weight:600;' : 'color:#aaa;'}">${abFmt(r.debitBalance)}</td>`;
      case 'credit':
        return `<td class="left num" style="${r.creditBalance > 0 ? 'color:#b91c1c;font-weight:600;' : 'color:#aaa;'}">${abFmt(r.creditBalance)}</td>`;
      case 'valDebit':
        return `<td class="left num" style="${r.valuatedDebit > 0 ? 'color:#a16207;font-weight:600;' : 'color:#aaa;'}">${abFmt(r.valuatedDebit)}</td>`;
      case 'valCredit':
        return `<td class="left num" style="${r.valuatedCredit > 0 ? 'color:#a16207;font-weight:600;' : 'color:#aaa;'}">${abFmt(r.valuatedCredit)}</td>`;
      default:
        return '<td>—</td>';
    }
  };

  // صف الإجماليات
  const renderTotalsRow = (): string => {
    // كم عمود غير مبلغي في البداية (لـ colspan على عمود "الإجمالي")
    const amountCols = new Set<AccountBalancesPrintCol>(['debit', 'credit', 'valDebit', 'valCredit']);
    const firstAmtIdx = visibleCols.findIndex(k => amountCols.has(k));
    const leadingNon = firstAmtIdx >= 0 ? firstAmtIdx : visibleCols.length;

    const parts: string[] = [];
    if (leadingNon > 0) {
      parts.push(`<th colspan="${leadingNon}" class="right" style="background:#ecf0f1;">${escapeHtml(i18n.accountBalances.totalsLbl(data.rows.length))}</th>`);
    }
    for (let i = leadingNon; i < visibleCols.length; i++) {
      const k = visibleCols[i];
      switch (k) {
        case 'debit':
          parts.push(`<th class="left num" style="background:#ecf0f1;color:#047857;">${abFmt(data.totalDebit)}</th>`);
          break;
        case 'credit':
          parts.push(`<th class="left num" style="background:#ecf0f1;color:#b91c1c;">${abFmt(data.totalCredit)}</th>`);
          break;
        case 'valDebit':
          parts.push(`<th class="left num" style="background:#ecf0f1;color:#a16207;">${abFmt(data.totalValuatedDebit)}</th>`);
          break;
        case 'valCredit':
          parts.push(`<th class="left num" style="background:#ecf0f1;color:#a16207;">${abFmt(data.totalValuatedCredit)}</th>`);
          break;
        default:
          parts.push(`<th style="background:#ecf0f1;">&nbsp;</th>`);
      }
    }
    return `<tr>${parts.join('')}</tr>`;
  };

  const colgroup = `<colgroup>${
    visibleCols.map(k => `<col${colWidthStyle(k) ? ` style="${colWidthStyle(k)}"` : ''}>`).join('')
  }</colgroup>`;

  const headRow = `<tr>${visibleCols.map(renderHeadCell).join('')}</tr>`;
  const bodyRows = data.rows.map((r, idx) =>
    `<tr>${visibleCols.map(k => renderRowCell(k, r, idx)).join('')}</tr>`
  ).join('');

  // ── 3) شارات الفلاتر (chips) في الأعلى
  const filterChips: string[] = [];
  filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.fromDate)} <strong class="num">${escapeHtml(formatDate(data.fromDate))}</strong></span>`);
  filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.toDate)} <strong class="num">${escapeHtml(formatDate(data.toDate))}</strong></span>`);
  if (colConfig.accountLabel || data.filterAccountId) {
    filterChips.push(`<span class="chip" style="background:#dbeafe;color:#1d4ed8;">${escapeHtml(i18n.accountBalances.accountChip)} <strong>${escapeHtml(colConfig.accountLabel ?? `#${data.filterAccountId}`)}</strong></span>`);
  } else {
    filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.accountChip)} <strong>${escapeHtml(i18n.accountBalances.allAccounts)}</strong></span>`);
  }
  filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.currencyChip)} <strong>${escapeHtml(data.filterCurrency || i18n.accountBalances.allCurrencies)}</strong></span>`);
  if (data.leavesOnly) filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.leavesOnly)}</span>`);
  if (data.maxLevel != null) filterChips.push(`<span class="chip">${escapeHtml(i18n.accountBalances.maxLevel(data.maxLevel))}</span>`);
  if (isValuated) filterChips.push(`<span class="chip" style="background:#fef3c7;color:#a16207;">${escapeHtml(i18n.accountBalances.valuatedBy(base))}</span>`);
  if (data.fxBulletinName) {
    filterChips.push(`<span class="chip" style="background:#eef2ff;color:#4338ca;">${escapeHtml(i18n.accountBalances.bulletin(data.fxBulletinName))}</span>`);
  }
  if (colConfig.searchFilter) {
    filterChips.push(`<span class="chip" style="background:#fce7f3;color:#9d174d;">${escapeHtml(i18n.accountBalances.searchFilter(colConfig.searchFilter))}</span>`);
  }
  if (colConfig.partiesOnly) {
    filterChips.push(`<span class="chip" style="background:#e0e7ff;color:#3730a3;">${escapeHtml(i18n.accountBalances.partiesOnly)}</span>`);
  }
  const fmCategoriesEnabled = colConfig.fmCategoriesEnabled ?? colConfig.fmKindsEnabled ?? [];
  const fmCategoriesTotal = colConfig.fmCategoriesTotal ?? Object.keys(i18n.accountBalances.fmKind).length;
  if (fmCategoriesEnabled.length > 0 && fmCategoriesEnabled.length < fmCategoriesTotal) {
    const labels = fmCategoriesEnabled.join(' · ');
    filterChips.push(`<span class="chip" style="background:#ede9fe;color:#5b21b6;">${escapeHtml(i18n.accountBalances.fmKindsChip(labels))}</span>`);
  }

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${escapeHtml(i18n.accountBalances.title)}</div>

    <div class="ab-filters">${filterChips.join(' ')}</div>

    ${data.fxUsedFallback ? `
      <div class="ab-alert">
        ${escapeHtml(i18n.accountBalances.fxWarn)}
      </div>
    ` : ''}

    <table class="ab-table">
      ${colgroup}
      <thead>${headRow}</thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="${visibleCols.length}" class="center" style="padding:18px;color:#888">${escapeHtml(i18n.accountBalances.empty)}</td></tr>`}
      </tbody>
      <tfoot>${renderTotalsRow()}</tfoot>
    </table>

    <div class="signatures">
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.auditor)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>

    ${buildFooter(company, i18n.accountBalances.footerText)}
  `;

  const extraStyles = `
    .ab-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
    .ab-filters .chip { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 999px; padding: 3px 10px; font-size: 11px; color: #374151; }
    .ab-alert { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 11px; color: #92400e; }
    .ab-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 6px; table-layout: fixed; }
    .ab-table th, .ab-table td { border: 1px solid #94a3b8; padding: 4px 6px; vertical-align: middle; }
    .ab-table thead th { background: #2c3e50; color: #fff; font-weight: 600; font-size: 11px; }
    .ab-table tfoot th { background: #ecf0f1; color: #111; font-weight: 700; }
    .ab-table tbody tr:nth-child(even) td { background: #fafbfc; }
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 297mm; }
  `;

  const dir = getPrintDir(locale);
  const headerCompanyName = locale === 'en' ? (company?.nameEn || company?.nameAr || '') : (company?.nameAr || '');
  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(i18n.accountBalances.title)}</title>
  <style>${PRINT_STYLES}${extraStyles}
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;
  openPrintPreview(fullDoc, `${i18n.accountBalances.previewTitle} - ${headerCompanyName}`.trim(), locale);
}

// ════════════════════════════════════════════════════════════════════
// طباعة الفاتورة — تصميم احترافي
// ════════════════════════════════════════════════════════════════════

export interface InvoicePrintLine {
  itemName: string;
  itemCode: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  isGift: boolean;
}

export interface InvoicePrintExpense {
  debitAmount: number;
  creditAmount: number;
  accountName: string;
  accountCode: string;
  description: string;
}

export interface InvoicePrintData {
  invoiceTypeName: string;
  invoiceNumber?: string | null;
  manualNumber?: string | null;
  invoiceDate: string;
  warehouseName?: string | null;
  partyName: string;
  partyAccountCode?: string | null;
  currency: string;
  lines: InvoicePrintLine[];
  discountPct: number;
  effectiveDiscount: number;
  additionPct: number;
  additionAmt: number;
  taxRate: number;
  taxAmount: number;
  subTotal: number;
  total: number;
  expenseLines?: InvoicePrintExpense[];
  isCash: boolean;
  dueDate?: string | null;
  notes?: string | null;
}

const INVOICE_EXTRA_STYLES = `
  /* ===== سمة فاتورة راقية: كحلي عميق + لمسة ذهبية ===== */
  /* رأس المستند: شريط علوي ذهبي رفيع للفاتورة */
  .preview-page { position: relative; }
  .preview-page::before { content: ''; position: absolute; top: 0; inset-inline: 0; height: 4px;
    background: linear-gradient(90deg, #13314f 0%, #c79a3f 50%, #13314f 100%); border-radius: 4px 4px 0 0; }
  .doc-header { border-bottom: 2px solid #13314f !important; }
  .doc-header .brand .titles h1 { color: #13314f; letter-spacing: .2px; }

  /* شريط عنوان الفاتورة */
  .inv-banner { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: linear-gradient(135deg, #13314f 0%, #21507c 100%); color: #fff;
    border-radius: 10px; padding: 14px 22px; margin: 16px 0 18px; overflow: hidden;
    border: 1px solid #0c2438; }
  .inv-banner::before { content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 6px;
    background: linear-gradient(180deg, #e3c87a, #c79a3f); }
  .inv-banner .inv-banner-title { font-size: 20px; font-weight: 800; letter-spacing: .4px;
    text-shadow: 0 1px 2px rgba(0,0,0,.2); }
  .inv-banner .inv-banner-no { text-align: left; }
  .inv-banner .inv-banner-no .lbl { font-size: 9px; color: #d8c79a; display: block; letter-spacing: .5px;
    text-transform: uppercase; }
  .inv-banner .inv-banner-no .val { font-size: 18px; font-weight: 800; color: #f4e9c8;
    font-family: 'Segoe UI', monospace; }

  /* صناديق المعلومات (العميل + بيانات الفاتورة) */
  .inv-info { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .info-card { border: 1px solid #d8dee6; border-radius: 10px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(15,42,67,.05); }
  .info-card > h3 { font-size: 10.5px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #13314f, #21507c);
    margin: 0; padding: 6px 14px; letter-spacing: .3px; }
  .info-card.party > h3 { border-bottom: 2px solid #c79a3f; }
  .info-card .info-body { padding: 9px 14px; }
  .info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
    padding: 4px 0; border-bottom: 1px dotted #eceff3; font-size: 11.5px; }
  .info-row:last-child { border-bottom: none; }
  .info-row .k { color: #7b8794; font-weight: 500; }
  .info-row .v { font-weight: 700; color: #13314f; text-align: left; }
  .info-row .v.mono { font-family: monospace; }
  .info-card.party .party-name { font-size: 16px; font-weight: 800; color: #13314f; margin-bottom: 3px; }
  .info-card.party .party-code { font-size: 10px; color: #8a94a0; font-family: monospace; }

  /* عناوين الأقسام */
  .section-title { font-size: 11px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #13314f, #21507c);
    padding: 6px 14px; border-radius: 6px 6px 0 0; margin-top: 18px; margin-bottom: 0;
    display: flex; align-items: center; gap: 6px; border-inline-start: 4px solid #c79a3f; }
  .section-title.gift { background: linear-gradient(135deg, #8a5412, #b87a26); border-inline-start-color: #f0c674; }
  .section-title.expense { background: linear-gradient(135deg, #143b6b, #1d4e89); border-inline-start-color: #7fb0e8; }
  .section-title + table { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }

  /* جدول البنود */
  table.inv-table { width: 100%; border-collapse: collapse; font-size: 11.5px;
    box-shadow: 0 1px 3px rgba(15,42,67,.05); }
  table.inv-table thead th { background: #13314f; color: #fff; font-weight: 700;
    padding: 7px 8px; border: 1px solid #0c2438; letter-spacing: .2px; }
  table.inv-table tbody td { padding: 6px 8px; border: 1px solid #e2e7ee; }
  table.inv-table tbody tr:nth-child(even) td { background: #f7f9fc; }
  table.inv-table tfoot th { padding: 7px 8px; border: 1px solid #d8dee6;
    background: #eef2f6; color: #13314f; font-weight: 800; }
  table.inv-table .item-name { font-weight: 600; color: #13314f; }
  table.inv-table .item-code { color: #97a1ad; font-size: 9px; }
  .gift-tag { color: #a96414; font-weight: 700; }

  /* لوحة الإجماليات */
  .totals-grid { margin-top: 16px; display: flex; justify-content: flex-start; }
  .totals-table { border-collapse: collapse; min-width: 310px; font-size: 12px;
    border: 1px solid #d4dae2; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(15,42,67,.06); }
  .totals-table td { padding: 7px 14px; border: 1px solid #e3e7ec; }
  .totals-table .t-label { color: #46566a; font-weight: 500; background: #f7f9fc; }
  .totals-table .t-value { text-align: left; font-family: monospace; font-weight: 700; color: #13314f; }
  .totals-table tr.grand-total td { background: linear-gradient(135deg, #13314f, #21507c);
    color: #f4e9c8; font-size: 15.5px; font-weight: 800; border-color: #0c2438; }
  .totals-table tr.grand-total .t-value { color: #f4e9c8; }

  /* المبلغ كتابةً (تفقيط) */
  .amount-words { display: flex; align-items: center; gap: 12px; margin-top: 12px;
    border: 1px solid #e6dcc2; background: #fdfaf2; border-radius: 8px; padding: 10px 14px; }
  .amount-words .aw-label { flex: none; font-size: 10px; font-weight: 800; color: #fff;
    background: linear-gradient(135deg, #c79a3f, #b8862d); padding: 5px 11px; border-radius: 5px;
    letter-spacing: .3px; }
  .amount-words .aw-value { font-size: 12.5px; font-weight: 700; color: #13314f; line-height: 1.6; }

  .notes-box { border: 1px solid #e2e7ee; border-radius: 8px; padding: 9px 14px; margin-top: 14px;
    font-size: 11px; color: #46566a; background: #fbfcfd; border-inline-start: 4px solid #c79a3f; }
  .notes-box .nb-title { font-weight: 700; color: #13314f; margin-bottom: 2px; }
  .settlement-box { border: 1px solid #cfe8d8; background: #f3faf5; border-radius: 8px;
    padding: 9px 14px; margin-top: 14px; font-size: 11.5px; color: #13314f; }
  .settlement-box.credit { border-color: #f3dcbb; background: #fdf8f1; }
  .settlement-box strong { font-weight: 800; }

  /* التواقيع: لمسة ذهبية على خط التوقيع */
  .signatures .sig { border-top: 1px solid #c79a3f !important; color: #13314f; font-weight: 600; }

  @media (max-width: 600px) {
    .inv-info { grid-template-columns: 1fr; }
    .amount-words { flex-direction: column; align-items: flex-start; gap: 6px; }
  }
`;

export function printInvoice(
  data: InvoicePrintData,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
) {
  const dir = getPrintDir(locale);
  const i18n = getPrintI18n(locale);
  const printedAt = formatPrintedAt(locale);
  const header = buildBrandHeader(company, printedAt, i18n, locale);
  const footer = buildFooter(company, 'مركز التجارة العراقي — IraqiTradeCenter');

  const fmtAmt = (n: number) => formatAmount(n) + ' ' + escapeHtml(data.currency);
  const fmtNum = (n: number) => formatAmount(n);

  const regularLines = data.lines.filter(l => !l.isGift);
  const giftLines    = data.lines.filter(l => l.isGift);

  // ── جدول البنود ──
  const buildLinesTable = (lines: InvoicePrintLine[], forGift = false) => {
    if (!lines.length) return '';
    const rows = lines.map((l, idx) => {
      const lineTotal = l.quantity * l.unitPrice - (forGift ? l.quantity * l.unitPrice : l.lineDiscount);
      return `<tr>
        <td class="center">${idx + 1}</td>
        <td><span class="item-name">${escapeHtml(l.itemName)}</span>${l.itemCode ? `<br><span class="item-code">${escapeHtml(l.itemCode)}</span>` : ''}</td>
        <td class="center">${escapeHtml(l.unitName)}</td>
        <td class="center num">${fmtNum(l.quantity)}</td>
        ${forGift ? '' : `<td class="center num">${fmtNum(l.unitPrice)}</td>`}
        ${forGift ? '' : `<td class="center num">${l.lineDiscount > 0 ? fmtNum(l.lineDiscount) : '—'}</td>`}
        <td class="center num">${forGift ? '<span class="gift-tag">هدية</span>' : fmtAmt(lineTotal)}</td>
      </tr>`;
    }).join('');

    const headers = forGift
      ? `<th class="center">#</th><th>المادة</th><th class="center">الوحدة</th><th class="center">الكمية</th><th class="center">الإجمالي</th>`
      : `<th class="center">#</th><th>المادة</th><th class="center">الوحدة</th><th class="center">الكمية</th><th class="center">السعر</th><th class="center">الخصم</th><th class="center">الإجمالي</th>`;

    return `
      <div class="section-title${forGift ? ' gift' : ''}">${forGift ? 'الهدايا المرفقة' : 'بنود الفاتورة'}</div>
      <table class="inv-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        ${!forGift ? `<tfoot><tr>
          <th colspan="6" class="left" style="padding-inline-end:12px">المجموع الفرعي</th>
          <th class="center num">${fmtAmt(data.subTotal)}</th>
        </tr></tfoot>` : ''}
      </table>`;
  };

  // ── جدول المصاريف ──
  const buildExpensesTable = () => {
    const exps = data.expenseLines?.filter(e => e.debitAmount > 0 || e.creditAmount > 0) ?? [];
    if (!exps.length) return '';
    const rows = exps.map((e, idx) => `<tr>
      <td class="center">${idx + 1}</td>
      <td class="mono">${escapeHtml(e.accountCode)}</td>
      <td>${escapeHtml(e.accountName)}</td>
      <td class="center num">${e.debitAmount > 0 ? fmtAmt(e.debitAmount) : '—'}</td>
      <td class="center num">${e.creditAmount > 0 ? fmtAmt(e.creditAmount) : '—'}</td>
      <td>${escapeHtml(e.description)}</td>
    </tr>`).join('');
    return `
      <div class="section-title expense">المصاريف</div>
      <table class="inv-table">
        <thead><tr>
          <th class="center">#</th>
          <th>كود الحساب</th><th>الحساب</th>
          <th class="center">مدين</th><th class="center">دائن</th>
          <th>البيان</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  // ── الإجماليات ──
  const buildTotals = () => {
    const rows: string[] = [];
    rows.push(`<tr><td class="t-label">المجموع الفرعي</td><td class="t-value num">${fmtAmt(data.subTotal)}</td></tr>`);
    if (data.effectiveDiscount > 0) {
      const label = data.discountPct > 0 ? `خصم (${fmtNum(data.discountPct)}%)` : 'الخصم';
      rows.push(`<tr><td class="t-label" style="color:#c0392b">${label}</td><td class="t-value num" style="color:#c0392b">— ${fmtAmt(data.effectiveDiscount)}</td></tr>`);
    }
    if (data.additionAmt > 0) {
      const label = data.additionPct > 0 ? `إضافة (${fmtNum(data.additionPct)}%)` : 'الإضافة';
      rows.push(`<tr><td class="t-label" style="color:#16a085">${label}</td><td class="t-value num" style="color:#16a085">+ ${fmtAmt(data.additionAmt)}</td></tr>`);
    }
    if (data.taxRate > 0) {
      rows.push(`<tr><td class="t-label">ضريبة (${fmtNum(data.taxRate)}%)</td><td class="t-value num">${fmtAmt(data.taxAmount)}</td></tr>`);
    }
    rows.push(`<tr class="grand-total"><td class="t-label">الإجمالي الكلي</td><td class="t-value num">${fmtAmt(data.total)}</td></tr>`);
    return `<div class="totals-grid"><table class="totals-table">${rows.join('')}</table></div>`;
  };

  // ── التسديد ──
  const buildSettlement = () => {
    if (data.isCash) return '';
    const dueInfo = data.dueDate ? ` — تاريخ الاستحقاق: <strong>${escapeHtml(data.dueDate)}</strong>` : '';
    return `<div class="settlement-box credit">
      <strong>فاتورة آجلة</strong>${dueInfo}
      <br>الطرف: <strong>${escapeHtml(data.partyName)}</strong>
      ${data.partyAccountCode ? `<span style="color:#8a94a0;font-size:10px">(${escapeHtml(data.partyAccountCode)})</span>` : ''}
    </div>`;
  };

  // ── المبلغ كتابةً (تفقيط) ──
  const amountWordsHtml = `<div class="amount-words">
    <span class="aw-label">المبلغ كتابةً</span>
    <span class="aw-value">${escapeHtml(tafqeet(data.total, { currency: data.currency }))}</span>
  </div>`;

  // ── ملاحظات ──
  const notesHtml = data.notes
    ? `<div class="notes-box"><div class="nb-title">ملاحظات</div>${escapeHtml(data.notes)}</div>`
    : '';

  // ── شريط العنوان ──
  const bannerHtml = `<div class="inv-banner">
    <div class="inv-banner-title">${escapeHtml(data.invoiceTypeName)}</div>
    <div class="inv-banner-no">
      <span class="lbl">رقم الفاتورة</span>
      <span class="val">${escapeHtml(data.invoiceNumber ?? 'تلقائي')}</span>
    </div>
  </div>`;

  // ── صندوق العميل/المورد ──
  const partyRows: string[] = [];
  partyRows.push(`<div class="party-name">${escapeHtml(data.partyName || '—')}</div>`);
  if (data.partyAccountCode) partyRows.push(`<div class="party-code">رقم الحساب: ${escapeHtml(data.partyAccountCode)}</div>`);
  const partyCard = `<div class="info-card party">
    <h3>العميل / المورد</h3>
    <div class="info-body">${partyRows.join('')}</div>
  </div>`;

  // ── صندوق بيانات الفاتورة ──
  const detailRows: string[] = [];
  detailRows.push(`<div class="info-row"><span class="k">التاريخ</span><span class="v">${escapeHtml(data.invoiceDate)}</span></div>`);
  if (data.manualNumber) detailRows.push(`<div class="info-row"><span class="k">الرقم اليدوي</span><span class="v mono">${escapeHtml(data.manualNumber)}</span></div>`);
  if (data.warehouseName) detailRows.push(`<div class="info-row"><span class="k">المستودع</span><span class="v">${escapeHtml(data.warehouseName)}</span></div>`);
  detailRows.push(`<div class="info-row"><span class="k">طريقة التسديد</span><span class="v">${data.isCash ? 'نقداً' : 'آجل'}</span></div>`);
  detailRows.push(`<div class="info-row"><span class="k">العملة</span><span class="v">${escapeHtml(data.currency)}</span></div>`);
  const detailCard = `<div class="info-card">
    <h3>بيانات الفاتورة</h3>
    <div class="info-body">${detailRows.join('')}</div>
  </div>`;

  const infoHtml = `<div class="inv-info">${partyCard}${detailCard}</div>`;

  const bodyHtml = `
    ${header}
    ${bannerHtml}
    ${infoHtml}
    ${buildLinesTable(regularLines, false)}
    ${giftLines.length > 0 ? buildLinesTable(giftLines, true) : ''}
    ${buildExpensesTable()}
    ${buildTotals()}
    ${amountWordsHtml}
    ${buildSettlement()}
    ${notesHtml}
    <div class="signatures" style="margin-top:34px">
      <div class="sig">المحرر</div>
      <div class="sig">المدقق</div>
      <div class="sig">المستلم / الزبون</div>
    </div>
    ${footer}
  `;

  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.invoiceTypeName)} - ${escapeHtml(data.invoiceNumber ?? '')}</title>
  <style>${PRINT_STYLES}${INVOICE_EXTRA_STYLES}
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${bodyHtml}</div>
</body>
</html>`;

  openPrintPreview(fullDoc, `${data.invoiceTypeName} — ${data.invoiceNumber ?? ''}`, locale);
}

// ═══════════════════════════════════════════════════════════════════════════
// تقارير المستودعات: حركة المادة + جرد المخزون
// ═══════════════════════════════════════════════════════════════════════════

function ttp(locale: PrintLocale, ar: string, en: string): string {
  return locale === 'en' ? en : ar;
}

const REPORT_EXTRA_STYLES = `
  .rep-filters { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
  .rep-filters .chip { background:#f1f5f9; border:1px solid #cbd5e1; border-radius:999px; padding:3px 11px; font-size:11px; color:#334155; }
  .rep-filters .chip strong { color:#0f172a; }
  .rep-summary { display:flex; flex-wrap:wrap; gap:10px; margin:8px 0 12px; }
  .rep-summary .box { flex:1; min-width:120px; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; background:#fff; }
  .rep-summary .box .lbl { font-size:10.5px; color:#64748b; margin-bottom:3px; }
  .rep-summary .box .val { font-size:15px; font-weight:700; }
  .rep-table { width:100%; border-collapse:collapse; font-size:10.5px; margin-top:4px; }
  .rep-table th, .rep-table td { border:1px solid #cbd5e1; padding:4px 6px; }
  .rep-table thead th { background:#1e293b; color:#fff; font-weight:600; font-size:11px; }
  .rep-table tbody tr:nth-child(even) { background:#f8fafc; }
  .rep-table tfoot th { background:#e2e8f0; color:#0f172a; font-weight:700; }
  .rep-badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:9.5px; font-weight:600; }
`;

export interface ItemMovementsPrintRow {
  date: string;
  typeLabel: string;
  party: string;
  warehouse: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  before: number;
  after: number;
  reference: string;
  isOut: boolean;
}

export interface ItemMovementsPrintInput {
  itemCode: string;
  itemName: string;
  unitName?: string;
  warehouseLabel?: string;
  fromDate?: string;
  toDate?: string;
  rows: ItemMovementsPrintRow[];
  totalIn: number;
  totalOut: number;
  net: number;
}

export function printItemMovements(
  input: ItemMovementsPrintInput,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  const dir = getPrintDir(locale);
  const printedAt = formatPrintedAt(locale);

  const filterChips: string[] = [];
  filterChips.push(`<span class="chip">${ttp(locale, 'المادة', 'Item')} <strong>${escapeHtml(input.itemCode)} — ${escapeHtml(input.itemName)}</strong></span>`);
  if (input.warehouseLabel)
    filterChips.push(`<span class="chip">${ttp(locale, 'المستودع', 'Warehouse')} <strong>${escapeHtml(input.warehouseLabel)}</strong></span>`);
  if (input.fromDate)
    filterChips.push(`<span class="chip">${ttp(locale, 'من', 'From')} <strong class="num">${escapeHtml(formatDate(input.fromDate))}</strong></span>`);
  if (input.toDate)
    filterChips.push(`<span class="chip">${ttp(locale, 'إلى', 'To')} <strong class="num">${escapeHtml(formatDate(input.toDate))}</strong></span>`);

  const rows = input.rows.map((r, idx) => `
    <tr>
      <td class="center" style="color:#94a3b8">${idx + 1}</td>
      <td class="center num" style="white-space:nowrap">${escapeHtml(formatDate(r.date))}</td>
      <td class="center"><span class="rep-badge" style="background:${r.isOut ? '#fee2e2' : '#dcfce7'};color:${r.isOut ? '#b91c1c' : '#15803d'};">${escapeHtml(r.typeLabel)}</span></td>
      <td>${escapeHtml(r.party || '—')}</td>
      <td>${escapeHtml(r.warehouse)}</td>
      <td class="center num" style="font-weight:700;color:${r.isOut ? '#b91c1c' : '#15803d'};">${r.isOut ? '-' : '+'}${formatAmountFixed2(Math.abs(r.quantity))}</td>
      <td class="center">${escapeHtml(r.unit)}</td>
      <td class="left num">${r.unitCost != null ? formatAmountFixed2(r.unitCost) : '—'}</td>
      <td class="center num" style="color:#64748b">${formatAmountFixed2(r.before)}</td>
      <td class="center num" style="font-weight:600">${formatAmountFixed2(r.after)}</td>
      <td>${escapeHtml(r.reference || '—')}</td>
    </tr>`).join('');

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${ttp(locale, 'تقرير حركة المادة', 'Item Movement Report')}</div>
    <div class="rep-filters">${filterChips.join(' ')}</div>
    <div class="rep-summary">
      <div class="box"><div class="lbl">${ttp(locale, 'إجمالي الوارد', 'Total In')}</div><div class="val" style="color:#15803d">${formatAmountFixed2(input.totalIn)}</div></div>
      <div class="box"><div class="lbl">${ttp(locale, 'إجمالي الصادر', 'Total Out')}</div><div class="val" style="color:#b91c1c">${formatAmountFixed2(input.totalOut)}</div></div>
      <div class="box"><div class="lbl">${ttp(locale, 'صافي الحركة', 'Net')}</div><div class="val">${formatAmountFixed2(input.net)} ${escapeHtml(input.unitName ?? '')}</div></div>
      <div class="box"><div class="lbl">${ttp(locale, 'عدد الحركات', 'Movements')}</div><div class="val num">${input.rows.length}</div></div>
    </div>
    <table class="rep-table">
      <thead>
        <tr>
          <th class="center" style="width:34px">#</th>
          <th class="center">${ttp(locale, 'التاريخ', 'Date')}</th>
          <th class="center">${ttp(locale, 'النوع', 'Type')}</th>
          <th>${ttp(locale, 'المورد/العميل', 'Party')}</th>
          <th>${ttp(locale, 'المستودع', 'Warehouse')}</th>
          <th class="center">${ttp(locale, 'الكمية', 'Qty')}</th>
          <th class="center">${ttp(locale, 'وحدة الجرد', 'Unit')}</th>
          <th class="left">${ttp(locale, 'التكلفة', 'Cost')}</th>
          <th class="center">${ttp(locale, 'الرصيد قبل', 'Before')}</th>
          <th class="center">${ttp(locale, 'الرصيد بعد', 'After')}</th>
          <th>${ttp(locale, 'المرجع', 'Reference')}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="11" class="center" style="padding:16px;color:#94a3b8">${ttp(locale, 'لا توجد حركات', 'No movements')}</td></tr>`}</tbody>
    </table>
    <div class="signatures" style="margin-top:30px">
      <div class="sig">${escapeHtml(i18n.signatures.accountant)}</div>
      <div class="sig">${ttp(locale, 'أمين المخزن', 'Storekeeper')}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>
    ${buildFooter(company, ttp(locale, 'تقرير حركة المادة', 'Item Movement Report'))}
  `;

  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ttp(locale, 'تقرير حركة المادة', 'Item Movement Report')}</title>
  <style>${PRINT_STYLES}${REPORT_EXTRA_STYLES}
    @page { size: A4 landscape; margin: 10mm; }
    .preview-page { max-width: 297mm; }
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;

  openPrintPreview(fullDoc, ttp(locale, 'تقرير حركة المادة', 'Item Movement Report'), locale);
}

export interface StockCountPrintRow {
  code: string;
  name: string;
  category: string | null;
  warehouse: string;
  unit: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
}

export interface StockCountPrintInput {
  warehouseLabel?: string;
  categoryLabel?: string;
  search?: string;
  rows: StockCountPrintRow[];
  totalQuantity: number;
  itemCount: number;
}

export function printStockCount(
  input: StockCountPrintInput,
  company: CompanySettingsDto | null = null,
  locale: PrintLocale = getPrintLocale(),
) {
  const i18n = getPrintI18n(locale);
  const dir = getPrintDir(locale);
  const printedAt = formatPrintedAt(locale);

  const filterChips: string[] = [];
  filterChips.push(`<span class="chip">${ttp(locale, 'المستودع', 'Warehouse')} <strong>${escapeHtml(input.warehouseLabel || ttp(locale, 'الكل', 'All'))}</strong></span>`);
  if (input.categoryLabel)
    filterChips.push(`<span class="chip">${ttp(locale, 'التصنيف', 'Category')} <strong>${escapeHtml(input.categoryLabel)}</strong></span>`);
  if (input.search)
    filterChips.push(`<span class="chip">${ttp(locale, 'بحث', 'Search')} <strong>${escapeHtml(input.search)}</strong></span>`);

  const rows = input.rows.map((r, idx) => `
    <tr>
      <td class="center" style="color:#94a3b8">${idx + 1}</td>
      <td class="center num" style="white-space:nowrap;color:#1f6f43;font-weight:600">${escapeHtml(r.code)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.category || '—')}</td>
      <td>${escapeHtml(r.warehouse)}</td>
      <td class="center num" style="font-weight:700;color:${r.quantity < 0 ? '#b91c1c' : '#0f172a'}">${formatAmountFixed2(r.quantity)}</td>
      <td class="center">${escapeHtml(r.unit)}</td>
      <td class="center num">${r.unitCost != null ? formatAmountFixed2(r.unitCost) : '—'}</td>
      <td class="center num">${r.totalCost != null ? formatAmountFixed2(r.totalCost) : '—'}</td>
    </tr>`).join('');

  const totalCost = input.rows.reduce((s, r) => s + (r.totalCost ?? 0), 0);

  const html = `
    ${buildBrandHeader(company, printedAt, i18n, locale)}
    <div class="report-title">${ttp(locale, 'تقرير جرد المخزون', 'Inventory Count Report')}</div>
    <div class="rep-filters">${filterChips.join(' ')}</div>
    <div class="rep-summary">
      <div class="box"><div class="lbl">${ttp(locale, 'عدد السطور', 'Rows')}</div><div class="val num">${input.rows.length}</div></div>
      <div class="box"><div class="lbl">${ttp(locale, 'عدد المواد', 'Items')}</div><div class="val num">${input.itemCount}</div></div>
      <div class="box"><div class="lbl">${ttp(locale, 'إجمالي الكمية', 'Total Qty')}</div><div class="val">${formatAmountFixed2(input.totalQuantity)}</div></div>
    </div>
    <table class="rep-table">
      <thead>
        <tr>
          <th class="center" style="width:34px">#</th>
          <th class="center">${ttp(locale, 'الرمز', 'Code')}</th>
          <th>${ttp(locale, 'المادة', 'Item')}</th>
          <th>${ttp(locale, 'التصنيف', 'Category')}</th>
          <th>${ttp(locale, 'المستودع', 'Warehouse')}</th>
          <th class="center">${ttp(locale, 'الكمية', 'Quantity')}</th>
          <th class="center">${ttp(locale, 'وحدة الجرد', 'Unit')}</th>
          <th class="center">${ttp(locale, 'تكلفة الوحدة', 'Unit cost')}</th>
          <th class="center">${ttp(locale, 'التكلفة', 'Cost')}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9" class="center" style="padding:16px;color:#94a3b8">${ttp(locale, 'لا توجد بيانات', 'No data')}</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <th colspan="5" class="center">${ttp(locale, 'الإجمالي', 'Total')}</th>
          <th class="center num">${formatAmountFixed2(input.totalQuantity)}</th>
          <th></th>
          <th></th>
          <th class="center num">${formatAmountFixed2(totalCost)}</th>
        </tr>
      </tfoot>
    </table>
    <div class="signatures" style="margin-top:30px">
      <div class="sig">${ttp(locale, 'أمين المخزن', 'Storekeeper')}</div>
      <div class="sig">${escapeHtml(i18n.signatures.auditor)}</div>
      <div class="sig">${escapeHtml(i18n.signatures.financialManager)}</div>
    </div>
    ${buildFooter(company, ttp(locale, 'تقرير جرد المخزون', 'Inventory Count Report'))}
  `;

  const fullDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ttp(locale, 'تقرير جرد المخزون', 'Inventory Count Report')}</title>
  <style>${PRINT_STYLES}${REPORT_EXTRA_STYLES}
    @page { size: A4; margin: 10mm; }
    body { direction: ${dir}; }
  </style>
</head>
<body>
  <div class="preview-page">${html}</div>
</body>
</html>`;

  openPrintPreview(fullDoc, ttp(locale, 'تقرير جرد المخزون', 'Inventory Count Report'), locale);
}
