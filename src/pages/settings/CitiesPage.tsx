import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { geographyApi, type CityDto, type UpsertCityPayload } from '@/lib/api/geography';
import { extractApiError } from '@/lib/utils';

const EMPTY: UpsertCityPayload = { countryId: 0, nameAr: '', nameEn: '', isActive: true };

export function CitiesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filterCountryId, setFilterCountryId] = useState<number | ''>('');
  const [editing, setEditing] = useState<CityDto | null>(null);
  const [form, setForm] = useState<UpsertCityPayload>(EMPTY);

  const { data: countries = [] } = useQuery({
    queryKey: ['system-countries'],
    queryFn: () => geographyApi.listCountries(),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['system-cities', filterCountryId],
    queryFn: () => geographyApi.listCities(filterCountryId === '' ? undefined : filterCountryId),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing) await geographyApi.updateCity(editing.id, form);
      else await geographyApi.createCity(form);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث المدينة' : 'تم إضافة المدينة');
      qc.invalidateQueries({ queryKey: ['system-cities'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => geographyApi.deleteCity(id),
    onSuccess: () => {
      toast.success('تم حذف المدينة');
      qc.invalidateQueries({ queryKey: ['system-cities'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحذف'),
  });

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY,
      countryId: filterCountryId !== '' ? filterCountryId : (countries[0]?.id ?? 0),
    });
    setOpen(true);
  }

  function openEdit(row: CityDto) {
    setEditing(row);
    setForm({ countryId: row.countryId, nameAr: row.nameAr, nameEn: row.nameEn ?? '', isActive: row.isActive });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          المدن
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border bg-background px-3 py-2 text-sm"
            value={filterCountryId} onChange={e => setFilterCountryId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">كل البلدان</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </select>
          <Button onClick={openCreate} disabled={countries.length === 0}>
            <Plus className="h-4 w-4" />إضافة مدينة
          </Button>
        </div>
      </div>

      {countries.length === 0 && (
        <p className="text-sm text-muted-foreground">أضف بلداً أولاً من صفحة البلدان.</p>
      )}

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>البلد</th>
                  <th>المدينة</th>
                  <th>الحالة</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد مدن</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-muted-foreground text-sm">{r.countryName}</td>
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
              <CardTitle className="text-base">{editing ? 'تعديل المدينة' : 'مدينة جديدة'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>البلد *</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.countryId || ''} onChange={e => setForm(f => ({ ...f, countryId: Number(e.target.value) }))}>
                  <option value="">— اختر —</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
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
                if (!form.countryId) { toast.error('اختر البلد'); return; }
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
