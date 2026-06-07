import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { geographyApi, type CountryDto, type UpsertCountryPayload } from '@/lib/api/geography';
import { extractApiError } from '@/lib/utils';

const EMPTY: UpsertCountryPayload = { code: '', nameAr: '', nameEn: '', isActive: true };

export function CountriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CountryDto | null>(null);
  const [form, setForm] = useState<UpsertCountryPayload>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['system-countries'],
    queryFn: () => geographyApi.listCountries(),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing) await geographyApi.updateCountry(editing.id, form);
      else await geographyApi.createCountry(form);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث البلد' : 'تم إضافة البلد');
      qc.invalidateQueries({ queryKey: ['system-countries'] });
      qc.invalidateQueries({ queryKey: ['item-countries'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => geographyApi.deleteCountry(id),
    onSuccess: () => {
      toast.success('تم حذف البلد');
      qc.invalidateQueries({ queryKey: ['system-countries'] });
      qc.invalidateQueries({ queryKey: ['item-countries'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحذف'),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(row: CountryDto) {
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
          <Globe className="h-5 w-5 text-primary" />
          البلدان
        </h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />إضافة بلد</Button>
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
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد بلدان</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>{r.nameAr}{r.nameEn ? <span className="text-muted-foreground text-xs ms-2">{r.nameEn}</span> : null}</td>
                    <td>{r.isActive ? <Badge variant="success">نشط</Badge> : <Badge variant="muted">موقوف</Badge>}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
              <CardTitle className="text-base">{editing ? 'تعديل البلد' : 'بلد جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>الرمز (ISO — مثل IQ)</Label>
                <Input dir="ltr" className="font-mono uppercase" maxLength={10}
                  value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
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
    </div>
  );
}
