import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocale, localizedAccountName, accountSearchHaystack } from '@/lib/i18n';
import type { AccountDto } from '@/types/api';

export interface AccountPickerProps {
  accounts: AccountDto[];
  value: number | null;
  initialLabel?: string;
  onChange: (id: number | null, label: string) => void;
  /** السماح بتركه فارغاً (مفيد في الفلاتر: جميع الحسابات) */
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  /** ارتفاع الـ input (افتراضي 9 وحدات) */
  inputHeight?: 8 | 9;
}

/**
 * Combobox للحساب: input مباشر + بحث فوري عبر الكود/الاسم.
 * يدعم لوحة المفاتيح (↑↓ Enter Esc) والإزالة الاختيارية للقيمة.
 */
export function AccountPicker({
  accounts,
  value,
  initialLabel,
  onChange,
  allowClear = false,
  placeholder = 'ابحث برقم أو اسم الحساب...',
  className,
  inputHeight = 9,
}: AccountPickerProps) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    if (value) {
      // ‎البيانات الحديثة من قائمة الحسابات تتقدّم على القيمة الممرَّرة
      // ‎من الخارج (تُستعمل كـ fallback فقط حين لا يكون الحساب ضمن القائمة،
      // ‎مثل حالة حساب «أب» قادم من شاشة أرصدة بينما الـ picker يعرض الأوراق فقط).
      const a = accounts.find(x => x.id === value);
      if (a) return `${a.code} - ${localizedAccountName(locale, a.nameAr, a.nameEn)}`;
      if (initialLabel) return initialLabel;
      return '';
    }
    return '';
  }, [value, accounts, initialLabel, locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 80);

    const exact: AccountDto[] = [];
    const startsCode: AccountDto[] = [];
    const startsName: AccountDto[] = [];
    const contains: AccountDto[] = [];

    for (const a of accounts) {
      const code = (a.code ?? '').toLowerCase();
      const hay = accountSearchHaystack(a.code, a.nameAr, a.nameEn);
      if (code === q) exact.push(a);
      else if (code.startsWith(q)) startsCode.push(a);
      else if (hay.startsWith(q)) startsName.push(a);
      else if (hay.includes(q)) contains.push(a);
    }
    return [...exact, ...startsCode, ...startsName, ...contains].slice(0, 80);
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const select = (a: AccountDto) => {
    onChange(a.id, `${a.code} - ${localizedAccountName(locale, a.nameAr, a.nameEn)}`);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const clear = () => {
    onChange(null, '');
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = filtered[highlight];
      if (a) select(a);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Backspace' && allowClear && !query && value) {
      // Backspace في حقل فارغ يمسح الاختيار
      clear();
    }
  };

  const heightCls = inputHeight === 8 ? 'h-8' : 'h-9';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={open ? query : selectedLabel}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKey}
          placeholder={selectedLabel || placeholder}
          className={cn(
            heightCls,
            'pr-7',
            allowClear && value ? 'pl-7' : 'pl-2',
            'text-xs',
            !value && !open && 'text-muted-foreground'
          )}
        />
        {allowClear && value && !open && (
          <button
            type="button"
            onClick={clear}
            className="absolute left-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="إلغاء التحديد"
            aria-label="مسح الحساب"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[280px] overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {allowClear && (
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  clear();
                }}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-right text-xs italic transition-colors',
                  !value ? 'bg-primary/15 font-semibold' : 'hover:bg-secondary/60',
                  'text-muted-foreground'
                )}
              >
                — جميع الحسابات —
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                لا توجد نتائج لـ "{query}"
              </div>
            ) : (
              filtered.map((a, idx) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    select(a);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-right text-sm transition-colors',
                    idx === highlight ? 'bg-primary/15' : 'hover:bg-secondary/60',
                    a.id === value && 'font-semibold'
                  )}
                >
                  <span className="num-display text-xs text-muted-foreground shrink-0 min-w-[60px]">
                    {a.code}
                  </span>
                  <span className="flex-1 truncate">
                    {localizedAccountName(locale, a.nameAr, a.nameEn)}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            {filtered.length} نتيجة • ↑↓ للتنقل • Enter للاختيار
          </div>
        </div>
      )}
    </div>
  );
}
