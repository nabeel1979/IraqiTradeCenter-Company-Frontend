/** يُطابق منطق GenerateNextBranchCodeAsync في الخادم. */
export function getNextBranchCode(existingCodes: string[]): string {
  const codes = existingCodes.map(c => c.trim().toUpperCase());
  let maxNum = 0;

  for (const code of codes) {
    if (code.length >= 2 && code[0] === 'B') {
      const n = Number.parseInt(code.slice(1), 10);
      if (!Number.isNaN(n)) maxNum = Math.max(maxNum, n);
    }
  }

  for (let n = maxNum + 1; n < maxNum + 500; n++) {
    const candidate = `B${String(n).padStart(2, '0')}`;
    if (!codes.includes(candidate)) return candidate;
  }

  const stamp = Date.now().toString().slice(-6);
  return `B${stamp}`;
}
