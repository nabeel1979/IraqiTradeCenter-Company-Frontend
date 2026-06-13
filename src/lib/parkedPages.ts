import { useSyncExternalStore } from 'react';

/**
 * صفحة معلّقة (Parked / Suspended page).
 * نخزّن المسار الكامل (pathname + search) حتى نتمكّن من إعادة فتح الصفحة كما هي،
 * مع عنوان وصفي ووقت التعليق. تُحفظ في localStorage لتبقى بعد إعادة التحميل.
 */
export interface ParkedPage {
  id: string;
  /** المسار الكامل: pathname + search */
  path: string;
  /** العنوان المعروض وقت التعليق */
  title: string;
  /** عنوان فرعي اختياري (مثل اسم الصفحة الأم) */
  subtitle?: string;
  /** طابع زمني (ms) لوقت التعليق */
  parkedAt: number;
}

const STORAGE_KEY = 'itc:parked-pages';
const EVENT = 'itc:parked-pages-changed';

function read(): ParkedPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as ParkedPage[]) : [];
  } catch {
    return [];
  }
}

/** ‎ذاكرة مؤقتة ثابتة المرجع — مطلوبة لاستقرار useSyncExternalStore. */
let cache: ParkedPage[] = read();

function write(items: ParkedPage[]): void {
  cache = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ‎تجاهل — قد يكون التخزين معطّلاً
  }
  window.dispatchEvent(new Event(EVENT));
}

/** ‎تعليق صفحة جديدة. يُزيل أي تعليق سابق لنفس المسار لتجنّب التكرار ويضعها في المقدّمة. */
export function parkPage(page: Omit<ParkedPage, 'id' | 'parkedAt'>): void {
  const items = read().filter(p => p.path !== page.path);
  items.unshift({
    ...page,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parkedAt: Date.now(),
  });
  write(items);
}

export function removeParkedPage(id: string): void {
  write(read().filter(p => p.id !== id));
}

export function clearParkedPages(): void {
  write([]);
}

function subscribe(cb: () => void): () => void {
  const handler = () => {
    cache = read();
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

function getSnapshot(): ParkedPage[] {
  return cache;
}

/** Hook تفاعلي يُعيد قائمة الصفحات المعلّقة ويُعاد رسمه عند أي تغيير. */
export function useParkedPages(): ParkedPage[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
