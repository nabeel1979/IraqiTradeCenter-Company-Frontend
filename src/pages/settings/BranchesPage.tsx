import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, Plus, Pencil, Trash2, X, Save, Star, Phone, MapPin, User,
  CheckCircle2, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { branchesApi } from '@/lib/api/branches';
import type { BranchDto, UpsertBranchPayload } from '@/lib/api/branches';
import { extractApiError, cn } from '@/lib/utils';
import { getNextBranchCode } from '@/lib/branches/branchCode';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

const EMPTY_FORM: UpsertBranchPayload = {
  nameAr: '',
  nameEn: '',
  phone: '',
  address: '',
  managerName: '',
  notes: '',
  isMain: false,
  isActive: true,
  displayOrder: 100,
};

export function BranchesPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UpsertBranchPayload>(EMPTY_FORM);

  const branchesQuery = useQuery({
    queryKey: ['branches', 'list'],
    queryFn: () => branchesApi.getAll(),
  });

  const branches = branchesQuery.data?.data ?? [];
  const nextBranchCode = useMemo(
    () => getNextBranchCode(branches.map(b => b.code)),
    [branches],
  );

  const createMut = useMutation({
    mutationFn: (data: UpsertBranchPayload) => branchesApi.create(data),
    onSuccess: res => {
      const code = res.data?.code;
      toast.success(code ? `تم إنشاء الفرع بنجاح — الكود: ${code}` : 'تم إنشاء الفرع بنجاح');
      qc.invalidateQueries({ queryKey: ['branches'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل إنشاء الفرع'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UpsertBranchPayload> }) =>
      branchesApi.update(id, data),
    onSuccess: () => {
      toast.success('تم تحديث الفرع بنجاح');
      qc.invalidateQueries({ queryKey: ['branches'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل تحديث الفرع'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => branchesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف الفرع');
      qc.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل حذف الفرع'),
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }

  function openEdit(b: BranchDto) {
    setEditingId(b.id);
    setForm({
      code: b.code,
      nameAr: b.nameAr,
      nameEn: b.nameEn ?? '',
      phone: b.phone ?? '',
      address: b.address ?? '',
      managerName: b.managerName ?? '',
      notes: b.notes ?? '',
      isMain: b.isMain,
      isActive: b.isActive,
      displayOrder: b.displayOrder,
    });
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nameAr.trim()) { toast.error('الاسم العربي مطلوب'); return; }

    if (editingId) {
      updateMut.mutate({ id: editingId, data: form });
    } else {
      const { code: _code, ...payload } = form;
      createMut.mutate(payload);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  if (branchesQuery.isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 p-6">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">الفروع</h1>
        </div>
        {can(PERMS.Branches.Branches.Create) && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            فرع جديد
          </Button>
        )}
      </div>

      {/* قائمة الفروع */}
      {branches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Building2 className="h-12 w-12 opacity-30" />
            <p className="text-lg">لا توجد فروع مضافة</p>
            {can(PERMS.Branches.Branches.Create) && (
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                أضف فرعاً
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map(branch => (
            <BranchCard
              key={branch.id}
              branch={branch}
              canEdit={can(PERMS.Branches.Branches.Update)}
              canDelete={can(PERMS.Branches.Branches.Delete)}
              onEdit={() => openEdit(branch)}
              onDelete={() => {
                if (confirm(`هل تريد حذف الفرع "${branch.nameAr}"؟`))
                  deleteMut.mutate(branch.id);
              }}
              isDeleting={deleteMut.isPending}
            />
          ))}
        </div>
      )}

      {/* نافذة الإضافة / التعديل */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-xl shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                {editingId ? 'تعديل الفرع' : 'فرع جديد'}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDialog}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <form onSubmit={handleSubmit} noValidate className="space-y-2">
                {editingId ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">كود الفرع</Label>
                      <Input value={form.code ?? ''} disabled readOnly className="h-8 font-mono text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="displayOrder" className="text-xs">ترتيب العرض</Label>
                      <Input
                        id="displayOrder"
                        type="number"
                        className="h-8 text-sm"
                        value={form.displayOrder}
                        onChange={e => setForm(f => ({ ...f, displayOrder: +e.target.value }))}
                        min={1}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_6.5rem] items-end gap-2">
                    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs leading-snug">
                      <span className="text-muted-foreground">كود الفرع: </span>
                      <span className="font-mono font-semibold text-primary">{nextBranchCode}</span>
                      <span className="text-muted-foreground"> (تلقائي)</span>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="displayOrder" className="text-xs">ترتيب العرض</Label>
                      <Input
                        id="displayOrder"
                        type="number"
                        className="h-8 text-sm"
                        value={form.displayOrder}
                        onChange={e => setForm(f => ({ ...f, displayOrder: +e.target.value }))}
                        min={1}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="nameAr" className="text-xs">
                    الاسم بالعربية <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nameAr"
                    className="h-8 text-sm"
                    value={form.nameAr}
                    onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="nameEn" className="text-xs">الاسم بالإنجليزية</Label>
                  <Input
                    id="nameEn"
                    className="h-8 text-sm"
                    value={form.nameEn ?? ''}
                    onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="phone" className="text-xs">رقم الهاتف</Label>
                    <Input
                      id="phone"
                      className="h-8 text-sm"
                      value={form.phone ?? ''}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="managerName" className="text-xs">مدير الفرع</Label>
                    <Input
                      id="managerName"
                      className="h-8 text-sm"
                      value={form.managerName ?? ''}
                      onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="address" className="text-xs">العنوان</Label>
                  <Input
                    id="address"
                    className="h-8 text-sm"
                    value={form.address ?? ''}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-xs">ملاحظات</Label>
                  <Input
                    id="notes"
                    className="h-8 text-sm"
                    value={form.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="flex cursor-pointer select-none items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={form.isActive}
                      onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    />
                    <span className="text-xs">مفعّل</span>
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={closeDialog}>
                      <X className="h-3.5 w-3.5 me-1" />
                      إلغاء
                    </Button>
                    <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                      {isSaving ? (
                        <LoadingSpinner className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      حفظ
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── بطاقة الفرع ─────────────────────────────────────────────────────────────

interface BranchCardProps {
  branch: BranchDto;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function BranchCard({ branch, canEdit, canDelete, onEdit, onDelete, isDeleting }: BranchCardProps) {
  return (
    <Card className={cn(
      'hover:shadow-md transition-shadow',
      branch.isMain && 'border-primary/40 bg-primary/[0.02]',
      !branch.isActive && 'opacity-60',
    )}>
      <CardContent className="p-4 space-y-3">
        {/* رأس البطاقة */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {branch.isMain ? (
              <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold truncate">{branch.nameAr}</p>
              {branch.nameEn && (
                <p className="text-xs text-muted-foreground truncate" dir="ltr">{branch.nameEn}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {branch.isActive ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
        </div>

        {/* كود + معلومات */}
        <div className="text-sm space-y-1 text-muted-foreground">
          <p className="font-mono text-xs bg-muted px-2 py-0.5 rounded inline-block">{branch.code}</p>

          {branch.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              <span>{branch.phone}</span>
            </div>
          )}
          {branch.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{branch.address}</span>
            </div>
          )}
          {branch.managerName && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span>{branch.managerName}</span>
            </div>
          )}
          {branch.currentAccountNameAr && (
            <p className="text-xs">
              الحساب الجاري: <span className="font-medium text-foreground">{branch.currentAccountNameAr}</span>
            </p>
          )}
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex justify-end gap-2 pt-1">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5 h-8 text-xs">
              <Pencil className="h-3.5 w-3.5" />
              تعديل
            </Button>
          )}
          {canDelete && !branch.isMain && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
