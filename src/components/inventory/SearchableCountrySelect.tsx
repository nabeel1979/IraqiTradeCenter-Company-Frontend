import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface CountryOption {
  id: number;
  nameAr: string;
  isActive?: boolean;
}

interface SearchableCountrySelectProps {
  countries: CountryOption[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableCountrySelect({
  countries,
  value,
  onChange,
  placeholder = '— اختر البلد —',
  className,
}: SearchableCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = countries.find(c => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = countries.filter(c => c.isActive !== false);
    if (!q) return active;
    return active.filter(c => c.nameAr.toLowerCase().includes(q));
  }, [countries, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        onClick={() => setOpen(o => !o)}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.nameAr ?? placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن بلد..."
                className="h-8 ps-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            <button
              type="button"
              className="flex w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'flex w-full rounded-md px-2 py-1.5 text-sm text-start hover:bg-muted',
                  value === c.id && 'bg-primary/10 text-primary font-medium',
                )}
                onClick={() => { onChange(c.id); setOpen(false); }}
              >
                {c.nameAr}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
