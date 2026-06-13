/** رسائل «المخزون غير كافٍ» — للعرض في نافذة مركزية بدل toast. */
export function isStockInsufficientMessage(message: string): boolean {
  return /المخزون غير كاف|Insufficient stock/i.test(message);
}

export interface StockInsufficientDetails {
  item?: string;
  required?: string;
  available?: string;
  date?: string;
  raw: string;
}

export function parseStockInsufficientMessage(message: string): StockInsufficientDetails {
  const item = message.match(/المادة ['']([^'']+)['']/)?.[1];
  const required = message.match(/المطلوب:\s*([\d.,]+)/)?.[1];
  const available = message.match(/المتاح:\s*([\d.,]+)/)?.[1];
  const date = message.match(/بتاريخ\s*(\d{4}\/\d{2}\/\d{2})/)?.[1];
  return { item, required, available, date, raw: message };
}

/** عرض الكمية بدون 3 منازل عشرية — 100 بدل 100.000 */
export function formatStockQtyDisplay(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(n)) return value;
  return formatStockQtyNumber(n);
}

export function formatStockQtyNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value - Math.round(value)) < 0.0000001) return String(Math.round(value));
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** رسالة موحّدة مع الخادم — تُ parse في StockInsufficientDialog */
export function buildStockInsufficientMessage(
  itemName: string,
  required: number,
  available: number,
  invoiceDate?: string,
): string {
  let msg = `المخزون غير كافٍ للمادة '${itemName}'. المطلوب: ${formatStockQtyNumber(required)} | المتاح: ${formatStockQtyNumber(Math.max(0, available))}`;
  if (invoiceDate) {
    const d = invoiceDate.slice(0, 10).replace(/-/g, '/');
    msg += ` بتاريخ ${d}`;
  }
  return msg;
}
