import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { inventoryApi, type UnitOfMeasureManageDto, type UpsertUnitPayload } from '@/lib/api/inventory';
import { extractApiError } from '@/lib/utils';
import { generateUnitCode } from '@/lib/unitCode';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { useInventorySoftDelete } from '@/components/inventory/useInventorySoftDelete';

const EMPTY: UpsertUnitPayload = { code: '', nameAr: '', nameEn: '', isActive: true, isDefault: false };

export function UnitsOfMeasurePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UnitOfMeasureManageDto | null>(null);
  const [form, setForm] = useState<UpsertUnitPayload>(EMPTY);

  const autoCode = useMemo(
    () => generateUnitCode(form.nameEn ?? '', form.nameAr),
    [form.nameEn, form.nameAr],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['units-of-measure-manage'],
    queryFn: () => inventoryApi.listUnitsManage(),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: UpsertUnitPayload = {
        ...form,
        code: editing ? form.code : '',
      };
      if (editing) await inventoryApi.updateUnitManage(editing.id, payload);
      else await inventoryApi.createUnitManage(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث الوحدة' : 'تم إضافة الوحدة');
      qc.invalidateQueries({ queryKey: ['units-of-measure-manage'] });
      qc.invalidateQueries({ queryKey: ['item-units'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
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
    deleteFn: id => inventoryApi.deleteUnitManage(id),
    invalidateKeys: [['units-of-measure-manage'], ['item-units']],
    note: 'لا يمكن حذف وحدة مرتبطة بمواد أو حركات مخزون.',
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(row: UnitOfMeasureManageDto) {
    setEditing(row);
    setForm({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? '',
      isActive: row.isActive,
      isDefault: row.isDefault,
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function updateName(field: 'nameAr' | 'nameEn', value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (!editing) next.code = generateUnitCode(next.nameEn ?? '', next.nameAr);
      return next;
    });
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" />
          وحدات القياس
        </h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />إضافة وحدة</Button>
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
                  <th>الحالة</th>
                  <th>افتراضية</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد وحدات — أضف الأولى</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>{r.nameAr}</td>
                    <td className="text-muted-foreground">{r.nameEn ?? '—'}</td>
                    <td>{r.isActive ? <Badge variant="success">نشط</Badge> : <Badge variant="muted">موقوف</Badge>}</td>
                    <td>{r.isDefault ? <Badge variant="outline">افتراضية</Badge> : '—'}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {canDelete && (
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
              <CardTitle className="text-base">{editing ? 'تعديل الوحدة' : 'وحدة جديدة'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => updateName('nameAr', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" placeholder="Piece, Bale, Box..."
                  value={form.nameEn ?? ''} onChange={e => updateName('nameEn', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">يُفضّل الإنجليزي لتوليد رمز واضح (مثل PIECE, BALE)</p>
              </div>
              <div className="space-y-1">
                <Label>رمز الوحدة</Label>
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
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  نشط
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isDefault ?? false} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  افتراضية
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                الوحدة الافتراضية تُختار تلقائياً عند إنشاء مادة جديدة (قابلة للتغيير)
              </p>
              <Button className="w-full" disabled={saveMut.isPending} onClick={() => {
                if (!form.nameAr.trim()) { toast.error('الاسم العربي مطلوب'); return; }
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
