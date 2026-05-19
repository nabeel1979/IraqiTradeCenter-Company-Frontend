import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
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

function initFormFromAccount(a?: AccountDto, parent?: AccountDto | null): FormState {
  if (a) {
    return {
      code: a.code,
      nameAr: a.nameAr,
      nameEn: '',
      type: a.type,
      nature: a.nature,
      description: '',
      isActive: true,
      isLeaf: a.isLeaf,
    };
  }
  // إنشاء جديد: نقترح كوداً تحت الأب (لا نلزم به - مستخدم قد يعدّله)
  let suggestedCode = '';
  if (parent) {
    suggestedCode = `${parent.code}1`;
  }
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
  onSubmit: (form: FormState) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(() => initFormFromAccount(account, parent));

  useEffect(() => {
    if (open) setForm(initFormFromAccount(account, parent));
  }, [open, account, parent]);

  const parentLevel = parent ? parent.level : 0;
  const newLevel = mode === 'create' ? parentLevel + 1 : (account?.level ?? 1);
  const reachedMax = mode === 'create' && newLevel > MAX_LEVEL;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reachedMax) return;
    onSubmit(form);
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
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button type="submit" form="account-form" disabled={loading || reachedMax}>
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

        <div>
          <Label className="text-xs">الاسم بالعربية</Label>
          <Input
            value={form.nameAr}
            onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
            placeholder="مثال: ذمم العملاء"
            required
            className="h-9"
          />
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
            {loading ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
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
        هل أنت متأكد من حذف الحساب{' '}
        <span className="font-bold">
          {account?.code} · {account?.nameAr}
        </span>{' '}
        ؟
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        لن يتم الحذف إذا كان للحساب فروع تابعة، أو قيود محاسبية، أو رصيد افتتاحي.
      </p>
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
}: {
  account: AccountDto;
  depth?: number;
  search: string;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAddChild: (parent: AccountDto) => void;
  onEdit: (a: AccountDto) => void;
  onDelete: (a: AccountDto) => void;
}) {
  const open = expanded.has(account.id);
  const hasChildren = account.children?.length > 0;

  const matchesSelf =
    !search || account.code.includes(search) || account.nameAr.includes(search);
  const childMatches = (acc: AccountDto): boolean => {
    if (!search) return true;
    if (acc.code.includes(search) || acc.nameAr.includes(search)) return true;
    return acc.children?.some(childMatches) ?? false;
  };
  const visible = matchesSelf || childMatches(account);
  if (!visible) return null;

  const colorClass = ACCOUNT_TYPE_COLORS[account.type] ?? 'text-muted-foreground';
  const canAddChild = account.level < MAX_LEVEL;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md py-2 pl-2 pr-3 text-sm hover:bg-accent/40',
          'border-r-2 border-transparent',
          depth === 0 && 'border-r-primary/40 bg-secondary/30 font-semibold'
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

        <span className="num-display text-xs text-muted-foreground">{account.code}</span>
        <span className={cn('flex-1', !account.isLeaf && 'font-medium')}>{account.nameAr}</span>

        <span className="hidden text-[10px] text-muted-foreground md:inline">
          L{account.level} · {NATURE_LABELS[account.nature] ?? '—'}
        </span>

        {depth === 0 && (
          <span className={cn('rounded-full bg-card px-2 py-0.5 text-[11px]', colorClass)}>
            {ACCOUNT_TYPE_LABELS[account.type] ?? '—'}
          </span>
        )}
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
          <button
            type="button"
            onClick={() => onDelete(account)}
            className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
            title="حذف"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {hasChildren && open && (
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

  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts-tree'],
    queryFn: () => accountingApi.getTree(),
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
    mutationFn: (payload: CreateAccountPayload) => accountingApi.createAccount(payload),
    onSuccess: res => {
      if (!res.success) {
        setFormError(res.errors?.join(' / ') ?? 'فشل الإنشاء');
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
  };

  const handleEdit = (a: AccountDto) => {
    setFormMode('edit');
    setEditingAccount(a);
    setParentAccount(null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleDelete = (a: AccountDto) => {
    setDeletingAccount(a);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const submitForm = (form: FormState) => {
    if (formMode === 'create') {
      createMut.mutate({
        code: form.code,
        nameAr: form.nameAr,
        nameEn: form.nameEn || null,
        type: form.type,
        nature: form.nature,
        parentId: parentAccount?.id ?? null,
        isLeaf: form.isLeaf,
        description: form.description || null,
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
    if (!data) return { total: 0 };
    let total = 0;
    const walk = (a: AccountDto) => {
      total++;
      a.children?.forEach(walk);
    };
    data.forEach(walk);
    return { total };
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
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>شجرة الحسابات</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.total} حساب · {data.length} مجموعة رئيسية · حد المستويات {MAX_LEVEL}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
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
              >
                <ListCollapse className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={expandAll}
                title="توسيع كل المستويات"
              >
                <ListTree className="h-4 w-4" />
              </Button>
              <Button onClick={handleAddRoot} size="sm">
                <Plus className="h-4 w-4" />
                حساب جذر جديد
              </Button>
            </div>
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
