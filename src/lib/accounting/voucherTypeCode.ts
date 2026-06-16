const PREFIX = 'VT';

/** يقترح كود VT التالي من الأكواد الموجودة — يعمل بدون اتصال بالخادم. */
export function suggestNextVoucherTypeCode(existingCodes: string[]): string {
  const set = new Set(existingCodes.map(c => c.trim().toUpperCase()).filter(Boolean));
  let max = 0;
  for (const raw of existingCodes) {
    const c = raw.trim().toUpperCase();
    if (!c.startsWith(PREFIX) || c.length <= PREFIX.length) continue;
    const n = Number.parseInt(c.slice(PREFIX.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  for (let i = max + 1; i < max + 101; i++) {
    const candidate = `${PREFIX}${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${PREFIX}${Date.now().toString().slice(-8)}`;
}
