import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Save, Search, Trash2, X, AlertTriangle, ArrowRight, Plus, UserPlus, Warehouse, Wallet, Hash, Calendar, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';
import { inventoryApi, ITEM_SALE_PRICE_TYPES, type ItemPriceType, type ItemListDto, type ItemDetailDto } from '@/lib/api/inventory';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { invoicesApi, type CreateInvoicePayload } from '@/lib/api/invoices';
import { invoiceTypesApi, type InvoiceTypeDto, INVOICE_SETTLEMENT_TYPES, INVOICE_PAYMENT_METHODS } from '@/lib/api/invoiceTypes';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { currenciesApi } from '@/lib/api/currencies';
import { getFinancialManagementPath } from '@/pages/financial-management/routes';
import { writeFmFocus } from '@/pages/financial-management/fmFocus';
import { resolveUnitPriceForParty } from '@/lib/inventory/partyItemPrice';
import { invoiceListPathForCategory } from '@/pages/invoices/invoiceRoutes';
import { InvoiceTotalsPanel } from '@/pages/invoices/components/InvoiceTotalsPanel';
import { cn, formatMoney, extractApiError } from '@/lib/utils';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type { FinancialPartyDto, FinancialPartyKind } from '@/types/api';

interface LineUnit {
  unitOfMeasureId: number;
  unitName: string;
  isBase: boolean;
}

interface InvoiceLine {
  itemId: number;
  itemCode: string;
  itemName: string;
  primaryImageId?: number | null;
  itemDetail?: ItemDetailDto;
  units: LineUnit[];
  unitOfMeasureId: number;
  unitName: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  isGift?: boolean;
}

const SELECT_CLS = 'invoice-select';
const NUMERIC_INPUT_CLS = 'invoice-number-input';
const parseDecimalInput = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function CreateInvoicePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: idParam } = useParams();
  const { can } = usePermissions();
  const canDelete = can(PERMS.Sales.Invoices.Delete);
  const editId = idParam ? Number(idParam) : null;
  const isEdit = editId != null && !Number.isNaN(editId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: ['invoice', editId],
    queryFn: () => invoicesApi.getById(editId!),
    enabled: isEdit,
  });
  const loadedInvoice = invoiceQuery.data;

  const typeIdParam = searchParams.get('typeId');
  const typeId = isEdit
    ? (loadedInvoice?.invoiceTypeId ?? null)
    : (typeIdParam ? Number(typeIdParam) : null);

  const typeQuery = useQuery({
    queryKey: ['invoice-type', typeId],
    queryFn: () => invoiceTypesApi.get(typeId!),
    enabled: typeId != null && !Number.isNaN(typeId),
  });
  const invoiceType: InvoiceTypeDto | undefined = typeQuery.data;

  const listPath = useMemo(
    () => invoiceListPathForCategory(invoiceType?.category ?? 1),
    [invoiceType?.category],
  );

  const partyKind = useMemo((): FinancialPartyKind => {
    if (invoiceType?.defaultPartyKind === 2) return 'Supplier';
    if (invoiceType?.defaultPartyKind === 1) return 'Customer';
    if (invoiceType?.category === 2 || invoiceType?.category === 3) return 'Supplier';
    return 'Customer';
  }, [invoiceType]);

  const partySectionTitle = 'العميل / المورد';
  const addPartyLabel = partyKind === 'Supplier' ? 'إضافة مورد' : 'إضافة عميل';

  const [party, setParty] = useState<FinancialPartyDto | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDrop, setShowPartyDrop] = useState(false);

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDrop, setShowItemDrop] = useState(false);

  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [additionAmt, setAdditionAmt] = useState(0);
  const [notes, setNotes] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // رقم/تاريخ/عملة الفاتورة
  const [manualNumber, setManualNumber] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [invoiceDate, setInvoiceDate] = useState(todayIso);
  const [currency, setCurrency] = useState('IQD');

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const list = currenciesQuery.data;
    if (!list || list.length === 0) return;
    if (list.some(c => c.code === currency)) return;
    const base = list.find(c => c.isBase) ?? list[0];
    if (base) setCurrency(base.code);
  }, [currenciesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // التسوية ووسيلة الدفع
  const [settlementType, setSettlementType] = useState<number>(2); // 1=نقدي، 2=آجل
  const [paymentMethodKind, setPaymentMethodKind] = useState<number>(1); // 1=صندوق، 2=شركة دفع، 3=مصرف
  const [paymentMeansAccountId, setPaymentMeansAccountId] = useState<number | null>(null);
  const isCash = settlementType === 1;

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-manage'],
    queryFn: () => inventoryApi.listWarehousesManage(),
    staleTime: 60_000,
  });

  const activeWarehouses = useMemo(
    () => (warehousesQuery.data ?? []).filter(w => w.isActive),
    [warehousesQuery.data],
  );

  const showWarehouse = invoiceType?.affectsInventory !== false;
  const savedWarehouseId = loadedInvoice?.warehouseId ?? null;

  // عند التعديل: مزامنة المستودع فور وصوله من API (قبل/بعد hydration)
  useEffect(() => {
    if (!isEdit || savedWarehouseId == null) return;
    setWarehouseId(savedWarehouseId);
  }, [isEdit, savedWarehouseId]);

  useEffect(() => {
    if (!showWarehouse || activeWarehouses.length === 0) return;
    // عند التعديل: انتظر تحميل الفاتورة ولا تفرض الافتراضي إذا كان لها مستودع محفوظ/مستنتج
    if (isEdit) {
      if (!hydrated && savedWarehouseId == null) return;
      if (savedWarehouseId != null && activeWarehouses.some(w => w.id === savedWarehouseId)) return;
    }
    // لا نُلغِ اختيار المستخدم/القيمة المحمّلة إن كانت صالحة.
    if (warehouseId && activeWarehouses.some(w => w.id === warehouseId)) return;
    // اختيار الأولوية: مستودع النوع → المستودع الافتراضي → أول مستودع
    const fromType = invoiceType?.defaultWarehouseId;
    if (fromType && activeWarehouses.some(w => w.id === fromType)) {
      setWarehouseId(fromType);
      return;
    }
    const defaultWh = activeWarehouses.find(w => w.isDefault) ?? activeWarehouses[0];
    setWarehouseId(defaultWh.id);
  }, [invoiceType?.defaultWarehouseId, activeWarehouses, showWarehouse, isEdit, hydrated, savedWarehouseId, warehouseId]);

  // ── التسوية: افتراضي من نوع الفاتورة
  useEffect(() => {
    if (invoiceType?.settlementType) setSettlementType(invoiceType.settlementType);
    if (invoiceType?.paymentMethodKind) setPaymentMethodKind(invoiceType.paymentMethodKind);
  }, [invoiceType?.settlementType, invoiceType?.paymentMethodKind]);

  // ── وسائل الدفع (صندوق / شركة دفع / مصرف) — كل منها مرتبط بحساب
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'active'],
    queryFn: () => cashBoxesApi.getAll(true),
    enabled: isCash && paymentMethodKind === 1,
    staleTime: 60_000,
  });
  const paymentCompaniesQuery = useQuery({
    queryKey: ['financial-parties', 'PaymentCompany'],
    queryFn: () => financialManagementApi.getParties({ kind: 'PaymentCompany' }),
    enabled: isCash && paymentMethodKind === 2,
    staleTime: 60_000,
  });
  const banksQuery = useQuery({
    queryKey: ['financial-parties', 'Bank'],
    queryFn: () => financialManagementApi.getParties({ kind: 'Bank' }),
    enabled: isCash && paymentMethodKind === 3,
    staleTime: 60_000,
  });

  // خيارات وسيلة الدفع الحالية: { id (accountId), label }
  const paymentMeansOptions = useMemo(() => {
    if (paymentMethodKind === 1)
      return (cashBoxesQuery.data ?? []).map(c => ({ accountId: c.accountId, label: `${c.nameAr} · ${c.code}` }));
    if (paymentMethodKind === 2)
      return (paymentCompaniesQuery.data ?? []).map(p => ({ accountId: p.accountId, label: `${p.nameAr} · ${p.accountCode}` }));
    return (banksQuery.data ?? []).map(p => ({ accountId: p.accountId, label: `${p.nameAr} · ${p.accountCode}` }));
  }, [paymentMethodKind, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]);

  const meansLoading =
    (paymentMethodKind === 1 && cashBoxesQuery.isLoading) ||
    (paymentMethodKind === 2 && paymentCompaniesQuery.isLoading) ||
    (paymentMethodKind === 3 && banksQuery.isLoading);

  // اختيار افتراضي لوسيلة الدفع: من نوع الفاتورة إن أمكن، وإلا أول خيار
  useEffect(() => {
    if (!isCash) {
      setPaymentMeansAccountId(null);
      return;
    }
    if (paymentMeansOptions.length === 0) {
      setPaymentMeansAccountId(null);
      return;
    }
    // إذا الاختيار الحالي ما زال صالحاً نتركه
    if (paymentMeansAccountId && paymentMeansOptions.some(o => o.accountId === paymentMeansAccountId)) return;

    let preferredId: number | null = null;
    if (paymentMethodKind === 1 && invoiceType?.paymentCashBoxId) {
      preferredId = (cashBoxesQuery.data ?? []).find(c => c.id === invoiceType.paymentCashBoxId)?.accountId ?? null;
    } else if (paymentMethodKind === 2 && invoiceType?.paymentCompanyId) {
      preferredId = (paymentCompaniesQuery.data ?? []).find(p => p.id === invoiceType.paymentCompanyId)?.accountId ?? null;
    } else if (paymentMethodKind === 3 && invoiceType?.paymentBankId) {
      preferredId = (banksQuery.data ?? []).find(p => p.id === invoiceType.paymentBankId)?.accountId ?? null;
    }
    setPaymentMeansAccountId(preferredId ?? paymentMeansOptions[0].accountId);
  }, [isCash, paymentMethodKind, paymentMeansOptions, invoiceType, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── جلب الأطراف من الإدارة المالية: العملاء والموردون معاً في كل أنواع الفواتير
  const partiesQuery = useQuery({
    queryKey: ['invoice-parties', partySearch],
    queryFn: async () => {
      const search = partySearch.trim() || undefined;
      const [customers, suppliers] = await Promise.all([
        financialManagementApi.getParties({ kind: 'Customer', includeInactive: false, search }),
        financialManagementApi.getParties({ kind: 'Supplier', includeInactive: false, search }),
      ]);
      const map = new Map<number, FinancialPartyDto>();
      [...customers, ...suppliers].forEach(p => map.set(p.id, p));
      return Array.from(map.values());
    },
    enabled: showPartyDrop,
  });

  // ── العملة تُشتق تلقائياً: نقدي ← عملة وسيلة الدفع، آجل ← عملة الطرف
  const availableCurrencies = useMemo<string[]>(() => {
    if (!isCash) return party?.allowedCurrencies ?? [];
    if (paymentMethodKind === 1) {
      const box = (cashBoxesQuery.data ?? []).find(c => c.accountId === paymentMeansAccountId);
      return (box?.currencies ?? []).filter(x => x.isActive).map(x => x.currency);
    }
    if (paymentMethodKind === 2) {
      const p = (paymentCompaniesQuery.data ?? []).find(x => x.accountId === paymentMeansAccountId);
      return p?.allowedCurrencies ?? [];
    }
    const b = (banksQuery.data ?? []).find(x => x.accountId === paymentMeansAccountId);
    return b?.allowedCurrencies ?? [];
  }, [isCash, paymentMethodKind, paymentMeansAccountId, party, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]);

  useEffect(() => {
    if (availableCurrencies.length === 0) return;
    if (availableCurrencies.includes(currency)) return;
    setCurrency(availableCurrencies[0]);
  }, [availableCurrencies]); // eslint-disable-line react-hooks/exhaustive-deps

  const currencyLocked = availableCurrencies.length === 1;
  const currencyOptions = useMemo(() => {
    const all = currenciesQuery.data ?? [];
    if (availableCurrencies.length > 0) return all.filter(c => availableCurrencies.includes(c.code));
    return all;
  }, [currenciesQuery.data, availableCurrencies]);

  // ── إخفاء الأطراف التي لا تملك عملة الفاتورة (في الوضع النقدي حيث العملة مثبّتة من الصندوق)
  const visibleParties = useMemo(() => {
    const list = partiesQuery.data ?? [];
    if (!isCash) return list;
    return list.filter(p => (p.allowedCurrencies ?? []).includes(currency));
  }, [partiesQuery.data, isCash, currency]);

  const partyPriceLabel = useMemo(() => {
    if (!party?.defaultSalesPriceType) return null;
    return ITEM_SALE_PRICE_TYPES.find(p => p.value === party.defaultSalesPriceType)?.label ?? null;
  }, [party]);

  const partyCreditLimit = useMemo(() => {
    if (!party?.creditLimits?.IQD?.debit) return 0;
    return party.creditLimits.IQD.debit;
  }, [party]);

  // ── جلب المواد (autocomplete)
  const itemsQuery = useQuery({
    queryKey: ['items', itemSearch],
    queryFn: () => inventoryApi.list({ search: itemSearch, pageSize: 10 }),
    enabled: showItemDrop,
  });

  // ── الحسابات
  const subTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice - (l.isGift ? l.quantity * l.unitPrice : l.lineDiscount)), 0),
    [lines]
  );
  const effectiveDiscount = useMemo(
    () => (discountPct > 0 ? Math.round((subTotal * discountPct) / 100) : discountAmt),
    [subTotal, discountPct, discountAmt]
  );
  const afterDiscount = subTotal - effectiveDiscount;
  const taxAmount = useMemo(() => Math.round((afterDiscount * taxRate) / 100), [afterDiscount, taxRate]);
  const total = afterDiscount + additionAmt + taxAmount;

  const overCredit = false; // سقف الائتمان يُعرض من بطاقة الطرف؛ التحقق الكامل عند الترحيل

  const openAddParty = () => {
    writeFmFocus({ mode: 'add', kind: partyKind });
    navigate(getFinancialManagementPath(partyKind));
  };

  const resolveLineUnitPrice = useCallback(async (detail: ItemDetailDto, unitId: number) => {
    const source = invoiceType?.autoPriceSource ?? 2;
    if (source === 2) {
      const priceType = (party?.defaultSalesPriceType ?? 4) as ItemPriceType;
      return resolveUnitPriceForParty(detail, unitId, priceType, currency);
    }
    if (source === 1 || source === 3) {
      try {
        const res = await invoicesApi.lastPrice({
          itemId: detail.id,
          mode: source === 1 ? 'purchase' : 'sale',
          financialPartyId: party?.id,
          unitOfMeasureId: unitId || undefined,
        });
        return res.found ? res.unitPrice : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }, [party, invoiceType, currency]);

  // ── إضافة مادة كسطر (سعر حسب خيار "جلب السعر التلقائي" لنوع الفاتورة)
  const addItem = useCallback(async (item: ItemListDto, asGift = false) => {
    if (!asGift && lines.some(l => l.itemId === item.id && !l.isGift)) {
      toast.error('لا يمكن تكرار المادة في الفاتورة إلا إذا كانت هدية');
      setItemSearch('');
      setShowItemDrop(false);
      return;
    }
    try {
      const detail = await inventoryApi.get(item.id);
      const defaultUnit = detail.units.find(u => u.isBase) ?? detail.units[0];
      const unitId = defaultUnit?.unitOfMeasureId ?? 0;
      const unitPrice = await resolveLineUnitPrice(detail, unitId);
      const units: LineUnit[] = detail.units.map(u => ({
        unitOfMeasureId: u.unitOfMeasureId,
        unitName: u.unitName ?? '',
        isBase: u.isBase,
      }));
      const primaryImageId =
        item.primaryImageId ?? detail.images.find(img => img.isPrimary)?.id ?? detail.images[0]?.id ?? null;
      setLines(prev => [
        ...prev,
        {
          itemId: item.id,
          itemCode: item.code,
          itemName: item.nameAr,
          primaryImageId,
          itemDetail: detail,
          units,
          unitOfMeasureId: unitId,
          unitName: defaultUnit?.unitName ?? '',
          quantity: 1,
          unitPrice,
          lineDiscount: 0,
          isGift: asGift,
        },
      ]);
      setItemSearch('');
      setShowItemDrop(false);
    } catch {
      toast.error(t('invoices.create.itemLoadError', { defaultValue: 'تعذّر تحميل أسعار المادة' }));
    }
  }, [lines, party, invoiceType, t, resolveLineUnitPrice]);

  const updateLine = (idx: number, patch: Partial<InvoiceLine>) =>
    setLines(prev => {
      const current = prev[idx];
      if (!current) return prev;
      if (patch.isGift === false && prev.some((l, i) => i !== idx && l.itemId === current.itemId && !l.isGift)) {
        toast.error('لا يمكن تكرار المادة في الفاتورة إلا إذا كانت هدية');
        return prev;
      }
      return prev.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    });
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleUnitChange = useCallback(async (idx: number, unitId: number) => {
    const line = lines[idx];
    if (!line) return;
    const u = line.units.find(x => x.unitOfMeasureId === unitId);
    let unitPrice = line.unitPrice;
    if (line.itemDetail) {
      unitPrice = await resolveLineUnitPrice(line.itemDetail, unitId);
    }
    updateLine(idx, { unitOfMeasureId: unitId, unitName: u?.unitName ?? '', unitPrice });
  }, [lines, resolveLineUnitPrice]);

  // ── تهيئة وضع التعديل: تعبئة النموذج من الفاتورة المحمّلة (مرة واحدة)
  useEffect(() => {
    if (!isEdit || hydratedRef.current || !loadedInvoice) return;
    // إذا كانت الفاتورة مرتبطة بنوع، ننتظر تحميل النوع أولاً (لتحديد نوع الطرف)
    if (typeId != null && !invoiceType) return;
    hydratedRef.current = true;

    (async () => {
      setTaxRate(loadedInvoice.taxRate ?? 0);
      if ((loadedInvoice.discountPercentage ?? 0) > 0) {
        setDiscountPct(loadedInvoice.discountPercentage!);
        setDiscountAmt(0);
      } else {
        setDiscountPct(0);
        setDiscountAmt(loadedInvoice.discountAmount ?? 0);
      }
      setAdditionAmt(loadedInvoice.additionAmount ?? 0);
      setNotes(loadedInvoice.notes ?? '');
      if (loadedInvoice.currency) setCurrency(loadedInvoice.currency);
      setInvoiceDate((loadedInvoice.invoiceDate ?? '').slice(0, 10) || todayIso);
      if (loadedInvoice.invoiceNumber) {
        setManualNumber(true);
        setInvoiceNumber(loadedInvoice.invoiceNumber);
      }
      setSettlementType(loadedInvoice.settlementType ?? 2);
      if (loadedInvoice.paymentMeansAccountId)
        setPaymentMeansAccountId(loadedInvoice.paymentMeansAccountId);
      if (loadedInvoice.warehouseId != null)
        setWarehouseId(loadedInvoice.warehouseId);

      if (loadedInvoice.financialPartyId) {
        try {
          const [customers, suppliers] = await Promise.all([
            financialManagementApi.getParties({ kind: 'Customer', includeInactive: true }),
            financialManagementApi.getParties({ kind: 'Supplier', includeInactive: true }),
          ]);
          const found = [...customers, ...suppliers].find(p => p.id === loadedInvoice.financialPartyId);
          if (found) setParty(found);
        } catch { /* تجاهل */ }
      }

      try {
        const built = await Promise.all(loadedInvoice.lines.map(async (ln): Promise<InvoiceLine> => {
          let units: LineUnit[] = [];
          let itemDetail: ItemDetailDto | undefined;
          let itemCode = '';
          let primaryImageId: number | null = null;
          try {
            const detail = await inventoryApi.get(ln.itemId);
            itemDetail = detail;
            itemCode = detail.code ?? '';
            units = detail.units.map(u => ({
              unitOfMeasureId: u.unitOfMeasureId,
              unitName: u.unitName ?? '',
              isBase: u.isBase,
            }));
            primaryImageId = detail.images.find(i => i.isPrimary)?.id ?? detail.images[0]?.id ?? null;
          } catch { /* تجاهل تعذّر تحميل المادة */ }
          const uomId = ln.unitOfMeasureId ?? (units.find(u => u.isBase)?.unitOfMeasureId ?? 0);
          return {
            itemId: ln.itemId,
            itemCode,
            itemName: ln.itemName,
            primaryImageId,
            itemDetail,
            units,
            unitOfMeasureId: uomId,
            unitName: ln.unitName ?? (units.find(u => u.unitOfMeasureId === uomId)?.unitName ?? ''),
            quantity: ln.quantity,
            unitPrice: ln.unitPrice,
            lineDiscount: ln.lineDiscount,
          };
        }));
        setLines(built);
      } catch { /* تجاهل */ }

      setHydrated(true);
    })();
  }, [isEdit, loadedInvoice, invoiceType, typeId, partyKind, todayIso]);

  // ── إنشاء الفاتورة
  const createMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => invoicesApi.create(payload),
    onSuccess: res => {
      if (res.success) {
        toast.success(t('invoices.create.issued', { number: res.data?.invoiceNumber }));
        navigate(listPath);
      } else {
        res.errors?.forEach(e => toast.error(e));
      }
    },
  });

  // ── تعديل الفاتورة
  const updateMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => invoicesApi.update(editId!, payload),
    onSuccess: res => {
      if (res.success) {
        toast.success('تم تحديث الفاتورة بنجاح');
        navigate(listPath);
      } else {
        res.errors?.forEach(e => toast.error(e));
      }
    },
    onError: () => toast.error('فشل تحديث الفاتورة'),
  });

  // ── حذف الفاتورة (من داخل التحرير) — يحذف القيد ويعكس أثر المخزون
  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.remove(editId!),
    onSuccess: res => {
      if (res.success) {
        toast.success('تم حذف الفاتورة وقيدها المحاسبي');
        navigate(listPath);
      } else {
        res.errors?.forEach(e => toast.error(e));
      }
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل حذف الفاتورة'),
  });

  const canDeleteInvoice = isEdit && canDelete && loadedInvoice?.status !== 'Cancelled';

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!party) return toast.error(partyKind === 'Supplier' ? 'اختر مورداً' : t('invoices.create.selectCustomer'));
    if (lines.length === 0) return toast.error(t('invoices.create.addLines'));
    const duplicateRegularItem = lines.some((line, idx) =>
      !line.isGift && lines.findIndex(other => !other.isGift && other.itemId === line.itemId) !== idx);
    if (duplicateRegularItem)
      return toast.error('لا يمكن تكرار المادة في الفاتورة إلا إذا كانت هدية');
    if (lines.some(l => l.unitOfMeasureId === 0))
      return toast.error(t('invoices.create.selectUom'));
    if (lines.some(l => l.quantity <= 0))
      return toast.error('كمية كل بند يجب أن تكون أكبر من صفر');
    if (lines.some(l => !l.isGift && l.unitPrice <= 0))
      return toast.error('سعر كل بند غير هدية يجب أن يكون أكبر من صفر');
    if (showWarehouse && !warehouseId)
      return toast.error('اختر المستودع');
    if (isCash && !paymentMeansAccountId)
      return toast.error('اختر وسيلة الدفع');
    if (manualNumber && !invoiceNumber.trim())
      return toast.error('أدخل رقم الفاتورة اليدوي');
    if (!invoiceDate)
      return toast.error('اختر تاريخ الفاتورة');
    if (total <= 0)
      return toast.error('لا يمكن حفظ فاتورة إجماليها صفر');

    const payload: CreateInvoicePayload = {
      financialPartyId: party.id,
      invoiceTypeId: typeId ?? undefined,
      warehouseId: showWarehouse ? warehouseId ?? undefined : undefined,
      settlementType,
      paymentMeansAccountId: isCash ? paymentMeansAccountId ?? undefined : undefined,
      invoiceNumber: manualNumber && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      invoiceDate,
      currency,
      taxRate,
      discountPercentage: discountPct,
      discountAmount: discountPct > 0 ? 0 : discountAmt,
      additionAmount: additionAmt,
      notes: notes || undefined,
      lines: lines.map(l => ({
        itemId: l.itemId,
        unitOfMeasureId: l.unitOfMeasureId,
        quantity: l.quantity,
        unitPriceOverride: l.unitPrice,
        lineDiscount: l.isGift ? l.quantity * l.unitPrice : l.lineDiscount,
      })),
    };

    if (isEdit) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  if (isEdit && invoiceQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">تعذّر تحميل الفاتورة</p>
        <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>الفواتير</Button>
      </div>
    );
  }

  if (isEdit && (invoiceQuery.isLoading || !hydrated)) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        {t('common.loading')}...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* شريط علوي ثابت */}
      <div className="invoice-toolbar">
        <Link to={listPath}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
            <ArrowRight className="h-4 w-4" />
            الفواتير
          </Button>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-base font-bold sm:text-lg">
            {isEdit ? 'تعديل الفاتورة' : invoiceType ? invoiceType.nameAr : t('invoices.list.newInvoice')}
          </h1>
          {isEdit && loadedInvoice && (
            <Badge variant="outline" className="shrink-0">{loadedInvoice.invoiceNumber}</Badge>
          )}
          {!isEdit && invoiceType && <Badge variant="outline" className="shrink-0">{invoiceType.code}</Badge>}
        </div>
        <div className="flex shrink-0 gap-2">
          {canDeleteInvoice && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>
            <X className="h-4 w-4" />
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || lines.length === 0 || !party}>
            <Save className="h-4 w-4" />
            {isEdit
              ? (saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات')
              : (saving ? t('invoices.create.issuing') : t('invoices.create.issue'))}
          </Button>
        </div>
      </div>

      <Card className="invoice-document border-0 shadow-md">
        <div className="invoice-document-accent" />
        <CardContent className="space-y-5 p-4 sm:p-5">

          {/* ── رأس الفاتورة: بيانات أساسية ── */}
          <div>
            <div className="invoice-section-title">بيانات الفاتورة</div>
            <div className="invoice-meta-grid">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="invoice-field-label mb-0 flex items-center gap-1">
                    <Hash className="h-3 w-3" /> رقم الفاتورة
                  </Label>
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={manualNumber} onChange={e => setManualNumber(e.target.checked)} />
                    يدوي
                  </label>
                </div>
                <Input
                  className="h-8 text-xs"
                  placeholder={manualNumber ? 'أدخل رقم الفاتورة' : 'يُولَّد تلقائياً'}
                  value={manualNumber ? invoiceNumber : ''}
                  disabled={!manualNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div>
                <Label className="invoice-field-label flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ الفاتورة
                </Label>
                <Input type="date" className="h-8 text-xs" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <Label className="invoice-field-label flex items-center gap-1">
                  <Coins className="h-3 w-3" /> العملة
                  {currencyLocked && <span className="text-[10px] text-muted-foreground">(تلقائي)</span>}
                </Label>
                <select
                  className={SELECT_CLS}
                  value={currency}
                  disabled={currencyLocked}
                  onChange={e => setCurrency(e.target.value)}
                >
                  {currencyOptions.length === 0 ? (
                    <option value={currency}>{currency}</option>
                  ) : (
                    currencyOptions.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.nameAr}{c.isBase ? ' ★' : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {isCash ? 'حسب عملة الصندوق/وسيلة الدفع' : 'حسب عملة الطرف'}
                </p>
              </div>
              {invoiceType && (
                <div className="invoice-meta-cell justify-center">
                  <span className="invoice-meta-label">نوع الفاتورة</span>
                  <span className="text-sm font-medium">{invoiceType.nameAr}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── الطرف والتسديد ── */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="invoice-section-title">{partySectionTitle}</div>
              <div className="space-y-3">
                {party ? (
                  <div className="invoice-party-card">
                    <div className="min-w-0">
                      <div className="font-semibold">{party.nameAr}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {party.accountCode}
                        {(party.contactPerson || party.mobile || party.phone) && (
                          <> · {party.contactPerson ?? party.mobile ?? party.phone}</>
                        )}
                      </div>
                      {partyCreditLimit > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('invoices.create.creditLimit')}: <span className="num-display">{formatMoney(partyCreditLimit, currency)}</span>
                        </div>
                      )}
                      {partyPriceLabel && (
                        <Badge variant="outline" className="mt-1.5 text-[10px]">{partyPriceLabel}</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setParty(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={`بحث ${partySectionTitle}...`}
                      className="h-9 pr-10 text-sm"
                      value={partySearch}
                      onChange={e => setPartySearch(e.target.value)}
                      onFocus={() => setShowPartyDrop(true)}
                    />
                    {showPartyDrop && (
                      <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                        {partiesQuery.isLoading ? (
                          <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                        ) : visibleParties.length === 0 ? (
                          <div className="space-y-2 p-3">
                            <p className="text-sm text-muted-foreground">
                              {isCash && (partiesQuery.data?.length ?? 0) > 0
                                ? `لا يوجد طرف يدعم عملة ${currency}`
                                : t('common.noResults')}
                            </p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={openAddParty}>
                              <Plus className="h-3.5 w-3.5" /> {addPartyLabel}
                            </Button>
                          </div>
                        ) : (
                          visibleParties.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 border-b border-border/40 p-3 text-right hover:bg-accent"
                              onClick={() => { setParty(p); setShowPartyDrop(false); setPartySearch(''); }}
                            >
                              <span className="font-medium">{p.nameAr}</span>
                              <span className="text-xs text-muted-foreground">{p.accountCode}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={openAddParty}>
                  <UserPlus className="h-3.5 w-3.5" /> {addPartyLabel}
                </Button>
              </div>
            </div>

            <div>
              <div className="invoice-section-title">التسديد والمستودع</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="invoice-field-label flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> طريقة التسديد
                  </Label>
                  <select className={SELECT_CLS} value={settlementType} onChange={e => setSettlementType(Number(e.target.value))}>
                    {INVOICE_SETTLEMENT_TYPES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {showWarehouse && (
                  <div>
                    <Label className="invoice-field-label flex items-center gap-1">
                      <Warehouse className="h-3 w-3" /> المستودع
                    </Label>
                    {warehousesQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                    ) : activeWarehouses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">لا توجد مستودعات</p>
                    ) : (
                      <select
                        className={SELECT_CLS}
                        value={warehouseId ?? savedWarehouseId ?? ''}
                        onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">— اختر المستودع —</option>
                        {activeWarehouses.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.nameAr}{w.isDefault ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {isCash && (
                  <>
                    <div>
                      <Label className="invoice-field-label">وسيلة الدفع</Label>
                      <select className={SELECT_CLS} value={paymentMethodKind} onChange={e => setPaymentMethodKind(Number(e.target.value))}>
                        {INVOICE_PAYMENT_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="invoice-field-label">
                        {paymentMethodKind === 1 ? 'الصندوق' : paymentMethodKind === 2 ? 'شركة الدفع' : 'المصرف'}
                      </Label>
                      {meansLoading ? (
                        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                      ) : paymentMeansOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">لا توجد خيارات</p>
                      ) : (
                        <select className={SELECT_CLS} value={paymentMeansAccountId ?? ''} onChange={e => setPaymentMeansAccountId(e.target.value ? Number(e.target.value) : null)}>
                          {paymentMeansOptions.map(o => (
                            <option key={o.accountId} value={o.accountId}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── البنود ── */}
          <div>
            <div className="invoice-section-title">{t('invoices.create.lines')}</div>
            {!party ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                اختر {partySectionTitle} أولاً لإضافة البنود
              </div>
            ) : (
            <>
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('invoices.create.itemSearch')}
                className="h-9 pr-10"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                onFocus={() => setShowItemDrop(true)}
              />
              {showItemDrop && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                  {itemsQuery.isLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                  ) : (itemsQuery.data?.items.length ?? 0) === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">{t('common.noResults')}</div>
                  ) : (
                    itemsQuery.data!.items.map(i => {
                      const alreadyRegular = lines.some(l => l.itemId === i.id && !l.isGift);
                      return (
                        <div key={i.id} className="flex items-center justify-between gap-2 border-b border-border/40 p-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-right hover:text-primary"
                            onClick={() => addItem(i)}
                          >
                            <div className="truncate font-medium">{i.nameAr}</div>
                            <div className="text-xs text-muted-foreground">
                              {i.code} · مخزون: {i.stockBaseQuantity}
                              {alreadyRegular ? ' · مضافة مسبقاً' : ''}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="num-display text-sm">{formatMoney(i.baseSalesPrice, currency)}</span>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => addItem(i, true)}>
                              هدية
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                {t('invoices.create.noLines')}
              </div>
            ) : (
              <div className="table-scroll rounded-xl border bg-card/70 shadow-sm">
                <table className="invoice-lines-table">
                  <colgroup>
                    <col className="w-12" />
                    <col className="w-14" />
                    <col className="w-[82px]" />
                    <col className="min-w-[260px]" />
                    <col className="w-[118px]" />
                    <col className="w-[116px]" />
                    <col className="w-[132px]" />
                    <col className="w-[132px]" />
                    <col className="w-[72px]" />
                    <col className="w-12" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="text-center">#</th>
                      <th></th>
                      <th>رمز</th>
                      <th>{t('invoices.create.colItem')}</th>
                      <th>{t('invoices.create.colUom')}</th>
                      <th className="text-left">{t('invoices.create.colQty')}</th>
                      <th className="text-left">{t('invoices.create.colPrice')}</th>
                      <th className="text-left">{t('invoices.create.colTotal')}</th>
                      <th className="text-center">هدية</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const rawLineTotal = l.quantity * l.unitPrice - l.lineDiscount;
                      const lineTotal = l.isGift ? 0 : rawLineTotal;
                      return (
                        <tr key={idx} className={l.isGift ? 'bg-emerald-500/5' : undefined}>
                          <td className="text-center text-xs text-muted-foreground">{idx + 1}</td>
                          <td>
                            {l.primaryImageId ? (
                              <ItemImageThumb itemId={l.itemId} imageId={l.primaryImageId} className="h-9 w-9 rounded" />
                            ) : (
                              <div className="h-9 w-9 rounded bg-muted" />
                            )}
                          </td>
                          <td className="font-mono text-[10px] text-muted-foreground">{l.itemCode}</td>
                          <td className="min-w-[260px]">
                            <div className="font-medium text-sm">{l.itemName}</div>
                            {l.isGift && <Badge variant="outline" className="mt-1 border-emerald-500/40 text-[10px] text-emerald-700">هدية</Badge>}
                          </td>
                          <td>
                            <select
                              className={cn(SELECT_CLS, 'min-w-0')}
                              value={l.unitOfMeasureId}
                              onChange={e => handleUnitChange(idx, Number(e.target.value))}
                            >
                              {l.units.map(u => (
                                <option key={u.unitOfMeasureId} value={u.unitOfMeasureId}>{u.unitName}</option>
                              ))}
                            </select>
                          </td>
                          <td className="text-left">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={cn(NUMERIC_INPUT_CLS, 'min-w-[108px]')}
                              value={l.quantity}
                              onChange={e => updateLine(idx, { quantity: parseDecimalInput(e.target.value) })}
                            />
                          </td>
                          <td className="text-left">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={cn(NUMERIC_INPUT_CLS, 'min-w-[124px]')}
                              value={l.unitPrice}
                              onChange={e => updateLine(idx, { unitPrice: parseDecimalInput(e.target.value) })}
                            />
                          </td>
                          <td className="text-left">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={cn(NUMERIC_INPUT_CLS, 'min-w-[124px] font-semibold')}
                              value={lineTotal}
                              disabled={l.isGift}
                              onChange={e => {
                                const total = parseDecimalInput(e.target.value);
                                const qty = l.quantity || 1;
                                updateLine(idx, { unitPrice: (total + l.lineDiscount) / qty });
                              }}
                            />
                          </td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={!!l.isGift}
                              onChange={e => updateLine(idx, { isGift: e.target.checked })}
                              title="هدية"
                            />
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="rounded p-1 text-destructive hover:bg-destructive/10"
                              onClick={() => removeLine(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </>
            )}
          </div>

          {/* ── الخصم والإجماليات ── */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="invoice-section-title">{t('invoices.create.discountAndTax')}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.discountPct')}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className={NUMERIC_INPUT_CLS}
                    value={discountPct}
                    onChange={e => { setDiscountPct(parseDecimalInput(e.target.value)); setDiscountAmt(0); }}
                  />
                </div>
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.discountAmt')}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className={NUMERIC_INPUT_CLS}
                    value={discountAmt}
                    disabled={discountPct > 0}
                    onChange={e => setDiscountAmt(parseDecimalInput(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="invoice-field-label">الإضافة / المصاريف</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className={NUMERIC_INPUT_CLS}
                    value={additionAmt}
                    onChange={e => setAdditionAmt(parseDecimalInput(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.taxPct')}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className={NUMERIC_INPUT_CLS}
                    value={taxRate}
                    onChange={e => setTaxRate(parseDecimalInput(e.target.value))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="invoice-field-label">{t('common.notes')}</Label>
                  <Input className="h-8 text-xs" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
              {overCredit && party && (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('invoices.create.overCreditLimitWarning', { limit: formatMoney(partyCreditLimit, currency) })}</span>
                </div>
              )}
            </div>

            <div>
              <div className="invoice-section-title">{t('invoices.create.totals')}</div>
              <InvoiceTotalsPanel
                currency={currency}
                subTotal={subTotal}
                discount={effectiveDiscount}
                tax={taxAmount}
                total={total}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {showDeleteConfirm && loadedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setShowDeleteConfirm(false)}
        >
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <h3 className="text-base font-bold">حذف الفاتورة</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              سيتم حذف الفاتورة <span className="font-semibold text-foreground">{loadedInvoice.invoiceNumber}</span> وحذف قيدها المحاسبي وعكس أثرها على المخزون ورصيد الطرف. لا يمكن التراجع.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={deleteMutation.isPending} onClick={() => setShowDeleteConfirm(false)}>
                إلغاء
              </Button>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                {deleteMutation.isPending ? 'جارٍ الحذف...' : 'حذف نهائي'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
