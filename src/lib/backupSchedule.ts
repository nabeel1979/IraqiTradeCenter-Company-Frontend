export type BackupScheduleKind = 'daily' | 'weekly' | 'monthly';

export interface ParsedBackupSchedule {
  kind: BackupScheduleKind;
  times: string[]; // HH:mm
  day: number; // 0-6 weekly, 1-28 monthly
}

const TIME_LIST = String.raw`(\d{2}:\d{2}(?:,\d{2}:\d{2})*)`;

function normalizeTime(raw: string): string {
  const [hRaw, mRaw] = raw.split(':');
  const h = Math.min(23, Math.max(0, Number(hRaw) || 0));
  const m = Math.min(59, Math.max(0, Number(mRaw) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function uniqueSortedTimes(times: string[]): string[] {
  return [...new Set(times.map(normalizeTime))].sort();
}

export function buildAutoBackupCron(kind: BackupScheduleKind, times: string[], day = 0): string {
  const list = uniqueSortedTimes(times.length > 0 ? times : ['02:00']);
  const joined = list.join(',');
  if (kind === 'daily') return `daily@${joined}`;
  if (kind === 'weekly') return `weekly@${Math.min(6, Math.max(0, day))}@${joined}`;
  return `monthly@${Math.min(28, Math.max(1, day || 1))}@${joined}`;
}

export function parseAutoBackupCron(cron?: string | null): ParsedBackupSchedule {
  const fallback: ParsedBackupSchedule = { kind: 'daily', times: ['02:00'], day: 0 };
  if (!cron?.trim()) return fallback;

  const s = cron.trim();
  const daily = new RegExp(`^daily@${TIME_LIST}$`).exec(s);
  if (daily) {
    return { kind: 'daily', times: uniqueSortedTimes(daily[1].split(',')), day: 0 };
  }

  const weekly = new RegExp(`^weekly@(\\d)@${TIME_LIST}$`).exec(s);
  if (weekly) {
    return {
      kind: 'weekly',
      times: uniqueSortedTimes(weekly[2].split(',')),
      day: Number(weekly[1]),
    };
  }

  const monthly = new RegExp(`^monthly@(\\d{1,2})@${TIME_LIST}$`).exec(s);
  if (monthly) {
    return {
      kind: 'monthly',
      times: uniqueSortedTimes(monthly[2].split(',')),
      day: Number(monthly[1]),
    };
  }

  // توافق مع صيغة قديمة: daily@02:00 بدون فواصل
  const legacyDaily = /^daily@(\d{2}):(\d{2})$/.exec(s);
  if (legacyDaily) return { kind: 'daily', times: [`${legacyDaily[1]}:${legacyDaily[2]}`], day: 0 };

  return fallback;
}

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

export const MAX_SCHEDULE_TIMES = 12;
