import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Palette, List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ColorSwatch } from '@/components/inventory/ColorSwatch';
import { StandardColorPickerDialog } from '@/components/inventory/StandardColorPickerDialog';
import { inventoryApi, type ItemColorManageDto, type UpsertColorPayload } from '@/lib/api/inventory';
import { extractApiError } from '@/lib/utils';
import { generateColorCode } from '@/lib/unitCode';
import { getAvailableStandardColors, type StandardColor } from '@/lib/inventory/standardColors';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { useInventorySoftDelete } from '@/components/inventory/useInventorySoftDelete';

const EMPTY: UpsertColorPayload = { code: '', nameAr: '', nameEn: '', hexCode: null, isActive: true };

export function ItemColorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionHiddenKeys, setSessionHiddenKeys] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ItemColorManageDto | null>(null);
  const [form, setForm] = useState<UpsertColorPayload>(EMPTY);

  const autoCode = useMemo(
    () => generateColorCode(form.nameEn ?? '', form.nameAr),
    [form.nameEn, form.nameAr],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['item-colors-manage'],
    queryFn: () => inventoryApi.listColorsManage(),
  });

  const availableStandard = useMemo(
    () => getAvailableStandardColors(rows, sessionHiddenKeys),
    [rows, sessionHiddenKeys],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: UpsertColorPayload = {
        ...form,
        code: editing ? form.code : '',
      };
      if (editing) await inventoryApi.updateColorManage(editing.id, payload);
      else await inventoryApi.createColorManage(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث اللون' : 'تم إضافة اللون');
      qc.invalidateQueries({ queryKey: ['item-colors-manage'] });
      qc.invalidateQueries({ queryKey: ['item-colors'] });
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
    deleteFn: id => inventoryApi.deleteColorManage(id),
    invalidateKeys: [['item-colors-manage'], ['item-colors']],
    note: 'لا يمكن حذف لون مرتبط بمواد.',
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setSessionHiddenKeys(new Set());
    setOpen(true);
  }

  function openEdit(row: ItemColorManageDto) {
    setEditing(row);
    setForm({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? '',
      hexCode: row.hexCode ?? null,
      isActive: row.isActive,
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setPickerOpen(false);
    setEditing(null);
    setSessionHiddenKeys(new Set());
    setForm(EMPTY);
  }

  function updateName(field: 'nameAr' | 'nameEn', value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (!editing) next.code = generateColorCode(next.nameEn ?? '', next.nameAr);
      return next;
    });
  }

  function pickStandard(std: StandardColor) {
    setForm(f => ({
      ...f,
      nameAr: std.nameAr,
      nameEn: std.nameEn,
      hexCode: std.hex,
      code: generateColorCode(std.nameEn, std.nameAr),
    }));
    setSessionHiddenKeys(prev => new Set(prev).add(std.key));
    setPickerOpen(false);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          الألوان
        </h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />إضافة لون</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10"></th>
                  <th>الرمز</th>
                  <th>الاسم (عربي)</th>
                  <th>الاسم (إنجليزي)</th>
                  <th>الحالة</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد ألوان — أضف الأول</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td><ColorSwatch hex={r.hexCode} size="sm" title={r.nameAr} /></td>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>{r.nameAr}</td>
                    <td className="text-muted-foreground">{r.nameEn ?? '—'}</td>
                    <td>{r.isActive ? <Badge variant="success">نشط</Badge> : <Badge variant="muted">موقوف</Badge>}</td>
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
              <CardTitle className="text-base">{editing ? 'تعديل اللون' : 'لون جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!editing && (
                <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
                  <List className="h-4 w-4" />
                  اختر من قائمة الألوان ({availableStandard.length})
                </Button>
              )}

              {form.hexCode && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30">
                  <ColorSwatch hex={form.hexCode} size="lg" />
                  <span className="text-sm text-muted-foreground">معاينة اللون</span>
                </div>
              )}

              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => updateName('nameAr', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" placeholder="Red, Blue, White..."
                  value={form.nameEn ?? ''} onChange={e => updateName('nameEn', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">يُفضّل الإنجليزي لتوليد رمز واضح (مثل RED, BLUE)</p>
              </div>
              <div className="space-y-1">
                <Label>رمز اللون</Label>
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
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                نشط
              </label>
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

      <StandardColorPickerDialog
        open={pickerOpen}
        title="اختر لوناً من القائمة"
        colors={availableStandard}
        onClose={() => setPickerOpen(false)}
        onSelect={pickStandard}
      />

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
