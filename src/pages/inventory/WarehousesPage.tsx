import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Warehouse, ArrowRight, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { useInventorySoftDelete } from '@/components/inventory/useInventorySoftDelete';
import {
  inventoryApi,
  type UpsertWarehousePayload,
  type WarehouseManageDto,
} from '@/lib/api/inventory';
import { branchesApi } from '@/lib/api/branches';
import { extractApiError } from '@/lib/utils';
import { generateWarehouseCode } from '@/lib/unitCode';

const EMPTY: UpsertWarehousePayload = {
  code: '',
  nameAr: '',
  nameEn: '',
  branchId: null,
  isActive: true,
  isDefault: false,
};

export function WarehousesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseManageDto | null>(null);
  const [form, setForm] = useState<UpsertWarehousePayload>(EMPTY);
  const [selectedParentAccountId, setSelectedParentAccountId] = useState<number | null>(null);

  const autoCode = useMemo(
    () => generateWarehouseCode(form.nameEn ?? '', form.nameAr),
    [form.nameEn, form.nameAr],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['warehouses-manage'],
    queryFn: () => inventoryApi.listWarehousesManage(),
  });

  const { data: branchesRes } = useQuery({
    queryKey: ['branches', 'active'],
    queryFn: () => branchesApi.getAll(true),
  });

  const { data: eligibleParents = [] } = useQuery({
    queryKey: ['warehouse-eligible-parents'],
    queryFn: () => inventoryApi.getWarehouseEligibleParentAccounts(),
    enabled: open,
  });

  const branchOptions = branchesRes?.data ?? [];

  const defaultBranchId = useMemo(() => {
    const main = branchOptions.find(b => b.isMain);
    return main?.id ?? branchOptions[0]?.id ?? null;
  }, [branchOptions]);

  useEffect(() => {
    if (!open || form.branchId != null || defaultBranchId == null) return;
    setForm(f => ({ ...f, branchId: defaultBranchId }));
  }, [open, form.branchId, defaultBranchId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: UpsertWarehousePayload = {
        ...form,
        code: editing ? form.code : '',
        branchId: form.branchId ?? null,
        parentAccountId: !editing ? (selectedParentAccountId ?? null) : null,
      };
      if (editing) await inventoryApi.updateWarehouseManage(editing.id, payload);
      else await inventoryApi.createWarehouseManage(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث المستودع' : 'تم إضافة المستودع');
      qc.invalidateQueries({ queryKey: ['warehouses-manage'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  const createAccountMut = useMutation({
    mutationFn: ({ id, parentAccountId }: { id: number; parentAccountId: number }) =>
      inventoryApi.createWarehouseAccount(id, parentAccountId),
    onSuccess: (data) => {
      toast.success(`تم إنشاء الحساب: ${data.accountCode} — ${data.accountNameAr}`);
      qc.invalidateQueries({ queryKey: ['warehouses-manage'] });
      if (editing) setEditing(e => e ? { ...e, accountId: data.accountId, accountCode: data.accountCode, accountNameAr: data.accountNameAr } : e);
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل إنشاء الحساب'),
  });

  const deleteAccountMut = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteWarehouseAccount(id),
    onSuccess: () => {
      toast.success('تم حذف الحساب المرتبط — يمكنك إعادة إنشائه تحت حساب أب آخر');
      qc.invalidateQueries({ queryKey: ['warehouses-manage'] });
      qc.invalidateQueries({ queryKey: ['warehouse-eligible-parents'] });
      setSelectedParentAccountId(null);
      if (editing) setEditing(e => e ? { ...e, accountId: null, accountCode: null, accountNameAr: null } : e);
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل حذف الحساب'),
  });

  const {
    canDelete,
    target: deleteTarget,
    requestDelete,
    closeDelete,
    confirmDelete,
    isDeleting,
    deleteError,
  } = useInventorySoftDelete({
    deleteFn: id => inventoryApi.deleteWarehouseManage(id),
    invalidateKeys: [['warehouses-manage']],
    note: 'لا يمكن حذف المستودع الافتراضي أو مستودع له حركات مخزون.',
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, branchId: defaultBranchId });
    setSelectedParentAccountId(null);
    setOpen(true);
  }

  function openEdit(row: WarehouseManageDto) {
    setEditing(row);
    setForm({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? '',
      branchId: row.branchId ?? defaultBranchId,
      isActive: row.isActive,
      isDefault: row.isDefault,
    });
    setSelectedParentAccountId(null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
    setSelectedParentAccountId(null);
  }

  function updateName(field: 'nameAr' | 'nameEn', value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (!editing) next.code = generateWarehouseCode(next.nameEn ?? '', next.nameAr);
      return next;
    });
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/inventory/constants">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowRight className="h-4 w-4" />
              ثوابت المادة
            </Button>
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            المستودعات
          </h1>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />إضافة مستودع</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>الاسم (عربي)</th>
                  <th>الاسم (إنجليزي)</th>
                  <th>الحساب</th>
                  <th>الفرع</th>
                  <th>الحالة</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد مستودعات — أضف الأول</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>{r.nameAr}{r.isDefault && <Badge variant="outline" className="ms-2 text-[10px]">افتراضي</Badge>}</td>
                    <td className="text-muted-foreground">{r.nameEn ?? '—'}</td>
                    <td>
                      {r.accountCode ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3 text-amber-500" />
                          <span className="font-mono">{r.accountCode}</span>
                          <span>{r.accountNameAr}</span>
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td>{r.branchNameAr ?? '—'}</td>
                    <td>{r.isActive ? <Badge variant="success">مفعّل</Badge> : <Badge variant="muted">موقوف</Badge>}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {canDelete && !r.isDefault && (
                          <Button variant="ghost" size="icon" onClick={() => requestDelete({ id: r.id, label: r.nameAr })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{editing ? 'تعديل المستودع' : 'مستودع جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => updateName('nameAr', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" placeholder="Main Warehouse..."
                  value={form.nameEn ?? ''} onChange={e => updateName('nameEn', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">يُفضّل الإنجليزي لتوليد رمز واضح</p>
              </div>
              <div className="space-y-1">
                <Label>رمز المستودع</Label>
                <Input
                  dir="ltr"
                  readOnly
                  className="font-mono uppercase bg-muted"
                  value={editing ? form.code : (autoCode || '—')}
                  placeholder="يُولَّد تلقائياً"
                />
                <p className="text-[10px] text-muted-foreground">
                  {editing ? 'الرمز ثابت بعد الإنشاء' : 'يُولَّد تلقائياً من الاسم عند الحفظ'}
                </p>
              </div>
              <div className="space-y-1">
                <Label>الفرع *</Label>
                <select
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.branchId ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, branchId: v ? Number(v) : null }));
                  }}
                >
                  {branchOptions.length === 0 ? (
                    <option value="">— لا توجد فروع —</option>
                  ) : (
                    branchOptions.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nameAr}{b.isMain ? ' (الرئيسي)' : ''}{b.code ? ` — ${b.code}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1">
                  <Lock className="h-3 w-3 text-amber-500" />
                  الحساب المحاسبي (المخزون)
                </Label>
                {editing?.accountCode ? (
                  <>
                    <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                      <span className="font-mono text-amber-600 font-medium">{editing.accountCode}</span>
                      <span className="flex-1">{editing.accountNameAr}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                        disabled={deleteAccountMut.isPending}
                        onClick={() => {
                          if (!editing) return;
                          if (window.confirm('حذف الحساب المرتبط بهذا المستودع؟ يُسمح فقط إذا لم يتحرك بقيود. بعدها يمكنك إعادة إنشائه تحت حساب أب آخر.'))
                            deleteAccountMut.mutate(editing.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">يُدار تلقائياً — لا يمكن تعديله من شجرة الحسابات. يمكن حذفه إذا لم يتحرك بقيود.</p>
                  </>
                ) : (
                  <div className="space-y-2 rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{editing ? 'بدون حساب — اختر الحساب الأب ثم أنشئه' : 'سيُنشأ حساب تلقائياً — اختر الحساب الأب'}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      اختر حساباً تحت المخزون (1.3) — الحساب المختار سيتحول تلقائياً إلى أب عند الإنشاء
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={selectedParentAccountId ?? ''}
                        onChange={e => setSelectedParentAccountId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">— اختر الحساب الأب —</option>
                        {eligibleParents.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.isLockedForWarehouse ? '🔒 ' : ''}{p.code} — {p.nameAr}
                          </option>
                        ))}
                      </select>
                      {editing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 whitespace-nowrap"
                          disabled={createAccountMut.isPending || !selectedParentAccountId}
                          onClick={() => {
                            if (editing && selectedParentAccountId)
                              createAccountMut.mutate({ id: editing.id, parentAccountId: selectedParentAccountId });
                          }}
                        >
                          إنشاء الحساب
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  مفعّل
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isDefault ?? false} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  افتراضي
                </label>
              </div>
              <Button className="w-full" disabled={saveMut.isPending || branchOptions.length === 0} onClick={() => {
                if (!form.nameAr.trim()) { toast.error('الاسم العربي مطلوب'); return; }
                if (!form.branchId) { toast.error('الفرع مطلوب'); return; }
                if (!editing && !selectedParentAccountId) { toast.error('اختيار الحساب الأب إلزامي'); return; }
                saveMut.mutate();
              }}>
                <Save className="h-4 w-4" />حفظ
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <SoftDeleteConfirmDialog
        open={!!deleteTarget}
        label={deleteTarget?.label ?? ''}
        note={deleteTarget?.note}
        loading={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </div>
  );
}
