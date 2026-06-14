import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Building2, Users, Landmark, Search,
  ChevronRight, ChevronLeft, Lock, Phone, Mail, MapPin, User,
  Smartphone, StickyNote, Coins, AlertTriangle, X,
  CircleOff, ShieldAlert, Download, Upload, Wallet, CreditCard,
  Scale, ArrowLeftRight, SlidersHorizontal, Store,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { cn, extractApiError, formatAmount } from '@/lib/utils';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { ITEM_SALE_PRICE_TYPES } from '@/lib/api/inventory';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi } from '@/lib/api/currencies';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale, localizedAccountName } from '@/lib/i18n';
import { CashBoxesPage } from '@/pages/accounting/CashBoxesPage';
import {
  getFinancialManagementPath,
  parseCashBoxView,
  type CashBoxView,
} from '@/pages/financial-management/routes';
import {
  clearFmFocus,
  parsePendingFmFocus,
  readFmFocus,
  writeFmFocus,
  type PartyPrefillPayload,
  type PendingFmFocus,
} from '@/pages/financial-management/fmFocus';
import { storePlatformApi, type StorePlatformUserProfile } from '@/lib/api/storePlatform';
import type {
  FinancialPartyKind,
  FinancialPartyCategoryDto,
  FinancialPartyDto,
  CreateFinancialPartyCategoryPayload,
  UpdateFinancialPartyCategoryPayload,
  CreateFinancialPartyPayload,
  UpdateFinancialPartyPayload,
  AccountBalanceRowDto,
} from '@/types/api';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Asset:     'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Liability: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Equity:    'text-violet-400 bg-violet-500/10 border-violet-500/30',
  Revenue:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Expense:   'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

// ── Kind metadata ────────────────────────────────────────────────
const KIND_NUM: Record<FinancialPartyKind, number> = {
  Supplier: 1, Customer: 2, Bank: 3, CashBox: 4, PaymentCompany: 5,
};

function isBankLikeKind(kind: FinancialPartyKind): boolean {
  return kind === 'Bank' || kind === 'PaymentCompany';
}

function hasContactTab(kind: FinancialPartyKind): boolean {
  return kind !== 'CashBox';
}

function isTradingKind(kind: FinancialPartyKind): boolean {
  return kind === 'Customer' || kind === 'Supplier';
}

function canAccessKind(kind: FinancialPartyKind, can: (p: string) => boolean): boolean {
  if (kind === 'CashBox') return can(PERMS.Accounting.CashBoxes.Read);
  return can(PERMS.FinancialManagement.Categories.Read) || can(PERMS.FinancialManagement.Parties.Read);
}

function kindPermSource(kind: FinancialPartyKind) {
  return kind === 'CashBox' ? PERMS.Accounting.CashBoxes : PERMS.FinancialManagement.Parties;
}

function categoryPermSource(kind: FinancialPartyKind) {
  return kind === 'CashBox' ? PERMS.Accounting.CashBoxes : PERMS.FinancialManagement.Categories;
}

function KindIcon({ kind, className }: { kind: FinancialPartyKind; className?: string }) {
  const icons = {
    Supplier: Building2,
    Customer: Users,
    Bank: Landmark,
    CashBox: Wallet,
    PaymentCompany: CreditCard,
  };
  const Ic = icons[kind];
  return <Ic className={className} />;
}

// ── Category Dialog ──────────────────────────────────────────────
interface CategoryDialogProps {
  editing: FinancialPartyCategoryDto | null;
  /** نوع الطرف الافتراضي عند الإنشاء (يأتي من التبويب النشط في أعلى الصفحة). */
  defaultKind: FinancialPartyKind;
  onClose: () => void;
  onSaved: () => void;
}

function CategoryDialog({ editing, defaultKind, onClose, onSaved }: CategoryDialogProps) {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const qc = useQueryClient();

  // ‎الحسابات الصالحة فقط (ورقة + غير مقفلة + غير مرتبطة بقيود).
  // ‎المحدّد الحالي عند تعديل النوع لا يأتي ضمن القائمة (لأنه أصبح مقفلاً)؛
  // ‎ولذلك يبقى الـ AccountPicker معطَّلاً في وضع التعديل.
  const eligibleQuery = useQuery({
    queryKey: ['financial-management', 'eligible-accounts'],
    queryFn: () => financialManagementApi.getEligibleAccounts(),
    staleTime: 30_000,
    enabled: !editing,
  });

  // ‎نُحوّل القائمة لشكل AccountDto كي يقبلها الـ AccountPicker.
  const pickerAccounts = useMemo(() => {
    return (eligibleQuery.data ?? []).map(a => ({
      id: a.id,
      code: a.code,
      nameAr: a.nameAr,
      nameEn: a.nameEn ?? null,
      type: 0, nature: 0, level: 1,
      isLeaf: true, isActive: true, openingBalance: 0,
    })) as any[];
  }, [eligibleQuery.data]);

  // ‎عند الإنشاء: نوع الطرف يُحدَّد ضمنياً من التبويب النشط (مورد/عميل/مصرف)،
  // ‎فلا حاجة لإظهار خيار النوع داخل النموذج. عند التعديل: لا يُسمح بتغيير النوع أصلاً.
  const kind: FinancialPartyKind = editing?.kind ?? defaultKind;
  const [nameAr, setNameAr]     = useState(editing?.nameAr ?? '');
  const [nameEn, setNameEn]     = useState(editing?.nameEn ?? '');
  const [accountId, setAccountId] = useState<number | null>(editing?.mainAccountId ?? null);
  const [accountLabel, setAccountLabel] = useState(
    editing ? `${editing.mainAccountCode} — ${localizedAccountName(locale, editing.mainAccountNameAr, editing.mainAccountNameEn)}` : ''
  );
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const createMut = useMutation({
    mutationFn: (p: CreateFinancialPartyCategoryPayload) => financialManagementApi.createCategory(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial-party-categories'] }); onSaved(); },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: (p: UpdateFinancialPartyCategoryPayload) => financialManagementApi.updateCategory(editing!.id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial-party-categories'] }); onSaved(); },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const handleSave = () => {
    if (!nameAr.trim()) { toast.error(t('financialManagement.categories.fields.nameAr') + ' مطلوب'); return; }
    if (!editing && !accountId) { toast.error(t('financialManagement.categories.fields.mainAccount') + ' مطلوب'); return; }

    if (editing) {
      updateMut.mutate({ nameAr: nameAr.trim(), nameEn: nameEn.trim() || null, isActive });
    } else {
      createMut.mutate({ kind: KIND_NUM[kind], nameAr: nameAr.trim(), nameEn: nameEn.trim() || null, mainAccountId: accountId! });
    }
  };

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KindIcon kind={kind} className="h-4 w-4 text-primary" />
            {editing ? t('financialManagement.categories.edit') : t('financialManagement.categories.new')}
            <span className="text-muted-foreground"> — {t(`financialManagement.kindSingular.${kind}`)}</span>
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('financialManagement.categories.fields.nameAr')} *</Label>
              <Input value={nameAr} onChange={e => setNameAr(e.target.value)} className="h-9" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('financialManagement.categories.fields.nameEn')}</Label>
              <Input value={nameEn} onChange={e => setNameEn(e.target.value)} className="h-9" dir="ltr" />
            </div>
          </div>

          {/* Account picker — only on create */}
          {!editing && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('financialManagement.categories.fields.mainAccount')} *</Label>
              <AccountPicker
                accounts={pickerAccounts}
                value={accountId}
                initialLabel={accountLabel}
                onChange={(id, lbl) => { setAccountId(id); setAccountLabel(lbl); }}
                allowClear
                placeholder={t('financialManagement.categories.fields.mainAccount')}
              />
              {!eligibleQuery.isLoading && pickerAccounts.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t('financialManagement.categories.noEligibleAccounts')}
                </p>
              )}
              {accountId && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  {t('financialManagement.categories.accountLockWarning')}
                </p>
              )}
            </div>
          )}

          {/* Active toggle — only on edit */}
          {editing && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-primary" />
              {t('financialManagement.categories.fields.isActive')}
            </label>
          )}
        </div>

        <div className={cn('flex gap-2 border-t border-border px-5 py-4', isRtl ? 'flex-row-reverse' : '')}>
          <Button onClick={handleSave} disabled={busy} className="gap-2 min-w-24">
            {busy ? <LoadingSpinner className="h-4 w-4 py-0" /> : null}
            {t('common.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Party Dialog ─────────────────────────────────────────────────
interface PartyDialogProps {
  editing: FinancialPartyDto | null;
  categoryId: number;
  categoryNameAr: string;
  kind: FinancialPartyKind;
  canCreate: boolean;
  canDelete: boolean;
  prefill?: PartyPrefillPayload | null;
  onClose: () => void;
  onSaved: () => void;
  /** بدء بطاقة طرف جديدة دون مغادرة النافذة. */
  onNew: () => void;
  /** حذف الطرف الجاري تعديله (يفتح تأكيد الحذف في الصفحة الأم). */
  onRequestDelete: () => void;
}

type PartyTab = 'basic' | 'contact' | 'pricing' | 'store';

type PartyCurrencySnapshot = { currency: string; debit: string; credit: string; iban: string };

function normalizePartyCurrencyRows(rows: PartyCurrencySnapshot[]): PartyCurrencySnapshot[] {
  return rows
    .map(r => ({
      currency: r.currency.trim().toUpperCase(),
      debit: r.debit.trim(),
      credit: r.credit.trim(),
      iban: r.iban.trim().toUpperCase(),
    }))
    .filter(r => r.currency || r.debit || r.credit || r.iban)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function serializePartyFormSnapshot(input: {
  nameAr: string;
  nameEn: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  addressEn: string;
  contactPerson: string;
  notes: string;
  bankAccountNumber: string;
  swiftCode: string;
  isActive: boolean;
  defaultSalesPriceType: number | null;
  showInStore: boolean;
  storeUserCode: string;
  rows: PartyCurrencySnapshot[];
}): string {
  return JSON.stringify({
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    phone: input.phone.trim(),
    mobile: input.mobile.trim(),
    email: input.email.trim(),
    address: input.address.trim(),
    addressEn: input.addressEn.trim(),
    contactPerson: input.contactPerson.trim(),
    notes: input.notes.trim(),
    bankAccountNumber: input.bankAccountNumber.trim(),
    swiftCode: input.swiftCode.trim().toUpperCase(),
    isActive: input.isActive,
    defaultSalesPriceType: input.defaultSalesPriceType,
    showInStore: input.showInStore,
    storeUserCode: input.storeUserCode.trim().toUpperCase(),
    currencies: normalizePartyCurrencyRows(input.rows),
  });
}

function partyDtoToCurrencyRows(editing: FinancialPartyDto): PartyCurrencySnapshot[] {
  const allowed = editing.allowedCurrencies ?? [];
  const limits  = editing.creditLimits ?? {};
  const ibans   = editing.currencyIbans ?? {};
  const merged  = new Set<string>([...allowed, ...Object.keys(limits), ...Object.keys(ibans)]);
  return Array.from(merged).map(cur => ({
    currency: cur,
    debit:  limits[cur]?.debit  != null ? String(limits[cur]!.debit)  : '',
    credit: limits[cur]?.credit != null ? String(limits[cur]!.credit) : '',
    iban:   ibans[cur] ?? '',
  }));
}

function PartyDialog({
  editing, categoryId, categoryNameAr, kind, canCreate, canDelete, prefill,
  onClose, onSaved, onNew, onRequestDelete,
}: PartyDialogProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const qc = useQueryClient();

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60_000,
  });

  const [tab, setTab]               = useState<PartyTab>(prefill?.initialTab ?? 'basic');
  const [nameAr, setNameAr]         = useState(editing?.nameAr ?? prefill?.nameAr ?? '');
  const [nameEn, setNameEn]         = useState(editing?.nameEn ?? prefill?.nameEn ?? '');
  // ‎صفوف ديناميكية للعملات المسموحة + سقوف الائتمان (مدين/دائن) لكل عملة —
  // ‎على غرار شاشة الصناديق. كل صف يُمثّل عملة واحدة مع uid فريد لإدارة الـ keys.
  type CurrencyRow = { uid: string; currency: string; debit: string; credit: string; iban: string };
  const [rows, setRows] = useState<CurrencyRow[]>(() => {
    if (editing) {
      const allowed = editing.allowedCurrencies ?? [];
      const limits  = editing.creditLimits ?? {};
      const ibans   = editing.currencyIbans ?? {};
      const merged  = new Set<string>([...allowed, ...Object.keys(limits), ...Object.keys(ibans)]);
      return Array.from(merged).map(cur => ({
        uid: Math.random().toString(36).slice(2, 9),
        currency: cur,
        debit:  limits[cur]?.debit  != null ? String(limits[cur]!.debit)  : '',
        credit: limits[cur]?.credit != null ? String(limits[cur]!.credit) : '',
        iban:   ibans[cur] ?? '',
      }));
    }
    return [];
  });
  const [phone, setPhone]           = useState(editing?.phone ?? prefill?.phone ?? '');
  const [mobile, setMobile]         = useState(editing?.mobile ?? prefill?.mobile ?? '');
  const [email, setEmail]           = useState(editing?.email ?? prefill?.email ?? '');
  const [address, setAddress]       = useState(editing?.address ?? prefill?.address ?? '');
  const [contactPerson, setContactPerson] = useState(editing?.contactPerson ?? prefill?.contactPerson ?? '');
  const [notes, setNotes]           = useState(editing?.notes ?? '');
  const [addressEn, setAddressEn]   = useState(editing?.addressEn ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(editing?.bankAccountNumber ?? '');
  const [swiftCode, setSwiftCode]   = useState(editing?.swiftCode ?? '');
  const [isActive, setIsActive]     = useState(editing?.isActive ?? true);
  const [defaultSalesPriceType, setDefaultSalesPriceType] = useState<number | null>(
    editing?.defaultSalesPriceType ?? 4,
  );
  const [showInStore, setShowInStore] = useState(prefill?.showInStore ?? editing?.showInStore ?? false);
  const [storeUserCode, setStoreUserCode] = useState(prefill?.storeUserCode ?? editing?.storeUserCode ?? '');
  const [storeProfile, setStoreProfile] = useState<StorePlatformUserProfile | null>(null);
  const [storeLookupBusy, setStoreLookupBusy] = useState(false);
  const linkStoreCustomerId = prefill?.linkStoreCustomerId ?? null;

  const isBankLike = isBankLikeKind(kind);
  const showContact = hasContactTab(kind);
  const showTradingTabs = isTradingKind(kind);

  const partyTabs = useMemo((): PartyTab[] => [
    'basic',
    ...(showContact ? ['contact' as const] : []),
    ...(showTradingTabs ? ['pricing' as const, 'store' as const] : []),
  ], [showContact, showTradingTabs]);

  // ‎عند إنشاء طرف جديد: نُهيّئ صفّاً افتراضياً بالعملة الرئيسية (isBase) للنظام —
  // ‎يبقى قابلاً للتغيير أو الحذف. نُنفّذها مرّة واحدة بعد تحميل قائمة العملات.
  const seededRef = useRef(false);
  useEffect(() => {
    if (editing || seededRef.current) return;
    const list = currenciesQuery.data ?? [];
    if (list.length === 0) return;
    seededRef.current = true;
    if (rows.length === 0) {
      const base = list.find(c => c.isBase) ?? list[0];
      setRows([{ uid: Math.random().toString(36).slice(2, 9), currency: base.code, debit: '', credit: '', iban: '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currenciesQuery.data, editing]);

  const addRow = () =>
    setRows(prev => [
      ...prev,
      { uid: Math.random().toString(36).slice(2, 9), currency: '', debit: '', credit: '', iban: '' },
    ]);

  const updateRow = (uid: string, patch: Partial<CurrencyRow>) =>
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (uid: string) =>
    setRows(prev => prev.filter(r => r.uid !== uid));

  // ‎العملات المُستخدَمة فعلاً في صفوف أخرى — نستثنيها من الـ <select> لتفادي التكرار.
  const usedCurrencies = (excludeUid: string) =>
    rows
      .filter(r => r.uid !== excludeUid)
      .map(r => r.currency.trim().toUpperCase())
      .filter(Boolean);

  const dupCurrencies = (() => {
    const codes = rows.map(r => r.currency.trim().toUpperCase()).filter(Boolean);
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const c of codes) {
      if (seen.has(c)) dups.push(c);
      else seen.add(c);
    }
    return Array.from(new Set(dups));
  })();

  const lookupStoreUser = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setStoreProfile(null);
      return;
    }
    setStoreLookupBusy(true);
    try {
      const profile = await storePlatformApi.lookupUser(trimmed, linkStoreCustomerId ?? undefined);
      setStoreProfile(profile);
    } catch (e) {
      setStoreProfile(null);
      toast.error(extractApiError(e, t('financialManagement.parties.store.userNotFound')));
    } finally {
      setStoreLookupBusy(false);
    }
  };

  useEffect(() => {
    if (!showTradingTabs || !storeUserCode.trim()) return;
    void lookupStoreUser(storeUserCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMut = useMutation({
    mutationFn: (p: CreateFinancialPartyPayload) => financialManagementApi.createParty(p),
    onSuccess: async (res) => {
      await qc.refetchQueries({ queryKey: ['financial-parties'] });
      qc.invalidateQueries({ queryKey: ['incoming-orders'] });
      qc.invalidateQueries({ queryKey: ['incoming-order'] });
      if (res?.message) toast.success(res.message);
      onSaved();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: (p: UpdateFinancialPartyPayload) => financialManagementApi.updateParty(editing!.id, p),
    onSuccess: async (res) => {
      await qc.refetchQueries({ queryKey: ['financial-parties'] });
      qc.invalidateQueries({ queryKey: ['incoming-orders'] });
      qc.invalidateQueries({ queryKey: ['incoming-order'] });
      if (showInStore && storeUserCode.trim()) {
        toast.success(t('financialManagement.parties.store.linkSuccess'));
      } else if (res?.message) {
        toast.success(res.message);
      }
      onSaved();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const handleSave = () => {
    if (!nameAr.trim()) { toast.error(t('financialManagement.parties.fields.nameAr') + ' مطلوب'); return; }
    if (dupCurrencies.length > 0) {
      toast.error(t('financialManagement.parties.fields.dupCurrencies', { list: dupCurrencies.join(', ') }));
      return;
    }
    // ‎منع حفظ البطاقة دون اختيار أي عملة.
    if (rows.every(r => !r.currency.trim())) {
      toast.error(t('financialManagement.parties.fields.currencyRequired'));
      setTab('basic');
      return;
    }

    // ‎نبني payload العملات + السقوف من الصفوف الديناميكية.
    const allowed: string[] = [];
    const limits: Record<string, { debit: number | null; credit: number | null }> = {};
    const ibans: Record<string, string> = {};
    for (const r of rows) {
      const code = r.currency.trim().toUpperCase();
      if (!code) continue;
      allowed.push(code);
      const dRaw = r.debit.trim();
      const cRaw = r.credit.trim();
      if (dRaw === '' && cRaw === '') {
        /* no limits */
      } else {
        const d = dRaw === '' ? null : (Number.isFinite(parseFloat(dRaw)) ? parseFloat(dRaw) : null);
        const c = cRaw === '' ? null : (Number.isFinite(parseFloat(cRaw)) ? parseFloat(cRaw) : null);
        if ((d ?? 0) !== 0 || (c ?? 0) !== 0) {
          limits[code] = { debit: d, credit: c };
        }
      }
      const ibanRaw = r.iban.trim().toUpperCase();
      if (isBankLike && ibanRaw) ibans[code] = ibanRaw;
    }

    const payload = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || null,
      creditLimits: Object.keys(limits).length ? limits : null,
      allowedCurrencies: allowed.length ? allowed : null,
      currencyIbans: isBankLike && Object.keys(ibans).length ? ibans : null,
      phone: phone.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      addressEn: addressEn.trim() || null,
      contactPerson: contactPerson.trim() || null,
      notes: notes.trim() || null,
      bankAccountNumber: isBankLike ? (bankAccountNumber.trim() || null) : null,
      swiftCode: isBankLike ? (swiftCode.trim() || null) : null,
      defaultSalesPriceType: showTradingTabs ? defaultSalesPriceType : null,
      showInStore: showTradingTabs ? showInStore : false,
      storeUserCode: showTradingTabs && showInStore
        ? (storeUserCode.trim() || editing?.storeUserCode || '').toUpperCase() || null
        : null,
      linkStoreCustomerId: showTradingTabs && showInStore && linkStoreCustomerId
        ? linkStoreCustomerId
        : null,
    };
    const effectiveStoreCode = (storeUserCode.trim() || editing?.storeUserCode || '').toUpperCase();
    if (showTradingTabs && showInStore && !effectiveStoreCode) {
      toast.error(t('financialManagement.parties.store.userCodeRequired'));
      setTab('store');
      return;
    }
    if (editing) {
      updateMut.mutate({ ...payload, isActive });
    } else {
      createMut.mutate({ ...payload, categoryId });
    }
  };

  const busy = createMut.isPending || updateMut.isPending;
  const availableCurrencies = currenciesQuery.data ?? [];

  const initialSnapshot = useMemo(() => {
    if (!editing) return null;
    return serializePartyFormSnapshot({
      nameAr: editing.nameAr,
      nameEn: editing.nameEn ?? '',
      phone: editing.phone ?? '',
      mobile: editing.mobile ?? '',
      email: editing.email ?? '',
      address: editing.address ?? '',
      addressEn: editing.addressEn ?? '',
      contactPerson: editing.contactPerson ?? '',
      notes: editing.notes ?? '',
      bankAccountNumber: editing.bankAccountNumber ?? '',
      swiftCode: editing.swiftCode ?? '',
      isActive: editing.isActive,
      defaultSalesPriceType: editing.defaultSalesPriceType ?? 4,
      showInStore: editing.showInStore ?? false,
      storeUserCode: editing.storeUserCode ?? '',
      rows: partyDtoToCurrencyRows(editing),
    });
  }, [editing]);

  const currentSnapshot = useMemo(() => serializePartyFormSnapshot({
    nameAr, nameEn, phone, mobile, email, address, addressEn, contactPerson, notes,
    bankAccountNumber, swiftCode, isActive, defaultSalesPriceType, showInStore, storeUserCode, rows,
  }), [nameAr, nameEn, phone, mobile, email, address, addressEn, contactPerson, notes, bankAccountNumber, swiftCode, isActive, defaultSalesPriceType, showInStore, storeUserCode, rows]);

  // ‎في التعديل: زر الحفظ معطّل حتى يتغيّر شيء في البطاقة.
  const isDirty = !editing || currentSnapshot !== initialSnapshot;
  const canSave = isDirty && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={cn(
          'w-full rounded-xl border border-border bg-card shadow-2xl',
          isBankLike || showTradingTabs ? 'max-w-3xl' : 'max-w-xl',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {editing ? t('financialManagement.parties.edit') : t('financialManagement.parties.new')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{categoryNameAr}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Generated account code — show on edit */}
        {editing && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-5 py-2 text-xs">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{t('financialManagement.parties.accountCode')}:</span>
            <span className="font-mono font-semibold text-primary" dir="ltr">{editing.accountCode}</span>
          </div>
        )}
        {!editing && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-5 py-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {t('financialManagement.parties.autoGeneratedCode')}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {partyTabs.map(tb => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                'flex-1 min-w-[5.5rem] py-2.5 text-sm font-medium transition-colors whitespace-nowrap px-2',
                tab === tb ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`financialManagement.parties.tabs.${tb}`)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="max-h-[55vh] overflow-y-auto p-5">
          {tab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('financialManagement.parties.fields.nameAr')} *</Label>
                  <Input value={nameAr} onChange={e => setNameAr(e.target.value)} className="h-9" dir="rtl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('financialManagement.parties.fields.nameEn')}</Label>
                  <Input value={nameEn} onChange={e => setNameEn(e.target.value)} className="h-9" dir="ltr" />
                </div>
              </div>

              {/* ‎رقم الحساب المصرفي + السويفت — يظهران فقط لأطراف نوع المصرف. */}
              {isBankLike && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <Landmark className="h-3 w-3" />
                      {t('financialManagement.parties.fields.bankAccountNumber')}
                    </Label>
                    <Input
                      value={bankAccountNumber}
                      onChange={e => setBankAccountNumber(e.target.value)}
                      className="h-9 num-display"
                      dir="ltr"
                      placeholder={t('financialManagement.parties.fields.bankAccountNumberPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <Landmark className="h-3 w-3" />
                      {t('financialManagement.parties.fields.swiftCode')}
                    </Label>
                    <Input
                      value={swiftCode}
                      onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                      className="h-9 num-display"
                      dir="ltr"
                      placeholder={t('financialManagement.parties.fields.swiftCodePlaceholder')}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-primary">
                      {t('financialManagement.parties.fields.currenciesSection')}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t('financialManagement.parties.fields.creditLimitsHint')}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addRow} className="h-7 gap-1 text-xs">
                    <Plus className="h-3 w-3" />
                    {t('financialManagement.parties.fields.addCurrency')}
                  </Button>
                </div>

                {dupCurrencies.length > 0 && (
                  <p className="text-[10px] text-destructive">
                    {t('financialManagement.parties.fields.dupCurrencies', { list: dupCurrencies.join(', ') })}
                  </p>
                )}

                {rows.length === 0 ? (
                  <p className="rounded border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                    {t('financialManagement.parties.fields.noCurrencies')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="p-1 text-start">{t('financialManagement.parties.fields.currency')}</th>
                          {isBankLike && (
                            <th className="p-1 text-start">{t('financialManagement.parties.fields.currencyIban')}</th>
                          )}
                          <th className="p-1 text-start">{t('financialManagement.parties.fields.creditLimitDebit')}</th>
                          <th className="p-1 text-start">{t('financialManagement.parties.fields.creditLimitCredit')}</th>
                          <th className="w-10 p-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const used = usedCurrencies(r.uid);
                          return (
                            <tr key={r.uid} className="border-t border-border/40">
                              <td className="p-1">
                                <select
                                  value={r.currency}
                                  onChange={e => updateRow(r.uid, { currency: e.target.value })}
                                  className="h-8 w-full rounded border border-input bg-secondary/40 px-2 text-xs"
                                >
                                  <option value="">{t('financialManagement.parties.fields.selectCurrency')}</option>
                                  {availableCurrencies
                                    .filter(c => !used.includes(c.code) || c.code === r.currency)
                                    .map(c => (
                                      <option key={c.code} value={c.code}>
                                        {c.code} — {c.nameAr || c.code}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              {isBankLike && (
                                <td className="p-1">
                                  <Input
                                    value={r.iban}
                                    onChange={e => updateRow(r.uid, { iban: e.target.value.toUpperCase() })}
                                    placeholder={t('financialManagement.parties.fields.currencyIbanPlaceholder')}
                                    className="h-8 num-display text-xs min-w-[140px]"
                                    dir="ltr"
                                  />
                                </td>
                              )}
                              <td className="p-1">
                                <Input
                                  type="number" inputMode="decimal" min="0" step="0.001"
                                  value={r.debit}
                                  onChange={e => updateRow(r.uid, { debit: e.target.value })}
                                  placeholder={t('financialManagement.parties.fields.noLimit')}
                                  className="h-8 num-display text-xs"
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  type="number" inputMode="decimal" min="0" step="0.001"
                                  value={r.credit}
                                  onChange={e => updateRow(r.uid, { credit: e.target.value })}
                                  placeholder={t('financialManagement.parties.fields.noLimit')}
                                  className="h-8 num-display text-xs"
                                />
                              </td>
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeRow(r.uid)}
                                  title={t('common.delete')}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {editing && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-primary" />
                  {t('financialManagement.parties.fields.isActive')}
                </label>
              )}
            </div>
          )}

          {tab === 'contact' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Phone className="h-3 w-3" />{t('financialManagement.parties.fields.phone')}</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-9" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Smartphone className="h-3 w-3" />{t('financialManagement.parties.fields.mobile')}</Label>
                  <Input value={mobile} onChange={e => setMobile(e.target.value)} className="h-9" dir="ltr" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3" />{t('financialManagement.parties.fields.email')}</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-9" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" />{t('financialManagement.parties.fields.contactPerson')}</Label>
                <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><MapPin className="h-3 w-3" />{t('financialManagement.parties.fields.address')}</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} className="h-9" dir="rtl" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><MapPin className="h-3 w-3" />{t('financialManagement.parties.fields.addressEn')}</Label>
                <Input value={addressEn} onChange={e => setAddressEn(e.target.value)} className="h-9" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><StickyNote className="h-3 w-3" />{t('financialManagement.parties.fields.notes')}</Label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {tab === 'pricing' && showTradingTabs && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">{t('financialManagement.parties.pricing.title')}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t('financialManagement.parties.pricing.hint')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ITEM_SALE_PRICE_TYPES.map(pt => {
                  const active = (defaultSalesPriceType ?? 4) === pt.value;
                  return (
                    <label
                      key={pt.value}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary/50 bg-primary/10 font-medium text-primary'
                          : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                      )}
                    >
                      <input
                        type="radio"
                        name="defaultSalesPriceType"
                        value={pt.value}
                        checked={active}
                        onChange={() => setDefaultSalesPriceType(pt.value)}
                        className="sr-only"
                      />
                      {pt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'store' && showTradingTabs && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium">{t('financialManagement.parties.store.title')}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t('financialManagement.parties.store.hint')}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showInStore}
                  onChange={e => setShowInStore(e.target.checked)}
                  className="accent-primary"
                />
                {t('financialManagement.parties.store.showInStore')}
              </label>
              {showInStore && (
                <>
                  <div>
                    <Label className="mb-1.5 block text-sm">{t('financialManagement.parties.store.userCode')}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={storeUserCode}
                        onChange={e => setStoreUserCode(e.target.value.toUpperCase())}
                        onBlur={() => void lookupStoreUser(storeUserCode)}
                        placeholder={t('orders.storeUserCodePlaceholder')}
                        className="font-mono"
                        dir="ltr"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={storeLookupBusy || !storeUserCode.trim()}
                        onClick={() => void lookupStoreUser(storeUserCode)}
                      >
                        {storeLookupBusy ? <LoadingSpinner className="h-4 w-4 py-0" /> : t('common.search')}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('financialManagement.parties.store.userCodeHint')}</p>
                  </div>
                  {storeProfile && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{t('financialManagement.parties.store.userContact')}</p>
                      <p className="font-medium">{storeProfile.fullName}</p>
                      <p dir="ltr">{storeProfile.contactPhone || storeProfile.phone}</p>
                      {storeProfile.email && <p dir="ltr">{storeProfile.email}</p>}
                      {(storeProfile.city || storeProfile.address) && (
                        <p>{[storeProfile.city, storeProfile.address, storeProfile.detailedAddress].filter(Boolean).join(' — ')}</p>
                      )}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          setPhone(storeProfile.contactPhone || storeProfile.phone || phone);
                          if (storeProfile.contactPhone && storeProfile.contactPhone !== storeProfile.phone) {
                            setMobile(storeProfile.phone);
                          }
                          setEmail(storeProfile.email || email);
                          setContactPerson(storeProfile.fullName || contactPerson);
                          const addr = [storeProfile.country, storeProfile.city, storeProfile.address, storeProfile.detailedAddress]
                            .filter(Boolean).join(' — ');
                          if (addr) setAddress(addr);
                          if (!nameAr.trim() && storeProfile.fullName && storeProfile.fullName !== '—') {
                            setNameAr(storeProfile.fullName);
                          }
                          toast.success(t('financialManagement.parties.store.contactApplied'));
                        }}
                      >
                        {t('financialManagement.parties.store.applyContact')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={cn('flex items-center gap-2 border-t border-border px-5 py-4', isRtl ? 'flex-row-reverse' : '')}>
          <Button onClick={handleSave} disabled={!canSave} className="gap-2 min-w-24">
            {busy ? <LoadingSpinner className="h-4 w-4 py-0" /> : null}
            {t('common.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>

          {/* ‎في وضع التعديل: إضافة طرف جديد أو حذف الحالي دون مغادرة البطاقة. */}
          {editing && (
            <div className={cn('flex items-center gap-2', isRtl ? 'me-auto' : 'ms-auto')}>
              {canCreate && (
                <Button type="button" variant="outline" onClick={onNew} disabled={busy} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t('financialManagement.parties.new')}
                </Button>
              )}
              {canDelete && (
                <Button type="button" variant="destructive" onClick={onRequestDelete} disabled={busy} className="gap-1.5">
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Party Card ───────────────────────────────────────────────────
function PartyCard({
  party, canEdit, onEdit,
  balanceRows,
  showBalances,
  showAccountTypes,
  valuated,
  kindBadgeColors,
}: {
  party: FinancialPartyDto;
  canEdit: boolean;
  onEdit: () => void;
  balanceRows?: AccountBalanceRowDto[];
  showBalances: boolean;
  showAccountTypes: boolean;
  valuated: boolean;
  kindBadgeColors: Record<FinancialPartyKind, string>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasContact = party.kind !== 'CashBox' && (party.phone || party.mobile || party.email || party.address || party.contactPerson);
  const showStoreLink = (party.kind === 'Customer' || party.kind === 'Supplier')
    && party.showInStore
    && !!party.storeUserCode?.trim();

  return (
    <div className={cn('rounded-lg border transition-all', party.isActive ? 'border-border' : 'border-border/40 opacity-60')}>
      <div
        className={cn('flex items-center gap-3 px-3 py-2.5', hasContact && 'cursor-pointer')}
        onClick={() => hasContact && setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{party.nameAr}</span>
            {party.nameEn && <span className="text-xs text-muted-foreground" dir="ltr">{party.nameEn}</span>}
            {!party.isActive && <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
              kindBadgeColors[party.kind],
            )}>
              {t(`financialManagement.kindSingular.${party.kind}`)}
            </span>
            {showAccountTypes && balanceRows?.[0]?.accountType && (
              <span className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                ACCOUNT_TYPE_COLORS[balanceRows[0].accountType] ?? 'text-muted-foreground',
              )}>
                {t(`accountBalances.types.${balanceRows[0].accountType}`, { defaultValue: balanceRows[0].accountType })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap min-w-0">
            <span className="font-mono text-xs text-primary shrink-0" dir="ltr">{party.accountCode}</span>
            {showStoreLink && (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300 shrink-0"
                title={t('financialManagement.parties.store.linkedBadge')}
              >
                <Store className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="font-mono truncate" dir="ltr">{party.storeUserCode}</span>
              </span>
            )}
            {showBalances && balanceRows?.map(row => {
              const debit = valuated ? (row.valuatedDebit ?? 0) : (row.debitBalance ?? 0);
              const credit = valuated ? (row.valuatedCredit ?? 0) : (row.creditBalance ?? 0);
              if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return null;
              return (
                <span
                  key={row.currency}
                  className="flex items-center gap-1 rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Coins className="h-2.5 w-2.5" />
                  <span className="font-mono font-bold" dir="ltr">{row.currency}</span>
                  {debit > 0 && (
                    <span className="text-emerald-400">
                      {t('financialManagement.filters.balanceDebit')} {formatAmount(debit, 0)}
                    </span>
                  )}
                  {credit > 0 && (
                    <span className="text-rose-400">
                      {t('financialManagement.filters.balanceCredit')} {formatAmount(credit, 0)}
                    </span>
                  )}
                </span>
              );
            })}
            {Object.entries(party.creditLimits ?? {}).map(([cur, lim]) => {
              const d = lim?.debit ?? 0;
              const c = lim?.credit ?? 0;
              if (d === 0 && c === 0) return null;
              return (
                <span key={cur} className="flex items-center gap-1 rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Coins className="h-2.5 w-2.5" />
                  <span className="font-mono font-bold" dir="ltr">{cur}</span>
                  {d > 0 && <span>↓ {formatAmount(d, 0)}</span>}
                  {c > 0 && <span>↑ {formatAmount(c, 0)}</span>}
                </span>
              );
            })}
            {isBankLikeKind(party.kind) && Object.entries(party.currencyIbans ?? {}).map(([cur, iban]) => (
              iban ? (
                <span key={`iban-${cur}`} className="rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono" dir="ltr">
                  {cur}: {iban}
                </span>
              ) : null
            ))}
            {party.allowedCurrencies.length > 0 && (
              <span className="text-xs text-muted-foreground" dir="ltr">{party.allowedCurrencies.join(' • ')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {hasContact && (
            <div className="flex gap-0.5 text-muted-foreground/50">
              {party.phone && <Phone className="h-3 w-3" />}
              {party.mobile && <Smartphone className="h-3 w-3" />}
              {party.email && <Mail className="h-3 w-3" />}
            </div>
          )}
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && hasContact && (
        <div className="border-t border-border/50 bg-secondary/20 px-4 pb-3 pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {party.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span dir="ltr">{party.phone}</span>
            </div>
          )}
          {party.mobile && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Smartphone className="h-3 w-3 shrink-0" />
              <span dir="ltr">{party.mobile}</span>
            </div>
          )}
          {party.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
              <Mail className="h-3 w-3 shrink-0" />
              <span dir="ltr" className="truncate">{party.email}</span>
            </div>
          )}
          {party.contactPerson && (
            <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
              <User className="h-3 w-3 shrink-0" />
              <span>{party.contactPerson}</span>
            </div>
          )}
          {party.address && (
            <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
              <MapPin className="h-3 w-3 shrink-0" />
              <span>{party.address}</span>
            </div>
          )}
          {party.notes && (
            <div className="flex items-start gap-1.5 text-muted-foreground col-span-2">
              <StickyNote className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{party.notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
interface FinancialManagementPageProps {
  kind: FinancialPartyKind;
}

// ── StoreLinkRequestsDialog ─────────────────────────────────────────────────
interface StoreLinkRequestsDialogProps {
  requests: import('@/lib/api/financialManagement').StoreLinkRequestDto[];
  parties: FinancialPartyDto[];
  onClose: () => void;
  onDone: () => void;
}

function StoreLinkRequestsDialog({ requests, parties, onClose, onDone }: StoreLinkRequestsDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedPartyId, setSelectedPartyId] = useState<Record<number, number | null>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  const linkableParties = useMemo(
    () => parties.filter(p => !p.storeUserCode?.trim()),
    [parties],
  );

  const visibleRequests = useMemo(() => {
    const linked = new Set(
      parties
        .map(p => p.storeUserCode?.trim().toUpperCase())
        .filter(Boolean) as string[],
    );
    return requests.filter(r => !linked.has(r.userCode.trim().toUpperCase()));
  }, [requests, parties]);

  const approveMut = useMutation({
    mutationFn: ({ linkId, partyId }: { linkId: number; partyId: number }) =>
      financialManagementApi.approveLinkRequest(linkId, partyId),
    onSuccess: () => {
      toast.success(t('financialManagement.storeLinkRequests.approveSuccess'));
      qc.invalidateQueries({ queryKey: ['financial-management', 'store-link-requests'] });
      qc.invalidateQueries({ queryKey: ['financial-parties'] });
      onDone();
    },
    onError: (e) => toast.error(extractApiError(e)),
    onSettled: () => setProcessingId(null),
  });

  const rejectMut = useMutation({
    mutationFn: (linkId: number) => financialManagementApi.rejectLinkRequest(linkId),
    onSuccess: () => {
      toast.success(t('financialManagement.storeLinkRequests.rejectSuccess'));
      qc.invalidateQueries({ queryKey: ['financial-management', 'store-link-requests'] });
      onDone();
    },
    onError: (e) => toast.error(extractApiError(e)),
    onSettled: () => setProcessingId(null),
  });

  const handleApprove = (linkId: number) => {
    const partyId = selectedPartyId[linkId];
    if (!partyId) { toast.error(t('financialManagement.storeLinkRequests.selectParty')); return; }
    setProcessingId(linkId);
    approveMut.mutate({ linkId, partyId });
  };

  const handleReject = (linkId: number) => {
    setProcessingId(linkId);
    rejectMut.mutate(linkId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold">{t('financialManagement.storeLinkRequests.title')}</h2>
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
              {visibleRequests.length}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visibleRequests.length === 0 ? (
            <EmptyState title={t('financialManagement.storeLinkRequests.empty')} icon={Store} />
          ) : (
            visibleRequests.map(req => (
              <div key={req.linkId} className="rounded-xl border border-border bg-background p-4 space-y-3">
                {/* Trader info */}
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{req.fullName}</span>
                      <span className="font-mono text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{req.userCode}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {req.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.phone}</span>}
                      {req.contactPhone && <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />{req.contactPhone}</span>}
                      {req.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.email}</span>}
                      {(req.city || req.country) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{[req.city, req.country].filter(Boolean).join('، ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(req.sentAt).toLocaleDateString('ar-IQ')}
                  </span>
                </div>

                {/* Party picker + actions */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {t('financialManagement.storeLinkRequests.linkToParty')}
                    </label>
                    <select
                      value={selectedPartyId[req.linkId] ?? ''}
                      onChange={e => setSelectedPartyId(p => ({ ...p, [req.linkId]: Number(e.target.value) || null }))}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      disabled={processingId === req.linkId}
                    >
                      <option value="">{t('financialManagement.storeLinkRequests.selectParty')}</option>
                      {linkableParties.map(p => (
                        <option key={p.id} value={p.id}>{p.accountCode} — {p.nameAr}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      disabled={processingId === req.linkId || !selectedPartyId[req.linkId]}
                      onClick={() => handleApprove(req.linkId)}
                    >
                      {processingId === req.linkId && approveMut.isPending
                        ? <LoadingSpinner className="h-3.5 w-3.5 py-0" />
                        : <User className="h-3.5 w-3.5" />}
                      {t('financialManagement.storeLinkRequests.approve')}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                      disabled={processingId === req.linkId}
                      onClick={() => handleReject(req.linkId)}
                    >
                      {processingId === req.linkId && rejectMut.isPending
                        ? <LoadingSpinner className="h-3.5 w-3.5 py-0" />
                        : <X className="h-3.5 w-3.5" />}
                      {t('financialManagement.storeLinkRequests.reject')}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function FinancialManagementPage({ kind: activeKind }: FinancialManagementPageProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();

  const catPerms = categoryPermSource(activeKind);
  const partyPerms = kindPermSource(activeKind);

  const canReadCats    = can(catPerms.Read);
  const canCreateCat   = can(catPerms.Create);
  const canEditCat     = can(catPerms.Update);
  const canDeleteCat   = can(catPerms.Delete);
  const canReadParties = can(partyPerms.Read);
  const canCreateParty = can(partyPerms.Create);
  const canEditParty   = can(partyPerms.Update);
  const canDeleteParty = can(partyPerms.Delete);

  const canReadCashBoxBalances  = can(PERMS.Accounting.CashBoxBalances.Read);
  const canReadCashBoxTransfers = can(PERMS.Accounting.CashBoxTransfers.Read);

  const canAccessPage = canAccessKind(activeKind, can);

  const cashBoxView: CashBoxView = activeKind === 'CashBox'
    ? parseCashBoxView(searchParams.toString())
    : 'parties';

  const setCashBoxView = (view: CashBoxView) => {
    if (view === 'parties') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ view }, { replace: true });
    }
  };

  const cashBoxSubTabs = useMemo(() => {
    const tabs: { id: CashBoxView; labelKey: string; icon: typeof Wallet; show: boolean }[] = [
      { id: 'parties', labelKey: 'financialManagement.cashBoxViews.parties', icon: Wallet, show: canReadParties },
      { id: 'balances', labelKey: 'financialManagement.cashBoxViews.balances', icon: Scale, show: canReadCashBoxBalances },
      { id: 'transfers', labelKey: 'financialManagement.cashBoxViews.transfers', icon: ArrowLeftRight, show: canReadCashBoxTransfers },
    ];
    return tabs.filter(tab => tab.show);
  }, [canReadParties, canReadCashBoxBalances, canReadCashBoxTransfers]);

  useEffect(() => {
    if (activeKind !== 'CashBox' || cashBoxSubTabs.length === 0) return;
    if (!cashBoxSubTabs.some(tab => tab.id === cashBoxView)) {
      setCashBoxView(cashBoxSubTabs[0].id);
    }
  }, [activeKind, cashBoxSubTabs, cashBoxView]);

  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyBalances, setShowPartyBalances] = useState(true);
  const [showAccountTypes, setShowAccountTypes] = useState(true);
  const [fmValuated, setFmValuated] = useState(true);
  const [fmIncludeDraft, setFmIncludeDraft] = useState(true);
  const [fmOptionsOpen, setFmOptionsOpen] = useState(false);
  const fmOptionsPanelRef = useRef<HTMLDivElement>(null);

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60 * 1000,
  });
  const baseCurrency = useMemo(
    () => currenciesQuery.data?.find(c => c.isBase) ?? null,
    [currenciesQuery.data],
  );

  const { defaultFromDate, defaultToDate } = useActiveFiscalYear();
  const balancePeriod = useMemo(
    () => ({ from: defaultFromDate, to: defaultToDate }),
    [defaultFromDate, defaultToDate],
  );

  const fmOptionsActiveCount = useMemo(
    () => [!showPartyBalances, !showAccountTypes, !fmValuated, !fmIncludeDraft].filter(Boolean).length,
    [showPartyBalances, showAccountTypes, fmValuated, fmIncludeDraft],
  );

  useEffect(() => {
    if (!fmOptionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (fmOptionsPanelRef.current && !fmOptionsPanelRef.current.contains(e.target as Node)) {
        setFmOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [fmOptionsOpen]);

  const partyBalancesQuery = useQuery({
    queryKey: ['account-balances', 'fm-parties', balancePeriod.from, balancePeriod.to, fmValuated, fmIncludeDraft],
    queryFn: () => accountingApi.getAccountBalances({
      from: balancePeriod.from,
      to: balancePeriod.to,
      valuated: fmValuated,
      leavesOnly: true,
      includeDraft: fmIncludeDraft,
    }),
    enabled: showPartyBalances && canReadParties && !!balancePeriod.from && !!balancePeriod.to,
    staleTime: 60_000,
  });

  const balancesByAccountId = useMemo(() => {
    const map = new Map<number, AccountBalanceRowDto[]>();
    for (const row of partyBalancesQuery.data?.rows ?? []) {
      const list = map.get(row.accountId) ?? [];
      list.push(row);
      map.set(row.accountId, list);
    }
    return map;
  }, [partyBalancesQuery.data?.rows]);

  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinancialPartyCategoryDto | null>(null);
  const [showPartyDialog, setShowPartyDialog] = useState(false);
  const [editingParty, setEditingParty] = useState<FinancialPartyDto | null>(null);
  const [partyPrefill, setPartyPrefill] = useState<PartyPrefillPayload | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'category' | 'party'; id: number; name: string } | null>(null);
  const [showLinkRequestsDialog, setShowLinkRequestsDialog] = useState(false);

  // طلبات الربط المعلقة من التجار — تُجلب فقط عند العملاء/الموردين
  const linkRequestsQuery = useQuery({
    queryKey: ['financial-management', 'store-link-requests'],
    queryFn: () => financialManagementApi.getStoreLinkRequests(),
    staleTime: 30_000,
    enabled: isTradingKind(activeKind),
  });
  const partiesQuery = useQuery({
    queryKey: ['financial-parties', activeKind, selectedCatId],
    queryFn: () => financialManagementApi.getParties({ kind: activeKind, categoryId: selectedCatId ?? undefined, includeInactive: true }),
    enabled: canReadParties,
    staleTime: 30_000,
  });

  const allPartiesForLinksQuery = useQuery({
    queryKey: ['financial-parties', activeKind, 'all-for-links'],
    queryFn: () => financialManagementApi.getParties({ kind: activeKind, includeInactive: true }),
    enabled: canReadParties && isTradingKind(activeKind),
    staleTime: 30_000,
  });

  const pendingLinkCount = useMemo(() => {
    const requests = linkRequestsQuery.data ?? [];
    const parties = allPartiesForLinksQuery.data ?? [];
    const linkedCodes = new Set(
      parties
        .map(p => p.storeUserCode?.trim().toUpperCase())
        .filter(Boolean) as string[],
    );
    return requests.filter(r => !linkedCodes.has(r.userCode.trim().toUpperCase())).length;
  }, [linkRequestsQuery.data, allPartiesForLinksQuery.data]);

  const categoriesQuery = useQuery({
    queryKey: ['financial-party-categories', activeKind],
    queryFn: () => financialManagementApi.getCategories(activeKind, true),
    enabled: canReadCats,
    staleTime: 30_000,
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: number) => financialManagementApi.deleteCategory(id),
    onSuccess: () => {
      toast.success(t('common.success'));
      qc.invalidateQueries({ queryKey: ['financial-party-categories'] });
      if (selectedCatId === confirmDelete?.id) setSelectedCatId(null);
      setConfirmDelete(null);
    },
    onError: (e) => { toast.error(extractApiError(e)); setConfirmDelete(null); },
  });

  const deletePartyMut = useMutation({
    mutationFn: (id: number) => financialManagementApi.deleteParty(id),
    onSuccess: () => {
      toast.success(t('common.success'));
      qc.invalidateQueries({ queryKey: ['financial-parties'] });
      setConfirmDelete(null);
    },
    onError: (e) => { toast.error(extractApiError(e)); setConfirmDelete(null); },
  });

  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter(c => c.kind === activeKind),
    [categoriesQuery.data, activeKind],
  );

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCatId) ?? null,
    [categories, selectedCatId],
  );

  // ‎اختيار أول نوع افتراضياً عند تحميل القائمة أو تبديل التبويب (مورد/عميل/مصرف).
  // ‎الاعتماد على `categories` فقط (لا على selectedCatId) يُبقي سلوك إلغاء التحديد
  // ‎اليدوي يعمل: نقر النوع المُحدَّد لإخفائه لا يُعيد اختيار الأول.
  useEffect(() => {
    if (categories.length === 0) return;
    if (selectedCatId == null || !categories.some(c => c.id === selectedCatId)) {
      setSelectedCatId(categories[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // ── ربط عميق: القدوم من شاشة السند عبر sessionStorage('fm:focus') لفتح بطاقة
  //    الطرف المرتبط بحساب معيّن مباشرة، أو فتح بطاقة طرف جديد ضمن فئته.
  const [pendingFocus, setPendingFocus] = useState<PendingFmFocus | null>(
    () => parsePendingFmFocus(readFmFocus()),
  );
  const focusAppliedRef = useRef(false);

  // ‎عند تبديل تبويب الإدارة المالية (مورد/عميل/مصرف…) أعد محاولة فتح البطاقة.
  useEffect(() => {
    const stored = readFmFocus();
    if (!stored) return;
    focusAppliedRef.current = false;
    setPendingFocus(parsePendingFmFocus(stored));
  }, [activeKind]);

  // ‎جلب كل الأطراف (بكل الأنواع) لاستخراج الطرف المطابق لـ accountId المطلوب.
  const focusLookupQuery = useQuery({
    queryKey: ['financial-parties', 'focus-lookup'],
    queryFn: () => financialManagementApi.getParties({ includeInactive: true }),
    enabled: canReadParties && pendingFocus != null
      && (pendingFocus.accountId != null || pendingFocus.partyId != null),
  });

  useEffect(() => {
    if (!pendingFocus || focusAppliedRef.current) return;

    // ‎إضافة/تعديل بلا accountId (مثلاً من تفعيل طلبية متجر).
    if (pendingFocus.accountId == null) {
      if (pendingFocus.mode === 'add') {
        if (categories.length === 0) return;
        if (pendingFocus.categoryId != null) {
          const cat = categories.find(c => c.id === pendingFocus.categoryId);
          if (!cat) return;
          setSelectedCatId(cat.id);
        }
        const prefill = pendingFocus.prefill ?? null;
        focusAppliedRef.current = true;
        clearFmFocus();
        setPendingFocus(null);
        setEditingParty(null);
        setPartyPrefill(prefill);
        setShowPartyDialog(true);
        return;
      }

      if (pendingFocus.mode === 'edit' && pendingFocus.partyId != null) {
        const list = focusLookupQuery.data;
        if (!list) return;
        const party = list.find(p => p.id === pendingFocus.partyId);
        if (!party) {
          focusAppliedRef.current = true;
          clearFmFocus();
          setPendingFocus(null);
          toast.error(t('financialManagement.parties.notAParty', { defaultValue: 'هذا الحساب ليس طرفاً مالياً' }));
          return;
        }
        if (party.kind !== activeKind) {
          writeFmFocus({
            mode: 'edit',
            kind: party.kind,
            partyId: party.id,
            prefill: pendingFocus.prefill,
          });
          navigate(getFinancialManagementPath(party.kind), { replace: true });
          return;
        }
        if (categories.length === 0) return;
        const prefill = pendingFocus.prefill ?? null;
        focusAppliedRef.current = true;
        clearFmFocus();
        setPendingFocus(null);
        setSelectedCatId(party.categoryId);
        setEditingParty(party);
        setPartyPrefill(prefill);
        setShowPartyDialog(true);
        return;
      }

      return;
    }

    // ‎فتح بطاقة نوع (حساب رئيسي مقفل للإدارة المالية).
    if (pendingFocus.focusTarget === 'category' && pendingFocus.categoryId != null) {
      if (categories.length === 0) return;
      const cat = categories.find(c => c.id === pendingFocus.categoryId);
      if (!cat) {
        focusAppliedRef.current = true;
        clearFmFocus();
        setPendingFocus(null);
        toast.error(t('financialManagement.parties.notAParty', { defaultValue: 'هذا الحساب ليس طرفاً مالياً' }));
        return;
      }
      if (cat.kind !== activeKind) {
        writeFmFocus({
          accountId: pendingFocus.accountId,
          mode: pendingFocus.mode,
          kind: cat.kind,
          categoryId: cat.id,
          focusTarget: 'category',
        });
        navigate(getFinancialManagementPath(cat.kind), { replace: true });
        return;
      }
      focusAppliedRef.current = true;
      clearFmFocus();
      setPendingFocus(null);
      setSelectedCatId(cat.id);
      setEditingCategory(cat);
      setShowCategoryDialog(true);
      return;
    }

    const list = focusLookupQuery.data;
    if (!list) return;

    const party = pendingFocus.partyId != null
      ? list.find(p => p.id === pendingFocus.partyId)
      : list.find(p => p.accountId === pendingFocus.accountId);
    const mode = pendingFocus.mode;

    if (!party) {
      focusAppliedRef.current = true;
      clearFmFocus();
      setPendingFocus(null);
      toast.error(t('financialManagement.parties.notAParty', { defaultValue: 'هذا الحساب ليس طرفاً مالياً' }));
      return;
    }

    if (party.kind !== activeKind) {
      writeFmFocus({
        accountId: party.accountId,
        mode,
        kind: party.kind,
        categoryId: party.categoryId,
        partyId: party.id,
        focusTarget: 'party',
      });
      navigate(getFinancialManagementPath(party.kind), { replace: true });
      return;
    }

    if (categories.length === 0) return;

    const catId = party.categoryId;
    if (!categories.some(c => c.id === catId)) {
      focusAppliedRef.current = true;
      clearFmFocus();
      setPendingFocus(null);
      toast.error(t('financialManagement.parties.notAParty', { defaultValue: 'هذا الحساب ليس طرفاً مالياً' }));
      return;
    }

    focusAppliedRef.current = true;
    clearFmFocus();
    setPendingFocus(null);
    setSelectedCatId(catId);
    setEditingParty(mode === 'add' ? null : party);
    setPartyPrefill(pendingFocus.prefill ?? null);
    setShowPartyDialog(true);
  }, [pendingFocus, focusLookupQuery.data, categories, t, activeKind, navigate]);

  const parties = useMemo(() => {
    let list = partiesQuery.data ?? [];
    if (selectedCatId) list = list.filter(p => p.categoryId === selectedCatId);
    const s = partySearch.trim().toLowerCase();
    if (s) list = list.filter(p =>
      p.nameAr.toLowerCase().includes(s) ||
      (p.nameEn ?? '').toLowerCase().includes(s) ||
      p.accountCode.toLowerCase().includes(s),
    );
    return list;
  }, [partiesQuery.data, selectedCatId, partySearch]);

  // ── Pagination (client-side) ───────────────────────────────────
  const PARTY_PAGE_SIZE_OPTIONS = [5, 10, 50, 100, 1000];
  const [partyPageSize, setPartyPageSize] = useState(10);
  const [partyPage, setPartyPage] = useState(1);
  useEffect(() => { setPartyPage(1); }, [activeKind, selectedCatId, partySearch, partyPageSize]);
  const totalPartyPages = Math.max(1, Math.ceil(parties.length / partyPageSize));
  useEffect(() => {
    if (partyPage > totalPartyPages) setPartyPage(totalPartyPages);
  }, [partyPage, totalPartyPages]);
  const pagedParties = useMemo(
    () => parties.slice((partyPage - 1) * partyPageSize, partyPage * partyPageSize),
    [parties, partyPage, partyPageSize],
  );

  // ── Excel export / import ──────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // ‎رؤوس الأعمدة العربية المعتمَدة للتصدير والاستيراد (نفس الشكل = قالب جاهز).
  const COL = {
    nameAr: 'اسم الحساب',
    nameEn: 'الاسم بالإنجليزي',
    code: 'رمز الحساب',
    currencies: 'العملات',
    phone: 'الهاتف',
    mobile: 'الجوال',
    email: 'البريد الإلكتروني',
    contactPerson: 'جهة الاتصال',
    address: 'العنوان',
    addressEn: 'العنوان بالإنجليزي',
    bankAccount: 'رقم الحساب المصرفي',
    swift: 'السويفت كود',
    notes: 'ملاحظات',
  };

  const handleExport = () => {
    const rows = parties.map(p => ({
      [COL.nameAr]: p.nameAr,
      [COL.nameEn]: p.nameEn ?? '',
      [COL.code]: p.accountCode,
      [COL.currencies]: p.allowedCurrencies.join(', '),
      [COL.phone]: p.phone ?? '',
      [COL.mobile]: p.mobile ?? '',
      [COL.email]: p.email ?? '',
      [COL.contactPerson]: p.contactPerson ?? '',
      [COL.address]: p.address ?? '',
      [COL.addressEn]: p.addressEn ?? '',
      [COL.bankAccount]: p.bankAccountNumber ?? '',
      [COL.swift]: p.swiftCode ?? '',
      [COL.notes]: p.notes ?? '',
    }));
    // ‎عند عدم وجود بيانات نُصدّر صفاً فارغاً (قالب) برؤوس الأعمدة فقط.
    const sheetData = rows.length > 0 ? rows : [Object.values(COL).reduce((a, k) => ({ ...a, [k]: '' }), {})];
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = Object.values(COL).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t(`financialManagement.kinds.${activeKind}`));
    const label = (selectedCategory?.nameAr ?? t(`financialManagement.kinds.${activeKind}`)).replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const splitCurrencies = (raw: unknown): string[] =>
    String(raw ?? '')
      .split(/[,،•|\/\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

  const handleImportFile = async (file: File) => {
    if (!selectedCategory) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const pick = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const v = row[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      let ok = 0, fail = 0;
      for (const row of rows) {
        const nameAr = pick(row, COL.nameAr, 'الاسم', 'NameAr', 'name');
        if (!nameAr) { fail++; continue; }
        const allowed = splitCurrencies(row[COL.currencies] ?? row['Currencies']);
        try {
          await financialManagementApi.createParty({
            categoryId: selectedCategory.id,
            nameAr,
            nameEn: pick(row, COL.nameEn, 'NameEn') || null,
            creditLimits: null,
            allowedCurrencies: allowed.length ? allowed : null,
            phone: pick(row, COL.phone, 'Phone') || null,
            mobile: pick(row, COL.mobile, 'Mobile') || null,
            email: pick(row, COL.email, 'Email') || null,
            address: pick(row, COL.address, 'Address') || null,
            addressEn: pick(row, COL.addressEn, 'AddressEn') || null,
            contactPerson: pick(row, COL.contactPerson, 'ContactPerson') || null,
            notes: pick(row, COL.notes, 'Notes') || null,
            bankAccountNumber: isBankLikeKind(activeKind) ? (pick(row, COL.bankAccount) || null) : null,
            swiftCode: isBankLikeKind(activeKind) ? (pick(row, COL.swift, 'SWIFT', 'Swift') || null) : null,
          });
          ok++;
        } catch { fail++; }
      }
      qc.invalidateQueries({ queryKey: ['financial-parties'] });
      qc.invalidateQueries({ queryKey: ['financial-party-categories'] });
      if (ok > 0) toast.success(t('financialManagement.parties.importDone', { ok, fail }));
      else toast.error(t('financialManagement.parties.importNone'));
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setImporting(false);
    }
  };

  const kindBadgeColors: Record<FinancialPartyKind, string> = {
    Supplier:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Customer:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Bank:           'bg-violet-500/15 text-violet-400 border-violet-500/30',
    CashBox:        'bg-amber-500/15 text-amber-400 border-amber-500/30',
    PaymentCompany: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  };

  if (!canAccessPage) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground gap-2">
        <ShieldAlert className="h-6 w-6" />
        <span>{t('common.noData')}</span>
      </div>
    );
  }

  const showPartiesLayout = activeKind !== 'CashBox' || cashBoxView === 'parties';

  return (
    <div className="flex h-full flex-col gap-4">
      {/* تبويبات فرعية لصفحة الصناديق: الأطراف / الأرصدة / المناقلات */}
      {activeKind === 'CashBox' && cashBoxSubTabs.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {cashBoxSubTabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCashBoxView(tab.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all',
                  cashBoxView === tab.id
                    ? `border ${kindBadgeColors.CashBox} font-semibold`
                    : 'text-muted-foreground hover:bg-secondary/40',
                )}
              >
                <TabIcon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      {activeKind === 'CashBox' && cashBoxView === 'balances' && canReadCashBoxBalances && (
        <CashBoxesPage mode="balances" />
      )}

      {activeKind === 'CashBox' && cashBoxView === 'transfers' && canReadCashBoxTransfers && (
        <CashBoxesPage mode="transfers" />
      )}

      {showPartiesLayout && (
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] min-h-0">

        {/* Left: Categories */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b border-border pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {t('financialManagement.categories.title')} — {t(`financialManagement.kinds.${activeKind}`)}
              </CardTitle>
              {canCreateCat && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => { setEditingCategory(null); setShowCategoryDialog(true); }}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('financialManagement.categories.new')}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-2">
            {categoriesQuery.isLoading && <LoadingSpinner text="" />}
            {!categoriesQuery.isLoading && categories.length === 0 && (
              <EmptyState title={t('financialManagement.categories.empty')} icon={Building2} />
            )}
            <div className="space-y-1">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id === selectedCatId ? null : cat.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-start transition-all',
                    selectedCatId === cat.id
                      ? `border-primary/40 ${kindBadgeColors[cat.kind]} bg-opacity-10`
                      : 'border-border hover:bg-secondary/30',
                    !cat.isActive && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{cat.nameAr}</span>
                        {!cat.isActive && <CircleOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      </div>
                      {cat.nameEn && <p className="text-xs text-muted-foreground" dir="ltr">{cat.nameEn}</p>}
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        <span className="font-mono" dir="ltr">{cat.mainAccountCode}</span>
                        <span className="truncate">{cat.mainAccountNameAr}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[11px] font-medium">
                        {cat.partyCount}
                      </span>
                      <div className="flex gap-0.5">
                        {canEditCat && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingCategory(cat); setShowCategoryDialog(true); }}
                            className="rounded p-1 text-muted-foreground hover:bg-background/50 hover:text-primary"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {canDeleteCat && (
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'category', id: cat.id, name: cat.nameAr }); }}
                            className="rounded p-1 text-muted-foreground hover:bg-background/50 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Parties */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b border-border pb-3 pt-4 px-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold shrink-0">
                {selectedCategory
                  ? `${t('financialManagement.parties.title')} — ${selectedCategory.nameAr}`
                  : t('financialManagement.parties.title')}
              </CardTitle>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <div ref={fmOptionsPanelRef} className="relative shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="relative h-8 gap-1.5 px-2.5"
                    onClick={() => setFmOptionsOpen(v => !v)}
                    title={t('financialManagement.filters.options')}
                    aria-expanded={fmOptionsOpen}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {fmOptionsActiveCount > 0 && (
                      <span className="absolute -top-1 end-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                        {fmOptionsActiveCount}
                      </span>
                    )}
                  </Button>
                  {fmOptionsOpen && (
                    <div
                      className="absolute end-0 top-[calc(100%+4px)] z-50 w-64 rounded-lg border border-border bg-popover shadow-lg"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      <div className="border-b border-border/60 bg-secondary/30 px-3 py-2 text-xs font-semibold">
                        {t('financialManagement.filters.options')}
                      </div>
                      <div className="flex flex-col gap-1 p-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={showPartyBalances} onChange={e => setShowPartyBalances(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('financialManagement.filters.showPartyBalances')}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={showAccountTypes} onChange={e => setShowAccountTypes(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('financialManagement.filters.showAccountTypes')}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={fmValuated} onChange={e => setFmValuated(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('financialManagement.filters.valuated', { currency: baseCurrency?.code ?? 'IQD' })}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={fmIncludeDraft} onChange={e => setFmIncludeDraft(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('financialManagement.filters.includeDraft')}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative flex-1 max-w-64">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={partySearch}
                    onChange={e => setPartySearch(e.target.value)}
                    placeholder={t('financialManagement.search')}
                    className="h-8 ps-8 text-xs"
                  />
                  {partySearch && (
                    <button onClick={() => setPartySearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectedCategory && (
                  <Button
                    size="sm" variant="outline"
                    className="h-8 gap-1 text-xs shrink-0"
                    onClick={handleExport}
                    title={t('financialManagement.parties.export')}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('financialManagement.parties.export')}
                  </Button>
                )}
                {canCreateParty && selectedCategory && (
                  <Button
                    size="sm" variant="outline"
                    className="h-8 gap-1 text-xs shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    title={t('financialManagement.parties.import')}
                  >
                    {importing
                      ? <LoadingSpinner className="h-3.5 w-3.5 py-0" />
                      : <Download className="h-3.5 w-3.5" />}
                    {t('financialManagement.parties.import')}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                    e.target.value = '';
                  }}
                />
                {isTradingKind(activeKind) && (
                  <Button
                    size="sm" variant="outline"
                    className={`relative h-8 gap-1 text-xs shrink-0 ${
                      pendingLinkCount > 0
                        ? 'border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
                        : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => setShowLinkRequestsDialog(true)}
                    title={t('financialManagement.storeLinkRequests.title')}
                  >
                    <Store className="h-3.5 w-3.5" />
                    {t('financialManagement.storeLinkRequests.title')}
                    {pendingLinkCount > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                        {pendingLinkCount}
                      </span>
                    )}
                  </Button>
                )}
                {canCreateParty && selectedCategory && (
                  <Button size="sm" className="h-8 gap-1 text-xs shrink-0" onClick={() => { setEditingParty(null); setPartyPrefill(null); setShowPartyDialog(true); }}>
                    <Plus className="h-3.5 w-3.5" />
                    {t('financialManagement.parties.new')}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-3">
            {!selectedCategory && !partySearch && (
              <EmptyState
                title={t('financialManagement.parties.emptyNoCategory')}
                icon={Users}
              />
            )}
            {partiesQuery.isLoading && <LoadingSpinner text="" />}
            {!partiesQuery.isLoading && parties.length === 0 && (selectedCategory || partySearch) && (
              <EmptyState title={t('financialManagement.parties.empty')} icon={Users} />
            )}
            <div className="space-y-1.5">
              {pagedParties.map(party => (
                <PartyCard
                  key={party.id}
                  party={party}
                  canEdit={canEditParty}
                  onEdit={() => { setEditingParty(party); setPartyPrefill(null); setShowPartyDialog(true); }}
                  balanceRows={balancesByAccountId.get(party.accountId)}
                  showBalances={showPartyBalances}
                  showAccountTypes={showAccountTypes}
                  valuated={fmValuated}
                  kindBadgeColors={kindBadgeColors}
                />
              ))}
            </div>
          </CardContent>

          {/* Pagination */}
          {parties.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t('financialManagement.parties.pageInfo', {
                    from: (partyPage - 1) * partyPageSize + 1,
                    to: Math.min(partyPage * partyPageSize, parties.length),
                    total: parties.length,
                  })}
                </span>
                <select
                  value={partyPageSize}
                  onChange={e => setPartyPageSize(Number(e.target.value))}
                  className="h-7 rounded border border-input bg-secondary/40 px-2 text-xs"
                  title={t('financialManagement.parties.perPage')}
                >
                  {PARTY_PAGE_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>{t('financialManagement.parties.perPageOption', { n })}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm" variant="outline" className="h-7 w-7 p-0"
                  disabled={partyPage <= 1}
                  onClick={() => setPartyPage(p => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium">{partyPage} / {totalPartyPages}</span>
                <Button
                  size="sm" variant="outline" className="h-7 w-7 p-0"
                  disabled={partyPage >= totalPartyPages}
                  onClick={() => setPartyPage(p => Math.min(totalPartyPages, p + 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      )}

      {/* Dialogs */}
      {showCategoryDialog && (
        <CategoryDialog
          editing={editingCategory}
          defaultKind={activeKind}
          onClose={() => setShowCategoryDialog(false)}
          onSaved={() => { setShowCategoryDialog(false); toast.success(t('common.success')); }}
        />
      )}

      {showPartyDialog && selectedCategory && (
        <PartyDialog
          key={`${editingParty?.id ?? 'new'}-${partyPrefill?.storeUserCode ?? ''}`}
          editing={editingParty}
          prefill={partyPrefill}
          categoryId={selectedCategory.id}
          categoryNameAr={selectedCategory.nameAr}
          kind={activeKind}
          canCreate={canCreateParty}
          canDelete={canDeleteParty}
          onClose={() => { setShowPartyDialog(false); setPartyPrefill(null); }}
          onSaved={() => { setShowPartyDialog(false); setPartyPrefill(null); toast.success(t('common.success')); }}
          onNew={() => { setEditingParty(null); setPartyPrefill(null); }}
          onRequestDelete={() => {
            if (!editingParty) return;
            const target = editingParty;
            setShowPartyDialog(false);
            setEditingParty(null);
            setConfirmDelete({ type: 'party', id: target.id, name: target.nameAr });
          }}
        />
      )}

      {/* Store Link Requests Dialog */}
      {showLinkRequestsDialog && (
        <StoreLinkRequestsDialog
          requests={linkRequestsQuery.data ?? []}
          parties={allPartiesForLinksQuery.data ?? partiesQuery.data ?? []}
          onClose={() => setShowLinkRequestsDialog(false)}
          onDone={() => {
            linkRequestsQuery.refetch();
            partiesQuery.refetch();
            allPartiesForLinksQuery.refetch();
          }}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/10 p-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  {confirmDelete.type === 'category'
                    ? t('financialManagement.categories.delete')
                    : t('financialManagement.parties.delete')}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{confirmDelete.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {confirmDelete.type === 'category'
                ? t('financialManagement.categories.deleteConfirm')
                : t('financialManagement.parties.deleteConfirm')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={deleteCatMut.isPending || deletePartyMut.isPending}
                onClick={() => {
                  if (confirmDelete.type === 'category') deleteCatMut.mutate(confirmDelete.id);
                  else deletePartyMut.mutate(confirmDelete.id);
                }}
              >
                {t('common.confirm')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
