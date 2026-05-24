import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, Save, Wallet, Banknote, AlertTriangle, BookOpen, X, ArrowDownLeft, ArrowUpRight, Pencil,
  Trash2, FilePlus2, Printer, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { accountingApi, type PostJournalEntryPayload, type UpdateVoucherEntryPayload } from '@/lib/api/accounting';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { cashBoxesApi, type CashBoxDto } from '@/lib/api/cashBoxes';
import { currenciesApi } from '@/lib/api/currencies';
import { companySettingsApi } from '@/lib/api/companySettings';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { useActiveFiscalYear, isDateInFiscalYear } from '@/hooks/useActiveFiscalYear';
import { printSingleVoucher } from '@/lib/printUtils';
import { usePermissions } from '@/lib/auth/usePermissions';
import { cn, formatAmount, extractApiError, toIsoLocalDate, isoDateForBackend } from '@/lib/utils';
import type { AccountDto } from '@/types/api';

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

/** مكوّن صغير لإعادة التوجيه برمجياً مع التعويض عن النافذة الزمنية بين الـ render وبين useEffect */
function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return <LoadingSpinner text="جارٍ التحويل..." />;
}

/**
 * صفحة السند المستقل (سند قبض/دفع/…).
 * تتلقى كود نوع السند من الرابط، تستخدم طبيعة السند لتحديد:
 *  - Debit: الصندوق مدين، الحساب الآخر دائن (سند قبض)
 *  - Credit: الصندوق دائن، الحساب الآخر مدين (سند دفع)
 * تواجه المستخدم بحقول مبسّطة: الصندوق + الحساب الآخر + المبلغ + العملة + البيان.
 * تحفظ كقيد عادي مع voucherTypeId للتمييز لاحقاً في القوائم.
 */
export function VoucherEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { code: codeParam, id: idParam } = useParams<{ code: string; id?: string }>();
  const code = (codeParam ?? '').toUpperCase();
  // وضع التعديل: id موجود في الرابط
  const editingId = idParam ? Number(idParam) : null;
  const isEditMode = editingId !== null && !Number.isNaN(editingId);

  // جلب نوع السند بالكود
  const typesQuery = useQuery({
    queryKey: ['voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });
  const voucherType = useMemo(
    () => (typesQuery.data ?? []).find(t => t.code.toUpperCase() === code) ?? null,
    [typesQuery.data, code]
  );

  // الصناديق النشطة
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'active'],
    queryFn: () => cashBoxesApi.getAll(true),
    staleTime: 60_000,
  });
  const cashBoxes = cashBoxesQuery.data ?? [];

  // ‎الصناديق المتاحة للمستخدم الحالي:
  //   • SuperAdmin أو لا توجد قيود (cashBoxIds فارغة) → كل الصناديق النشطة.
  //   • مستخدم عادي → فقط الصناديق التي يملك صلاحية استخدامها.
  // ‎الترتيب يتبع ترتيب القائمة الأصلية (displayOrder من الـ API).
  const { cashBoxIds, isSuper } = usePermissions();
  const allowedBoxes = useMemo(() => {
    if (isSuper || cashBoxIds.length === 0) return cashBoxes;
    const allowedSet = new Set(cashBoxIds);
    return cashBoxes.filter(b => allowedSet.has(b.id));
  }, [cashBoxes, cashBoxIds, isSuper]);

  // الحسابات (للطرف الآخر)
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });
  const leafAccounts = useMemo(
    () => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []),
    [treeQuery.data]
  );

  // ‎حسابات الصناديق محجوزة — لا تظهر في قائمة الحساب المقابل لأن الصندوق
  // ‎هو الطرف الأول من السند، وتحريكها يتم حصراً عبر السندات نفسها (لا قيود يدوية).
  const cashBoxAccountIds = useMemo(
    () => new Set(cashBoxes.map(b => b.accountId)),
    [cashBoxes]
  );
  const counterpartyAccounts = useMemo(
    () => leafAccounts.filter(a => !cashBoxAccountIds.has(a.id)),
    [leafAccounts, cashBoxAccountIds]
  );

  // العملات المفعّلة
  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
  });
  const enabledCurrencies = currenciesQuery.data ?? [];

  // ‎إعدادات الشركة — تُستخدم في ترويسة الطباعة (لوكو/اسم/اتصال)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60_000,
  });

  // ‎حالة الفترة المحاسبية المرتبطة بتاريخ السند: تُستخدم لإخفاء أزرار
  // ‎الحفظ/التعديل/الحذف (وعرض شريط "قراءة فقط") عندما يقع التاريخ ضمن
  // ‎فترة مغلقة/مقفلة أو ضمن سنة مالية مغلقة. يَعتمد على `entryDate`
  // ‎فيُعاد الجلب تلقائياً عند تغيير المستخدم للتاريخ.
  // (مُعرَّف هنا لأن `entryDate` يُعرَّف لاحقاً، لذا نُؤجّل التعريف للأسفل.)

  // ── حالة النموذج
  const [entryDate, setEntryDate] = useState(() => toIsoLocalDate(new Date()));

  // ‎حالة الفترة المحاسبية لتاريخ السند:
  //   • IsEditable=false ⇒ السند ضمن فترة مغلقة/مقفلة أو سنة مغلقة → قراءة فقط.
  //   • تُستدعى مع كل تغيير لـ entryDate لإظهار/إخفاء أزرار الحفظ/الحذف فوراً.
  const periodStatusQuery = useQuery({
    queryKey: ['period-status', entryDate],
    queryFn: () => fiscalYearsApi.getPeriodStatusByDate(entryDate),
    enabled: !!entryDate,
    staleTime: 30_000,
  });
  const periodStatus = periodStatusQuery.data ?? null;

  // ‎السنة المالية المُفَعَّلة: تستخدمها الواجهة لتقرير ما إن كان القيد
  // ‎الأصلي يقع ضمن السنة الحالية. هذا حارس مستقلّ عن إغلاق الفترة:
  // ‎حتى لو كانت الفترة مفتوحة، إذا كان القيد يخصّ سنة مالية أخرى فلا
  // ‎يُسمح بتعديله. التغيير اليدوي للتاريخ لا يفلت من هذا القيد لأن
  // ‎التحقق يتم على تاريخ القيد المحمَّل من قاعدة البيانات (وليس على
  // ‎قيمة حقل الإدخال الحالية).
  const { activeFiscalYear } = useActiveFiscalYear();
  const isPeriodLocked = !!periodStatus && !periodStatus.isEditable;
  const periodLockReason = (() => {
    if (!periodStatus) return null;
    if (periodStatus.fiscalYearIsClosed) return `السنة المالية "${periodStatus.fiscalYearName}" مغلقة`;
    if (periodStatus.periodStatus === 2) return `الفترة ${periodStatus.periodNumber} مغلقة`;
    if (periodStatus.periodStatus === 3) return `الفترة ${periodStatus.periodNumber} مقفلة`;
    return null;
  })();

  const [cashBoxId, setCashBoxId] = useState<number | null>(null);
  const [counterAccountId, setCounterAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState('IQD');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // ‎ترحيل فوري عند الحفظ (Posted) أو إبقاء القيد كمسودة (Draft).
  // ‎الافتراضي true ليبقى السلوك الحالي عند الإنشاء.
  const [postImmediately, setPostImmediately] = useState(true);
  // ‎بعد حفظ ناجح: نُفرّغ الحساب المقابل ونمنع الـ effect المسؤول عن
  // ‎التعبئة الافتراضية من إعادة ملئه مرة واحدة (حتى يبقى الحقل فارغاً
  // ‎ينتظر إدخالاً جديداً للسند التالي).
  const skipDefaultCounterFillRef = useRef(false);

  // ── في وضع التعديل: نحمّل القيد الموجود ونملأ الحقول منه (مرة واحدة)
  const editEntryQuery = useQuery({
    queryKey: ['voucher-entry-edit', editingId],
    queryFn: () => accountingApi.getJournalEntryById(editingId as number),
    enabled: isEditMode,
    staleTime: 0,
  });

  // ‎تاريخ القيد كما هو في قاعدة البيانات (وليس قيمة حقل الإدخال). هذا
  // ‎هو المرجع الذي نقارن به مع السنة المالية النشطة، فلا يستطيع المستخدم
  // ‎الالتفاف على القيد بتعديل التاريخ في الحقل.
  const originalEntryDate = isEditMode ? editEntryQuery.data?.entryDate ?? null : null;
  const isOriginalOutsideActiveFY =
    isEditMode &&
    !!activeFiscalYear &&
    !!originalEntryDate &&
    !isDateInFiscalYear(originalEntryDate, activeFiscalYear);
  const outsideFYReason = isOriginalOutsideActiveFY && activeFiscalYear
    ? `هذا السند بتاريخ ${toIsoLocalDate(new Date(originalEntryDate as string))} خارج السنة المالية النشطة "${activeFiscalYear.name}". لا يمكن تعديله أو حذفه. لتعديله، فعّل السنة المالية المناسبة من صفحة "السنوات المالية".`
    : null;

  // ‎effect مستقل لتحميل التاريخ من القيد بمجرد وصوله من الـ API،
  // ‎بدون انتظار تحميل الصناديق/الحسابات. هذا يضمن ظهور التاريخ الفعلي
  // ‎للقيد المحفوظ في قاعدة البيانات منذ أول render للنموذج.
  useEffect(() => {
    if (!isEditMode) return;
    const entry = editEntryQuery.data;
    if (!entry) return;
    setEntryDate(toIsoLocalDate(entry.entryDate));
  }, [isEditMode, editEntryQuery.data]);

  useEffect(() => {
    if (!isEditMode || prefilled) return;
    const entry = editEntryQuery.data;
    if (!entry || !voucherType || cashBoxes.length === 0) return;

    // طبيعة Debit (سند قبض): الصندوق على الجانب المدين، الحساب المقابل دائن
    // طبيعة Credit (سند دفع): الصندوق على الجانب الدائن، الحساب المقابل مدين
    const isCashDebit = voucherType.nature === 'Debit';
    const cashLine = entry.lines.find(l => l.isDebit === isCashDebit);
    const counterLine = entry.lines.find(l => l.isDebit !== isCashDebit);
    if (!cashLine || !counterLine) return;

    const box = cashBoxes.find(b => b.accountId === cashLine.accountId) ?? null;
    setCashBoxId(box?.id ?? null);
    setCounterAccountId(counterLine.accountId);
    setAmount(Number(cashLine.amount));
    setCurrency(entry.currency || 'IQD');
    setDescription(entry.description || '');
    // ‎في وضع التعديل: استرجع حالة الترحيل من القيد المحفوظ
    setPostImmediately(entry.status !== 'Draft');
    setPrefilled(true);
  }, [isEditMode, prefilled, editEntryQuery.data, voucherType, cashBoxes]);

  // ‎في وضع الإنشاء: عيّن أول صندوق متاح للمستخدم افتراضياً.
  // ‎يعمل بمجرد توفّر قائمة `allowedBoxes` ويبقى يحترم اختيار المستخدم
  // ‎(لأنه يُفعَّل فقط حين يكون cashBoxId == null).
  useEffect(() => {
    if (isEditMode) return;
    if (cashBoxId != null) return;
    if (allowedBoxes.length === 0) return;
    setCashBoxId(allowedBoxes[0].id);
  }, [isEditMode, cashBoxId, allowedBoxes]);

  const selectedBox: CashBoxDto | null = useMemo(
    () => cashBoxes.find(b => b.id === cashBoxId) ?? null,
    [cashBoxes, cashBoxId]
  );

  // العملات المسموحة في الصندوق المختار (إن وُجد) — وإلا كل العملات المفعّلة
  const allowedCurrencies = useMemo(() => {
    if (!selectedBox || selectedBox.currencies.length === 0) {
      return enabledCurrencies;
    }
    const codes = selectedBox.currencies.filter(c => c.isActive).map(c => c.currency.toUpperCase());
    return enabledCurrencies.filter(c => codes.includes(c.code.toUpperCase()));
  }, [selectedBox, enabledCurrencies]);

  // عند تغيير الصندوق، إذا كانت العملة الحالية ليست مسموحة → نختار أول عملة متاحة
  useEffect(() => {
    if (!selectedBox) return;
    const codes = (selectedBox.currencies.filter(c => c.isActive).map(c => c.currency.toUpperCase()))
      || [];
    if (codes.length === 0) return;
    if (!codes.includes(currency.toUpperCase())) {
      setCurrency(codes[0]);
    }
  }, [selectedBox]); // eslint-disable-line react-hooks/exhaustive-deps

  // اقتراح حساب الطرف الآخر تلقائياً من الافتراضي في نوع السند
  useEffect(() => {
    if (!voucherType) return;
    if (counterAccountId != null) return;
    if (isEditMode) return; // ‎في وضع التعديل: ننتظر إكمال التعبئة من القيد الأصلي
    // ‎بعد الحفظ مباشرةً: نتخطّى التعبئة مرة واحدة ليبقى الحقل فارغاً
    if (skipDefaultCounterFillRef.current) {
      skipDefaultCounterFillRef.current = false;
      return;
    }
    // الطرف المقابل بحسب الطبيعة:
    //   Debit → الصندوق مدين، الحساب الآخر هو الافتراضي للدائن
    //   Credit → الصندوق دائن، الحساب الآخر هو الافتراضي للمدين
    const suggestedId =
      voucherType.nature === 'Debit'
        ? voucherType.defaultCreditAccountId
        : voucherType.nature === 'Credit'
          ? voucherType.defaultDebitAccountId
          : null;
    if (suggestedId != null) setCounterAccountId(suggestedId);
  }, [voucherType, counterAccountId]);

  // عرض الحدّ الحالي للعملة المختارة في الصندوق
  const currencyLimits = useMemo(() => {
    if (!selectedBox) return null;
    return selectedBox.currencies.find(c => c.currency.toUpperCase() === currency.toUpperCase()) ?? null;
  }, [selectedBox, currency]);

  // التحقق
  const validate = (): string | null => {
    if (!voucherType) return 'نوع السند غير معروف';
    // الأنواع المختلطة يُتعامل معها عبر صفحة "قيد محاسبي" — هذا المسار محمي بإعادة التوجيه أعلاه
    if (cashBoxId == null) return 'اختر الصندوق';
    if (counterAccountId == null) return 'اختر الحساب المقابل';
    if (selectedBox?.accountId === counterAccountId)
      return 'لا يجوز أن يكون حساب الصندوق هو نفسه حساب الطرف المقابل';
    if (!amount || amount <= 0) return 'المبلغ يجب أن يكون أكبر من صفر';
    if (!entryDate) return 'التاريخ مطلوب';
    // ‎حارس السنة المالية النشطة على مستوى التحقق:
    //   حتى لو أُخفيت أزرار الواجهة، نمنع الحفظ صراحةً عند التعديل خارج
    //   نطاق السنة الحالية مع رسالة موضِّحة.
    if (isOriginalOutsideActiveFY && activeFiscalYear) {
      return `لا يمكن تعديل سند خارج السنة المالية النشطة "${activeFiscalYear.name}". لتعديله، فعِّل السنة المالية المناسبة أولاً.`;
    }
    return null;
  };

  // الحفظ — يستخدم نقطة نهاية مختلفة في وضع التعديل
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!voucherType || !selectedBox) throw new Error('بيانات ناقصة');
      const cashBoxAccountId = selectedBox.accountId;
      const isCashDebit = voucherType.nature === 'Debit';

      // طبيعة Debit (سند قبض): الصندوق مدين، الحساب المقابل دائن
      // طبيعة Credit (سند دفع): الصندوق دائن، الحساب المقابل مدين
      const lines = [
        {
          accountId: cashBoxAccountId,
          isDebit: isCashDebit,
          amount: Number(amount),
          description: null as string | null,
        },
        {
          accountId: counterAccountId!,
          isDebit: !isCashDebit,
          amount: Number(amount),
          description: null as string | null,
        },
      ];

      if (isEditMode && editingId != null) {
        const payload: UpdateVoucherEntryPayload = {
          entryDate: isoDateForBackend(entryDate),
          description: description.trim() || `${voucherType.nameAr} — ${selectedBox.nameAr}`,
          currency,
          postImmediately,
          lines,
        };
        return accountingApi.updateVoucherEntry(editingId, payload);
      }

      const payload: PostJournalEntryPayload = {
        entryDate: isoDateForBackend(entryDate),
        description: description.trim() || `${voucherType.nameAr} — ${selectedBox.nameAr}`,
        entryType: 1,
        currency,
        postImmediately,
        voucherTypeId: voucherType.id,
        lines,
      };
      return accountingApi.postJournalEntry(payload);
    },
    onSuccess: async res => {
      if (!res.success) {
        const msg = extractApiError(res, isEditMode ? 'تعذّر تحديث السند' : 'تعذّر حفظ السند');
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(isEditMode ? 'تم تحديث السند' : 'تم حفظ السند');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });

      // ‎فتح صفحة الطباعة تلقائياً بعد الحفظ الناجح (نسخة شركة + نسخة زبون).
      //   • في وضع الإنشاء: نأخذ الـ id من استجابة الـ API.
      //   • في وضع التعديل: نستخدم editingId الحالي.
      const savedId = isEditMode ? editingId : (res.data as number | undefined);
      if (savedId) {
        try {
          const fullEntry = await accountingApi.getJournalEntryById(savedId);
          printEntryData(fullEntry);
        } catch {
          // ‎الطباعة عملية ثانوية — لا نعطّل التدفّق الأصلي عند فشلها.
        }
      }

      if (isEditMode) {
        // ‎عُد إلى تقرير السند بعد التحديث الناجح
        navigate(code ? `/accounting/vouchers/${code}` : '/accounting/journal');
        return;
      }
      // ‎إعادة تهيئة النموذج لإدخال سند جديد:
      //   • تفريغ المبلغ والبيان والحساب المقابل
      //   • تحديث التاريخ ليوم اليوم (في حال انتقل اليوم أثناء العمل)
      //   • منع الـ effect من إعادة ملء الحساب المقابل افتراضياً
      skipDefaultCounterFillRef.current = true;
      setCounterAccountId(null);
      setAmount(0);
      setDescription('');
      setError(null);
      setEntryDate(toIsoLocalDate(new Date()));
    },
    onError: (e: any) => {
      const msg = extractApiError(e, isEditMode ? 'فشل تحديث السند' : 'فشل حفظ السند');
      setError(msg);
      toast.error(msg);
    },
  });

  const handleSave = () => {
    setError(null);
    const v = validate();
    if (v) { setError(v); toast.error(v); return; }
    saveMutation.mutate();
  };

  // ── حذف السند (وضع التعديل فقط) — يستخدم endpoint السندات المخصّصة
  const deleteMutation = useMutation({
    mutationFn: () => accountingApi.deleteVoucherEntry(editingId!),
    onSuccess: res => {
      if (!res.success) {
        const msg = extractApiError(res, 'تعذّر حذف السند');
        toast.error(msg);
        return;
      }
      toast.success('تم حذف السند');
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      navigate(code ? `/accounting/vouchers/${code}` : '/accounting/journal');
    },
    onError: (e: any) => {
      toast.error(extractApiError(e, 'فشل حذف السند'));
    },
  });

  // ── إنشاء سند جديد بنفس النوع
  const handleCreateNew = () => {
    if (!code) return;
    navigate(`/accounting/vouchers/${code}/new`);
  };

  // ── الطباعة: نستخرج اسم الصندوق وحساب الطرف الآخر من سطور القيد ذاتها
  //    حتى نعمل بشكل مستقل عن حالة النموذج الحالية (مفيد بعد حفظ سند جديد
  //    حيث يكون النموذج قد فُرّغ، وكذلك للسندات المحمَّلة في وضع التعديل).
  const printEntryData = (fullEntry: import('@/types/api').JournalEntryDto) => {
    if (!voucherType) {
      toast.error('نوع السند غير معروف');
      return;
    }
    const isCashDebit = voucherType.nature === 'Debit';
    const cashLine = fullEntry.lines.find(l => l.isDebit === isCashDebit);
    const counterLine = fullEntry.lines.find(l => l.isDebit !== isCashDebit);
    if (!cashLine || !counterLine) {
      toast.error('بيانات السند غير مكتملة للطباعة');
      return;
    }
    const box = cashBoxes.find(b => b.accountId === cashLine.accountId) ?? null;
    const counterAcc = leafAccounts.find(a => a.id === counterLine.accountId) ?? null;
    printSingleVoucher({
      entry: fullEntry,
      voucherTypeName: voucherType.nameAr,
      voucherNature: voucherType.nature as 'Debit' | 'Credit' | 'Mixed',
      cashBoxName: box?.nameAr ?? cashLine.accountName ?? '—',
      counterAccountName: counterAcc?.nameAr ?? counterLine.accountName ?? '—',
      counterAccountCode: counterAcc?.code ?? null,
      company: companyQuery.data ?? null,
    });
  };

  // ── زر الطباعة اليدوي (يظهر في وضع التعديل): يستخدم القيد المحمَّل مسبقاً
  const handlePrint = () => {
    const entry = editEntryQuery.data;
    if (!entry) {
      toast.error('لا توجد بيانات سند للطباعة');
      return;
    }
    printEntryData(entry);
  };

  // مسار الرجوع: إذا جاء عبر state.returnTo نستخدمه،
  // ‎وإلا نعود إلى تقرير هذا السند (لو متوفر الكود) ثم القيود اليومية كاحتياط
  const returnState = (location.state as { returnTo?: string } | null) ?? null;
  const backHref = returnState?.returnTo
    || (code ? `/accounting/vouchers/${code}` : '/accounting/journal');

  if (typesQuery.isLoading || cashBoxesQuery.isLoading || treeQuery.isLoading) {
    return <LoadingSpinner text={isEditMode ? 'تحميل القيد للتعديل...' : 'تحميل البيانات...'} />;
  }

  if (!voucherType) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <div>نوع السند بالكود <span className="font-bold text-foreground">{code}</span> غير موجود أو معطّل.</div>
        <Button variant="outline" size="sm" onClick={() => navigate('/accounting/voucher-types')}>إدارة الأنواع</Button>
      </div>
    );
  }

  // ‎الأنواع المختلطة (Mixed): لا تدعم النموذج المبسّط لأن المدين والدائن
  // ‎ متعددا الأطراف. نوجّه إلى صفحة "قيد محاسبي" متعدد البنود مع تثبيت نوع السند.
  if (voucherType.nature === 'Mixed') {
    const target = isEditMode && editingId != null
      ? `/accounting/journal/${editingId}/edit`
      : `/accounting/journal/new?voucherType=${encodeURIComponent(voucherType.code)}`;
    return <RedirectTo to={target} />;
  }

  // ‎قيد مولَّد من مناقلة بين صناديق: لا يُسمح بتعديله أو حذفه من هنا (ولا
  // ‎من أي شاشة قيود يدوية). كل التعديل/الإلغاء يتم من نافذة "الصناديق ⇒
  // ‎المناقلات" حصراً، حفاظاً على ترابط قيدَيْ الإرسال/الاستلام والأرصدة.
  const lockedRefType = isEditMode && editEntryQuery.data
    ? (editEntryQuery.data.referenceType === 'CashBoxTransfer' ? 'transfer'
      : editEntryQuery.data.referenceType === 'CashBoxTransferReversal' ? 'reversal'
      : null)
    : null;
  if (isEditMode && lockedRefType && editEntryQuery.data) {
    const entry = editEntryQuery.data;
    const lockedTitle = lockedRefType === 'reversal'
      ? 'هذا القيد عكس مناقلة'
      : 'هذا القيد مولَّد من مناقلة بين صناديق';
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-amber-400/40 bg-amber-400/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15">
            <Lock className="h-6 w-6 text-amber-400" />
          </div>
          <h2 className="mb-2 text-base font-semibold">{lockedTitle}</h2>
          <p className="mb-1 text-sm text-muted-foreground">
            القيد رقم{' '}
            <span className="font-mono text-foreground">
              {entry.voucherNumber ?? `#${entry.entryNumber}`}
            </span>{' '}
            لا يمكن تعديله أو حذفه من هذه الصفحة.
          </p>
          <p className="mb-5 text-xs text-muted-foreground">
            للحفاظ على ترابط قيدَيْ الإرسال والاستلام يجب التعديل/الإلغاء من
            تبويب «المناقلات» في نافذة الصناديق (تراجع عن الاستلام أوّلاً إن
            كانت المناقلة مستلَمة).
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                navigate('/accounting/cash-boxes?tab=transfers', {
                  state: { returnTo: backHref, returnLabel: 'القيد' },
                })
              }
              className="gap-1.5"
            >
              <BookOpen className="h-3.5 w-3.5" />
              فتح المناقلات
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(`/accounting/journal/${entry.id}/view`, {
                  state: { returnTo: backHref, returnLabel: 'القيد' },
                })
              }
              className="gap-1.5"
            >
              عرض القيد فقط
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(backHref)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ‎في وضع التعديل: ننتظر اكتمال تحميل القيد ثم تعبئته في الحقول قبل العرض
  if (isEditMode && (editEntryQuery.isLoading || !prefilled)) {
    return <LoadingSpinner text="تحميل القيد للتعديل..." />;
  }

  const isCashDebit = voucherType.nature === 'Debit';
  const cashSideLabel = isCashDebit ? 'مدين' : 'دائن';
  const counterSideLabel = isCashDebit ? 'دائن' : 'مدين';
  const sideColor = isCashDebit ? 'emerald' : 'amber';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ‎شريط أدوات علوي - مرن على الموبايل:
            • صف 1: زر رجوع + اسم السند + الـ badges (التفاف عند الضرورة)
            • صف 2: الأزرار (طباعة/جديد/حذف/ترحيل فوري/حفظ) - يلتف لسطرين على الموبايل */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* القسم الأيمن: العنوان + الشارات */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(backHref)}
            className="h-9 shrink-0 gap-1 px-2 sm:h-8"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            رجوع
          </Button>
          <h1 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base font-semibold">
            <span className="inline-flex items-center gap-1">
              {isCashDebit ? <ArrowDownLeft className="h-4 w-4 text-emerald-400" /> : <ArrowUpRight className="h-4 w-4 text-amber-400" />}
              {voucherType.nameAr}
            </span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium border',
              isCashDebit
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            )}>
              طبيعته: {cashSideLabel}
            </span>
            {isEditMode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Pencil className="h-3 w-3" />
                وضع التعديل
              </span>
            )}
            {isEditMode && editEntryQuery.data?.voucherNumber && (
              <>
                <span className="num-display rounded border border-primary/40 bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
                  {editEntryQuery.data.voucherNumber}
                </span>
                <span
                  className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title="رقم القيد الداخلي"
                >
                  #{editEntryQuery.data.entryNumber}
                </span>
              </>
            )}
            {isEditMode && !editEntryQuery.data?.voucherNumber && editEntryQuery.data?.entryNumber && (
              <span className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                #{editEntryQuery.data.entryNumber}
              </span>
            )}
          </h1>
        </div>

        {/* القسم الأيسر: الأزرار */}
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              title="طباعة السند (نسخة شركة + نسخة زبون)"
              className="h-9 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary sm:h-8"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
          )}
          {isEditMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              title={`إنشاء ${voucherType.nameAr} جديد`}
              className="h-9 gap-1.5 sm:h-8"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              جديد
            </Button>
          )}
          {/*
            • أزرار الحذف/الحفظ تختفي عند:
              - فترة مغلقة (IsEditable=false)
              - أو سند أصلي خارج السنة المالية النشطة (isOriginalOutsideActiveFY)
              في كلتا الحالتين تتحوّل الصفحة إلى وضع "قراءة فقط".
          */}
          {isEditMode && !isPeriodLocked && !isOriginalOutsideActiveFY && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              title="حذف السند"
              className="h-9 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </Button>
          )}
          {!isPeriodLocked && !isOriginalOutsideActiveFY && (
            <label
              className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2 text-xs sm:h-8"
              title="حفظ القيد كمُرحَّل مباشرةً (Posted) أو إبقائه كمسودة (Draft)"
            >
              <input
                type="checkbox"
                checked={postImmediately}
                onChange={e => setPostImmediately(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>ترحيل فوري</span>
            </label>
          )}
          {!isPeriodLocked && !isOriginalOutsideActiveFY && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="h-9 gap-1.5 sm:h-8"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending
                ? (isEditMode ? 'جارٍ التحديث...' : 'جارٍ الحفظ...')
                : (isEditMode ? 'تحديث السند' : 'حفظ السند')}
            </Button>
          )}
          {(isPeriodLocked || isOriginalOutsideActiveFY) && (
            <span className="flex h-9 items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 text-xs text-warning sm:h-8">
              <Lock className="h-3.5 w-3.5" />
              قراءة فقط
            </span>
          )}
        </div>
      </div>

      {/* شريط تنبيه واضح يشرح لماذا الصفحة في وضع القراءة فقط */}
      {isPeriodLocked && periodLockReason && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{periodLockReason} — لا يمكن إنشاء أو تعديل أو حذف القيود في هذا التاريخ.</div>
            <div className="mt-0.5 text-[11px] text-warning/80">
              لإجراء تعديلات، يجب فك إغلاق الفترة من صفحة "الفترات المحاسبية"، أو اختيار تاريخ ضمن فترة مفتوحة.
            </div>
          </div>
        </div>
      )}

      {/* شريط تنبيه: السند خارج السنة المالية النشطة */}
      {isOriginalOutsideActiveFY && outsideFYReason && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{outsideFYReason}</div>
            <div className="mt-0.5 text-[11px] text-rose-300/80">
              ملاحظة: تغيير حقل التاريخ في النموذج لا يفك هذا القيد — السنة المالية الأصلية للسند هي ما يُحدِّد قابلية التعديل.
            </div>
          </div>
        </div>
      )}

      {/* النموذج */}
      <div className="grid flex-1 gap-3 lg:grid-cols-3">
        {/* العمود الأيمن: المعطيات */}
        <div className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 rounded-md border border-border bg-card/50 p-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <Label className="mb-1 block text-[11px] text-muted-foreground">التاريخ</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="md:col-span-3">
              <Label className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  الصندوق ({cashSideLabel})
                </span>
                {selectedBox?.code && (
                  <span className="num-display text-[10px] text-primary">{selectedBox.code}</span>
                )}
              </Label>
              <select
                value={cashBoxId ?? ''}
                onChange={e => setCashBoxId(e.target.value === '' ? null : Number(e.target.value))}
                disabled={allowedBoxes.length <= 1}
                title={allowedBoxes.length <= 1 ? 'لا تتوفر سوى صندوق واحد ضمن صلاحياتك' : undefined}
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm',
                  allowedBoxes.length <= 1 && 'cursor-not-allowed opacity-90'
                )}
              >
                {allowedBoxes.length === 0 ? (
                  <option value="">— لا توجد صناديق متاحة —</option>
                ) : allowedBoxes.length === 1 ? (
                  <option value={allowedBoxes[0].id}>{allowedBoxes[0].nameAr}</option>
                ) : (
                  <>
                    <option value="">— اختر الصندوق —</option>
                    {allowedBoxes.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nameAr}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {selectedBox && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  الحساب المربوط:&nbsp;
                  <span className="num-display text-primary">{selectedBox.accountCode}</span>
                  <span className="ms-1">- {selectedBox.accountName}</span>
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Banknote className="h-3 w-3" />
                العملة
              </Label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                disabled={!selectedBox && allowedCurrencies.length === 0}
                className="h-9 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
              >
                {allowedCurrencies.length === 0 ? (
                  <option value="IQD">IQD</option>
                ) : (
                  allowedCurrencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))
                )}
              </select>
            </div>

            <div className="md:col-span-4">
              <Label className="mb-1 block text-[11px] text-muted-foreground">المبلغ</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount === 0 ? '' : amount}
                onChange={e => setAmount(Number(e.target.value) || 0)}
                placeholder="0"
                className={cn(
                  'h-9 num-display text-left text-base font-bold',
                  isCashDebit ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'
                )}
              />
            </div>

            <div className="md:col-span-12">
              <Label className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>الحساب المقابل ({counterSideLabel})</span>
                <span className="text-[9px] text-muted-foreground/70">
                  {isCashDebit ? 'من الذي قام بالدفع/الجهة' : 'إلى الذي تم الدفع/الجهة'}
                </span>
              </Label>
              <AccountPicker
                accounts={counterpartyAccounts}
                value={counterAccountId}
                initialLabel={
                  counterAccountId != null
                    ? leafAccounts
                        .filter(a => a.id === counterAccountId)
                        .map(a => `${a.code} - ${a.nameAr}`)[0]
                    : undefined
                }
                onChange={id => setCounterAccountId(id)}
                allowClear
                placeholder="اختر الحساب المقابل..."
                inputHeight={9}
              />
            </div>

            <div className="md:col-span-12">
              <Label className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>البيان (اختياري)</span>
                <span className="num-display">{description.length}/200</span>
              </Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 200))}
                placeholder={`${voucherType.nameAr} — وصف العملية`}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-destructive/20">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* العمود الأيسر: ملخّص ومعلومات الصندوق */}
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-card/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              ملخّص القيد الناتج
            </div>
            {selectedBox && counterAccountId != null && amount > 0 ? (
              <div className="space-y-1.5 text-xs">
                <div className={cn(
                  'flex items-center justify-between rounded border px-2 py-1.5',
                  `border-${sideColor}-500/30 bg-${sideColor}-500/5`
                )}>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/80">{cashSideLabel}</span>
                    <span className="font-medium">{selectedBox.accountName}</span>
                  </div>
                  <span className={cn('num-display font-bold', isCashDebit ? 'text-emerald-300' : 'text-amber-300')}>
                    {formatAmount(amount)} {currency}
                  </span>
                </div>
                <div className={cn(
                  'flex items-center justify-between rounded border px-2 py-1.5',
                  isCashDebit
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/30 bg-emerald-500/5'
                )}>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/80">{counterSideLabel}</span>
                    <span className="font-medium">
                      {leafAccounts.find(a => a.id === counterAccountId)?.nameAr ?? '—'}
                    </span>
                  </div>
                  <span className={cn('num-display font-bold', isCashDebit ? 'text-amber-300' : 'text-emerald-300')}>
                    {formatAmount(amount)} {currency}
                  </span>
                </div>
              </div>
            ) : (
              <p className="rounded border border-dashed border-border/50 px-2 py-3 text-center text-[11px] text-muted-foreground">
                املأ الحقول أعلاه لرؤية ملخّص القيد.
              </p>
            )}
          </div>

          {currencyLimits && (currencyLimits.debitLimit != null || currencyLimits.creditLimit != null) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="mb-1 font-semibold text-amber-300">سقوف الصندوق ({currency})</div>
              {currencyLimits.debitLimit != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سقف مدين:</span>
                  <span className="num-display font-bold text-emerald-300">
                    {formatAmount(currencyLimits.debitLimit)}
                  </span>
                </div>
              )}
              {currencyLimits.creditLimit != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سقف دائن:</span>
                  <span className="num-display font-bold text-amber-300">
                    {formatAmount(currencyLimits.creditLimit)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* مودال تأكيد الحذف */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="font-semibold">تأكيد حذف السند</h3>
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
                هل أنت متأكد من حذف{' '}
                <span className="font-semibold text-primary">{voucherType.nameAr}</span>
                {editEntryQuery.data?.entryNumber && (
                  <>
                    {' '}رقم{' '}
                    <span className="font-mono text-primary">
                      {editEntryQuery.data.voucherNumber ?? `#${editEntryQuery.data.entryNumber}`}
                    </span>
                  </>
                )}
                ؟
              </p>
              {editEntryQuery.data && (
                <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <div>البيان: {editEntryQuery.data.description || '—'}</div>
                  <div>المبلغ: {formatAmount(amount)} {currency}</div>
                </div>
              )}
              <p className="text-xs text-amber-400">لا يمكن التراجع عن هذه العملية.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-3">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? 'جارٍ الحذف...' : 'حذف السند'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
