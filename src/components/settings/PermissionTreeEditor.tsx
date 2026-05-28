import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleNode } from '@/types/api';

interface Props {
  tree: ModuleNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** للقراءة فقط (مثلاً عرض صلاحيات SuperAdmin). */
  readOnly?: boolean;
  /** ملاحظة تظهر أعلى الشجرة. */
  hint?: string;
}

/**
 * شجرة Module → Resource → [Actions] مع:
 *   • خانة "تحديد الكل" في الأعلى
 *   • خانة "تحديد كل المودول"
 *   • خانة "تحديد كل المورد" (تختار كل الأكشنز في الصف)
 *   • أكشن مفرد (Read / Create / Update / Delete / Print / Post / Export)
 *
 * الـ checkbox الأعلى يصير في حالة "indeterminate" تلقائياً إذا بعض أبنائه مختار وبعض لا.
 */
export function PermissionTreeEditor({ tree, selected, onChange, readOnly, hint }: Props) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // كل الأكواد في الشجرة (لتحديد/إلغاء الكل بسرعة)
  const allCodes = useMemo(() => {
    const out: string[] = [];
    for (const m of tree) for (const r of m.resources) for (const a of r.actions) out.push(a.code);
    return out;
  }, [tree]);

  const setMany = (codes: string[], on: boolean) => {
    if (readOnly) return;
    const next = new Set(selected);
    if (on) codes.forEach(c => next.add(c));
    else codes.forEach(c => next.delete(c));
    onChange(next);
  };

  const allSelected = allCodes.length > 0 && allCodes.every(c => selected.has(c));
  const anySelected = allCodes.some(c => selected.has(c));

  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {/* تحديد الكل */}
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
        <TriStateCheckbox
          checked={allSelected}
          indeterminate={!allSelected && anySelected}
          disabled={readOnly}
          onChange={v => setMany(allCodes, v)}
        />
        <span className="text-sm font-medium">
          {allSelected ? t('permissions.deselectAll') : t('permissions.selectAll')}
        </span>
        <span className="ms-auto text-xs text-muted-foreground">
          {selected.size} / {allCodes.length}
        </span>
      </div>

      {/* المودولز */}
      <div className="space-y-1.5">
        {tree.map(m => {
          const mCodes = m.resources.flatMap(r => r.actions.map(a => a.code));
          const mSelected = mCodes.every(c => selected.has(c));
          const mAny = mCodes.some(c => selected.has(c));
          const mKey = `m:${m.module}`;
          const isCollapsed = collapsed.has(mKey);

          return (
            <div key={m.module} className="rounded-lg border border-border/60 bg-card/30">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleCollapse(mKey)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('common.toggleCollapse')}
                >
                  {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <TriStateCheckbox
                  checked={mSelected}
                  indeterminate={!mSelected && mAny}
                  disabled={readOnly}
                  onChange={v => setMany(mCodes, v)}
                />
                <span className="text-sm font-semibold">{m.moduleAr}</span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {mCodes.filter(c => selected.has(c)).length} / {mCodes.length}
                </span>
              </div>

              {!isCollapsed && (
                <div className="border-t border-border/40 px-3 py-2">
                  <div className="space-y-1">
                    {m.resources.map(r => {
                      const rCodes = r.actions.map(a => a.code);
                      const rSelected = rCodes.every(c => selected.has(c));
                      const rAny = rCodes.some(c => selected.has(c));

                      return (
                        <div
                          key={r.resource}
                          className="grid grid-cols-12 items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary/30"
                        >
                          <div className="col-span-12 flex items-center gap-2 md:col-span-4">
                            <TriStateCheckbox
                              checked={rSelected}
                              indeterminate={!rSelected && rAny}
                              disabled={readOnly}
                              onChange={v => setMany(rCodes, v)}
                            />
                            <span className="text-sm">{r.resourceAr}</span>
                          </div>
                          <div className="col-span-12 flex flex-wrap items-center gap-2 md:col-span-8">
                            {r.actions.map(a => (
                              <label
                                key={a.code}
                                className={cn(
                                  'flex cursor-pointer select-none items-center gap-1.5 rounded border border-border/50 bg-secondary/20 px-2 py-1 text-xs transition',
                                  selected.has(a.code) && 'border-primary/60 bg-primary/10 text-primary',
                                  readOnly && 'cursor-not-allowed opacity-60'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5"
                                  checked={selected.has(a.code)}
                                  disabled={readOnly}
                                  onChange={e => setMany([a.code], e.target.checked)}
                                />
                                <span>{a.actionAr}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TriState {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function TriStateCheckbox({ checked, indeterminate, disabled, onChange }: TriState) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer"
      checked={checked}
      disabled={disabled}
      ref={el => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={e => onChange(e.target.checked)}
    />
  );
}
