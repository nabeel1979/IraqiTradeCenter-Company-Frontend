/**
 * يُشغّل تنزيلاً مباشراً عبر المتصفح (Content-Disposition) بدون blob URL.
 * يذهب الملف إلى مجلد التنزيلات الافتراضي — مثل تنزيلات نظام الشركات.
 */
export function triggerNativeDownload(url: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 120_000);
}
