import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Shield, Plus, Pencil, Trash2, X, Save, ShieldCheck, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PermissionTreeEditor } from '@/components/settings/PermissionTreeEditor';
import { rolesApi } from '@/lib/api/roles';
import { permissionsApi } from '@/lib/api/permissions';
import { extractApiError, cn } from '@/lib/utils';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type { RoleListItemDto, RoleUpsertPayload } from '@/types/api';

export function RolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [editing, setEditing] = useState<RoleListItemDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ['roles', 'list'],
    queryFn: rolesApi.list,
  });

  const removeM = useMutation({
    mutationFn: (id: number) => rolesApi.remove(id),
    onSuccess: () => {
      toast.success(t('common.success'));
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const close = () => {
    setEditing(null);
    setCreatingNew(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('roles.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('roles.subtitle')}
          </p>
        </div>
        {can(PERMS.System.Roles.Create) && (
          <Button onClick={() => setCreatingNew(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('roles.newRole')}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <CardTitle>{t('roles.listTitle')}</CardTitle>
          <span className="ms-auto text-xs text-muted-foreground">
            {rolesQuery.data?.length ?? 0}
          </span>
        </CardHeader>
        <CardContent>
          {rolesQuery.isLoading ? (
            <LoadingSpinner />
          ) : (rolesQuery.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-right text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('roles.cols.name')}</th>
                    <th className="px-3 py-2 font-medium">{t('roles.cols.code')}</th>
                    <th className="px-3 py-2 font-medium">{t('roles.cols.type')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('roles.cols.permissions')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('roles.cols.users')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('roles.cols.status')}</th>
                    <th className="px-3 py-2 font-medium text-left">{t('roles.cols.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rolesQuery.data?.map(r => (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-secondary/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {r.isSuperAdmin ? (
                            <ShieldCheck className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Shield className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">{r.nameAr}</span>
                        </div>
                        {r.description && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                      <td className="px-3 py-2.5">
                        {r.isSystemRole ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                            <Lock className="h-3 w-3" />
                            {t('common.system', { defaultValue: 'System' })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('roles.typeCustom')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.isSuperAdmin ? (
                          <span className="text-xs text-amber-500">{t('roles.typeAll')}</span>
                        ) : (
                          <span className="text-sm">{r.permissionCount}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm">{r.userCount}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            'inline-block rounded px-2 py-0.5 text-xs',
                            r.isActive
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-muted/40 text-muted-foreground'
                          )}
                        >
                          {r.isActive ? 'فعّال' : 'موقوف'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <div className="inline-flex gap-1">
                          {can(PERMS.System.Roles.Update) && (
                            <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can(PERMS.System.Roles.Delete) && !r.isSystemRole && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`حذف الدور "${r.nameAr}"؟`)) removeM.mutate(r.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(creatingNew || editing) && (
        <RoleEditorDialog
          mode={editing ? 'edit' : 'create'}
          existing={editing}
          onClose={close}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            close();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  Dialog: إنشاء / تعديل دور
// ────────────────────────────────────────────────────────────
interface DialogProps {
  mode: 'create' | 'edit';
  existing: RoleListItemDto | null;
  onClose: () => void;
  onSaved: () => void;
}

function RoleEditorDialog({ mode, existing, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState(existing?.code ?? '');
  const [nameAr, setNameAr] = useState(existing?.nameAr ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const isSuperAdmin = existing?.isSuperAdmin ?? false;
  const isSystem = existing?.isSystemRole ?? false;

  const treeQuery = useQuery({
    queryKey: ['permissions', 'tree'],
    queryFn: permissionsApi.tree,
    staleTime: 5 * 60_000,
  });

  // تحميل صلاحيات الدور الحالي عند فتح dialog التعديل
  const detailQuery = useQuery({
    queryKey: ['roles', 'detail', existing?.id],
    queryFn: () => rolesApi.get(existing!.id),
    enabled: mode === 'edit' && !!existing,
  });

  useEffect(() => {
    if (detailQuery.data) setSelectedPerms(new Set(detailQuery.data.permissions));
  }, [detailQuery.data]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload: RoleUpsertPayload = {
        code: code.trim(),
        nameAr: nameAr.trim(),
        description: description?.trim() || null,
        isActive,
        permissions: Array.from(selectedPerms),
      };
      if (mode === 'create') return rolesApi.create(payload);
      return rolesApi.update(existing!.id, payload);
    },
    onSuccess: res => {
      if (res.success) {
        toast.success(t('common.success'));
        onSaved();
      } else {
        toast.error(res.errors?.join('، ') ?? t('common.error'));
      }
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const canSave = useMemo(() => nameAr.trim().length > 0 && (mode === 'edit' || code.trim().length > 0), [code, nameAr, mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-[min(960px,95vw)] flex-col rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="font-medium">{mode === 'create' ? t('roles.newRole') : `${t('common.edit')}: ${existing?.nameAr}`}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* الحقول الأساسية */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <Label>{t('roles.form.code')}</Label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value)}
                disabled={isSystem}
                placeholder="Accountant"
                className="mt-1"
              />
              {isSystem && (
                <p className="mt-1 text-[11px] text-muted-foreground">{t('roles.form.codeLocked')}</p>
              )}
            </div>
            <div className="md:col-span-5">
              <Label>{t('roles.form.nameAr')}</Label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                placeholder={t('roles.form.nameArPlaceholder')}
                className="mt-1"
              />
            </div>
            <div className="flex items-end md:col-span-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>{t('roles.form.active')}</span>
              </label>
            </div>
            <div className="md:col-span-12">
              <Label>{t('roles.form.description')}</Label>
              <Input
                value={description ?? ''}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('roles.form.descriptionPlaceholder')}
                className="mt-1"
              />
            </div>
          </div>

          {/* شجرة الصلاحيات */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('roles.permissionsTitle')}</h3>
            </div>
            {isSuperAdmin ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                {t('roles.superAdminNote')}
              </div>
            ) : treeQuery.isLoading || (mode === 'edit' && detailQuery.isLoading) ? (
              <LoadingSpinner />
            ) : (
              <PermissionTreeEditor
                tree={treeQuery.data ?? []}
                selected={selectedPerms}
                onChange={setSelectedPerms}
                hint={t('roles.permissionsHint')}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!canSave || saveM.isPending} onClick={() => saveM.mutate()} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saveM.isPending ? '...' : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
