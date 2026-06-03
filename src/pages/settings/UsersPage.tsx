import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users, Plus, Pencil, Trash2, X, Save, Search, Shield, Wallet, KeySquare,
  Info, ShieldCheck, Eye, EyeOff, RefreshCw, Upload,
} from 'lucide-react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PermissionTreeEditor } from '@/components/settings/PermissionTreeEditor';
import { usersApi } from '@/lib/api/users';
import { rolesApi } from '@/lib/api/roles';
import { permissionsApi } from '@/lib/api/permissions';
import { cashBoxesApi, type CashBoxDto } from '@/lib/api/cashBoxes';
import { cn, extractApiError } from '@/lib/utils';
import { generateRandomPassword } from '@/lib/auth/password';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type {
  RoleListItemDto,
  UserDetailDto,
  UserListItemDto,
} from '@/types/api';

type Tab = 'basic' | 'roles' | 'permissions' | 'cashboxes';

const MAX_AVATAR_BYTES = 512 * 1024;

export function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserListItemDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users', 'list', search],
    queryFn: () => usersApi.list(search || undefined),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      toast.success(t('common.success'));
      qc.invalidateQueries({ queryKey: ['users'] });
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
          <h1 className="font-display text-2xl font-semibold">{t('users.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.sections.users.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can(PERMS.System.Roles.Read) && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link to="/settings/roles">
                <Shield className="h-4 w-4" />
                {t('settings.sections.roles.title')}
              </Link>
            </Button>
          )}
          {can(PERMS.System.Users.Create) && (
            <Button onClick={() => setCreatingNew(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t('common.new')} {t('users.title')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <CardTitle>{t('users.listTitle')}</CardTitle>
          <div className="ms-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="h-8 w-56 pr-7 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {usersQuery.data?.length ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <LoadingSpinner />
          ) : (usersQuery.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('users.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-right text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('users.cols.name')}</th>
                    <th className="px-3 py-2 font-medium">{t('users.cols.username')}</th>
                    <th className="px-3 py-2 font-medium">{t('users.cols.roles')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('users.cols.cashboxes')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('users.cols.status')}</th>
                    <th className="px-3 py-2 font-medium text-left">{t('users.cols.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data?.map(u => (
                    <tr key={u.id} className="border-b border-border/30 hover:bg-secondary/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={u.fullName} size="sm" />
                          <span className="font-medium">{u.fullName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{u.phone}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            u.roles.map(r => (
                              <span
                                key={r}
                                className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                              >
                                {r}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm">{u.cashBoxCount}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={cn(
                              'inline-block rounded px-2 py-0.5 text-xs',
                              u.isActive
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-muted/40 text-muted-foreground'
                            )}
                          >
                            {u.isActive ? t('users.statusActive', { defaultValue: 'فعّال' }) : t('users.statusInactive', { defaultValue: 'موقوف' })}
                          </span>
                          {u.mustChangePassword && (
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                              {t('users.mustChangeBadge', { defaultValue: 'يلزم تغيير كلمة المرور' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <div className="inline-flex gap-1">
                          {can(PERMS.System.Users.Update) && (
                            <Button size="icon" variant="ghost" onClick={() => setEditing(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can(PERMS.System.Users.Delete) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`حذف المستخدم "${u.fullName}"؟`)) removeM.mutate(u.id);
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
        <UserEditorDialog
          mode={editing ? 'edit' : 'create'}
          existing={editing}
          onClose={close}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['users'] });
            close();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  Dialog: إنشاء / تعديل مستخدم
// ────────────────────────────────────────────────────────────
interface DialogProps {
  mode: 'create' | 'edit';
  existing: UserListItemDto | null;
  onClose: () => void;
  onSaved: () => void;
}

function UserEditorDialog({ mode, existing, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('basic');
  const [showPassword, setShowPassword] = useState(false);

  // الحقول الأساسية
  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(mode === 'create');
  const [passwordGenerated, setPasswordGenerated] = useState(false);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // الأدوار + الـ overrides + الصناديق (تُحمَّل من الـ detail)
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [grantedOverrides, setGrantedOverrides] = useState<Set<string>>(new Set());
  const [deniedOverrides, setDeniedOverrides] = useState<Set<string>>(new Set());
  const [userCashBoxes, setUserCashBoxes] = useState<Map<number, { canReceive: boolean; canPay: boolean }>>(new Map());

  const rolesQuery = useQuery({ queryKey: ['roles', 'list'], queryFn: rolesApi.list });
  const treeQuery  = useQuery({ queryKey: ['permissions', 'tree'], queryFn: permissionsApi.tree, staleTime: 5 * 60_000 });
  const cashBoxesQuery = useQuery({ queryKey: ['cash-boxes', 'active'], queryFn: () => cashBoxesApi.getAll(true) });
  const detailQuery = useQuery({
    queryKey: ['users', 'detail', existing?.id],
    queryFn: () => usersApi.get(existing!.id),
    enabled: mode === 'edit' && !!existing,
  });

  const activeCashBoxIds = useMemo(
    () => new Set((cashBoxesQuery.data ?? []).map(c => c.id)),
    [cashBoxesQuery.data],
  );

  useEffect(() => {
    if (!detailQuery.data) return;
    const d = detailQuery.data as UserDetailDto;
    setRoleIds(d.roleIds);
    setGrantedOverrides(new Set(d.overrides.filter(o => o.isGranted).map(o => o.permissionCode)));
    setDeniedOverrides(new Set(d.overrides.filter(o => !o.isGranted).map(o => o.permissionCode)));
    const m = new Map<number, { canReceive: boolean; canPay: boolean }>();
    for (const c of d.cashBoxes) {
      if (activeCashBoxIds.size === 0 || activeCashBoxIds.has(c.cashBoxId)) {
        m.set(c.cashBoxId, { canReceive: c.canReceive, canPay: c.canPay });
      }
    }
    setUserCashBoxes(m);
    setAvatarBase64(d.avatarBase64 ?? null);
  }, [detailQuery.data, activeCashBoxIds]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error(t('users.avatarNotImage', { defaultValue: 'اختر ملف صورة فقط' }));
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      toast.error(t('users.avatarTooLarge', { defaultValue: 'حجم الصورة كبير — الحد 512 ك.ب' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarBase64(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(f);
  };

  const handleGeneratePassword = () => {
    const generated = generateRandomPassword(12);
    setPassword(generated);
    setMustChangePassword(true);
    setShowPassword(false);
    setPasswordGenerated(true);
    toast.success(t('users.passwordGeneratedHidden', { defaultValue: 'تم توليد كلمة مرور — لن تُعرض في الشاشة. احفظ ثم أبلغ المستخدم.' }));
  };

  // ── حفظ
  const saveM = useMutation({
    mutationFn: async () => {
      // 1) أنشئ/حدِّث الحساب
      let userId = existing?.id ?? '';
      if (mode === 'create') {
        const res = await usersApi.create({
          fullName: fullName.trim(),
          phone: phone.trim(),
          password,
          isActive,
          roleIds,
          mustChangePassword,
          avatarBase64,
        });
        if (!res.success || !res.data) throw new Error(res.errors?.[0] ?? 'فشل إنشاء المستخدم');
        userId = res.data.id;
      } else {
        const upd = await usersApi.update(existing!.id, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          password: password || undefined,
          isActive,
          mustChangePassword: password ? mustChangePassword : undefined,
          avatarBase64,
        });
        if (!upd.success) throw new Error(upd.errors?.[0] ?? 'فشل تعديل المستخدم');

        // الأدوار (في وضع التعديل فقط — في الإنشاء أُرسلت ضمن create)
        const rr = await usersApi.setRoles(userId, roleIds);
        if (!rr.success) throw new Error(rr.errors?.[0] ?? 'فشل تعديل الأدوار');
      }

      // 2) الـ overrides
      const overrides = [
        ...Array.from(grantedOverrides).map(c => ({ permissionCode: c, isGranted: true })),
        ...Array.from(deniedOverrides).map(c => ({ permissionCode: c, isGranted: false })),
      ];
      const ro = await usersApi.setOverrides(userId, overrides);
      if (!ro.success) throw new Error(ro.errors?.[0] ?? 'فشل تعديل الاستثناءات');

      // 3) الصناديق — نرسل فقط المعرّفات النشطة (تتجاهل الربط القديم بصناديق محذوفة)
      const boxes = Array.from(userCashBoxes.entries())
        .filter(([cashBoxId]) => activeCashBoxIds.has(cashBoxId))
        .map(([cashBoxId, v]) => ({
          cashBoxId, canReceive: v.canReceive, canPay: v.canPay,
        }));
      const rb = await usersApi.setCashBoxes(userId, boxes);
      if (!rb.success) throw new Error(rb.errors?.[0] ?? 'فشل تعديل الصناديق');

      return userId;
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'تم إنشاء المستخدم' : 'تم تحديث المستخدم');
      onSaved();
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const canSave =
    fullName.trim().length >= 2 &&
    phone.trim().length >= 3 &&
    (mode === 'edit' || password.length >= 4) &&
    (mode === 'create' || (detailQuery.isSuccess && cashBoxesQuery.isSuccess));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-[min(1080px,96vw)] flex-col rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-medium">
              {mode === 'create' ? 'مستخدم جديد' : `تعديل: ${existing?.fullName}`}
            </h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* التبويبات */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-2">
          <TabButton active={tab === 'basic'}       onClick={() => setTab('basic')}       icon={<Info className="h-3.5 w-3.5" />} label={t('users.tabs.basic')} />
          <TabButton active={tab === 'roles'}       onClick={() => setTab('roles')}       icon={<Shield className="h-3.5 w-3.5" />} label={t('users.tabs.roles')} />
          <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')} icon={<KeySquare className="h-3.5 w-3.5" />} label={t('users.tabs.permissions')} />
          <TabButton active={tab === 'cashboxes'}   onClick={() => setTab('cashboxes')}   icon={<Wallet className="h-3.5 w-3.5" />} label={t('users.tabs.cashboxes')} />
          {mode === 'edit' && detailQuery.data?.isSuperAdmin && (
            <span className="ms-auto inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              SuperAdmin — يتجاوز كل الفحوصات
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'basic' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-3">
                <Label>{t('users.avatar', { defaultValue: 'صورة المستخدم' })}</Label>
                <div className="mt-1 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 p-3">
                  <UserAvatar name={fullName || '?'} src={avatarBase64} size="lg" />
                  <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => avatarFileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                    {avatarBase64 ? t('users.avatarChange', { defaultValue: 'تغيير' }) : t('users.avatarUpload', { defaultValue: 'رفع صورة' })}
                  </Button>
                  {avatarBase64 && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setAvatarBase64('')}>
                      {t('users.avatarRemove', { defaultValue: 'حذف الصورة' })}
                    </Button>
                  )}
                  <p className="text-center text-[10px] text-muted-foreground">{t('users.avatarHint', { defaultValue: 'PNG/JPG — حتى 512 ك.ب' })}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:col-span-9 md:grid-cols-2">
              <div className="md:col-span-1">
                <Label>{t('users.form.fullName')}</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1" />
              </div>
              <div className="md:col-span-1">
                <Label>{t('users.form.username')}</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="mt-1"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  placeholder={t('users.form.usernamePlaceholder')}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  هذا ما سيكتبه المستخدم في شاشة الدخول. يقبل اسم لاتيني أو رقم هاتف.
                </p>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>{mode === 'create' ? t('users.form.password', { defaultValue: 'كلمة المرور *' }) : t('users.form.newPassword', { defaultValue: 'كلمة مرور جديدة (اختياري)' })}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword && !passwordGenerated ? 'text' : 'password'}
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        setPasswordGenerated(false);
                      }}
                      placeholder={mode === 'edit' ? t('users.form.passwordKeep', { defaultValue: 'اتركها فارغة لعدم التغيير' }) : '••••••••'}
                      className={cn('font-mono text-sm', !passwordGenerated && 'pl-9')}
                      dir="ltr"
                    />
                    {!passwordGenerated && (
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  <Button type="button" variant="outline" className="gap-1.5 shrink-0" onClick={handleGeneratePassword}>
                    <RefreshCw className="h-4 w-4" />
                    {t('users.generatePassword', { defaultValue: 'توليد' })}
                  </Button>
                </div>
                {passwordGenerated && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('users.passwordGeneratedHint', { defaultValue: 'كلمة مرور عشوائية جاهزة — لن تُعرض هنا. اضغط حفظ ثم أبلغ المستخدم خارج النظام.' })}
                  </p>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mustChangePassword}
                    onChange={e => setMustChangePassword(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{t('users.mustChangeOnLogin', { defaultValue: 'يلزم تغيير كلمة المرور عند أول دخول' })}</span>
                </label>
              </div>
              <div className="flex items-end md:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{t('users.accountActive')}</span>
                </label>
              </div>
              </div>
            </div>
          )}

          {tab === 'roles' && (
            <RolesPicker roles={rolesQuery.data ?? []} selected={roleIds} onChange={setRoleIds} />
          )}

          {tab === 'permissions' && (
            <OverridesPanel
              treeReady={!!treeQuery.data}
              tree={treeQuery.data ?? []}
              granted={grantedOverrides}
              denied={deniedOverrides}
              setGranted={setGrantedOverrides}
              setDenied={setDeniedOverrides}
              isSuperAdmin={!!detailQuery.data?.isSuperAdmin}
              effective={detailQuery.data?.effectivePermissions ?? []}
            />
          )}

          {tab === 'cashboxes' && (
            <CashBoxesPicker
              all={cashBoxesQuery.data ?? []}
              selected={userCashBoxes}
              onChange={setUserCashBoxes}
            />
          )}
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

function TabButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── أدوار
function RolesPicker({
  roles, selected, onChange,
}: { roles: RoleListItemDto[]; selected: number[]; onChange: (next: number[]) => void }) {
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        يحصل المستخدم على جميع صلاحيات الأدوار المختارة (إذا اختار دور SuperAdmin فإنه يحصل على كل صلاحيات النظام).
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {roles.filter(r => r.isActive).map(r => {
          const checked = selected.includes(r.id);
          return (
            <label
              key={r.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card/30 p-3 transition',
                checked && 'border-primary/60 bg-primary/5'
              )}
            >
              <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={() => toggle(r.id)} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {r.isSuperAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{r.nameAr}</span>
                  <span className="ms-auto font-mono text-[10px] text-muted-foreground">{r.code}</span>
                </div>
                {r.description && <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── استثناءات الصلاحيات (Grant / Deny فوق ما يمنحه الدور)
interface OverridesPanelProps {
  treeReady: boolean;
  tree: import('@/types/api').ModuleNode[];
  granted: Set<string>;
  denied: Set<string>;
  setGranted: (s: Set<string>) => void;
  setDenied: (s: Set<string>) => void;
  isSuperAdmin: boolean;
  effective: string[];
}

function OverridesPanel({
  treeReady, tree, granted, denied, setGranted, setDenied, isSuperAdmin, effective,
}: OverridesPanelProps) {
  if (isSuperAdmin) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
        SuperAdmin — كل الصلاحيات ممنوحة تلقائياً، الاستثناءات غير قابلة للتعديل.
      </div>
    );
  }
  if (!treeReady) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        استخدم هذه الاستثناءات لمنح صلاحية لم يعطها الدور، أو لمنع صلاحية أعطاها الدور — دون تعديل الدور نفسه.
      </p>

      <details open className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-emerald-400">
          صلاحيات مُضافة (Grant) — {granted.size}
        </summary>
        <div className="mt-2">
          <PermissionTreeEditor
            tree={tree}
            selected={granted}
            onChange={next => {
              // لا يمكن منح وحجب نفس الصلاحية معاً
              const cleaned = new Set(denied);
              next.forEach(c => cleaned.delete(c));
              setDenied(cleaned);
              setGranted(next);
            }}
          />
        </div>
      </details>

      <details className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-rose-400">
          صلاحيات محجوبة (Deny) — {denied.size}
        </summary>
        <div className="mt-2">
          <PermissionTreeEditor
            tree={tree}
            selected={denied}
            onChange={next => {
              const cleaned = new Set(granted);
              next.forEach(c => cleaned.delete(c));
              setGranted(cleaned);
              setDenied(next);
            }}
          />
        </div>
      </details>

      {effective.length > 0 && (
        <details className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            الصلاحيات الفعّالة الحالية — {effective.length}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {effective.map(p => (
              <span key={p} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                {p}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── الصناديق المسموحة
interface CashBoxesPickerProps {
  all: CashBoxDto[];
  selected: Map<number, { canReceive: boolean; canPay: boolean }>;
  onChange: (next: Map<number, { canReceive: boolean; canPay: boolean }>) => void;
}

function CashBoxesPicker({ all, selected, onChange }: CashBoxesPickerProps) {
  const { t } = useTranslation();
  const setEntry = (id: number, patch: Partial<{ canReceive: boolean; canPay: boolean }>) => {
    const next = new Map(selected);
    const cur = next.get(id) ?? { canReceive: true, canPay: true };
    next.set(id, { ...cur, ...patch });
    onChange(next);
  };
  const toggleAssign = (id: number, on: boolean) => {
    const next = new Map(selected);
    if (on) next.set(id, { canReceive: true, canPay: true });
    else next.delete(id);
    onChange(next);
  };

  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('users.cashboxes.empty')}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t('users.cashboxes.hint')}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-3 py-2 font-medium">{t('users.cashboxes.colAssigned')}</th>
              <th className="px-3 py-2 font-medium">{t('common.code')}</th>
              <th className="px-3 py-2 font-medium">{t('common.name')}</th>
              <th className="px-3 py-2 font-medium text-center">{t('users.cashboxes.colReceive')}</th>
              <th className="px-3 py-2 font-medium text-center">{t('users.cashboxes.colPay')}</th>
            </tr>
          </thead>
          <tbody>
            {all.map(b => {
              const assignment = selected.get(b.id);
              const assigned = !!assignment;
              return (
                <tr key={b.id} className="border-t border-border/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={assigned}
                      onChange={e => toggleAssign(b.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                  <td className="px-3 py-2">{b.nameAr}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      disabled={!assigned}
                      checked={assignment?.canReceive ?? false}
                      onChange={e => setEntry(b.id, { canReceive: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      disabled={!assigned}
                      checked={assignment?.canPay ?? false}
                      onChange={e => setEntry(b.id, { canPay: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
