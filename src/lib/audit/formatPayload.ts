import type { TFunction } from 'i18next';

function fieldLabel(key: string, t: TFunction): string {
  const variants = [
    key,
    key.charAt(0).toLowerCase() + key.slice(1),
    key.charAt(0).toUpperCase() + key.slice(1),
  ];
  for (const v of variants) {
    const label = t(`audit.payload.fields.${v}`, { defaultValue: '' });
    if (label) return label;
  }
  return key;
}

function localizeValue(value: unknown, t: TFunction): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean') {
    return t(value ? 'audit.payload.values.true' : 'audit.payload.values.false', {
      defaultValue: value ? 'Yes' : 'No',
    });
  }
  if (typeof value === 'string') {
    return t(`audit.payload.values.${value}`, { defaultValue: value });
  }
  if (Array.isArray(value)) {
    return value.map(v => localizeValue(v, t));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[fieldLabel(k, t)] = localizeValue(v, t);
    }
    return out;
  }
  return value;
}

/** يُحوّل JSON الحمولة إلى نص منسّق بمفاتيح وقيم مترجمة حسب اللغة الحالية. */
export function formatLocalizedAuditPayload(raw: string, t: TFunction): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const localized = localizeValue(parsed, t);
    return JSON.stringify(localized, null, 2);
  } catch {
    return raw;
  }
}
