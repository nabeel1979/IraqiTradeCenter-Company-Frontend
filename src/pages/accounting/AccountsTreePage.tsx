import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  FolderTree,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ListCollapse,
  ListTree,
  EyeOff,
} from 'lucide-react';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  accountingApi,
  type CreateAccountPayload,
  type UpdateAccountPayload,
} from '@/lib/api/accounting';
import { formatIQD, cn } from '@/lib/utils';
import type { AccountDto } from '@/types/api';

const MAX_LEVEL = 5;

/** بحث متعمّق عن حساب بمعرّفه داخل شجرة الحسابات. */
function findAccountById(tree: AccountDto[], id: number): AccountDto | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findAccountById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

const ACCOUNT_TYPE_LABELS: Record<number, string> = {
  1: 'أصول',
  2: 'خصوم',
  3: 'حقوق ملكية',
  4: 'إيرادات',
  5: 'مصروفات',
};

const ACCOUNT_TYPE_COLORS: Record<number, string> = {
  1: 'text-blue-400',
  2: 'text-amber-400',
  3: 'text-violet-400',
  4: 'text-emerald-400',
  5: 'text-rose-400',
};

const NATURE_LABELS: Record<number, string> = {
  1: 'مدين',
  2: 'دائن',
};

/**
 * تصنيف الحساب إلى "ميزانية" أو "أرباح وخسارة" بناءً على أول رقم في الكود:
 *   • يبدأ بـ 1 (أصول) أو 2 (خصوم/حقوق ملكية) → ميزانية (Balance Sheet)
 *   • يبدأ بـ 3 (إيرادات) أو 4 (مصاريف)      → أرباح وخسارة (P&L)
 * إذا لم يبدأ برقم متعارف عليه نُرجع null (لا نعرض البادج).
 */
function getAccountCategory(code: string | undefined | null): {
  label: string;
  cls: string;
} | null {
  if (!code) return null;
  const first = code.trim().charAt(0);
  if (first === '1' || first === '2') {
    return {
      label: 'ميزانية',
      cls: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    };
  }
  if (first === '3' || first === '4') {
    return {
      label: 'أرباح وخسارة',
      cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    };
  }
  return null;
}

// ============================================================
// Modal بسيط (Portal-less, Radix-less)
// ============================================================
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-xl"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ============================================================
// نموذج Create / Update
// ============================================================
type FormMode = 'create' | 'edit';

interface FormState {
  code: string;
  nameAr: string;
  nameEn: string;
  type: number;
  nature: number;
  description: string;
  isActive: boolean;
  isLeaf: boolean;
}

/**
 * يقترح الكود التالي لحساب فرعي جديد تحت {@link parent}.
 *
 * الخوارزمية: نمسح كل أبناء {@link parent} المباشرين (مفعَّلين + معطَّلين بشرط
 * أن يكون الـ tree مطلوباً بـ includeInactive=true)، ونستخرج اللاحقة الرقمية
 * بعد كود الأب لكل ابن، ثم نُرجع `parent.code + (max + 1)`. هذا يضمن:
 *
 *   1. التسلسل التصاعدي: لا يُعاد استخدام كود سبق وأُعطي لحساب آخر حتى لو
 *      تم تعطيله — لأن السجلات المحاسبية القديمة قد تشير إليه برمزه.
 *   2. لا يقترح كوداً موجوداً بالفعل (سواء مفعَّل أو معطَّل) فيتفادى رسالة
 *      "رمز الحساب مستخدم بالفعل".
 *
 * إذا لم يكن لدى الأب أبناء بَعد → يُقترح `parent.code + "1"`.
 */
function suggestNextChildCode(parent: AccountDto): string {
  const prefix = parent.code;
  const children = parent.children ?? [];
  let max = 0;
  for (const child of children) {
    if (!child.code.startsWith(prefix)) continue;
    const suffix = child.code.slice(prefix.length);
    // ‎نتعامل فقط مع لواحق رقمية بحتة (تتفق مع التقليد المحاسبي العراقي:
    // ‎كل مستوى يضيف رقماً جديداً للأب)
    if (!/^\d+$/.test(suffix)) continue;
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

function initFormFromAccount(a?: AccountDto, parent?: AccountDto | null): FormState {
  if (a) {
    return {
      code: a.code,
      nameAr: a.nameAr,
      nameEn: '',
      type: a.type,
      nature: a.nature,
      description: '',
      isActive: a.isActive,
      isLeaf: a.isLeaf,
    };
  }
  // إنشاء جديد: نقترح كوداً تحت الأب — تسلسل تصاعدي يأخذ بعين الاعتبار
  // الحسابات المعطَّلة كي لا يصطدم بكود محجوز.
  const suggestedCode = parent ? suggestNextChildCode(parent) : '';
  return {
    code: suggestedCode,
    nameAr: '',
    nameEn: '',
    type: parent?.type ?? 1,
    nature: parent?.nature ?? 1,
    description: '',
    isActive: true,
    isLeaf: true,
  };
}

function AccountFormModal({
  open,
  mode,
  account,
  parent,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  mode: FormMode;
  account?: AccountDto;
  parent?: AccountDto | null;
  onClose: () => void;
  onSubmit: (form: FormState, addAnother: boolean) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(() => initFormFromAccount(account, parent));
  // ‎مرجع لمعرفة أيّ زرّ ضُغط للإرسال — كي نُبقي النموذج مفتوحاً عند "حفظ وإضافة آخر".
  // ‎نستخدم ref بدل state كي تكون القيمة جاهزة فوراً للـ onSubmit الذي يلي onClick مباشرة
  // ‎في نفس tick، بدون انتظار إعادة الرندر.
  const addAnotherRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setForm(initFormFromAccount(account, parent));
  }, [open, account, parent]);

  // ‎تركيز تلقائي على حقل الاسم بعد فتح النافذة — يسرّع إدخالات متتالية للإخوة.
  useEffect(() => {
    if (open && mode === 'create') {
      const t = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  const parentLevel = parent ? parent.level : 0;
  const newLevel = mode === 'create' ? parentLevel + 1 : (account?.level ?? 1);
  const reachedMax = mode === 'create' && newLevel > MAX_LEVEL;

  // ‎تحذير فوري قبل الإرسال: اسم مستخدم تحت نفس الأب (نتطابق مع نفس فحص الباكند:
  // ‎تطابق بعد قصّ المسافات، نتجاهل الحساب الحالي عند التعديل، ونشمل المعطَّلين).
  // ‎الصفحة تمرّر `parent` للحالتين معاً: في الإنشاء = الأب الجديد، وفي التعديل =
  // ‎الأب الفعلي للحساب (يُحدَّد من account.parentId).
  const nameConflict = useMemo(() => {
    const typed = form.nameAr.trim();
    if (!typed) return null;
    const siblings = parent?.children ?? [];
    const hit = siblings.find(s => s.nameAr.trim() === typed && s.id !== account?.id);
    return hit ?? null;
  }, [form.nameAr, parent?.children, account?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reachedMax) return;
    if (nameConflict) return; // الباكند سيرفض أيضاً، لكن نمنع المحاولة محلياً
    const addAnother = addAnotherRef.current;
    addAnotherRef.current = false; // إعادة تصفير بعد القراءة
    onSubmit(form, addAnother);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'create'
          ? parent
            ? 'إضافة حساب فرعي'
            : 'إضافة حساب جذر جديد'
          : 'تعديل الحساب'
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          {/* زر إضافي يظهر فقط في الإنشاء تحت أب — يُبقي النافذة مفتوحة لإضافة المزيد. */}
          {mode === 'create' && parent && (
            <Button
              type="submit"
              form="account-form"
              variant="secondary"
              disabled={loading || reachedMax || !!nameConflict}
              onClick={() => {
                addAnotherRef.current = true;
              }}
              title="يحفظ الحساب الحالي ويُبقي النموذج مفتوحاً لإضافة شقيق جديد تحت نفس الأب"
            >
              {loading && addAnotherRef.current ? 'جارٍ الحفظ...' : 'حفظ وإضافة آخر'}
            </Button>
          )}
          <Button
            type="submit"
            form="account-form"
            disabled={loading || reachedMax || !!nameConflict}
            onClick={() => {
              addAnotherRef.current = false;
            }}
          >
            {loading ? 'جارٍ الحفظ...' : mode === 'create' ? 'إنشاء' : 'حفظ التغييرات'}
          </Button>
        </div>
      }
    >
      {reachedMax && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>تجاوزت الحد الأقصى للمستويات (5). لا يمكن إضافة حساب فرعي.</div>
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <form id="account-form" onSubmit={handleSubmit} className="space-y-3">
        {parent && mode === 'create' && (
          <div className="rounded-md border border-border bg-secondary/30 p-2.5 text-[11px] leading-relaxed">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">الحساب الأب:</span>
              <span className="text-muted-foreground">المستوى {parent.level} → {newLevel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="num-display text-foreground">{parent.code}</span>
              <span className="truncate font-medium">{parent.nameAr}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Label className="text-xs">رمز الحساب</Label>
            <Input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              disabled={mode === 'edit'}
              placeholder="مثال: 1611"
              required
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">المستوى</Label>
            <Input value={newLevel} disabled className="h-9 num-display" />
          </div>
        </div>

        {/* بادج تصنيف الحساب: ميزانية أو أرباح وخسارة بناءً على بداية الكود */}
        {(() => {
          const cat = getAccountCategory(form.code);
          if (!cat) return null;
          return (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">تصنيف الحساب:</span>
              <span className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                cat.cls
              )}>
                {cat.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                (مبني على بادئة الكود — 1/2 = ميزانية، 3/4 = أرباح وخسارة)
              </span>
            </div>
          );
        })()}

        <div>
          <Label className="text-xs">الاسم بالعربية</Label>
          <Input
            ref={nameInputRef}
            value={form.nameAr}
            onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
            placeholder="مثال: ذمم العملاء"
            required
            className={cn('h-9', nameConflict && 'border-destructive focus-visible:ring-destructive')}
            aria-invalid={!!nameConflict}
            aria-describedby={nameConflict ? 'name-conflict-msg' : undefined}
          />
          {nameConflict && (
            <p
              id="name-conflict-msg"
              className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                هذا الاسم مستخدم بالفعل تحت نفس الأب{' '}
                <span className="num-display">({nameConflict.code})</span> — يرجى استخدام اسم مختلف.
              </span>
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs">الاسم بالإنجليزية (اختياري)</Label>
          <Input
            value={form.nameEn}
            onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
            placeholder="e.g. Customer Receivables"
            className="h-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">نوع الحساب</Label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: Number(e.target.value) }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value={1}>أصول</option>
              <option value={2}>خصوم</option>
              <option value={3}>حقوق ملكية</option>
              <option value={4}>إيرادات</option>
              <option value={5}>مصروفات</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">الطبيعة</Label>
            <select
              value={form.nature}
              onChange={e => setForm(f => ({ ...f, nature: Number(e.target.value) }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value={1}>مدين</option>
              <option value={2}>دائن</option>
            </select>
          </div>
        </div>

        <div>
          <Label className="text-xs">الوصف (اختياري)</Label>
          <Input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="ملاحظات إضافية..."
            className="h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.isLeaf}
              onChange={e => setForm(f => ({ ...f, isLeaf: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            حساب تفصيلي (يقبل قيوداً)
          </label>
          {mode === 'edit' && (
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              مفعّل
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Confirm Delete Dialog
// ============================================================
function ConfirmDeleteModal({
  open,
  account,
  onClose,
  onConfirm,
  loading,
  error,
}: {
  open: boolean;
  account?: AccountDto;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تأكيد حذف الحساب"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'جارٍ النقل...' : 'نقل إلى السلة'}
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}
      <p className="text-sm">
        هل أنت متأكد من نقل الحساب{' '}
        <span className="font-bold">
          {account?.code} · {account?.nameAr}
        </span>{' '}
        إلى سلة المهملات؟
      </p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>
          سيُنقل إلى السلة ويمكن استعادته لاحقاً. لن يتم الحذف إذا كان للحساب فروع تابعة، أو قيود
          محاسبية، أو رصيد افتتاحي.
        </p>
        <p className="text-amber-500">
          الكود سيبقى محجوزاً حتى تستعيد الحساب أو تحذفه نهائياً من السلة.
        </p>
      </div>
    </Modal>
  );
}

// ============================================================
// Tree Node
// ============================================================
function AccountNode({
  account,
  depth = 0,
  search,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  forceShowAll = false,
}: {
  account: AccountDto;
  depth?: number;
  search: string;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAddChild: (parent: AccountDto) => void;
  onEdit: (a: AccountDto) => void;
  onDelete: (a: AccountDto) => void;
  /**
   * ‎إن كانت true: نظهر هذا الحساب وكل أبنائه بدون فلتر بحث (يُمرَّر من الأب
   * ‎عند مطابقة سلفٍ ما — لتُعرض الشجرة الفرعية كاملةً تحت الحساب المطابق).
   */
  forceShowAll?: boolean;
}) {
  const open = expanded.has(account.id);
  const hasChildren = account.children?.length > 0;

  // ‎بحث case-insensitive ويتجاهل المسافات الزائدة
  const q = search.trim().toLowerCase();
  const matchesSelf =
    !q || account.code.toLowerCase().includes(q) || account.nameAr.toLowerCase().includes(q);

  const childMatches = (acc: AccountDto): boolean => {
    if (!q) return true;
    if (acc.code.toLowerCase().includes(q) || acc.nameAr.toLowerCase().includes(q)) return true;
    return acc.children?.some(childMatches) ?? false;
  };
  // ‎مرئي إذا: (أ) الأب طلب إظهار كل شيء، أو (ب) لا يوجد بحث، أو (ج) هذا الحساب
  // ‎يطابق، أو (د) أحد أبنائه يطابق (لإظهار المسار للحساب المطابق).
  const visible = forceShowAll || matchesSelf || childMatches(account);
  if (!visible) return null;

  // ‎عند مطابقة هذا الحساب أو وراثة forceShowAll، نمرّر إظهاراً كاملاً للأبناء
  // ‎ليُعرضوا جميعاً (بما فيهم غير المطابقين).
  const childForceShowAll = forceShowAll || (!!q && matchesSelf);

  // ‎مع وجود بحث وعدم وجود forceShowAll: نوسّع الشجرة تلقائياً عند هذه العقدة
  // ‎لإظهار المسار للنتيجة المطابقة بدون نقرات إضافية.
  const expandedForSearch = !!q && !forceShowAll && childMatches(account);
  const showChildren = open || expandedForSearch || forceShowAll;

  const colorClass = ACCOUNT_TYPE_COLORS[account.type] ?? 'text-muted-foreground';
  // ‎الحساب الورقة المرتبط فعلاً بقيد/صندوق/نوع سند/رصيد افتتاحي لا يقبل
  // ‎إضافة فروع تحته (تكسر سلامة المراجع) ولا يقبل الحذف. الحماية مكرَّرة على
  // ‎الخادم — هذا الإخفاء فقط لتحسين تجربة المستخدم.
  const blocked = account.isUsed === true;
  // ‎الحساب المعطَّل (IsActive=false) لا تظهر له صلاحية إضافة فرع — لأن الفرع
  // ‎الجديد سيكون أيضاً غير قابل للاستخدام في شاشات الاختيار. على المستخدم
  // ‎تفعيله أولاً عبر شاشة التعديل، أو اختيار حساب أب آخر.
  const inactive = account.isActive === false;
  const canAddChild = account.level < MAX_LEVEL && !blocked && !inactive;
  // ‎الحساب الذي له أبناء لا يقبل الحذف (يجب حذف أبنائه أولاً) — نخفي الأيقونة
  // ‎بدلاً من إظهارها وفشل العملية لاحقاً.
  const canDelete = !blocked && !hasChildren;

  // ‎نُبرز هذا الحساب بإطار/خلفية مميّزة عند مطابقة البحث ليلفت النظر بسهولة
  const isSearchHit = !!q && (account.code.toLowerCase().includes(q) || account.nameAr.toLowerCase().includes(q));

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md py-2 pl-2 pr-3 text-sm hover:bg-accent/40',
          'border-r-2 border-transparent',
          depth === 0 && 'border-r-primary/40 bg-secondary/30 font-semibold',
          // ‎الحساب المعطَّل: عتم خفيف على المحتوى بأكمله مع خلفية محايدة لتمييزه
          inactive && 'opacity-60 saturate-50',
          isSearchHit && 'bg-primary/10 ring-1 ring-primary/40'
        )}
        style={{ paddingRight: `${0.75 + depth * 1.25}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(account.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : (
          <Wallet className={cn('h-4 w-4', colorClass)} />
        )}

        <span className={cn('num-display text-xs text-muted-foreground', inactive && 'line-through')}>
          {account.code}
        </span>
        <span className={cn('flex-1', !account.isLeaf && 'font-medium', inactive && 'line-through')}>
          {account.nameAr}
        </span>

        {inactive && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500"
            title="هذا الحساب معطَّل — لا يظهر في شاشات الاختيار، لكن كوده محجوز. يمكنك تفعيله من زرّ التعديل."
          >
            <EyeOff className="h-3 w-3" />
            معطَّل
          </span>
        )}

        <span className="hidden text-[10px] text-muted-foreground md:inline">
          L{account.level} · {NATURE_LABELS[account.nature] ?? '—'}
        </span>

        {depth === 0 && (
          <span className={cn('rounded-full bg-card px-2 py-0.5 text-[11px]', colorClass)}>
            {ACCOUNT_TYPE_LABELS[account.type] ?? '—'}
          </span>
        )}
        {depth === 0 && (() => {
          const cat = getAccountCategory(account.code);
          if (!cat) return null;
          return (
            <span className={cn(
              'hidden rounded-full border px-2 py-0.5 text-[10px] font-medium md:inline',
              cat.cls
            )}>
              {cat.label}
            </span>
          );
        })()}
        {account.openingBalance !== 0 && (
          <span className="num-display text-xs text-muted-foreground">
            {formatIQD(account.openingBalance)}
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canAddChild && (
            <button
              type="button"
              onClick={() => onAddChild(account)}
              className="rounded p-1 hover:bg-primary/20 hover:text-primary"
              title="إضافة حساب فرعي"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(account)}
            className="rounded p-1 hover:bg-blue-500/20 hover:text-blue-400"
            title="تعديل"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(account)}
              className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
              title="حذف"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasChildren && showChildren && (
        <div>
          {account.children.map(child => (
            <AccountNode
              key={child.id}
              account={child}
              depth={depth + 1}
              search={search}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              forceShowAll={childForceShowAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export function AccountsTreePage() {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingAccount, setEditingAccount] = useState<AccountDto | undefined>();
  const [parentAccount, setParentAccount] = useState<AccountDto | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<AccountDto | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // ‎مفتاح يُجبر إعادة بناء AccountFormModal بعد كل عملية "حفظ وإضافة آخر"
  // ‎حتى يُعاد احتساب الكود المقترح ويُمسح اسم/وصف الحساب السابق.
  const [formInstanceId, setFormInstanceId] = useState(0);

  const qc = useQueryClient();
  // ‎شاشة الإدارة هي الموضع الوحيد الذي يطلب الحسابات المعطَّلة، كي يرى المستخدم
  // ‎شجرة كاملة (مفعَّلة + معطَّلة) ويفهم لماذا قد يُرفض كود معيّن لتكراره.
  // ‎باقي الشاشات (قيود/صناديق/سندات) تستدعي getTree() فتأخذ المفعَّلة فقط.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts-tree', 'all'],
    queryFn: accountingApi.getFullTree,
  });

  const toggle = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const expandAll = useCallback(() => {
    if (!data) return;
    const all = new Set<number>();
    const walk = (a: AccountDto) => {
      if (a.children?.length > 0) all.add(a.id);
      a.children?.forEach(walk);
    };
    data.forEach(walk);
    setExpanded(all);
  }, [data]);

  const createMut = useMutation({
    mutationFn: async (vars: { payload: CreateAccountPayload; addAnother: boolean }) => {
      const res = await accountingApi.createAccount(vars.payload);
      return { res, addAnother: vars.addAnother };
    },
    onSuccess: async ({ res, addAnother }) => {
      if (!res.success) {
        setFormError(res.errors?.join(' / ') ?? 'فشل الإنشاء');
        return;
      }
      setFormError(null);
      // ‎"حفظ وإضافة آخر": نُبقي النافذة مفتوحة ونُجهّز الفورم لإخوة جدد تحت نفس الأب.
      if (addAnother && parentAccount) {
        // ‎ننتظر إعادة الجلب فعلياً (await) كي يكون مرجع الأب الجديد يحوي الابن الذي
        // ‎أُنشئ للتو، وبالتالي يُحتسب الكود التالي بشكل صحيح في الفورم القادم.
        await qc.invalidateQueries({ queryKey: ['accounts-tree'] });
        const fresh = qc.getQueryData<AccountDto[]>(['accounts-tree']);
        if (fresh) {
          const updatedParent = findAccountById(fresh, parentAccount.id);
          if (updatedParent) setParentAccount(updatedParent);
        }
        // ‎نوسّع الأب كي يرى المستخدم الحساب الذي أنشأه للتو في الشجرة خلف النافذة.
        setExpanded(prev => {
          if (prev.has(parentAccount.id)) return prev;
          const next = new Set(prev);
          next.add(parentAccount.id);
          return next;
        });
        // ‎بدّل key لإعادة mount للنموذج (مسح الاسم/الوصف + احتساب كود جديد).
        setFormInstanceId(n => n + 1);
        return;
      }
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      setFormOpen(false);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { errors?: string[] } } };
      setFormError(e.response?.data?.errors?.join(' / ') ?? 'حدث خطأ في الاتصال');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateAccountPayload }) =>
      accountingApi.updateAccount(id, payload),
    onSuccess: res => {
      if (!res.success) {
        setFormError(res.errors?.join(' / ') ?? 'فشل التحديث');
        return;
      }
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      setFormOpen(false);
      setFormError(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { errors?: string[] } } };
      setFormError(e.response?.data?.errors?.join(' / ') ?? 'حدث خطأ في الاتصال');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => accountingApi.deleteAccount(id),
    onSuccess: res => {
      if (!res.success) {
        setDeleteError(res.errors?.join(' / ') ?? 'فشل الحذف');
        return;
      }
      qc.invalidateQueries({ queryKey: ['accounts-tree'] });
      setDeleteOpen(false);
      setDeleteError(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { errors?: string[] } } };
      setDeleteError(e.response?.data?.errors?.join(' / ') ?? 'حدث خطأ في الاتصال');
    },
  });

  const handleAddRoot = () => {
    setFormMode('create');
    setEditingAccount(undefined);
    setParentAccount(null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleAddChild = (parent: AccountDto) => {
    setFormMode('create');
    setEditingAccount(undefined);
    setParentAccount(parent);
    setFormError(null);
    setFormOpen(true);
    // ‎وسّع الأب فوراً كي يرى المستخدم سياق الإضافة في الشجرة، ويستطيع المتابعة
    // ‎بإضافة أكثر من ابن دون إعادة العثور على الأب وفتحه يدوياً.
    setExpanded(prev => {
      if (prev.has(parent.id)) return prev;
      const next = new Set(prev);
      next.add(parent.id);
      return next;
    });
  };

  const handleEdit = (a: AccountDto) => {
    setFormMode('edit');
    setEditingAccount(a);
    // ‎نمرّر الأب الفعلي للحساب أيضاً في وضع التعديل، كي يعمل فحص تكرار الاسم
    // ‎بين الإخوة داخل الـ Modal بشكل صحيح (يستثني الحساب نفسه).
    setParentAccount(a.parentId ? findAccountById(data ?? [], a.parentId) : null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleDelete = (a: AccountDto) => {
    setDeletingAccount(a);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const submitForm = (form: FormState, addAnother: boolean) => {
    if (formMode === 'create') {
      createMut.mutate({
        payload: {
          code: form.code,
          nameAr: form.nameAr,
          nameEn: form.nameEn || null,
          type: form.type,
          nature: form.nature,
          parentId: parentAccount?.id ?? null,
          isLeaf: form.isLeaf,
          description: form.description || null,
        },
        addAnother,
      });
    } else if (editingAccount) {
      updateMut.mutate({
        id: editingAccount.id,
        payload: {
          nameAr: form.nameAr,
          nameEn: form.nameEn || null,
          type: form.type,
          nature: form.nature,
          description: form.description || null,
          isActive: form.isActive,
        },
      });
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, inactive: 0 };
    let total = 0;
    let inactive = 0;
    const walk = (a: AccountDto) => {
      total++;
      if (a.isActive === false) inactive++;
      a.children?.forEach(walk);
    };
    data.forEach(walk);
    return { total, inactive };
  }, [data]);

  if (isLoading) return <LoadingSpinner text="جاري تحميل شجرة الحسابات..." />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={FolderTree}
        title="تعذّر تحميل شجرة الحسابات"
        description="حدث خطأ في الاتصال بالخادم"
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          {/* عنوان البطاقة + زر "حساب جذر جديد" — صفّ واحد، يلتفّ على الجوال */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>شجرة الحسابات</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.total} حساب · {data.length} مجموعة رئيسية · حد المستويات {MAX_LEVEL}
                {stats.inactive > 0 && (
                  <>
                    {' · '}
                    <span className="text-amber-500">
                      {stats.inactive} معطَّل
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {can(PERMS.System.Trash.Read) && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  title="فتح سلة المهملات الموحَّدة لكل النظام"
                >
                  <Link to="/system/trash">
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">السلة</span>
                  </Link>
                </Button>
              )}
              <Button onClick={handleAddRoot} size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">حساب جذر جديد</span>
                <span className="sm:hidden">جذر جديد</span>
              </Button>
            </div>
          </div>

          {/* صفّ البحث + أزرار الطي/التوسيع — البحث يأخذ المساحة المتبقية */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                placeholder="ابحث بالكود أو الاسم..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={collapseAll}
              title="طي كل المستويات (إظهار المستوى الأول فقط)"
              className="shrink-0"
            >
              <ListCollapse className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={expandAll}
              title="توسيع كل المستويات"
              className="shrink-0"
            >
              <ListTree className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <EmptyState icon={FolderTree} title="لا حسابات" description="شجرة الحسابات فارغة" />
          ) : (
            <div className="space-y-1">
              {data.map(root => (
                <AccountNode
                  key={root.id}
                  account={root}
                  depth={0}
                  search={search}
                  expanded={expanded}
                  onToggle={toggle}
                  onAddChild={handleAddChild}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AccountFormModal
        key={formInstanceId}
        open={formOpen}
        mode={formMode}
        account={editingAccount}
        parent={parentAccount}
        onClose={() => {
          if (!createMut.isPending && !updateMut.isPending) setFormOpen(false);
        }}
        onSubmit={submitForm}
        loading={createMut.isPending || updateMut.isPending}
        error={formError}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        account={deletingAccount}
        onClose={() => {
          if (!deleteMut.isPending) setDeleteOpen(false);
        }}
        onConfirm={() => deletingAccount && deleteMut.mutate(deletingAccount.id)}
        loading={deleteMut.isPending}
        error={deleteError}
      />
    </div>
  );
}
