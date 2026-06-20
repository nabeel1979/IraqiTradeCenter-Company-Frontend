import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Save, Search, Trash2, ArrowRight,
  AlertTriangle, BookOpen, X, CheckCircle2, Printer, FilePlus2, Lock, History, Archive, Undo2,
  Download, Upload, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  accountingApi,
  getReversalOriginalEntryId,
  type JournalEntryType,
  type PostJournalEntryPayload,
  type UpdateJournalEntryPayload,
} from '@/lib/api/accounting';
import {
  CASH_BOX_TRANSFERS_PATH,
  isDirectTransferReference,
} from '@/lib/accounting/journalEntrySource';
import { navigateBackFromEntrySource } from '@/lib/reportReturnState';
import {
  exportJournalLinesTemplate,
  importJournalLinesFromExcel,
} from '@/lib/accounting/journalEntryLinesExcel';
import { companySettingsApi } from '@/lib/api/companySettings';
import { currenciesApi } from '@/lib/api/currencies';
import { journalVoucherTypesApi, type JournalVoucherTypeDto } from '@/lib/api/journalVoucherTypes';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { useActiveFiscalYear, isDateInFiscalYear } from '@/hooks/useActiveFiscalYear';
import { defaultEntryDateForFiscalYear } from '@/lib/fiscalYearDates';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { EntityAuditDialog } from '@/components/audit/EntityAuditDialog';
import { VoucherAttachmentsDialog } from '@/components/accounting/VoucherAttachmentsDialog';
import { voucherAttachmentsApi } from '@/lib/api/attachments';
import { invoicesApi } from '@/lib/api/invoices';
import { inventoryApi } from '@/lib/api/inventory';
import { formatAmountFixed2, cn, extractApiError, toIsoLocalDate, isoDateForBackend } from '@/lib/utils';
import { BranchSelect } from '@/components/branches/BranchSelect';
import { useBranchContext } from '@/lib/branches/useBranchContext';
import type { AccountDto } from '@/types/api';
import { useLocale, localizedName, localizedAccountName, localizedVoucherTypeName } from '@/lib/i18n';

interface FormLine {
  uid: string;
  accountId: number | null;
  accountCode?: string;
  accountName?: string;
  isDebit: boolean;
  amount: number;
  description: string;
}

/** قائمة احتياطية لتُعرض حتى ينتهي تحميل العملات من الإعدادات */
const FALLBACK_CURRENCIES = [
  { code: 'IQD', label: 'دينار عراقي' },
  { code: 'USD', label: 'دولار أمريكي' },
  { code: 'EUR', label: 'يورو' },
  { code: 'SAR', label: 'ريال سعودي' },
  { code: 'AED', label: 'درهم إماراتي' },
];

const ENTRY_TYPE_KEYS: Array<{ value: JournalEntryType; labelKey: string }> = [
  { value: 1, labelKey: 'createJournalEntry.entryTypes.normal' },
  { value: 2, labelKey: 'createJournalEntry.entryTypes.opening' },
];

function newLine(isDebit = true): FormLine {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    accountId: null,
    isDebit,
    amount: 0,
    description: '',
  };
}

// ── Flatten الشجرة إلى قائمة الحسابات الفرعية (Leaf فقط — التي تقبل قيوداً)
function flattenLeafAccounts(tree: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (nodes: AccountDto[]) => {
    for (const n of nodes) {
      if (n.isLeaf) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

interface CreateJournalEntryPageProps {
  /** عند true: عرض القيد فقط بدون أزرار/إمكانية الحفظ والتعديل */
  viewOnly?: boolean;
}

export function CreateJournalEntryPage({ viewOnly = false }: CreateJournalEntryPageProps = {}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id: idParam } = useParams<{ id: string }>();
  const editId = idParam ? Number(idParam) : null;
  const isEdit = editId !== null && !Number.isNaN(editId);
  const isView = viewOnly && isEdit;

  /**
   * عند فتح الصفحة من زر "أصل القيد" في كشف الحساب، يصل state يحتوي
   * مسار الرجوع المخصص. نستخدمه لإظهار زر "رجوع لكشف الحساب" بدل
   * الرجوع الافتراضي لقائمة القيود، ولاستئناف نفس النتائج بعد الحفظ.
   */
  const returnState = (location.state as
    | { returnTo?: string; returnLabel?: string }
    | null) ?? null;
  // ‎كود نوع السند المثبَّت (إن وُجد): يأتي من ?voucherType=JV عند الدخول
  // ‎من سند مختلط في القائمة الجانبية. يقفل الـ dropdown ويُمرّر مسار رجوع
  // ‎مناسب لتقرير ذلك السند.
  const lockedVoucherCode = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return (q.get('voucherType') || '').trim().toUpperCase();
  }, [location.search]);
  const backHref = returnState?.returnTo
    || (lockedVoucherCode ? `/accounting/vouchers/${lockedVoucherCode}` : '/accounting/journal');
  const backLabel = returnState?.returnLabel
    ? t('createJournalEntry.backTo', { label: returnState.returnLabel })
    : t('createJournalEntry.back');
  const backShort = returnState?.returnLabel || t('createJournalEntry.back');

  const handleBack = () => navigateBackFromEntrySource(navigate, backHref, returnState?.returnTo);

  const [entryDate, setEntryDate] = useState(() => toIsoLocalDate(new Date()));
  const [description, setDescription] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [currency, setCurrency] = useState('IQD');
  const [entryType, setEntryType] = useState<JournalEntryType>(1);
  const [voucherTypeId, setVoucherTypeId] = useState<number | null>(null);
  const [postImmediately, setPostImmediately] = useState(true);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [lines, setLines] = useState<FormLine[]>([newLine(true), newLine(false)]);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // ‎فتح نافذة "مراقبة" لهذا القيد (سجل عملياته فقط).
  const [showAudit, setShowAudit] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const voucherTypeAppliedRef = useRef<number | null>(null);
  const linesFileInputRef = useRef<HTMLInputElement>(null);
  const [importingLines, setImportingLines] = useState(false);
  const { requiresBranch, branches, hasBranches } = useBranchContext();

  // ‎حالة الفترة المحاسبية لتاريخ القيد: تتبدّل مع كل تعديل لـ entryDate.
  // ‎عندما تكون الفترة مغلقة/مقفلة (أو السنة مغلقة) ⇒ الصفحة قراءة فقط:
  // ‎تختفي أزرار الحفظ/الحذف ويظهر شريط تنبيه واضح للمستخدم.
  const periodStatusQuery = useQuery({
    queryKey: ['period-status', entryDate],
    queryFn: () => fiscalYearsApi.getPeriodStatusByDate(entryDate),
    enabled: !!entryDate,
    staleTime: 30_000,
  });
  const periodStatus = periodStatusQuery.data ?? null;

  // ‎السنة المالية المُفَعَّلة — مرجع مستقلّ عن الفترات: حتى لو كانت
  // ‎الفترة مفتوحة، لا يُسمح بتعديل قيد ينتمي لسنة مالية أخرى.
  const { activeFiscalYear } = useActiveFiscalYear();
  useEffect(() => {
    if (isEdit) return;
    if (activeFiscalYear) {
      setEntryDate(defaultEntryDateForFiscalYear(activeFiscalYear));
    }
  }, [activeFiscalYear?.id, isEdit]);
  const isPeriodLocked = !!periodStatus && !periodStatus.isEditable;
  const periodLockReason = (() => {
    if (!periodStatus) return null;
    if (periodStatus.fiscalYearIsClosed) return t('createJournalEntry.fyClosedReason', { name: periodStatus.fiscalYearName });
    if (periodStatus.periodStatus === 2) return t('createJournalEntry.periodClosedReason', { num: periodStatus.periodNumber });
    if (periodStatus.periodStatus === 3) return t('createJournalEntry.periodLockedReason', { num: periodStatus.periodNumber });
    return null;
  })();

  // ── جلب الحسابات
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  const leafAccounts = useMemo(
    () => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []),
    [treeQuery.data]
  );

  // ‎حسابات محجوبة (صناديق + وسيط تسوية) — لا يجوز تحريكها عبر قيد عام.
  // ‎الباك إند يفرض القاعدة نفسها.
  const restrictedAccountsQuery = useQuery({
    queryKey: ['accounts', 'journal-restricted-ids'],
    queryFn: () => accountingApi.getJournalRestrictedAccountIds(),
    staleTime: 60_000,
  });
  const restrictedAccountIds = useMemo(
    () => new Set(restrictedAccountsQuery.data ?? []),
    [restrictedAccountsQuery.data],
  );
  const selectableAccounts = useMemo(
    () => leafAccounts.filter(a => !restrictedAccountIds.has(a.id)),
    [leafAccounts, restrictedAccountIds],
  );

  // ── جلب العملات المُفعَّلة بترتيبها من الإعدادات
  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
  });
  const CURRENCIES = useMemo(() => {
    const list = currenciesQuery.data ?? [];
    if (list.length === 0) return FALLBACK_CURRENCIES;
    return list.map(c => ({ code: c.code, label: c.nameAr || c.code }));
  }, [currenciesQuery.data]);

  // ── جلب أنواع السندات المفعّلة
  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });
  const voucherTypes = voucherTypesQuery.data ?? [];
  const selectedVoucherType: JournalVoucherTypeDto | null = useMemo(
    () => (voucherTypeId ? voucherTypes.find(v => v.id === voucherTypeId) ?? null : null),
    [voucherTypeId, voucherTypes]
  );

  // ‎نوع السند المثبَّت من query string (?voucherType=JV)
  const lockedVoucherType: JournalVoucherTypeDto | null = useMemo(() => {
    if (!lockedVoucherCode) return null;
    return voucherTypes.find(v => v.code.toUpperCase() === lockedVoucherCode) ?? null;
  }, [lockedVoucherCode, voucherTypes]);

  // ‎عند الإنشاء مع تثبيت نوع سند: فعّله تلقائياً (مرة واحدة) ليفعل تعبئة الحسابات الافتراضية
  useEffect(() => {
    if (isEdit) return;
    if (!lockedVoucherType) return;
    if (voucherTypeId === lockedVoucherType.id) return;
    setVoucherTypeId(lockedVoucherType.id);
  }, [isEdit, lockedVoucherType, voucherTypeId]);

  // ── إذا تعديل، اجلب القيد
  const editQuery = useQuery({
    queryKey: ['journal-entry', editId],
    queryFn: () => accountingApi.getJournalEntryById(editId!),
    enabled: isEdit,
  });

  /** للقيود القديمة المرتبطة بفاتورة بدون BranchId — نستنتجه من مستودع الفاتورة */
  const invoiceBranchQuery = useQuery({
    queryKey: ['invoice-entry-branch', editQuery.data?.referenceId],
    queryFn: async () => {
      const refId = editQuery.data!.referenceId!;
      const invoice = await invoicesApi.getById(refId);
      if (!invoice.warehouseId) return null;
      const warehouses = await inventoryApi.listWarehousesManage();
      const wh = warehouses.find(w => w.id === invoice.warehouseId);
      return wh?.branchId ?? null;
    },
    enabled:
      isEdit
      && editQuery.data?.branchId == null
      && editQuery.data?.referenceId != null
      && (editQuery.data.referenceType === 'SalesInvoice' || editQuery.data.source === 'SalesInvoice'),
    staleTime: 5 * 60_000,
  });

  const entryAttachmentsQuery = useQuery({
    queryKey: ['voucher-attachments', editId],
    queryFn: () => voucherAttachmentsApi.list(editId!),
    enabled: isEdit && editId != null,
    staleTime: 30_000,
  });
  const entryAttachmentCount = entryAttachmentsQuery.data?.length ?? 0;

  // ‎تاريخ القيد الأصلي كما هو في قاعدة البيانات. نستخدمه (وليس قيمة
  // ‎حقل التاريخ في النموذج) لتقييم انتماء القيد للسنة النشطة، فلا
  // ‎يستطيع المستخدم الالتفاف على القيد عبر تعديل التاريخ في الحقل.
  const originalEntryDate = isEdit ? editQuery.data?.entryDate ?? null : null;
  const isOriginalOutsideActiveFY =
    isEdit &&
    !!activeFiscalYear &&
    !!originalEntryDate &&
    !isDateInFiscalYear(originalEntryDate, activeFiscalYear);
  const outsideFYReason = isOriginalOutsideActiveFY && activeFiscalYear
    ? t('createJournalEntry.outsideFYReason', { date: toIsoLocalDate(new Date(originalEntryDate as string)), name: activeFiscalYear.name })
    : null;

  // ── إعدادات الشركة (للطباعة)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  // ‎نوع السند الخاص بالقيد المُحمّل (إن وُجد) — يُستخدم للتمييز بين Mixed وغيره.
  // ‎مُعرَّف هنا (قبل الـ early returns) للحفاظ على ثبات ترتيب الـ hooks بين الـ renders.
  const loadedEntryVoucherType = useMemo(() => {
    const e = editQuery.data;
    if (!e?.voucherTypeId) return null;
    return voucherTypes.find(v => v.id === e.voucherTypeId) ?? null;
  }, [editQuery.data, voucherTypes]);

  const originalReversalEntryId = editQuery.data
    ? getReversalOriginalEntryId(editQuery.data)
    : null;
  const reversalOriginalQuery = useQuery({
    queryKey: ['journal-entry', 'reversal-original', originalReversalEntryId],
    queryFn: () => accountingApi.getJournalEntryById(originalReversalEntryId!),
    enabled: isEdit && originalReversalEntryId != null,
    staleTime: 60_000,
  });
  const isReversalOfTransfer = reversalOriginalQuery.data
    ? isDirectTransferReference(reversalOriginalQuery.data.referenceType)
    : false;

  useEffect(() => {
    if (!isEdit || !editQuery.data) return;
    const e = editQuery.data;
    setEntryDate(toIsoLocalDate(e.entryDate));
    setDescription(e.description);
    setManualNumber(e.manualNumber ?? '');
    setCurrency(e.currency || 'IQD');
    setEntryType(e.entryType === 'Opening' ? 2 : 1);
    setVoucherTypeId(e.voucherTypeId ?? null);
    setBranchId(e.branchId ?? null);
    voucherTypeAppliedRef.current = e.voucherTypeId ?? null; // تجنّب إعادة ملء الأسطر للمحفوظ
    // ‎في وضع التعديل: استرجع حالة الترحيل من القيد المحفوظ
    setPostImmediately(e.status !== 'Draft');
    setLines(
      e.lines.map(l => ({
        uid: Math.random().toString(36).slice(2, 10),
        accountId: l.accountId,
        accountName: l.accountName ?? undefined,
        isDebit: l.isDebit,
        amount: l.amount,
        description: l.description ?? '',
      }))
    );
  }, [isEdit, editQuery.data]);

  const effectiveBranchId = branchId ?? invoiceBranchQuery.data ?? null;

  const branchDisplayName = useMemo(() => {
    if (effectiveBranchId == null) return null;
    const b = branches.find(x => x.id === effectiveBranchId);
    return b ? localizedName(locale, b.nameAr, b.nameEn) : null;
  }, [effectiveBranchId, branches, locale]);

  const handleClose = () => {
    if (returnState?.returnTo) {
      navigate(returnState.returnTo);
      return;
    }
    const entry = editQuery.data;
    if (
      entry?.referenceId
      && (entry.source === 'SalesInvoice' || entry.source === 'PurchaseInvoice')
    ) {
      navigate(`/invoices/${entry.referenceId}/edit`);
      return;
    }
    navigateBackFromEntrySource(navigate, backHref, returnState?.returnTo);
  };

  const totalDebit = useMemo(
    () => lines.filter(l => l.isDebit).reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines]
  );
  const totalCredit = useMemo(
    () => lines.filter(l => !l.isDebit).reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines]
  );
  const isBalanced = useMemo(
    () => Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0,
    [totalDebit, totalCredit]
  );

  const updateLine = (uid: string, patch: Partial<FormLine>) => {
    setLines(prev => prev.map(l => (l.uid === uid ? { ...l, ...patch } : l)));
  };

  /**
   * عند اختيار نوع السند: نملأ الحسابين الافتراضيين (مدين/دائن) في أوّل سطرين فارغين.
   * لا نلمس الأسطر التي يدوياً تم اختيار حساب فيها أو التي تحوي مبلغًا.
   * نستخدم ref لتجنّب إعادة الملء عند كل re-render، فقط عند تغيير قيمة النوع فعليًا.
   */
  useEffect(() => {
    if (isView) return;
    if (voucherTypeAppliedRef.current === voucherTypeId) return;
    voucherTypeAppliedRef.current = voucherTypeId;
    if (!selectedVoucherType) return;
    setLines(prev => {
      const next = [...prev];
      const tryFill = (
        accountId: number | null | undefined,
        accountName: string | null | undefined,
        accountCode: string | null | undefined,
        wantDebit: boolean,
      ) => {
        if (!accountId) return;
        const idx = next.findIndex(
          l => l.isDebit === wantDebit && !l.accountId && (!l.amount || l.amount <= 0),
        );
        if (idx === -1) return;
        const label = accountCode && accountName
          ? `${accountCode} - ${accountName}`
          : (accountName || accountCode || '');
        next[idx] = {
          ...next[idx],
          accountId,
          accountName: label,
          accountCode: accountCode ?? undefined,
        };
      };
      tryFill(
        selectedVoucherType.defaultDebitAccountId ?? null,
        selectedVoucherType.defaultDebitAccountName ?? null,
        selectedVoucherType.defaultDebitAccountCode ?? null,
        true,
      );
      tryFill(
        selectedVoucherType.defaultCreditAccountId ?? null,
        selectedVoucherType.defaultCreditAccountName ?? null,
        selectedVoucherType.defaultCreditAccountCode ?? null,
        false,
      );
      return next;
    });
  }, [voucherTypeId, selectedVoucherType, isView]);

  const removeLine = (uid: string) => {
    setLines(prev => (prev.length <= 2 ? prev : prev.filter(l => l.uid !== uid)));
  };

  const addLine = (isDebit: boolean) => {
    setLines(prev => [...prev, newLine(isDebit)]);
  };

  const handleExportLines = () => {
    exportJournalLinesTemplate(leafAccounts, locale, 'journal-lines-template');
    toast.success(t('createJournalEntry.excel.exportDone'));
  };

  const handleImportLinesFile = async (file: File) => {
    setImportingLines(true);
    try {
      const result = await importJournalLinesFromExcel(file, leafAccounts);
      if (result.imported === 0) {
        toast.error(t('createJournalEntry.excel.importNone'));
        return;
      }
      setLines(result.lines.map(l => ({
        uid: l.uid,
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        isDebit: l.isDebit,
        amount: l.amount,
        description: l.description,
      })));
      setError(null);
      const parts: string[] = [t('createJournalEntry.excel.importDone', { count: result.imported })];
      if (result.unknownAccounts.length > 0) {
        const preview = result.unknownAccounts.slice(0, 5).join('، ');
        const more = result.unknownAccounts.length > 5
          ? t('createJournalEntry.excel.andMore', { count: result.unknownAccounts.length - 5 })
          : '';
        parts.push(t('createJournalEntry.excel.skippedAccounts', {
          count: result.unknownAccounts.length,
          list: `${preview}${more}`,
        }));
        toast.warning(parts.join(' — '));
      } else {
        toast.success(parts[0]);
      }
    } catch (e) {
      toast.error(extractApiError(e, t('createJournalEntry.excel.importFailed')));
    } finally {
      setImportingLines(false);
      if (linesFileInputRef.current) linesFileInputRef.current.value = '';
    }
  };

  // ── الحفظ
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: PostJournalEntryPayload | UpdateJournalEntryPayload = {
        entryDate: isoDateForBackend(entryDate),
        description: description.trim(),
        entryType,
        currency,
        postImmediately,
        voucherTypeId: voucherTypeId ?? null,
        branchId: branchId ?? null,
        manualNumber: manualNumber.trim() || null,
        lines: lines.map(l => ({
          accountId: l.accountId!,
          isDebit: l.isDebit,
          amount: Number(l.amount),
          description: l.description?.trim() || null,
        })),
      };
      if (isEdit) {
        return accountingApi.updateJournalEntry(editId!, payload as UpdateJournalEntryPayload);
      }
      return accountingApi.postJournalEntry(payload as PostJournalEntryPayload);
    },
    onSuccess: res => {
      if (!res.success) {
        const msg = extractApiError(res, t('createJournalEntry.saveFailed'));
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(isEdit ? t('createJournalEntry.saveSuccessEdit') : t('createJournalEntry.saveSuccessCreate'));
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      handleBack();
    },
    onError: (err: any) => {
      const msg = extractApiError(err, t('createJournalEntry.saveFailed'));
      setError(msg);
      toast.error(msg);
    },
  });

  // ── حذف القيد (وضع التعديل فقط)
  const deleteMutation = useMutation({
    mutationFn: () => accountingApi.deleteJournalEntry(editId!),
    onSuccess: res => {
      if (!res.success) {
        const msg = extractApiError(res, t('createJournalEntry.deleteFailed'));
        toast.error(msg);
        return;
      }
      toast.success(t('createJournalEntry.deleteSuccess'));
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      handleBack();
    },
    onError: (err: any) => {
      toast.error(extractApiError(err, t('createJournalEntry.deleteFailed')));
    },
  });

  // ── الانتقال لإنشاء قيد جديد بنفس نوع السند (إن وُجد)
  const handleCreateNew = () => {
    const code = editQuery.data?.voucherTypeCode || lockedVoucherCode;
    const target = code
      ? `/accounting/journal/new?voucherType=${encodeURIComponent(code)}`
      : '/accounting/journal/new';
    navigate(target);
  };

  const validate = (): string | null => {
    if (lines.length < 2) return t('createJournalEntry.validation.minLines');
    for (const l of lines) {
      if (!l.accountId) return t('createJournalEntry.validation.missingAccount');
      if (!l.amount || l.amount <= 0) return t('createJournalEntry.validation.zeroAmount');
    }
    if (!isBalanced) return t('createJournalEntry.validation.notBalanced');
    if (isOriginalOutsideActiveFY && activeFiscalYear) {
      return t('createJournalEntry.validation.outsideFY', { name: activeFiscalYear.name });
    }
    if (requiresBranch && branchId == null) {
      return 'يجب اختيار الفرع';
    }
    return null;
  };

  const handleSave = () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      toast.error(v);
      return;
    }
    saveMutation.mutate();
  };

  const handlePrint = async () => {
    if (!isEdit || !editId) return;
    let printed: import('@/types/api').JournalEntryDto | null = null;
    try {
      const fresh = await accountingApi.getJournalEntryById(editId);
      printSingleJournalEntry(fresh, companyQuery.data ?? null);
      printed = fresh;
    } catch {
      if (editQuery.data) {
        printSingleJournalEntry(editQuery.data, companyQuery.data ?? null);
        printed = editQuery.data;
      } else {
        toast.error(t('createJournalEntry.printLoadFailed'));
      }
    }
    if (printed) {
      // ‎سجل عملية الطباعة في سجل المراقبة (لا يُفشل الطباعة إن فشل التسجيل).
      void auditApi.logPrint({
        entityType: printed.voucherTypeId ? 'Voucher' : 'JournalEntry',
        entityId: printed.id,
        summary: printed.voucherNumber
          ? `طباعة سند ${printed.voucherNumber} — ${printed.description}`
          : `طباعة قيد ${printed.entryNumber} — ${printed.description}`,
        details: {
          entryNumber: printed.entryNumber,
          voucherNumber: printed.voucherNumber,
          manualNumber: printed.manualNumber,
        },
      });
    }
  };

  if (treeQuery.isLoading || (isEdit && editQuery.isLoading) || voucherTypesQuery.isLoading) {
    return <LoadingSpinner text={t('createJournalEntry.loading')} />;
  }

  // ‎عند إنشاء قيد جديد من نافذة "القيود اليومية" مباشرةً، نمنع إنشاء
  // ‎"قيد عام بدون نوع سند" إذا كانت هناك أنواع سندات مفعَّلة كصفحات مستقلّة.
  // ‎هذا يضمن أن جميع القيود تُنشأ من خلال نوع سند مخصّص ويحافظ على
  // ‎تماسك التقارير (كل نوع له صفحته الخاصة، وصفحة "القيود اليومية" تبقى
  // ‎للعرض والتقرير فقط).
  const hasSidebarVoucherTypes = voucherTypes.some(v => v.showInSidebar);
  // ‎شاشة الحماية: تُعرض فقط عند الإنشاء العام بدون تثبيت نوع سند.
  // ‎إذا وصلنا عبر `?voucherType=XX` (مثلاً سند مختلط من القائمة الجانبية)،
  // ‎نسمح بفتح النموذج لأن المستخدم اختار النوع بالفعل.
  if (!isEdit && !isView && hasSidebarVoucherTypes && !lockedVoucherType) {
    const sidebarTypes = voucherTypes
      .filter(v => v.showInSidebar)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-lg border border-amber-400/40 bg-amber-400/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <h2 className="mb-2 text-base font-semibold">{t('createJournalEntry.restrictedTitle')}</h2>
          <p className="mb-1 text-sm text-muted-foreground">
            {t('createJournalEntry.restrictedDesc')}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            {t('createJournalEntry.restrictedChoose')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {sidebarTypes.slice(0, 6).map(v => (
              <Button
                key={v.id}
                size="sm"
                variant="outline"
                onClick={() => navigate(`/accounting/vouchers/${v.code}/new`)}
                className="h-8 gap-1.5"
                title={v.description ?? undefined}
              >
                <Plus className="h-3.5 w-3.5" />
                {localizedVoucherTypeName(locale, v.nameAr, v.nameEn)}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="h-8 gap-1.5 text-muted-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {t('createJournalEntry.back')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ‎في وضع التعديل: إذا كان القيد مولّداً من سند أو فاتورة، اعرض رسالة وتحويل تلقائي
  const loadedEntry = editQuery.data;
  // ‎السندات المختلطة (Mixed) تُحرَّر مباشرةً من هذه الصفحة — لا تُعدّ "مُدارة"
  const isManagedEntry = !!loadedEntry && (
    (!!loadedEntry.voucherTypeId && loadedEntryVoucherType?.nature !== 'Mixed') ||
    (!!loadedEntry.source && loadedEntry.source !== 'Manual')
  );
  if (isEdit && !isView && isManagedEntry && loadedEntry) {
    const goSource = () => {
      if (loadedEntry.voucherTypeId && loadedEntry.voucherTypeCode) {
        navigate(`/accounting/vouchers/${loadedEntry.voucherTypeCode}/${loadedEntry.id}/edit`);
        return;
      }
      if ((loadedEntry.source === 'SalesInvoice' || loadedEntry.source === 'PurchaseInvoice') && loadedEntry.referenceId) {
        navigate(`/invoices/${loadedEntry.referenceId}/edit`);
        return;
      }
      navigate(`/accounting/journal/${loadedEntry.id}/view`);
    };
    const sourceLabel = loadedEntry.voucherTypeName
      || (loadedEntry.source === 'SalesInvoice' ? t('createJournalEntry.sourceLabels.SalesInvoice')
        : loadedEntry.source === 'PurchaseInvoice' ? t('createJournalEntry.sourceLabels.PurchaseInvoice')
        : loadedEntry.source === 'Payment' ? t('createJournalEntry.sourceLabels.Payment')
        : loadedEntry.source === 'Receipt' ? t('createJournalEntry.sourceLabels.Receipt')
        : loadedEntry.source === 'StockMovement' ? t('createJournalEntry.sourceLabels.StockMovement')
        : t('createJournalEntry.sourceLabels.default'));
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-amber-400/40 bg-amber-400/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <h2 className="mb-2 text-base font-semibold">{t('createJournalEntry.managedTitle')}</h2>
          <p className="mb-1 text-sm text-muted-foreground">
            {t('createJournalEntry.managedDesc', { num: loadedEntry.voucherNumber ?? `#${loadedEntry.entryNumber}`, source: sourceLabel })}
          </p>
          <p className="mb-5 text-xs text-muted-foreground">
            {t('createJournalEntry.managedNote')}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" onClick={goSource} className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {t('createJournalEntry.openSource')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/accounting/journal/${loadedEntry.id}/view`)}
              className="gap-1.5"
            >
              {t('createJournalEntry.viewOnly')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/accounting/journal')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* شريط أدوات علوي مدمج */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isView ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="h-8 gap-1.5"
              title={t('common.close')}
            >
              <X className="h-3.5 w-3.5" />
              {t('common.close')}
            </Button>
          ) : (
            <Button
              variant={returnState?.returnTo ? 'default' : 'outline'}
              size="sm"
              onClick={handleBack}
              className={cn(
                'h-8 gap-1 px-2',
                returnState?.returnTo && 'gap-1.5 bg-primary/90 hover:bg-primary'
              )}
              title={backLabel}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>{backShort}</span>
            </Button>
          )}
          <h1 className="flex items-center gap-1.5 text-base font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            {isView ? t('createJournalEntry.view') : (isEdit ? t('createJournalEntry.edit') : t('createJournalEntry.create'))}
            {isEdit && editQuery.data?.entryNumber && (
              <>
                {editQuery.data.voucherNumber ? (
                  <>
                    <span className="num-display rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
                      {editQuery.data.voucherNumber}
                    </span>
                    <span
                      className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title={t('createJournalEntry.internalNumberTip')}
                    >
                      #{editQuery.data.entryNumber}
                    </span>
                  </>
                ) : (
                  <span className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                    #{editQuery.data.entryNumber}
                  </span>
                )}
              </>
            )}
            {isView && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                {t('createJournalEntry.readOnlyBadge')}
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isView && hasBranches && branchDisplayName && (
            <div
              className="flex h-8 max-w-[160px] items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2 text-xs text-muted-foreground"
              title={t('branches.branch', { defaultValue: 'الفرع' })}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary/80" />
              <span className="truncate">{branchDisplayName}</span>
            </div>
          )}
          {isEdit && !isView && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              title={t('createJournalEntry.newSameType')}
              className="h-8 gap-1.5"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              {t('createJournalEntry.newSameType')}
            </Button>
          )}
          {isEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              title={t('createJournalEntry.print')}
              className="h-8 gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              {t('createJournalEntry.print')}
            </Button>
          )}
          {isEdit && originalReversalEntryId != null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isReversalOfTransfer) {
                  navigate(CASH_BOX_TRANSFERS_PATH);
                  return;
                }
                navigate(`/accounting/journal/${originalReversalEntryId}/view`);
              }}
              title={
                isReversalOfTransfer
                  ? t('createJournalEntry.openTransferSourceTip')
                  : t('createJournalEntry.viewOriginalEntryTip', { num: originalReversalEntryId })
              }
              className="h-8 gap-1.5 border-sky-500/60 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {isReversalOfTransfer
                ? t('createJournalEntry.openTransferSource')
                : t('createJournalEntry.viewOriginalEntry', { num: originalReversalEntryId })}
            </Button>
          )}
          {/*
            زرّ "مراقبة": يفتح نافذة سجل عمليات هذا القيد (إضافة/تعديل/حذف/طباعة).
            متاح في وضعَي التعديل والعرض لأن السجل قراءة فقط ولا يتعارض مع قفل
            الفترة أو وضع القيد خارج السنة المالية.
          */}
          {isEdit && editId != null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAudit(true)}
              title={t('audit.openButtonTip')}
              className="h-8 gap-1.5 border-violet-500/60 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
            >
              <History className="h-3.5 w-3.5" />
              {t('audit.openButton')}
            </Button>
          )}
          {isEdit && editId != null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchive(true)}
              title={t('attachments.openButtonTip')}
              className="h-8 gap-1.5 border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
            >
              <Archive className="h-3.5 w-3.5" />
              {t('attachments.openButton')}
            </Button>
          )}
          {/*
            • قيود مولَّدة من مناقلات الصناديق (CashBoxTransfer / CashBoxTransferReversal)
              مقفولة من التعديل في هذه الصفحة وفي السندات؛ يجب التعديل من
              نافذة المناقلات نفسها (صفحة الصناديق ⇒ تبويب "المناقلات").
              لذا نُخفي زرّ "تعديل" نهائياً للمستخدم حتى لا يصل إلى رسالة
              قفل من السيرفر.
          */}
          {isView && editId && !isPeriodLocked && !isOriginalOutsideActiveFY
            && loadedEntry?.referenceType !== 'CashBoxTransfer'
            && loadedEntry?.referenceType !== 'CashBoxTransferReversal' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/accounting/journal/${editId}/edit`)}
              className="h-8 gap-1.5"
              title={t('createJournalEntry.editEntryTip')}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('createJournalEntry.editEntry')}
            </Button>
          )}
          {isView
            && (loadedEntry?.referenceType === 'CashBoxTransfer'
              || loadedEntry?.referenceType === 'CashBoxTransferReversal') && (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 text-[11px] font-medium text-amber-500"
              title={t('createJournalEntry.cashBoxTransferTip')}
            >
              {t('createJournalEntry.cashBoxTransfer')}
            </span>
          )}
          {/*
            • تختفي أزرار الحفظ/الحذف عند:
              - فترة مغلقة (isPeriodLocked)
              - أو قيد خارج السنة المالية النشطة (isOriginalOutsideActiveFY)
              ويُستبدل بشريط "قراءة فقط".
          */}
          {isEdit && !isView && !isPeriodLocked && !isOriginalOutsideActiveFY && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              title={t('createJournalEntry.deleteTip')}
              className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('createJournalEntry.delete')}
            </Button>
          )}
          {!isView && !isPeriodLocked && !isOriginalOutsideActiveFY && (
            <label className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={postImmediately}
                onChange={e => setPostImmediately(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>{t('createJournalEntry.postImmediately')}</span>
            </label>
          )}
          {!isView && !isPeriodLocked && !isOriginalOutsideActiveFY && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || !isBalanced}
              className="h-8 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? t('createJournalEntry.saving') : t('createJournalEntry.save')}
            </Button>
          )}
          {!isView && (isPeriodLocked || isOriginalOutsideActiveFY) && (
            <span className="flex h-8 items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 text-xs text-warning">
              <Lock className="h-3.5 w-3.5" />
              {t('createJournalEntry.readOnly')}
            </span>
          )}
        </div>
      </div>

      {/* شريط تنبيه واضح يشرح لماذا الصفحة في وضع القراءة فقط */}
      {!isView && isPeriodLocked && periodLockReason && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{periodLockReason} — {t('createJournalEntry.periodLockedNote')}</div>
            <div className="mt-0.5 text-[11px] text-warning/80">
              {t('createJournalEntry.periodLockedHint')}
            </div>
          </div>
        </div>
      )}

      {/* شريط تنبيه: القيد خارج السنة المالية النشطة */}
      {!isView && isOriginalOutsideActiveFY && outsideFYReason && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{outsideFYReason}</div>
            <div className="mt-0.5 text-[11px] text-rose-300/80">
              {t('createJournalEntry.outsideFYHint')}
            </div>
          </div>
        </div>
      )}

      {/* رأس القيد - سطر واحد */}
      <div className={cn(
        'grid gap-2 rounded-md border border-border bg-card/50 p-2 md:grid-cols-12',
        isView && 'opacity-95'
      )}>
        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">{t('createJournalEntry.form.date')}</Label>
          <Input
            type="date"
            value={entryDate}
            onChange={e => setEntryDate(e.target.value)}
            className="h-8 text-xs"
            readOnly={isView}
            disabled={isView}
          />
        </div>

        <div className="md:col-span-3">
          <Label className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t('createJournalEntry.form.voucherType')}</span>
            {selectedVoucherType?.code && (
              <span className="num-display rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary">
                {selectedVoucherType.code}
              </span>
            )}
          </Label>
          {isEdit ? (
            // ‎في وضع التعديل/العرض: نوع السند جزء من هوية القيد ولا يُغيَّر.
            // ‎تسمية للقراءة فقط لمعرفة من أي سند أُنشئ القيد.
            <div
              className="flex h-8 w-full items-center rounded-md border border-input bg-secondary/30 px-2 text-xs text-foreground/85"
              title={t('createJournalEntry.voucherTypeLocked')}
            >
              {selectedVoucherType
                ? localizedVoucherTypeName(locale, selectedVoucherType.nameAr, selectedVoucherType.nameEn)
                : t('createJournalEntry.noVoucherType')}
            </div>
          ) : (
            <select
              value={voucherTypeId ?? ''}
              onChange={e => {
                const v = e.target.value;
                setVoucherTypeId(v === '' ? null : Number(v));
              }}
              disabled={!!lockedVoucherType}
              className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
              title={lockedVoucherType ? t('createJournalEntry.voucherTypeLockedShort') : (selectedVoucherType?.description ?? undefined)}
            >
              {!lockedVoucherType && <option value="">{t('createJournalEntry.noVoucherType')}</option>}
              {voucherTypes.map(v => (
                <option key={v.id} value={v.id}>{localizedVoucherTypeName(locale, v.nameAr, v.nameEn)}</option>
              ))}
            </select>
          )}
        </div>

        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">{t('createJournalEntry.form.currency')}</Label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            disabled={isView}
            className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">{t('createJournalEntry.form.entryType')}</Label>
          <select
            value={entryType}
            onChange={e => setEntryType(Number(e.target.value) as JournalEntryType)}
            disabled={isView}
            className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
          >
            {ENTRY_TYPE_KEYS.map(et => (
              <option key={et.value} value={et.value}>{t(et.labelKey)}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <Label className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t('createJournalEntry.form.description')}</span>
            <span className="num-display">{description.length}/200</span>
          </Label>
          <Input
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 200))}
            maxLength={200}
            placeholder={t('createJournalEntry.form.descriptionPlaceholder')}
            className="h-8 text-xs"
            readOnly={isView}
            disabled={isView}
          />
        </div>

        {/*
          الرقم اليدوي:
          حقل اختياري يُسجّل فيه المستخدم رقم شيك / إيصال خارجي / مستند ورقي
          مرتبط بالقيد. مستقل عن EntryNumber (المسلسل الداخلي) و VoucherNumber
          (المسلسل التلقائي للسند). يدخل في فلتر البحث على صفحة القيود.
        */}
        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">
            {t('createJournalEntry.form.manualNumber', { defaultValue: 'Manual number' })}
          </Label>
          <Input
            value={manualNumber}
            onChange={e => setManualNumber(e.target.value.slice(0, 50))}
            maxLength={50}
            placeholder={t('createJournalEntry.form.manualNumberPlaceholder', { defaultValue: 'Check / external ref…' })}
            className="h-8 num-display text-xs"
            readOnly={isView}
            disabled={isView}
            dir="ltr"
          />
        </div>

        {!isView && (
          <BranchSelect
            className="md:col-span-2"
            value={branchId}
            onChange={setBranchId}
          />
        )}
      </div>

      {/* البنود - يأخذ كامل المساحة المتبقية */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span>{t('createJournalEntry.lines.title')}</span>
            <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t('createJournalEntry.lines.count', { count: lines.length })}
            </span>
          </div>
          {!isView && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportLines}
                className="h-7 gap-1 px-2 text-xs"
                title={t('createJournalEntry.excel.exportTip')}
              >
                <Upload className="h-3 w-3" />
                {t('createJournalEntry.excel.export')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => linesFileInputRef.current?.click()}
                disabled={importingLines}
                className="h-7 gap-1 px-2 text-xs"
                title={t('createJournalEntry.excel.importTip')}
              >
                <Download className="h-3 w-3" />
                {importingLines ? t('createJournalEntry.excel.importing') : t('createJournalEntry.excel.import')}
              </Button>
              <input
                ref={linesFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportLinesFile(f);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => addLine(true)} className="h-7 gap-1 px-2 text-xs">
                <Plus className="h-3 w-3" />
                {t('createJournalEntry.lines.addLine')}
              </Button>
            </div>
          )}
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto"
          aria-disabled={isView || undefined}
        >
          {/* في وضع العرض: نُبقي حاوية التمرير قابلة للتمرير ونعطّل التفاعل على المحتوى فقط */}
          <div className={cn(isView && 'pointer-events-none select-none opacity-95')}>
          {/* table-fixed لضمان احترام عرض كل عمود.
              الترتيب RTL (يمين→يسار): ت | مدين | دائن | الحساب | البيان */}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[28%]" />
              <col className="w-[26%]" />
              <col className="w-10" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-secondary/60 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-1.5 text-center">#</th>
                <th className="p-1.5 text-center">{t('createJournalEntry.lines.debit')}</th>
                <th className="p-1.5 text-center">{t('createJournalEntry.lines.credit')}</th>
                <th className="p-1.5 text-center">{t('createJournalEntry.lines.account')}</th>
                <th className="p-1.5 text-center">{t('createJournalEntry.lines.description')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <LineRow
                  key={line.uid}
                  index={idx + 1}
                  line={line}
                  accounts={selectableAccounts}
                  onChange={patch => updateLine(line.uid, patch)}
                  onRemove={() => removeLine(line.uid)}
                  canRemove={!isView && lines.length > 2}
                  currency={currency}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* شريط المجاميع */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">{t('createJournalEntry.totals.debit')}:</span>
              <span className="num-display font-semibold text-emerald-400">
                {formatAmountFixed2(totalDebit)} {currency}
              </span>
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">{t('createJournalEntry.totals.credit')}:</span>
              <span className="num-display font-semibold text-rose-400">
                {formatAmountFixed2(totalCredit)} {currency}
              </span>
            </span>
            <span className="h-3.5 w-px bg-border" />
            {isBalanced ? (
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {t('createJournalEntry.totals.balanced')}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {t('createJournalEntry.totals.diff')}: <span className="num-display">{formatAmountFixed2(Math.abs(totalDebit - totalCredit))}</span>
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-destructive/20">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/*
        مودال "مراقبة": سجل عمليات هذا القيد فقط (إضافة/تعديل/حذف/طباعة).
        نوع الكيان يتغيّر بحسب نوع المصدر — إذا كان القيد مرتبطاً بنوع سند مخصّص
        نعرضه ككيان Voucher، وإلا فهو JournalEntry عادي.
      */}
      {showAudit && editId != null && (
        <EntityAuditDialog
          open={showAudit}
          onClose={() => setShowAudit(false)}
          entityType={loadedEntry?.voucherTypeId ? 'Voucher' : 'JournalEntry'}
          entityId={editId}
          subtitle={
            loadedEntry?.voucherNumber
              ? `${loadedEntry.voucherNumber}${loadedEntry.entryNumber ? ` · #${loadedEntry.entryNumber}` : ''}`
              : loadedEntry?.entryNumber
                ? `#${loadedEntry.entryNumber}`
                : undefined
          }
        />
      )}

      {/* أرشيف القيد: ملفات/صور مرفقة (شيكات، إيصالات، …). */}
      {showArchive && editId != null && (
        <VoucherAttachmentsDialog
          open={showArchive}
          onClose={() => setShowArchive(false)}
          entryId={editId}
          subtitle={
            loadedEntry?.voucherNumber
              ? `${loadedEntry.voucherNumber}${loadedEntry.entryNumber ? ` · #${loadedEntry.entryNumber}` : ''}`
              : loadedEntry?.entryNumber
                ? `#${loadedEntry.entryNumber}`
                : undefined
          }
        />
      )}

      {/* مودال تأكيد الحذف */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="font-semibold">{t('createJournalEntry.deleteConfirm.title')}</h3>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p>
                {t('createJournalEntry.deleteConfirm.body', { num: editQuery.data?.voucherNumber ?? `#${editQuery.data?.entryNumber ?? ''}` })}
              </p>
              {editQuery.data && (
                <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <div>{t('createJournalEntry.deleteConfirm.descLabel')}: {editQuery.data.description}</div>
                  <div>
                    {t('createJournalEntry.deleteConfirm.amountLabel')}: {formatAmountFixed2(editQuery.data.totalDebit)} {editQuery.data.currency || 'IQD'}
                  </div>
                </div>
              )}
              {entryAttachmentCount > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                  <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t('createJournalEntry.deleteConfirm.attachmentsWarning', {
                      count: entryAttachmentCount,
                      defaultValue: entryAttachmentCount === 1
                        ? 'سوف يُحذف ملف واحد مرفق من أرشيف السند.'
                        : `سوف تُحذف ${entryAttachmentCount} ملفات مرفقة من أرشيف السند.`,
                    })}
                  </span>
                </p>
              )}
              <p className="text-xs text-amber-400">{t('createJournalEntry.deleteConfirm.irreversible')}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-3">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? t('createJournalEntry.deleteConfirm.deleting') : t('createJournalEntry.deleteConfirm.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// صف بند مع AccountPicker
// ─────────────────────────────────────────
function LineRow({
  index, line, accounts, onChange, onRemove, canRemove,
}: {
  index: number;
  line: FormLine;
  accounts: AccountDto[];
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
  currency?: string;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/20">
      <td className="p-1 text-center text-xs text-muted-foreground">{index}</td>
      <td className="p-1 align-top">
        <AmountInput
          value={line.isDebit ? line.amount : 0}
          active={line.isDebit}
          onChange={n => onChange({ isDebit: true, amount: n })}
          onFocus={() => !line.isDebit && onChange({ isDebit: true, amount: 0 })}
          className={cn('border-emerald-500/50', !line.isDebit && 'opacity-50')}
        />
      </td>
      <td className="p-1 align-top">
        <AmountInput
          value={!line.isDebit ? line.amount : 0}
          active={!line.isDebit}
          onChange={n => onChange({ isDebit: false, amount: n })}
          onFocus={() => line.isDebit && onChange({ isDebit: false, amount: 0 })}
          className={cn('border-rose-500/50', line.isDebit && 'opacity-50')}
        />
      </td>
      <td className="p-1 align-top">
        <AccountPicker
          accounts={accounts}
          value={line.accountId}
          initialLabel={
            line.accountName ||
            (line.accountId
              ? accounts.find(a => a.id === line.accountId)?.code +
                ' - ' +
                accounts.find(a => a.id === line.accountId)?.nameAr
              : '')
          }
          onChange={(id, label) => onChange({ accountId: id, accountName: label })}
        />
      </td>
      <td className="p-1 align-top">
        <Input
          value={line.description}
          onChange={e => onChange({ description: e.target.value.slice(0, 150) })}
          maxLength={150}
          placeholder={t('createJournalEntry.lines.descPlaceholder')}
          className="h-8 text-xs"
          title={line.description}
        />
      </td>
      <td className="p-1 align-top">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
          title={t('createJournalEntry.lines.deleteTip')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────
// AmountInput — يدعم 0.5 و 0.05 وكل القيم العشرية بحرية
// يحتفظ بنص العرض داخلياً ولا يُحوِّله إلى رقم إلا عند الحاجة
// ─────────────────────────────────────────
function AmountInput({
  value,
  active,
  onChange,
  onFocus,
  className,
}: {
  value: number;
  active: boolean;
  onChange: (n: number) => void;
  onFocus?: () => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(value > 0 ? String(value) : '');
  const editingRef = useRef(false);

  // مزامنة عند تغيير value من الخارج (مثلاً عند تحميل قيد للتعديل أو تبديل مدين/دائن)
  useEffect(() => {
    if (editingRef.current) return;
    const cur = parseFloat(text) || 0;
    if (Math.abs(cur - value) > 0.0000001) {
      setText(value > 0 ? String(value) : '');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // إذا غير-active نظِّف النص (للسطر الجانب الآخر)
  useEffect(() => {
    if (!active) setText('');
  }, [active]);

  const handleChange = (raw: string) => {
    // اسمح بـ: فارغ | رقم | نقطة | كسر عشري بأي عدد منازل
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      editingRef.current = true;
      setText(raw);
      const n = raw === '' || raw === '.' ? 0 : parseFloat(raw);
      onChange(Number.isNaN(n) ? 0 : n);
    }
  };

  const handleBlur = () => {
    editingRef.current = false;
    // طبِّع: أزل النقاط الزائدة في النهاية
    if (text.endsWith('.')) {
      setText(text.slice(0, -1));
    }
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={active ? text : ''}
      onChange={e => handleChange(e.target.value)}
      onFocus={onFocus}
      onBlur={handleBlur}
      placeholder="—"
      className={cn('h-8 text-left num-display text-xs', className)}
    />
  );
}

// ─────────────────────────────────────────
// AccountPicker — Combobox: input مباشر + بحث فوري
// ─────────────────────────────────────────
function AccountPicker({
  accounts,
  value,
  initialLabel,
  onChange,
}: {
  accounts: AccountDto[];
  value: number | null;
  initialLabel?: string;
  onChange: (id: number, label: string) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** اسم الحساب بحسب اللغة الحالية مع fallback إلى القاموس الافتراضي. */
  const displayName = (a: AccountDto) =>
    localizedAccountName(locale, a.nameAr, a.nameEn);

  // النص الافتراضي عند عدم التركيز (الحساب المختار حالياً)
  const selectedLabel = useMemo(() => {
    if (initialLabel) return initialLabel;
    if (value) {
      const a = accounts.find(x => x.id === value);
      return a ? `${a.code} - ${displayName(a)}` : '';
    }
    return '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, accounts, initialLabel, locale]);

  // النتائج المرتّبة: تطابق تام → بدء الكود → بدء الاسم → احتواء
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 60);

    const exact: AccountDto[] = [];
    const startsCode: AccountDto[] = [];
    const startsName: AccountDto[] = [];
    const contains: AccountDto[] = [];

    for (const a of accounts) {
      const code = (a.code ?? '').toLowerCase();
      const nameAr = (a.nameAr ?? '').toLowerCase();
      const nameEn = (a.nameEn ?? '').toLowerCase();
      if (code === q) exact.push(a);
      else if (code.startsWith(q)) startsCode.push(a);
      else if (nameAr.startsWith(q) || nameEn.startsWith(q)) startsName.push(a);
      else if (code.includes(q) || nameAr.includes(q) || nameEn.includes(q)) contains.push(a);
    }
    return [...exact, ...startsCode, ...startsName, ...contains].slice(0, 60);
  }, [accounts, query]);

  // إغلاق عند النقر خارج الحقل
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // إعادة تعيين highlight عند تغيير النتائج
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const select = (a: AccountDto) => {
    onChange(a.id, `${a.code} - ${displayName(a)}`);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = filtered[highlight];
      if (a) select(a);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={open ? query : selectedLabel}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKey}
          placeholder={selectedLabel || t('createJournalEntry.accountPicker.placeholder', { defaultValue: 'Search by account number or name…' })}
          className={cn('h-8 pr-7 pl-2 text-xs', !value && !open && 'text-muted-foreground')}
        />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[280px] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {t('createJournalEntry.accountPicker.noResults', { query, defaultValue: 'No results for "{{query}}"' })}
              </div>
            ) : (
              filtered.map((a, idx) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    select(a);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-sm transition-colors',
                    locale === 'ar' ? 'text-right' : 'text-left',
                    idx === highlight ? 'bg-primary/15' : 'hover:bg-secondary/60',
                    a.id === value && 'font-semibold'
                  )}
                >
                  <span className="num-display text-xs text-muted-foreground shrink-0 min-w-[60px]">
                    {a.code}
                  </span>
                  <span className="flex-1 truncate">{displayName(a)}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            {filtered.length} نتيجة • ↑↓ للتنقل • Enter للاختيار
          </div>
        </div>
      )}
    </div>
  );
}
