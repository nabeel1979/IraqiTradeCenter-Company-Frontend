import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildFullNumber,
  flagEmoji,
  filterPhoneCountries,
  getCountryDisplayName,
  parsePhoneForInput,
  type PhoneCountry,
} from '@/lib/phone/countries';
import { detectDefaultCountryIso } from '@/lib/phone/detectCountry';

type PhoneInputProps = {
  value?: string;
  onChange: (fullDigits: string) => void;
  defaultCountryIso?: string;
  className?: string;
  size?: 'default' | 'sm';
  disabled?: boolean;
  id?: string;
};

function countryLabel(country: PhoneCountry, locale: string): string {
  return getCountryDisplayName(country.iso, locale);
}

export function PhoneInput({
  value = '',
  onChange,
  defaultCountryIso,
  className,
  size = 'default',
  disabled,
  id,
}: PhoneInputProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en';
  const rootRef = useRef<HTMLDivElement>(null);
  const resolvedDefaultIso = defaultCountryIso ?? detectDefaultCountryIso();

  const [country, setCountry] = useState<PhoneCountry>(
    () => parsePhoneForInput(value, resolvedDefaultIso).country,
  );
  const [national, setNational] = useState(
    () => parsePhoneForInput(value, resolvedDefaultIso).national,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const parsed = parsePhoneForInput(value, resolvedDefaultIso);
    setCountry(parsed.country);
    setNational(parsed.national);
  }, [value, resolvedDefaultIso]);

  const heightClass = size === 'sm' ? 'h-9' : 'h-10';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const emit = (c: PhoneCountry, n: string) => {
    const full = buildFullNumber(c.dialCode, n);
    onChange(full);
  };

  const filtered = useMemo(() => filterPhoneCountries(query), [query]);

  const placeholder = country.iso === 'IQ' ? '7XXXXXXXXX' : t('common.phoneInput.phoneNumber');

  return (
    <div ref={rootRef} dir="ltr" className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-row overflow-hidden rounded-md border border-input bg-background',
          heightClass,
          'ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          disabled && 'opacity-50',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className="order-1 flex shrink-0 items-center gap-1 border-r border-input bg-muted/40 px-2 text-sm hover:bg-muted/70"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="text-base leading-none" aria-hidden>
            {flagEmoji(country.iso)}
          </span>
          <span className="font-medium text-foreground" dir="ltr">
            {country.iso} +{country.dialCode}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <input
          id={id}
          type="tel"
          dir="ltr"
          disabled={disabled}
          placeholder={placeholder}
          value={national}
          onChange={e => {
            const next = e.target.value.replace(/[^\d\s-]/g, '');
            setNational(next);
            emit(country, next);
          }}
          className="order-2 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {open && (
        <div
          dir="ltr"
          className="absolute left-0 z-50 mt-1 w-full min-w-[280px] overflow-hidden rounded-md border bg-popover text-left text-popover-foreground shadow-md"
          role="listbox"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('common.phoneInput.searchCountry')}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map(c => (
              <li key={c.iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso === country.iso}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                    c.iso === country.iso && 'bg-accent/60',
                  )}
                  onClick={() => {
                    setCountry(c);
                    setOpen(false);
                    setQuery('');
                    emit(c, national);
                  }}
                >
                  <span className="text-lg leading-none">{flagEmoji(c.iso)}</span>
                  <span className="min-w-[4.5rem] font-medium" dir="ltr">
                    {c.iso} +{c.dialCode}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {countryLabel(c, locale)}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t('common.noResults')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
