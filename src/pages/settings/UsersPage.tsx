import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users, Plus, Pencil, Trash2, X, Save, Search, Shield, Wallet, KeySquare,
  Info, ShieldCheck, RefreshCw, Upload, Mail, Phone, Smartphone, Building2,
} from 'lucide-react';
import { UserCredentialsDialog } from '@/components/settings/UserCredentialsDialog';
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
import { branchesApi, type BranchDto, type UserBranchesDto } from '@/lib/api/branches';
import { cn, extractApiError } from '@/lib/utils';
import { generateRandomPassword } from '@/lib/auth/password';
import { usePermissions } from '@/lib/auth/usePermissions';
import { isParentHost } from '@/lib/platform';
import { PERMS } from '@/lib/auth/permissions';
import type {
  RoleListItemDto,
  UserDetailDto,
  UserListItemDto,
} from '@/types/api';

type Tab = 'basic' | 'roles' | 'permissions' | 'cashboxes' | 'branches';

const MAX_AVATAR_BYTES = 512 * 1024;

type UserFormSnapshot = {
  fullName: string;
  phone: string;
  email: string;
  contactPhone: string;
  mobile: string;
  isActive: boolean;
  avatarBase64: string | null;
  roleIds: number[];
  grantedOverrides: string[];
  deniedOverrides: string[];
  cashBoxes: string;
  assignedBranchIds: number[];
  defaultBranchId: number | null;
};

function snapshotCashBoxes(
  m: Map<number, { canReceive: boolean; canPay: boolean }>,
): string {
  return JSON.stringify(
    Array.from(m.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([id, v]) => ({ id, canReceive: v.canReceive, canPay: v.canPay })),
  );
}

function buildEditSnapshot(
  d: UserDetailDto,
  branches: UserBranchesDto | undefined,
  activeCashBoxIds: Set<number>,
): UserFormSnapshot {
  const cashBoxes = new Map<number, { canReceive: boolean; canPay: boolean }>();
  for (const c of d.cashBoxes) {
    if (activeCashBoxIds.size === 0 || activeCashBoxIds.has(c.cashBoxId)) {
      cashBoxes.set(c.cashBoxId, { canReceive: c.canReceive, canPay: c.canPay });
    }
  }
  return {
    fullName: d.fullName.trim(),
    phone: d.phone.trim(),
    email: (d.email ?? '').trim(),
    contactPhone: (d.contactPhone ?? '').trim(),
    mobile: (d.mobile ?? '').trim(),
    isActive: d.isActive,
    avatarBase64: d.avatarBase64 ?? null,
    roleIds: [...d.roleIds].sort((a, b) => a - b),
    grantedOverrides: d.overrides.filter(o => o.isGranted).map(o => o.permissionCode).sort(),
    deniedOverrides: d.overrides.filter(o => !o.isGranted).map(o => o.permissionCode).sort(),
    cashBoxes: snapshotCashBoxes(cashBoxes),
    assignedBranchIds: (branches?.assigned.map(a => a.branchId) ?? []).sort((a, b) => a - b),
    defaultBranchId: branches?.defaultBranchId ?? null,
  };
}

function buildCurrentSnapshot(
  fullName: string,
  phone: string,
  email: string,
  contactPhone: string,
  mobile: string,
  isActive: boolean,
  avatarBase64: string | null,
  roleIds: number[],
  grantedOverrides: Set<string>,
  deniedOverrides: Set<string>,
  userCashBoxes: Map<number, { canReceive: boolean; canPay: boolean }>,
  assignedBranchIds: Set<number>,
  defaultBranchId: number | null,
): UserFormSnapshot {
  return {
    fullName: fullName.trim(),
    phone: phone.trim(),
    email: email.trim(),
    contactPhone: contactPhone.trim(),
    mobile: mobile.trim(),
    isActive,
    avatarBase64,
    roleIds: [...roleIds].sort((a, b) => a - b),
    grantedOverrides: Array.from(grantedOverrides).sort(),
    deniedOverrides: Array.from(deniedOverrides).sort(),
    cashBoxes: snapshotCashBoxes(userCashBoxes),
    assignedBranchIds: Array.from(assignedBranchIds).sort((a, b) => a - b),
    defaultBranchId,
  };
}

function snapshotsEqual(a: UserFormSnapshot, b: UserFormSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function snapshotsEqualBasic(a: UserFormSnapshot, b: UserFormSnapshot): boolean {
  return a.fullName === b.fullName
    && a.phone === b.phone
    && a.email === b.email
    && a.contactPhone === b.contactPhone
    && a.mobile === b.mobile
    && a.isActive === b.isActive
    && a.avatarBase64 === b.avatarBase64;
}

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
    mutationFn: (u: UserListItemDto) => usersApi.remove(u.id),
    onSuccess: (res) => {
      const contacts = res.data?.removedContacts?.filter(Boolean) ?? [];
      if (contacts.length > 0) {
        toast.success(t('users.deletedWithContacts', { contacts: contacts.join('، ') }));
      } else {
        toast.success(t('common.success'));
      }
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['contact-points'] });
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
                          {can(PERMS.System.Users.Delete) && !u.isSystemAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(t('users.deleteUserConfirm', { name: u.fullName }))) removeM.mutate(u);
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

type CredentialsModal = {
  username: string;
  password: string;
  titleKey: 'users.credentials.passwordChanged' | 'users.credentials.newUser';
  credentialsUrl?: string;
  credentialsUrlCopyPassword?: string;
  /** إغلاق محرر المستخدم بعد «تم» (إنشاء حساب جديد) */
  closeEditorOnDone?: boolean;
};

function UserEditorDialog({ mode, existing, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('basic');
  const createPasswordRef = useRef('');
  const [credentialsModal, setCredentialsModal] = useState<CredentialsModal | null>(null);

  // الحقول الأساسية
  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // الأدوار + الـ overrides + الصناديق (تُحمَّل من الـ detail)
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [grantedOverrides, setGrantedOverrides] = useState<Set<string>>(new Set());
  const [deniedOverrides, setDeniedOverrides] = useState<Set<string>>(new Set());
  const [userCashBoxes, setUserCashBoxes] = useState<Map<number, { canReceive: boolean; canPay: boolean }>>(new Map());
  const [defaultBranchId, setDefaultBranchId] = useState<number | null>(null);
  const [assignedBranchIds, setAssignedBranchIds] = useState<Set<number>>(new Set());
  const [branchSaveAttempted, setBranchSaveAttempted] = useState(false);

  const rolesQuery = useQuery({ queryKey: ['roles', 'list'], queryFn: rolesApi.list });
  const treeQuery  = useQuery({ queryKey: ['permissions', 'tree'], queryFn: permissionsApi.tree, staleTime: 5 * 60_000 });
  const cashBoxesQuery = useQuery({ queryKey: ['cash-boxes', 'active'], queryFn: () => cashBoxesApi.getAll(true) });
  const branchesListQuery = useQuery({ queryKey: ['branches', 'list'], queryFn: () => branchesApi.getAll(), staleTime: 5 * 60_000 });
  const userBranchesQuery = useQuery({
    queryKey: ['user-branches', existing?.id],
    queryFn: () => branchesApi.getUserBranches(existing!.id),
    enabled: mode === 'edit' && !!existing,
    staleTime: 0,
  });
  const detailQuery = useQuery({
    queryKey: ['users', 'detail', existing?.id],
    queryFn: () => usersApi.get(existing!.id),
    enabled: mode === 'edit' && !!existing,
  });

  const isSystemAdmin = !!(detailQuery.data?.isSystemAdmin ?? existing?.isSystemAdmin);

  useEffect(() => {
    if (isSystemAdmin && tab !== 'basic') setTab('basic');
  }, [isSystemAdmin, tab]);

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
    setEmail(d.email ?? '');
    setContactPhone(d.contactPhone ?? '');
    setMobile(d.mobile ?? '');
  }, [detailQuery.data, activeCashBoxIds]);

  useEffect(() => {
    if (!userBranchesQuery.data?.data) return;
    const d = userBranchesQuery.data.data;
    setDefaultBranchId(d.defaultBranchId ?? null);
    setAssignedBranchIds(new Set(d.assigned.map(a => a.branchId)));
  }, [userBranchesQuery.data]);

  const systemBranches = branchesListQuery.data?.data ?? [];
  const hasSystemBranches = !isParentHost() && systemBranches.length > 0;

  useEffect(() => {
    if (mode !== 'create' || !hasSystemBranches || assignedBranchIds.size > 0) return;
    const main = systemBranches.find(b => b.isMain) ?? systemBranches[0];
    if (main) {
      setAssignedBranchIds(new Set([main.id]));
      setDefaultBranchId(main.id);
    }
  }, [mode, hasSystemBranches, systemBranches, assignedBranchIds.size]);

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

  const resetPasswordM = useMutation({
    mutationFn: () => usersApi.resetPassword(existing!.id),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCredentialsModal({
        username: phone.trim(),
        password: data.temporaryPassword,
        titleKey: 'users.credentials.passwordChanged',
        closeEditorOnDone: false,
        credentialsUrl: data.credentialsUrl,
        credentialsUrlCopyPassword: data.credentialsUrlCopyPassword,
      });
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const handleResetPassword = () => {
    if (!window.confirm(t('users.resetPasswordConfirm'))) return;
    resetPasswordM.mutate();
  };

  // ── حفظ
  const saveM = useMutation({
    mutationFn: async () => {
      // 1) أنشئ/حدِّث الحساب
      let userId = existing?.id ?? '';
      if (mode === 'create') {
        const pwd = generateRandomPassword(12);
        createPasswordRef.current = pwd;
        const res = await usersApi.create({
          fullName: fullName.trim(),
          phone: phone.trim(),
          password: pwd,
          isActive,
          roleIds,
          mustChangePassword: true,
          avatarBase64,
          email: email.trim() || null,
          contactPhone: contactPhone.trim() || null,
          mobile: mobile.trim() || null,
        });
        if (!res.success || !res.data) throw new Error(res.errors?.[0] ?? 'فشل إنشاء المستخدم');
        userId = res.data.id;
      } else {
        const upd = await usersApi.update(existing!.id, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          isActive,
          avatarBase64,
          email: email.trim() || null,
          contactPhone: contactPhone.trim() || null,
          mobile: mobile.trim() || null,
        });
        if (!upd.success) throw new Error(upd.errors?.[0] ?? 'فشل تعديل المستخدم');

        if (!isSystemAdmin) {
          const rr = await usersApi.setRoles(userId, roleIds);
          if (!rr.success) throw new Error(rr.errors?.[0] ?? 'فشل تعديل الأدوار');
        }
      }

      if (!isSystemAdmin) {
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

      // 4) الفروع (شركات فقط)
      if (hasSystemBranches) {
        if (assignedBranchIds.size === 0) {
          throw new Error('يجب تعيين فرع واحد على الأقل للمستخدم');
        }
        if (!defaultBranchId || !assignedBranchIds.has(defaultBranchId)) {
          throw new Error('يجب تحديد فرع افتراضي من الفروع المسموحة');
        }
        const ub = await branchesApi.updateUserBranches(userId, {
          defaultBranchId,
          branchIds: Array.from(assignedBranchIds),
        });
        if (!ub.success) throw new Error(ub.errors?.[0] ?? 'فشل تعديل الفروع');
      }
      }

      return userId;
    },
    onSuccess: () => {
      if (mode === 'create' && createPasswordRef.current) {
        setCredentialsModal({
          username: phone.trim(),
          password: createPasswordRef.current,
          titleKey: 'users.credentials.newUser',
          closeEditorOnDone: true,
        });
        createPasswordRef.current = '';
        return;
      }
      toast.success(mode === 'create' ? t('users.credentials.newUser') : t('common.success'));
      onSaved();
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const branchesValid = isSystemAdmin
    || !hasSystemBranches
    || (assignedBranchIds.size >= 1
      && defaultBranchId != null
      && assignedBranchIds.has(defaultBranchId));

  const isFormReady =
    mode === 'create' ||
    (detailQuery.isSuccess &&
      (isSystemAdmin || (
        cashBoxesQuery.isSuccess &&
        (!hasSystemBranches || userBranchesQuery.isSuccess)
      )));

  const initialSnapshot = useMemo(() => {
    if (mode !== 'edit' || !detailQuery.data) return null;
    if (!isSystemAdmin && hasSystemBranches && !userBranchesQuery.isSuccess) return null;
    return buildEditSnapshot(
      detailQuery.data as UserDetailDto,
      userBranchesQuery.data?.data,
      activeCashBoxIds,
    );
  }, [mode, detailQuery.data, userBranchesQuery.data, hasSystemBranches, activeCashBoxIds, isSystemAdmin]);

  const currentSnapshot = useMemo(
    () => buildCurrentSnapshot(
      fullName,
      phone,
      email,
      contactPhone,
      mobile,
      isActive,
      avatarBase64,
      roleIds,
      grantedOverrides,
      deniedOverrides,
      userCashBoxes,
      assignedBranchIds,
      defaultBranchId,
    ),
    [
      fullName, phone, email, contactPhone, mobile, isActive, avatarBase64,
      roleIds, grantedOverrides, deniedOverrides, userCashBoxes,
      assignedBranchIds, defaultBranchId,
    ],
  );

  const isDirty =
    mode === 'create' ||
    (initialSnapshot != null && (
      isSystemAdmin
        ? !snapshotsEqualBasic(initialSnapshot, currentSnapshot)
        : !snapshotsEqual(initialSnapshot, currentSnapshot)
    ));

  const canSave =
    isFormReady &&
    fullName.trim().length >= 2 &&
    phone.trim().length >= 3 &&
    (mode === 'create' || isDirty);

  const finishCredentials = () => {
    const closeEditor = credentialsModal?.closeEditorOnDone;
    setCredentialsModal(null);
    if (closeEditor) onSaved();
  };

  return (
    <>
    {credentialsModal && (
      <UserCredentialsDialog
        username={credentialsModal.username}
        password={credentialsModal.password}
        titleKey={credentialsModal.titleKey}
        credentialsUrl={credentialsModal.credentialsUrl}
        credentialsUrlCopyPassword={credentialsModal.credentialsUrlCopyPassword}
        onDone={finishCredentials}
      />
    )}
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
          {!isSystemAdmin && (
            <>
              <TabButton active={tab === 'roles'}       onClick={() => setTab('roles')}       icon={<Shield className="h-3.5 w-3.5" />} label={t('users.tabs.roles')} />
              <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')} icon={<KeySquare className="h-3.5 w-3.5" />} label={t('users.tabs.permissions')} />
              <TabButton active={tab === 'cashboxes'}   onClick={() => setTab('cashboxes')}   icon={<Wallet className="h-3.5 w-3.5" />} label={t('users.tabs.cashboxes')} />
              {!isParentHost() && (branchesListQuery.data?.data?.length ?? 0) > 0 && (
                <TabButton active={tab === 'branches'} onClick={() => setTab('branches')} icon={<Building2 className="h-3.5 w-3.5" />} label="الفروع" />
              )}
            </>
          )}
          {mode === 'edit' && detailQuery.data?.isSuperAdmin && (
            <span className="ms-auto inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              SuperAdmin — يتجاوز كل الفحوصات
            </span>
          )}
          {isSystemAdmin && (
            <span className={cn('inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary', !detailQuery.data?.isSuperAdmin && 'ms-auto')}>
              <ShieldCheck className="h-3.5 w-3.5" />
              المدير الأول — محمي من التعديل والحذف
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
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="mt-1"
                  disabled={isSystemAdmin}
                  readOnly={isSystemAdmin}
                />
                {isSystemAdmin && (
                  <p className="mt-1 text-[11px] text-muted-foreground">اسم المدير الأول للنظام غير قابل للتعديل</p>
                )}
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
                  disabled={isSystemAdmin}
                  readOnly={isSystemAdmin}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isSystemAdmin
                    ? 'اسم الدخول للمدير الأول محمي ولا يمكن تغييره'
                    : t('users.form.usernameHint')}
                </p>
              </div>
              <div className="md:col-span-1">
                <Label className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('users.form.email')}
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1"
                  dir="ltr"
                  placeholder="info@company.iq"
                />
              </div>
              <div className="md:col-span-1">
                <Label className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('users.form.contactPhone')}
                </Label>
                <Input
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  className="mt-1"
                  dir="ltr"
                  placeholder="07701234567"
                />
              </div>
              <div className="md:col-span-1">
                <Label className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('users.form.mobile')}
                </Label>
                <Input
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  className="mt-1"
                  dir="ltr"
                />
              </div>
              <p className="md:col-span-2 text-[11px] text-muted-foreground">
                {t('users.form.contactsRegistryHint')}
              </p>
              {mode === 'create' && (
                <p className="md:col-span-2 text-[11px] text-muted-foreground">
                  {t('users.createPasswordHint')}
                </p>
              )}
              {mode === 'edit' && (
                <div className="md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={resetPasswordM.isPending}
                    onClick={handleResetPassword}
                  >
                    <RefreshCw className={cn('h-4 w-4', resetPasswordM.isPending && 'animate-spin')} />
                    {t('users.resetPassword')}
                  </Button>
                </div>
              )}
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

          {tab === 'roles' && !isSystemAdmin && (
            <RolesPicker
              roles={rolesQuery.data ?? []}
              selected={roleIds}
              onChange={setRoleIds}
              lockSuperAdmin={isSystemAdmin}
            />
          )}

          {tab === 'permissions' && !isSystemAdmin && (
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

          {tab === 'cashboxes' && !isSystemAdmin && (
            <CashBoxesPicker
              all={cashBoxesQuery.data ?? []}
              selected={userCashBoxes}
              onChange={setUserCashBoxes}
            />
          )}

          {tab === 'branches' && !isSystemAdmin && (
            <BranchesPicker
              all={branchesListQuery.data?.data ?? []}
              assigned={assignedBranchIds}
              defaultBranchId={defaultBranchId}
              onChange={(ids, def) => { setAssignedBranchIds(ids); setDefaultBranchId(def); }}
              showErrors={hasSystemBranches && !branchesValid && (tab === 'branches' || branchSaveAttempted)}
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={!canSave || saveM.isPending}
            onClick={() => {
              if (!isSystemAdmin && hasSystemBranches && !branchesValid) {
                setBranchSaveAttempted(true);
                setTab('branches');
                toast.error('يجب اختيار فرع واحد على الأقل وتحديد الفرع الافتراضي');
                return;
              }
              saveM.mutate();
            }}
            className="gap-1.5"
            variant={mode === 'edit' && isDirty ? 'default' : canSave ? 'default' : 'secondary'}
            title={
              mode === 'edit' && !isDirty
                ? 'لا توجد تغييرات'
                : hasSystemBranches && !branchesValid
                  ? 'اختر الفروع من تبويب «الفروع» قبل الحفظ'
                  : undefined
            }
          >
            <Save className="h-4 w-4" />
            {saveM.isPending ? '...' : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
    </>
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
  roles, selected, onChange, lockSuperAdmin = false,
}: {
  roles: RoleListItemDto[];
  selected: number[];
  onChange: (next: number[]) => void;
  lockSuperAdmin?: boolean;
}) {
  const superRole = roles.find(r => r.isSuperAdmin);
  const toggle = (id: number) => {
    if (lockSuperAdmin && superRole && id === superRole.id) return;
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        يحصل المستخدم على جميع صلاحيات الأدوار المختارة (إذا اختار دور SuperAdmin فإنه يحصل على كل صلاحيات النظام تلقائياً وديناميكياً).
      </p>
      {lockSuperAdmin && superRole && (
        <p className="text-xs text-primary">
          دور SuperAdmin مثبّت على المدير الأول للنظام ولا يمكن إزالته.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {roles.filter(r => r.isActive).map(r => {
          const checked = selected.includes(r.id);
          const locked = lockSuperAdmin && r.isSuperAdmin;
          return (
            <label
              key={r.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border border-border/60 bg-card/30 p-3 transition',
                checked && 'border-primary/60 bg-primary/5',
                locked && 'cursor-not-allowed opacity-90',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={checked}
                disabled={locked}
                onChange={() => toggle(r.id)}
              />
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
function collectPermissionCodes(tree: import('@/types/api').ModuleNode[]): string[] {
  const codes: string[] = [];
  for (const mod of tree) {
    for (const res of mod.resources) {
      for (const act of res.actions) {
        codes.push(act.code);
      }
    }
  }
  return codes;
}

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
    const treeCodes = collectPermissionCodes(tree);
    const allCodes = Array.from(new Set([...treeCodes, ...effective])).sort();
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          SuperAdmin — كل الصلاحيات ممنوحة تلقائياً وديناميكياً (بما فيها الصلاحيات الجديدة)، الاستثناءات غير قابلة للتعديل.
        </div>
        {treeReady && allCodes.length > 0 && (
          <details open className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              الصلاحيات الفعّالة — {allCodes.length}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {allCodes.map(p => (
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

// ── الفروع المسموحة + الفرع الافتراضي
interface BranchesPickerProps {
  all: BranchDto[];
  assigned: Set<number>;
  defaultBranchId: number | null;
  onChange: (assigned: Set<number>, defaultBranchId: number | null) => void;
  showErrors?: boolean;
}

function BranchesPicker({ all, assigned, defaultBranchId, onChange, showErrors }: BranchesPickerProps) {
  const allSelected = all.length > 0 && all.every(b => assigned.has(b.id));
  const someSelected = assigned.size > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAssign = (id: number, on: boolean) => {
    const next = new Set(assigned);
    if (on) {
      next.add(id);
      onChange(next, defaultBranchId ?? id);
      return;
    }
    next.delete(id);
    if (defaultBranchId === id) onChange(next, null);
    else onChange(next, defaultBranchId);
  };

  const toggleAll = (on: boolean) => {
    if (!on) {
      onChange(new Set(), null);
      return;
    }
    const next = new Set(all.map(b => b.id));
    const main = all.find(b => b.isMain) ?? all[0];
    onChange(next, defaultBranchId ?? main?.id ?? null);
  };

  const setDefault = (id: number) => {
    const next = new Set(assigned);
    next.add(id);
    onChange(next, id);
  };

  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد فروع مضافة في النظام.</p>;
  }

  const missingAssigned = assigned.size === 0;
  const missingDefault = assigned.size > 0 && defaultBranchId == null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        حدد الفروع التي يمكن للمستخدم العمل عليها (إلزامي). يجب تحديد فرع افتراضي يُستخدم في جميع النوافذ.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-3 py-2 font-medium">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={e => toggleAll(e.target.checked)}
                  />
                  <span>مسموح</span>
                </label>
              </th>
              <th className="px-3 py-2 font-medium">الكود</th>
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium text-center">الافتراضي</th>
            </tr>
          </thead>
          <tbody>
            {all.map(b => {
              const isAssigned = assigned.has(b.id);
              const isDefault = defaultBranchId === b.id;
              return (
                <tr key={b.id} className="border-t border-border/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isAssigned}
                      onChange={e => toggleAssign(b.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                  <td className="px-3 py-2">
                    {b.nameAr}
                    {b.isMain && (
                      <span className="ms-2 text-[10px] text-amber-400">رئيسي</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="defaultBranch"
                      className="h-4 w-4"
                      disabled={!isAssigned}
                      checked={isDefault}
                      onChange={() => setDefault(b.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showErrors && missingAssigned && (
        <p className="text-xs text-destructive">يجب اختيار فرع واحد على الأقل.</p>
      )}
      {showErrors && !missingAssigned && missingDefault && (
        <p className="text-xs text-destructive">يجب تحديد الفرع الافتراضي.</p>
      )}
    </div>
  );
}
