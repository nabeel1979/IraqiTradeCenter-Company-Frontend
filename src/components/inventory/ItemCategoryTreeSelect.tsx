import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Folder, Search, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemCategoryDto } from '@/lib/api/inventory';

interface ItemCategoryTreeSelectProps {
  categories: ItemCategoryDto[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
}

function findLabel(cats: ItemCategoryDto[], id: number, prefix = ''): string | null {
  for (const c of cats) {
    const label = prefix ? `${prefix} › ${c.nameAr}` : c.nameAr;
    if (c.id === id) return label;
    if (c.children?.length) {
      const found = findLabel(c.children, id, label);
      if (found) return found;
    }
  }
  return null;
}

function isSelectableLeaf(node: ItemCategoryDto): boolean {
  const hasChildren = (node.children?.length ?? 0) > 0;
  return !hasChildren && node.parentId != null;
}

function collectSelectableLeaves(
  nodes: ItemCategoryDto[],
  prefix = '',
): { id: number; label: string }[] {
  const out: { id: number; label: string }[] = [];
  for (const node of nodes) {
    const label = prefix ? `${prefix} › ${node.nameAr}` : node.nameAr;
    if (isSelectableLeaf(node)) out.push({ id: node.id, label });
    if (node.children?.length) out.push(...collectSelectableLeaves(node.children, label));
  }
  return out;
}

function TreeOptions({
  nodes, depth, value, onSelect,
}: {
  nodes: ItemCategoryDto[];
  depth: number;
  value: number | null | undefined;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {nodes.map(node => {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const selectable = isSelectableLeaf(node);
        return (
          <div key={node.id}>
            {selectable ? (
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-start hover:bg-muted',
                  value === node.id && 'bg-primary/10 text-primary font-medium',
                )}
                style={{ paddingInlineStart: 8 + depth * 16 }}
                onClick={() => onSelect(node.id)}
              >
                <Tag className="h-3.5 w-3.5 shrink-0 opacity-60" />
                {node.nameAr}
              </button>
            ) : (
              <div
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"
                style={{ paddingInlineStart: 8 + depth * 16 }}
              >
                <Folder className="h-3.5 w-3.5 shrink-0" />
                {node.nameAr}
              </div>
            )}
            {hasChildren && (
              <TreeOptions
                nodes={node.children}
                depth={depth + 1}
                value={value}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** اختيار صنف فرعي نهائي من شجرة الأصناف مع بحث */
export function ItemCategoryTreeSelect({
  categories, value, onChange, placeholder = '— اختر صنفاً فرعياً —', className,
}: ItemCategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value != null ? findLabel(categories, value) : null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return collectSelectableLeaves(categories).filter(o =>
      o.label.toLowerCase().includes(q),
    );
  }, [categories, query]);

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
        <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel ?? placeholder}
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
                placeholder="ابحث عن صنف..."
                className="h-8 ps-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              {placeholder}
            </button>
            {query.trim() ? (
              searchResults.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
              ) : searchResults.map(o => (
                <button
                  key={o.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-start hover:bg-muted',
                    value === o.id && 'bg-primary/10 text-primary font-medium',
                  )}
                  onClick={() => { onChange(o.id); setOpen(false); }}
                >
                  <Tag className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  {o.label}
                </button>
              ))
            ) : categories.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground text-center">لا توجد أصناف</p>
            ) : (
              <TreeOptions
                nodes={categories}
                depth={0}
                value={value}
                onSelect={id => { onChange(id); setOpen(false); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { findLabel as findCategoryLabel, isSelectableLeaf };
