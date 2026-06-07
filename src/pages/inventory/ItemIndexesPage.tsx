import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, ListOrdered } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { inventoryApi, type ItemIndexDto, type UpsertIndexPayload } from '@/lib/api/inventory';
import { extractApiError } from '@/lib/utils';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { useInventorySoftDelete } from '@/components/inventory/useInventorySoftDelete';

const EMPTY: UpsertIndexPayload = { code: '', nameAr: '', nameEn: '', isActive: true };

export function ItemIndexesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemIndexDto | null>(null);
  const [form, setForm] = useState<UpsertIndexPayload>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['item-indexes'],
    queryFn: () => inventoryApi.listIndexes(),
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? inventoryApi.updateIndex(editing.id, form)
      : inventoryApi.createIndex(form),
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث الفهرس' : 'تم إضافة الفهرس');
      qc.invalidateQueries({ queryKey: ['item-indexes'] });
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
    deleteFn: id => inventoryApi.deleteIndex(id),
    invalidateKeys: [['item-indexes']],
    note: 'لا يمكن حذف فهرس مرتبط بمواد.',
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(row: ItemIndexDto) {
    setEditing(row);
    setForm({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn ?? '', isActive: row.isActive });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-primary" />
          فهارس المواد
        </h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />إضافة فهرس</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>الاسم</th>
                  <th>الحالة</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد فهارس — أضف الأول</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>{r.nameAr}{r.nameEn ? <span className="text-muted-foreground text-xs ms-2">{r.nameEn}</span> : null}</td>
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
              <CardTitle className="text-base">{editing ? 'تعديل الفهرس' : 'فهرس جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>الرمز (اختياري — يُولَّد من الاسم)</Label>
                <Input dir="ltr" className="font-mono" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" value={form.nameEn ?? ''} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                نشط
              </label>
              <Button className="w-full" disabled={saveMut.isPending} onClick={() => {
                if (!form.nameAr.trim()) { toast.error('الاسم مطلوب'); return; }
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
