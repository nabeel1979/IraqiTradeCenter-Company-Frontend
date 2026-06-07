import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save, Search, Trash2, X, AlertTriangle, ArrowRight, Plus, UserPlus,
  Warehouse, Wallet, Hash, Calendar, Coins, MoreVertical, Package, CreditCard, Receipt,
  Printer, TrendingUp, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';
import { inventoryApi, ITEM_SALE_PRICE_TYPES, type ItemPriceType, type ItemListDto, type ItemDetailDto, type ItemMovementDto, type ItemWarehouseStockDto } from '@/lib/api/inventory';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { invoicesApi, type CreateInvoicePayload } from '@/lib/api/invoices';
import { invoiceTypesApi, type InvoiceTypeDto, INVOICE_SETTLEMENT_TYPES, INVOICE_PAYMENT_METHODS } from '@/lib/api/invoiceTypes';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { currenciesApi } from '@/lib/api/currencies';
import { accountingApi } from '@/lib/api/accounting';
import { getFinancialManagementPath } from '@/pages/financial-management/routes';
import { writeFmFocus } from '@/pages/financial-management/fmFocus';
import { resolveUnitPriceForParty } from '@/lib/inventory/partyItemPrice';
import { invoiceListPathForCategory } from '@/pages/invoices/invoiceRoutes';
import { InvoiceTotalsPanel } from '@/pages/invoices/components/InvoiceTotalsPanel';
import { cn, formatMoney, extractApiError } from '@/lib/utils';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type { FinancialPartyDto, FinancialPartyKind, AccountDto } from '@/types/api';

// ── أنواع ──────────────────────────────────────────────────────────────────
interface LineUnit { unitOfMeasureId: number; unitName: string; isBase: boolean; }

interface InvoiceLine {
  itemId: number; itemCode: string; itemName: string;
  primaryImageId?: number | null; itemDetail?: ItemDetailDto;
  units: LineUnit[]; unitOfMeasureId: number; unitName: string;
  quantity: number; unitPrice: number; lineDiscount: number; isGift?: boolean;
}

interface ExpenseLine {
  id: string;
  debitAmount: number;
  creditAmount: number;
  accountId: number | null;
  accountName: string;
  accountCode: string;
  description: string;
  accountSearch: string;
}

type InvoiceTab = 'lines' | 'gifts' | 'expenses' | 'settlement';

// ── ثوابت ──────────────────────────────────────────────────────────────────
const MOVEMENT_TYPE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'شراء وارد',       color: 'text-green-600'  },
  2: { label: 'بيع صادر',        color: 'text-red-600'    },
  3: { label: 'مرتجع بيع',       color: 'text-green-500'  },
  4: { label: 'مرتجع شراء',      color: 'text-red-500'    },
  5: { label: 'تسوية',           color: 'text-blue-600'   },
  6: { label: 'تحويل',           color: 'text-orange-500' },
  7: { label: 'تالف',            color: 'text-destructive'},
  8: { label: 'رصيد افتتاحي',    color: 'text-primary'    },
};

const SELECT_CLS = 'invoice-select';
const NUMERIC_INPUT_CLS = 'invoice-number-input';

const parseDecimalInput = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const flattenAccounts = (list: AccountDto[]): AccountDto[] => {
  const result: AccountDto[] = [];
  const traverse = (items: AccountDto[]) => {
    for (const a of items) {
      if (a.isLeaf) result.push(a);
      if (a.children?.length) traverse(a.children);
    }
  };
  traverse(list);
  return result;
};

// ── مكوّن زر التاب ─────────────────────────────────────────────────────────
function TabBtn({
  active, onClick, children, count,
}: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────────────
export function CreateInvoicePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: idParam } = useParams();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canDelete = can(PERMS.Sales.Invoices.Delete);
  const editId = idParam ? Number(idParam) : null;
  const isEdit = editId != null && !Number.isNaN(editId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── تاب نشط ──
  const [activeTab, setActiveTab] = useState<InvoiceTab>('lines');
  const [expAccountFocusId, setExpAccountFocusId] = useState<string | null>(null);

  // ── قائمة الإجراءات (Portal) ──
  interface LineMenu { origIdx: number; itemId: number; itemName: string; x: number; y: number; }
  const [lineMenu, setLineMenu] = useState<LineMenu | null>(null);

  const openLineMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, origIdx: number, itemId: number, itemName: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setLineMenu({ origIdx, itemId, itemName, x: rect.right, y: rect.bottom + 4 });
  }, []);

  // ── مودالات المادة ──
  const [itemCardId, setItemCardId] = useState<number | null>(null);
  const [itemMovementsId, setItemMovementsId] = useState<{ id: number; name: string } | null>(null);
  const [itemStockId, setItemStockId] = useState<{ id: number; name: string } | null>(null);

  const itemCardQuery = useQuery({
    queryKey: ['item-card', itemCardId],
    queryFn: () => inventoryApi.get(itemCardId!),
    enabled: itemCardId != null,
  });
  const itemMovementsQuery = useQuery({
    queryKey: ['item-movements', itemMovementsId?.id],
    queryFn: () => inventoryApi.getMovements(itemMovementsId!.id),
    enabled: itemMovementsId != null,
  });
  const itemStockQuery = useQuery({
    queryKey: ['item-stock', itemStockId?.id],
    queryFn: () => inventoryApi.getStockPerWarehouse(itemStockId!.id),
    enabled: itemStockId != null,
  });

  // ── بيانات الفاتورة المحمَّلة (تعديل) ──
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

  const listPath = useMemo(() => invoiceListPathForCategory(invoiceType?.category ?? 1), [invoiceType?.category]);

  const partyKind = useMemo((): FinancialPartyKind => {
    if (invoiceType?.defaultPartyKind === 2) return 'Supplier';
    if (invoiceType?.defaultPartyKind === 1) return 'Customer';
    if (invoiceType?.category === 2 || invoiceType?.category === 3) return 'Supplier';
    return 'Customer';
  }, [invoiceType]);

  const partySectionTitle = 'العميل / المورد';
  const addPartyLabel = partyKind === 'Supplier' ? 'إضافة مورد' : 'إضافة عميل';

  // ── حالة النموذج ──
  const [party, setParty] = useState<FinancialPartyDto | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDrop, setShowPartyDrop] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDrop, setShowItemDrop] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [additionPct, setAdditionPct] = useState(0);
  const [additionAmt, setAdditionAmt] = useState(0);
  const [notes, setNotes] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // رأس الفاتورة
  const [manualNumber, setManualNumber] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [invoiceDate, setInvoiceDate] = useState(todayIso);
  const [currency, setCurrency] = useState('IQD');

  // التسديد
  const [settlementType, setSettlementType] = useState<number>(2);
  const [paymentMethodKind, setPaymentMethodKind] = useState<number>(1);
  const [paymentMeansAccountId, setPaymentMeansAccountId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const isCash = settlementType === 1;

  // المصاريف
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);
  const [expenseDistMethod, setExpenseDistMethod] = useState<'value' | 'volume' | 'weight'>('value');

  // ── استعلامات الحسابات (للمصاريف) ──
  const accountsQuery = useQuery({
    queryKey: ['accounts-tree'],
    queryFn: accountingApi.getTree,
    staleTime: 10 * 60_000,
  });
  const restrictedIdsQuery = useQuery({
    queryKey: ['accounts-journal-restricted'],
    queryFn: accountingApi.getJournalRestrictedAccountIds,
    staleTime: 10 * 60_000,
  });
  const restrictedIds = useMemo(() => new Set(restrictedIdsQuery.data ?? []), [restrictedIdsQuery.data]);

  // حسابات المصاريف: الأوراق فقط، مع إخفاء الصناديق والمستودعات
  const expenseAccounts = useMemo(() =>
    flattenAccounts(accountsQuery.data ?? []).filter(a =>
      !restrictedIds.has(a.id) &&
      !a.isLockedForWarehouse,
    ),
  [accountsQuery.data, restrictedIds]);

  const focusedExp = expenseLines.find(e => e.id === expAccountFocusId);
  const expAccountResults = useMemo(() => {
    if (!expAccountFocusId) return [];
    const q = (focusedExp?.accountSearch ?? '').trim().toLowerCase();
    if (!q) return expenseAccounts.slice(0, 12);
    return expenseAccounts.filter(a =>
      a.code.toLowerCase().includes(q) || a.nameAr.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [expenseAccounts, focusedExp, expAccountFocusId]);

  // ── مستودعات ──
  const currenciesQuery = useQuery({ queryKey: ['currencies', 'enabled'], queryFn: () => currenciesApi.getAll(true), staleTime: 5 * 60_000 });
  useEffect(() => {
    const list = currenciesQuery.data;
    if (!list?.length) return;
    if (list.some(c => c.code === currency)) return;
    const base = list.find(c => c.isBase) ?? list[0];
    if (base) setCurrency(base.code);
  }, [currenciesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const warehousesQuery = useQuery({ queryKey: ['warehouses-manage'], queryFn: () => inventoryApi.listWarehousesManage(), staleTime: 60_000 });
  const activeWarehouses = useMemo(() => (warehousesQuery.data ?? []).filter(w => w.isActive), [warehousesQuery.data]);
  const showWarehouse = invoiceType?.affectsInventory !== false;
  const savedWarehouseId = loadedInvoice?.warehouseId ?? null;

  useEffect(() => { if (!isEdit || savedWarehouseId == null) return; setWarehouseId(savedWarehouseId); }, [isEdit, savedWarehouseId]);
  useEffect(() => {
    if (!showWarehouse || activeWarehouses.length === 0) return;
    if (isEdit) { if (!hydrated) return; if (warehouseId != null && activeWarehouses.some(w => w.id === warehouseId)) return; }
    if (warehouseId && activeWarehouses.some(w => w.id === warehouseId)) return;
    const fromType = invoiceType?.defaultWarehouseId;
    if (fromType && activeWarehouses.some(w => w.id === fromType)) { setWarehouseId(fromType); return; }
    setWarehouseId((activeWarehouses.find(w => w.isDefault) ?? activeWarehouses[0]).id);
  }, [invoiceType?.defaultWarehouseId, activeWarehouses, showWarehouse, isEdit, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (invoiceType?.settlementType) setSettlementType(invoiceType.settlementType);
    if (invoiceType?.paymentMethodKind) setPaymentMethodKind(invoiceType.paymentMethodKind);
  }, [invoiceType?.settlementType, invoiceType?.paymentMethodKind]);

  // ── وسائل الدفع ──
  const cashBoxesQuery = useQuery({ queryKey: ['cash-boxes', 'active'], queryFn: () => cashBoxesApi.getAll(true), enabled: isCash && paymentMethodKind === 1, staleTime: 60_000 });
  const paymentCompaniesQuery = useQuery({ queryKey: ['financial-parties', 'PaymentCompany'], queryFn: () => financialManagementApi.getParties({ kind: 'PaymentCompany' }), enabled: isCash && paymentMethodKind === 2, staleTime: 60_000 });
  const banksQuery = useQuery({ queryKey: ['financial-parties', 'Bank'], queryFn: () => financialManagementApi.getParties({ kind: 'Bank' }), enabled: isCash && paymentMethodKind === 3, staleTime: 60_000 });

  const paymentMeansOptions = useMemo(() => {
    if (paymentMethodKind === 1) return (cashBoxesQuery.data ?? []).map(c => ({ accountId: c.accountId, label: `${c.nameAr} · ${c.code}` }));
    if (paymentMethodKind === 2) return (paymentCompaniesQuery.data ?? []).map(p => ({ accountId: p.accountId, label: `${p.nameAr} · ${p.accountCode}` }));
    return (banksQuery.data ?? []).map(p => ({ accountId: p.accountId, label: `${p.nameAr} · ${p.accountCode}` }));
  }, [paymentMethodKind, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]);

  const meansLoading = (paymentMethodKind === 1 && cashBoxesQuery.isLoading) || (paymentMethodKind === 2 && paymentCompaniesQuery.isLoading) || (paymentMethodKind === 3 && banksQuery.isLoading);

  useEffect(() => {
    if (!isCash) { setPaymentMeansAccountId(null); return; }
    if (!paymentMeansOptions.length) { setPaymentMeansAccountId(null); return; }
    if (paymentMeansAccountId && paymentMeansOptions.some(o => o.accountId === paymentMeansAccountId)) return;
    let preferredId: number | null = null;
    if (paymentMethodKind === 1 && invoiceType?.paymentCashBoxId) preferredId = (cashBoxesQuery.data ?? []).find(c => c.id === invoiceType.paymentCashBoxId)?.accountId ?? null;
    else if (paymentMethodKind === 2 && invoiceType?.paymentCompanyId) preferredId = (paymentCompaniesQuery.data ?? []).find(p => p.id === invoiceType.paymentCompanyId)?.accountId ?? null;
    else if (paymentMethodKind === 3 && invoiceType?.paymentBankId) preferredId = (banksQuery.data ?? []).find(p => p.id === invoiceType.paymentBankId)?.accountId ?? null;
    setPaymentMeansAccountId(preferredId ?? paymentMeansOptions[0].accountId);
  }, [isCash, paymentMethodKind, paymentMeansOptions, invoiceType, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── أطراف ──
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

  const availableCurrencies = useMemo<string[]>(() => {
    if (!isCash) return party?.allowedCurrencies ?? [];
    if (paymentMethodKind === 1) { const box = (cashBoxesQuery.data ?? []).find(c => c.accountId === paymentMeansAccountId); return (box?.currencies ?? []).filter(x => x.isActive).map(x => x.currency); }
    if (paymentMethodKind === 2) { const p = (paymentCompaniesQuery.data ?? []).find(x => x.accountId === paymentMeansAccountId); return p?.allowedCurrencies ?? []; }
    const b = (banksQuery.data ?? []).find(x => x.accountId === paymentMeansAccountId);
    return b?.allowedCurrencies ?? [];
  }, [isCash, paymentMethodKind, paymentMeansAccountId, party, cashBoxesQuery.data, paymentCompaniesQuery.data, banksQuery.data]);

  useEffect(() => { if (!availableCurrencies.length) return; if (availableCurrencies.includes(currency)) return; setCurrency(availableCurrencies[0]); }, [availableCurrencies]); // eslint-disable-line react-hooks/exhaustive-deps
  const currencyLocked = availableCurrencies.length === 1;
  const currencyOptions = useMemo(() => { const all = currenciesQuery.data ?? []; if (availableCurrencies.length > 0) return all.filter(c => availableCurrencies.includes(c.code)); return all; }, [currenciesQuery.data, availableCurrencies]);
  const visibleParties = useMemo(() => { const list = partiesQuery.data ?? []; if (!isCash) return list; return list.filter(p => (p.allowedCurrencies ?? []).includes(currency)); }, [partiesQuery.data, isCash, currency]);
  const partyPriceLabel = useMemo(() => { if (!party?.defaultSalesPriceType) return null; return ITEM_SALE_PRICE_TYPES.find(p => p.value === party.defaultSalesPriceType)?.label ?? null; }, [party]);
  const partyCreditLimit = useMemo(() => party?.creditLimits?.IQD?.debit ?? 0, [party]);

  // ── مواد ──
  const itemsQuery = useQuery({ queryKey: ['items', itemSearch], queryFn: () => inventoryApi.list({ search: itemSearch, pageSize: 10 }), enabled: showItemDrop });

  // معرّفات المواد المستخدمة (حسب التاب)
  const usedItemIds = useMemo(
    () => new Set(
      activeTab === 'gifts'
        ? lines.filter(l => l.isGift).map(l => l.itemId)
        : lines.filter(l => !l.isGift).map(l => l.itemId)
    ),
    [lines, activeTab],
  );

  // ── البنود المشتقة ──
  const regularLinesWithIdx = useMemo(() => lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => !l.isGift), [lines]);
  const giftLinesWithIdx = useMemo(() => lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => l.isGift), [lines]);

  // ── الحسابات ──
  const subTotal = useMemo(() => lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice - (l.isGift ? l.quantity * l.unitPrice : l.lineDiscount)), 0), [lines]);
  const effectiveDiscount = useMemo(() => (discountPct > 0 ? Math.round((subTotal * discountPct) / 100) : discountAmt), [subTotal, discountPct, discountAmt]);
  const afterDiscount = subTotal - effectiveDiscount;
  const taxAmount = useMemo(() => Math.round((afterDiscount * taxRate) / 100), [afterDiscount, taxRate]);
  const total = afterDiscount + additionAmt + taxAmount;

  useEffect(() => { if (discountPct > 0) setDiscountAmt(Math.round(subTotal * discountPct / 100)); }, [subTotal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (additionPct > 0) setAdditionAmt(Math.round(subTotal * additionPct / 100)); }, [subTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiscountPct = useCallback((val: number) => { setDiscountPct(val); setDiscountAmt(val > 0 ? Math.round(subTotal * val / 100) : 0); }, [subTotal]);
  const handleDiscountAmt = useCallback((val: number) => { setDiscountAmt(val); setDiscountPct(val > 0 && subTotal > 0 ? parseFloat((val / subTotal * 100).toFixed(2)) : 0); }, [subTotal]);
  const handleAdditionPct = useCallback((val: number) => { setAdditionPct(val); setAdditionAmt(val > 0 ? Math.round(subTotal * val / 100) : 0); }, [subTotal]);
  const handleAdditionAmt = useCallback((val: number) => { setAdditionAmt(val); setAdditionPct(val > 0 && subTotal > 0 ? parseFloat((val / subTotal * 100).toFixed(2)) : 0); }, [subTotal]);

  const openAddParty = () => { writeFmFocus({ mode: 'add', kind: partyKind }); navigate(getFinancialManagementPath(partyKind)); };

  const resolveLineUnitPrice = useCallback(async (detail: ItemDetailDto, unitId: number) => {
    const source = invoiceType?.autoPriceSource ?? 2;
    if (source === 2) return resolveUnitPriceForParty(detail, unitId, (party?.defaultSalesPriceType ?? 4) as ItemPriceType, currency);
    if (source === 1 || source === 3) {
      try { const res = await invoicesApi.lastPrice({ itemId: detail.id, mode: source === 1 ? 'purchase' : 'sale', financialPartyId: party?.id, unitOfMeasureId: unitId || undefined }); return res.found ? res.unitPrice : 0; } catch { return 0; }
    }
    return 0;
  }, [party, invoiceType, currency]);

  const addItem = useCallback(async (item: ItemListDto, forceGift = false) => {
    const asGift = forceGift || activeTab === 'gifts';
    const relevantLines = asGift ? lines.filter(l => l.isGift) : lines.filter(l => !l.isGift);
    if (relevantLines.some(l => l.itemId === item.id)) {
      toast.error(asGift ? 'هذه المادة موجودة في الهدايا مسبقاً' : 'لا يمكن تكرار المادة في الفاتورة');
      setItemSearch(''); setShowItemDrop(false); return;
    }
    try {
      const detail = await inventoryApi.get(item.id);
      const defaultUnit = detail.units.find(u => u.isBase) ?? detail.units[0];
      const unitId = defaultUnit?.unitOfMeasureId ?? 0;
      const unitPrice = await resolveLineUnitPrice(detail, unitId);
      const units: LineUnit[] = detail.units.map(u => ({ unitOfMeasureId: u.unitOfMeasureId, unitName: u.unitName ?? '', isBase: u.isBase }));
      const primaryImageId = item.primaryImageId ?? detail.images.find(img => img.isPrimary)?.id ?? detail.images[0]?.id ?? null;
      setLines(prev => [...prev, { itemId: item.id, itemCode: item.code, itemName: item.nameAr, primaryImageId, itemDetail: detail, units, unitOfMeasureId: unitId, unitName: defaultUnit?.unitName ?? '', quantity: 1, unitPrice, lineDiscount: 0, isGift: asGift }]);
      setItemSearch(''); setShowItemDrop(false);
    } catch { toast.error(t('invoices.create.itemLoadError', { defaultValue: 'تعذّر تحميل أسعار المادة' })); }
  }, [lines, party, invoiceType, t, resolveLineUnitPrice, activeTab]);

  const updateLine = (idx: number, patch: Partial<InvoiceLine>) =>
    setLines(prev => { const current = prev[idx]; if (!current) return prev; return prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)); });
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const handleUnitChange = useCallback(async (idx: number, unitId: number) => {
    const line = lines[idx]; if (!line) return;
    const u = line.units.find(x => x.unitOfMeasureId === unitId);
    const unitPrice = line.itemDetail ? await resolveLineUnitPrice(line.itemDetail, unitId) : line.unitPrice;
    updateLine(idx, { unitOfMeasureId: unitId, unitName: u?.unitName ?? '', unitPrice });
  }, [lines, resolveLineUnitPrice]);

  // ── المصاريف ──
  const addExpenseLine = () => {
    setExpenseLines(prev => [...prev, { id: Date.now().toString(), debitAmount: 0, creditAmount: 0, accountId: null, accountName: '', accountCode: '', description: '', accountSearch: '' }]);
  };
  const updateExpenseLine = (id: string, patch: Partial<ExpenseLine>) =>
    setExpenseLines(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  const removeExpenseLine = (id: string) => setExpenseLines(prev => prev.filter(e => e.id !== id));
  const totalExpenses = useMemo(() => expenseLines.reduce((s, e) => s + e.debitAmount, 0), [expenseLines]);

  // ── تهيئة وضع التعديل ──
  useEffect(() => {
    if (!isEdit || hydratedRef.current || !loadedInvoice) return;
    if (typeId != null && !invoiceType) return;
    hydratedRef.current = true;
    (async () => {
      setTaxRate(loadedInvoice.taxRate ?? 0);
      if ((loadedInvoice.discountPercentage ?? 0) > 0) { setDiscountPct(loadedInvoice.discountPercentage!); setDiscountAmt(0); }
      else { setDiscountPct(0); setDiscountAmt(loadedInvoice.discountAmount ?? 0); }
      setAdditionAmt(loadedInvoice.additionAmount ?? 0); setAdditionPct(0);
      setNotes(loadedInvoice.notes ?? '');
      if (loadedInvoice.currency) setCurrency(loadedInvoice.currency);
      setInvoiceDate((loadedInvoice.invoiceDate ?? '').slice(0, 10) || todayIso);
      if (loadedInvoice.invoiceNumber) { setManualNumber(true); setInvoiceNumber(loadedInvoice.invoiceNumber); }
      setSettlementType(loadedInvoice.settlementType ?? 2);
      if (loadedInvoice.paymentMeansAccountId) setPaymentMeansAccountId(loadedInvoice.paymentMeansAccountId);
      if (loadedInvoice.warehouseId != null) setWarehouseId(loadedInvoice.warehouseId);
      if (loadedInvoice.financialPartyId) {
        try {
          const [customers, suppliers] = await Promise.all([financialManagementApi.getParties({ kind: 'Customer', includeInactive: true }), financialManagementApi.getParties({ kind: 'Supplier', includeInactive: true })]);
          const found = [...customers, ...suppliers].find(p => p.id === loadedInvoice.financialPartyId);
          if (found) setParty(found);
        } catch { /* تجاهل */ }
      }
      try {
        const built = await Promise.all(loadedInvoice.lines.map(async (ln): Promise<InvoiceLine> => {
          let units: LineUnit[] = []; let itemDetail: ItemDetailDto | undefined; let itemCode = ''; let primaryImageId: number | null = null;
          try { const detail = await inventoryApi.get(ln.itemId); itemDetail = detail; itemCode = detail.code ?? ''; units = detail.units.map(u => ({ unitOfMeasureId: u.unitOfMeasureId, unitName: u.unitName ?? '', isBase: u.isBase })); primaryImageId = detail.images.find(i => i.isPrimary)?.id ?? detail.images[0]?.id ?? null; } catch { /* تجاهل */ }
          const uomId = ln.unitOfMeasureId ?? (units.find(u => u.isBase)?.unitOfMeasureId ?? 0);
          return { itemId: ln.itemId, itemCode, itemName: ln.itemName, primaryImageId, itemDetail, units, unitOfMeasureId: uomId, unitName: ln.unitName ?? (units.find(u => u.unitOfMeasureId === uomId)?.unitName ?? ''), quantity: ln.quantity, unitPrice: ln.unitPrice, lineDiscount: ln.lineDiscount };
        }));
        setLines(built);
      } catch { /* تجاهل */ }
      setHydrated(true);
    })();
  }, [isEdit, loadedInvoice, invoiceType, typeId, partyKind, todayIso]);

  // ── حفظ ──
  const invalidateInvoices = () => queryClient.invalidateQueries({ queryKey: ['invoices'] });

  const createMutation = useMutation({
    mutationFn: (p: CreateInvoicePayload) => invoicesApi.create(p),
    onSuccess: res => {
      if (res.success) {
        invalidateInvoices();
        toast.success(t('invoices.create.issued', { number: res.data?.invoiceNumber }));
        navigate(listPath);
      } else res.errors?.forEach(e => toast.error(e));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (p: CreateInvoicePayload) => invoicesApi.update(editId!, p),
    onSuccess: res => {
      if (res.success) {
        invalidateInvoices();
        queryClient.invalidateQueries({ queryKey: ['invoice', editId] });
        toast.success('تم تحديث الفاتورة بنجاح');
        navigate(listPath);
      } else res.errors?.forEach(e => toast.error(e));
    },
    onError: () => toast.error('فشل تحديث الفاتورة'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.remove(editId!),
    onSuccess: res => {
      if (res.success) {
        invalidateInvoices();
        queryClient.removeQueries({ queryKey: ['invoice', editId] });
        toast.success('تم حذف الفاتورة وقيدها المحاسبي');
        navigate(listPath);
      } else res.errors?.forEach(e => toast.error(e));
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل حذف الفاتورة'),
  });

  const canDeleteInvoice = isEdit && canDelete && loadedInvoice?.status !== 'Cancelled';
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    const regularLines = lines.filter(l => !l.isGift);
    if (!party) return toast.error(partyKind === 'Supplier' ? 'اختر مورداً' : t('invoices.create.selectCustomer'));
    if (regularLines.length === 0) return toast.error(t('invoices.create.addLines'));
    if (lines.some(l => l.unitOfMeasureId === 0)) return toast.error(t('invoices.create.selectUom'));
    if (lines.some(l => l.quantity <= 0)) return toast.error('كمية كل بند يجب أن تكون أكبر من صفر');
    if (regularLines.some(l => l.unitPrice <= 0)) return toast.error('سعر كل بند يجب أن يكون أكبر من صفر');
    if (showWarehouse && !warehouseId) return toast.error('اختر المستودع');
    if (isCash && !paymentMeansAccountId) return toast.error('اختر وسيلة الدفع');
    if (manualNumber && !invoiceNumber.trim()) return toast.error('أدخل رقم الفاتورة اليدوي');
    if (!invoiceDate) return toast.error('اختر تاريخ الفاتورة');
    if (total <= 0) return toast.error('لا يمكن حفظ فاتورة إجماليها صفر');
    const payload: CreateInvoicePayload = {
      financialPartyId: party.id, invoiceTypeId: typeId ?? undefined,
      warehouseId: showWarehouse ? warehouseId ?? undefined : undefined,
      settlementType, paymentMeansAccountId: isCash ? paymentMeansAccountId ?? undefined : undefined,
      invoiceNumber: manualNumber && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      invoiceDate, currency, taxRate,
      discountPercentage: discountPct, discountAmount: discountPct > 0 ? 0 : discountAmt,
      additionAmount: additionAmt, notes: notes || undefined,
      lines: lines.map(l => ({ itemId: l.itemId, unitOfMeasureId: l.unitOfMeasureId, quantity: l.quantity, unitPriceOverride: l.unitPrice, lineDiscount: l.isGift ? l.quantity * l.unitPrice : l.lineDiscount })),
    };
    if (isEdit) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  if (isEdit && invoiceQuery.isError) {
    return (<div className="flex flex-col items-center gap-3 py-20 text-center"><AlertTriangle className="h-8 w-8 text-destructive" /><p className="text-sm text-muted-foreground">تعذّر تحميل الفاتورة</p><Button variant="outline" size="sm" onClick={() => navigate(listPath)}>الفواتير</Button></div>);
  }
  if (isEdit && (invoiceQuery.isLoading || !hydrated)) {
    return (<div className="flex items-center justify-center py-24 text-sm text-muted-foreground">{t('common.loading')}...</div>);
  }

  // ── مكوّن جدول البنود (مشترك بين الأصناف والهدايا) ──────────────────────
  const renderLineTable = (linesDisplay: Array<InvoiceLine & { origIdx: number }>, tab: 'lines' | 'gifts') => {
    if (linesDisplay.length === 0) {
      return (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {tab === 'lines' ? t('invoices.create.noLines') : 'لا توجد هدايا مضافة'}
        </div>
      );
    }
    return (
      <div className="overflow-hidden rounded-xl border bg-card/70 shadow-sm">
        <table className="invoice-lines-table">
          <colgroup>
            <col className="w-8" />          {/* # */}
            <col />                           {/* المادة — مرن */}
            <col className="w-[115px]" />     {/* وحدة — أوسع */}
            <col className="w-[90px]" />      {/* كمية */}
            <col className="w-[100px]" />     {/* السعر */}
            <col className="w-[100px]" />     {/* الإجمالي */}
            <col className="w-9" />           {/* الإجراءات */}
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">#</th>
              <th>{t('invoices.create.colItem')}</th>
              <th className="text-center">{t('invoices.create.colUom')}</th>
              <th className="text-center">{t('invoices.create.colQty')}</th>
              <th className="text-center">{t('invoices.create.colPrice')}</th>
              <th className="text-center">{t('invoices.create.colTotal')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linesDisplay.map((l, displayIdx) => {
              const rawLineTotal = l.quantity * l.unitPrice - l.lineDiscount;
              const lineTotal = l.isGift ? 0 : rawLineTotal;
              return (
                <tr key={l.origIdx} className={l.isGift ? 'bg-emerald-500/5' : undefined}>
                  <td className="text-center text-[10px] text-muted-foreground">{displayIdx + 1}</td>
                  <td>
                    <div className="flex min-w-0 items-center gap-1.5">
                      {l.primaryImageId
                        ? <ItemImageThumb itemId={l.itemId} imageId={l.primaryImageId} className="h-6 w-6 shrink-0 rounded" />
                        : <div className="h-6 w-6 shrink-0 rounded bg-muted" />}
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-medium leading-tight">{l.itemName}</div>
                        <div className="font-mono text-[9px] leading-tight text-muted-foreground">{l.itemCode}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="invoice-table-select"
                      value={l.unitOfMeasureId}
                      onChange={e => handleUnitChange(l.origIdx, Number(e.target.value))}
                    >
                      {l.units.map(u => <option key={u.unitOfMeasureId} value={u.unitOfMeasureId}>{u.unitName}</option>)}
                    </select>
                  </td>
                  <td>
                    <Input
                      type="text" inputMode="decimal"
                      className="invoice-table-input"
                      value={l.quantity || ''}
                      placeholder="0"
                      onChange={e => updateLine(l.origIdx, { quantity: parseDecimalInput(e.target.value) })}
                    />
                  </td>
                  <td>
                    <Input
                      type="text" inputMode="decimal"
                      className="invoice-table-input"
                      value={l.unitPrice || ''}
                      placeholder="0"
                      disabled={l.isGift}
                      onChange={e => updateLine(l.origIdx, { unitPrice: parseDecimalInput(e.target.value) })}
                    />
                  </td>
                  <td>
                    <Input
                      type="text" inputMode="decimal"
                      className="invoice-table-input"
                      value={lineTotal || ''}
                      placeholder="0"
                      disabled={l.isGift}
                      onChange={e => {
                        const tot = parseDecimalInput(e.target.value);
                        updateLine(l.origIdx, { unitPrice: (tot + l.lineDiscount) / (l.quantity || 1) });
                      }}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-accent"
                      onClick={e => openLineMenu(e, l.origIdx, l.itemId, l.itemName)}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ── محتوى تاب البنود / الهدايا ──────────────────────────────────────────
  const renderItemsTab = (tab: 'lines' | 'gifts') => {
    const linesDisplay = tab === 'lines' ? regularLinesWithIdx : giftLinesWithIdx;
    return (
      <div className="space-y-2">
        {/* بحث عن مادة */}
        {party && (
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={tab === 'lines' ? t('invoices.create.itemSearch') : 'ابحث عن مادة هدية...'}
              className="h-8 pr-10 text-sm"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              onFocus={() => setShowItemDrop(true)}
            />
            {showItemDrop && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                {itemsQuery.isLoading
                  ? <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                  : (itemsQuery.data?.items.length ?? 0) === 0
                    ? <div className="p-3 text-sm text-muted-foreground">{t('common.noResults')}</div>
                    : itemsQuery.data!.items.filter(i => !usedItemIds.has(i.id)).map(i => (
                      <div key={i.id} className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
                        <button type="button" className="min-w-0 flex-1 text-right hover:text-primary" onClick={() => addItem(i)}>
                          <div className="truncate text-sm font-medium">{i.nameAr}</div>
                          <div className="text-[11px] text-muted-foreground">{i.code} · مخزون: {i.stockBaseQuantity}</div>
                        </button>
                        <span className="num-display text-xs">{formatMoney(i.baseSalesPrice, currency)}</span>
                      </div>
                    ))
                }
              </div>
            )}
          </div>
        )}

        {!party
          ? <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">اختر {partySectionTitle} أولاً</div>
          : renderLineTable(linesDisplay, tab)
        }
      </div>
    );
  };

  // ── محتوى تاب المصاريف ──────────────────────────────────────────────────
  const renderExpensesTab = () => (
    <div className="space-y-3">
      {/* طريقة التوزيع */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-secondary/20 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">طريقة التوزيع:</span>
        {([['value', 'على القيمة الإجمالية'], ['volume', 'على الحجم'], ['weight', 'على الوزن']] as const).map(([val, label]) => (
          <label key={val} className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="radio" name="expDist" value={val} checked={expenseDistMethod === val} onChange={() => setExpenseDistMethod(val)} className="accent-primary" />
            {label}
          </label>
        ))}
      </div>

      {/* جدول المصاريف — بدون overflow-hidden كي تظهر قوائم الحساب */}
      <div className="rounded-xl border bg-card/70 shadow-sm">
        <table className="invoice-lines-table">
          <colgroup>
            <col className="w-7" />        {/* # */}
            <col className="w-[105px]" />  {/* مدين */}
            <col className="w-[105px]" />  {/* دائن */}
            <col className="w-[45%]" />    {/* الحساب */}
            <col />                         {/* البيان */}
            <col className="w-8" />        {/* × */}
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">#</th>
              <th className="text-center">مدين</th>
              <th className="text-center">دائن</th>
              <th className="text-right">الحساب</th>
              <th className="text-right">البيان</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseLines.length === 0
              ? <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">لا توجد مصاريف — اضغط "إضافة سطر"</td></tr>
              : expenseLines.map((exp, idx) => (
                <tr key={exp.id}>
                  <td className="text-center text-[10px] text-muted-foreground">{idx + 1}</td>
                  {/* مدين */}
                  <td>
                    <Input
                      type="text" inputMode="decimal"
                      className="invoice-table-input"
                      value={exp.debitAmount > 0 ? exp.debitAmount : ''}
                      placeholder="0"
                      onChange={e => updateExpenseLine(exp.id, { debitAmount: parseDecimalInput(e.target.value) })}
                    />
                  </td>
                  {/* دائن */}
                  <td>
                    <Input
                      type="text" inputMode="decimal"
                      className="invoice-table-input"
                      value={exp.creditAmount > 0 ? exp.creditAmount : ''}
                      placeholder="0"
                      onChange={e => updateExpenseLine(exp.id, { creditAmount: parseDecimalInput(e.target.value) })}
                    />
                  </td>
                  {/* الحساب — مع بحث فوري */}
                  <td className="relative">
                    <Input
                      className="h-8 w-full min-w-0 text-xs"
                      value={expAccountFocusId === exp.id
                        ? exp.accountSearch
                        : exp.accountName
                          ? `${exp.accountCode} · ${exp.accountName}`
                          : ''}
                      placeholder={accountsQuery.isLoading ? 'جارٍ التحميل...' : 'ابحث عن حساب...'}
                      onChange={e => updateExpenseLine(exp.id, {
                        accountSearch: e.target.value,
                        accountId: null,
                        accountName: '',
                        accountCode: '',
                      })}
                      onFocus={() => {
                        updateExpenseLine(exp.id, { accountSearch: '' });
                        setExpAccountFocusId(exp.id);
                      }}
                      onBlur={() => setTimeout(() => setExpAccountFocusId(null), 250)}
                    />
                    {expAccountFocusId === exp.id && (
                      <div className="absolute right-0 top-full z-50 mt-0.5 max-h-52 w-72 overflow-auto rounded-lg border bg-card shadow-2xl">
                        {accountsQuery.isLoading ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground">جارٍ تحميل الحسابات...</div>
                        ) : expAccountResults.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground">لا توجد نتائج</div>
                        ) : (
                          expAccountResults.map(a => (
                            <button
                              key={a.id} type="button"
                              className={cn(
                                'flex w-full items-center gap-3 border-b border-border/30 px-3 py-2 text-right hover:bg-accent',
                                exp.accountId === a.id && 'bg-primary/10',
                              )}
                              onMouseDown={() => {
                                updateExpenseLine(exp.id, {
                                  accountId: a.id,
                                  accountName: a.nameAr,
                                  accountCode: a.code,
                                  accountSearch: '',
                                });
                                setExpAccountFocusId(null);
                              }}
                            >
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{a.code}</span>
                              <span className="min-w-0 truncate text-xs font-medium">{a.nameAr}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </td>
                  {/* البيان */}
                  <td>
                    <Input
                      className="h-8 w-full min-w-0 text-xs"
                      value={exp.description}
                      placeholder="البيان..."
                      onChange={e => updateExpenseLine(exp.id, { description: e.target.value })}
                    />
                  </td>
                  {/* حذف */}
                  <td className="text-center">
                    <button
                      type="button"
                      className="rounded p-1 text-destructive hover:bg-destructive/10"
                      onClick={() => removeExpenseLine(exp.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addExpenseLine}>
          <Plus className="h-3.5 w-3.5" /> إضافة سطر
        </Button>
        {totalExpenses > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">إجمالي المصاريف:</span>
            <span className="num-display font-semibold">{formatMoney(totalExpenses, currency)}</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── محتوى تاب التسديد ───────────────────────────────────────────────────
  const renderSettlementTab = () => (
    <div className="space-y-4">
      {isCash ? (
        <div className="rounded-lg border bg-card/50 p-4 text-sm">
          <p className="font-medium">التسديد نقدي</p>
          <p className="mt-1 text-muted-foreground">تم تحديد وسيلة الدفع في رأس الفاتورة.</p>
          {paymentMeansAccountId && (
            <div className="mt-2 rounded-md bg-secondary/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">الوسيلة: </span>
              <span className="text-sm font-medium">{paymentMeansOptions.find(o => o.accountId === paymentMeansAccountId)?.label ?? '—'}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="invoice-field-label flex items-center gap-1">
                <Calendar className="h-3 w-3" /> تاريخ الاستحقاق
              </Label>
              <Input type="date" className="h-8 text-xs" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            {party && (
              <div className="rounded-lg border bg-card/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">الطرف</p>
                <p className="mt-1 font-semibold">{party.nameAr}</p>
                <p className="font-mono text-xs text-muted-foreground">{party.accountCode}</p>
              </div>
            )}
          </div>

          {/* ملخص ائتمان */}
          {party && partyCreditLimit > 0 && (
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">سقف الائتمان</span>
                <span className="num-display font-semibold">{formatMoney(partyCreditLimit, currency)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-sm">
                <span className="text-muted-foreground">مبلغ هذه الفاتورة</span>
                <span className={cn('num-display font-bold', total > partyCreditLimit ? 'text-destructive' : 'text-primary')}>
                  {formatMoney(total, currency)}
                </span>
              </div>
              {total > partyCreditLimit && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> تجاوز سقف الائتمان
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="invoice-print-root space-y-3 pb-6">
      {/* ── قائمة الإجراءات عبر Portal (خارج أي overflow-hidden) ── */}
      {lineMenu !== null && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setLineMenu(null)} />
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border bg-card py-1 shadow-2xl"
            style={{ left: lineMenu.x - 160, top: lineMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemCardId(lineMenu.itemId); setLineMenu(null); }}
            >
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              بطاقة المادة
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemMovementsId({ id: lineMenu.itemId, name: lineMenu.itemName }); setLineMenu(null); }}
            >
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              حركة مادة
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemStockId({ id: lineMenu.itemId, name: lineMenu.itemName }); setLineMenu(null); }}
            >
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
              جرد المخزون
            </button>
            <div className="mx-3 my-1 border-t border-border/50" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => { removeLine(lineMenu.origIdx); setLineMenu(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* ── شريط الأدوات ── */}
      <div className="invoice-toolbar">
        <Link to={listPath}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
            <ArrowRight className="h-4 w-4" /> الفواتير
          </Button>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-base font-bold sm:text-lg">
            {isEdit ? 'تعديل الفاتورة' : invoiceType ? invoiceType.nameAr : t('invoices.list.newInvoice')}
          </h1>
          {isEdit && loadedInvoice && <Badge variant="outline" className="shrink-0">{loadedInvoice.invoiceNumber}</Badge>}
        </div>
        <div className="flex shrink-0 gap-2">
          {canDeleteInvoice && (
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" /> حذف
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>
            <X className="h-4 w-4" /> {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || lines.filter(l => !l.isGift).length === 0 || !party}>
            <Save className="h-4 w-4" />
            {isEdit ? (saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات') : (saving ? t('invoices.create.issuing') : t('invoices.create.issue'))}
          </Button>
        </div>
      </div>

      <Card className="invoice-document border-0 shadow-md">
        <div className="invoice-document-accent" />
        <CardContent className="space-y-3 p-3 sm:p-4">

          {/* ── رأس الفاتورة ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Hash className="h-3 w-3" /> رقم الفاتورة</Label>
              <div className="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 px-2 font-mono text-xs text-muted-foreground">
                {isEdit && loadedInvoice ? loadedInvoice.invoiceNumber : 'تلقائي'}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="invoice-field-label mb-0 flex items-center gap-1"><Hash className="h-3 w-3" /> الرقم اليدوي</Label>
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                  <input type="checkbox" checked={manualNumber} onChange={e => setManualNumber(e.target.checked)} /> تفعيل
                </label>
              </div>
              <Input className="h-8 text-xs" placeholder={manualNumber ? 'أدخل الرقم' : '—'} value={manualNumber ? invoiceNumber : ''} disabled={!manualNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Calendar className="h-3 w-3" /> التاريخ</Label>
              <Input type="date" className="h-8 text-xs" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Wallet className="h-3 w-3" /> طريقة التسديد</Label>
              <select className={SELECT_CLS} value={settlementType} onChange={e => setSettlementType(Number(e.target.value))}>
                {INVOICE_SETTLEMENT_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {showWarehouse && (
              <div>
                <Label className="invoice-field-label flex items-center gap-1"><Warehouse className="h-3 w-3" /> المستودع</Label>
                {warehousesQuery.isLoading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                  : activeWarehouses.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد مستودعات</p>
                  : <select className={SELECT_CLS} value={warehouseId ?? ''} onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— اختر —</option>
                    {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.nameAr}{w.isDefault ? ' ★' : ''}</option>)}
                  </select>
                }
              </div>
            )}
            <div>
              <Label className="invoice-field-label flex items-center gap-1">
                <Coins className="h-3 w-3" /> العملة
                {currencyLocked && <span className="text-[9px] text-muted-foreground">(تلقائي)</span>}
              </Label>
              <select className={SELECT_CLS} value={currency} disabled={currencyLocked} onChange={e => setCurrency(e.target.value)}>
                {currencyOptions.length === 0 ? <option value={currency}>{currency}</option>
                  : currencyOptions.map(c => <option key={c.code} value={c.code}>{c.code} · {c.nameAr}{c.isBase ? ' ★' : ''}</option>)}
              </select>
            </div>
          </div>

          {/* وسيلة الدفع */}
          {isCash && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="invoice-field-label">وسيلة الدفع</Label>
                <select className={SELECT_CLS} value={paymentMethodKind} onChange={e => setPaymentMethodKind(Number(e.target.value))}>
                  {INVOICE_PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="invoice-field-label">{paymentMethodKind === 1 ? 'الصندوق' : paymentMethodKind === 2 ? 'شركة الدفع' : 'المصرف'}</Label>
                {meansLoading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                  : !paymentMeansOptions.length ? <p className="text-xs text-muted-foreground">لا توجد خيارات</p>
                  : <select className={SELECT_CLS} value={paymentMeansAccountId ?? ''} onChange={e => setPaymentMeansAccountId(e.target.value ? Number(e.target.value) : null)}>
                    {paymentMeansOptions.map(o => <option key={o.accountId} value={o.accountId}>{o.label}</option>)}
                  </select>
                }
              </div>
            </div>
          )}

          {/* ── الطرف ── */}
          <div>
            <div className="invoice-section-title">{partySectionTitle}</div>
            <div className="flex items-center gap-2">
              {party ? (
                <div className="invoice-party-card flex-1 py-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{party.nameAr}</span>
                    <span className="font-mono text-xs text-muted-foreground">{party.accountCode}</span>
                    {(party.contactPerson || party.mobile || party.phone) && <span className="text-xs text-muted-foreground">{party.contactPerson ?? party.mobile ?? party.phone}</span>}
                    {partyPriceLabel && <Badge variant="outline" className="text-[10px]">{partyPriceLabel}</Badge>}
                    {partyCreditLimit > 0 && <span className="text-xs text-muted-foreground">حد ائتمان: <span className="num-display">{formatMoney(partyCreditLimit, currency)}</span></span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setParty(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder={`بحث ${partySectionTitle}...`} className="h-8 pr-10 text-sm" value={partySearch} onChange={e => setPartySearch(e.target.value)} onFocus={() => setShowPartyDrop(true)} />
                  {showPartyDrop && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                      {partiesQuery.isLoading ? <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                        : !visibleParties.length ? (
                          <div className="space-y-2 p-3">
                            <p className="text-sm text-muted-foreground">{isCash && (partiesQuery.data?.length ?? 0) > 0 ? `لا يوجد طرف يدعم عملة ${currency}` : t('common.noResults')}</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={openAddParty}><Plus className="h-3.5 w-3.5" /> {addPartyLabel}</Button>
                          </div>
                        ) : visibleParties.map(p => (
                          <button key={p.id} type="button" className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-right hover:bg-accent"
                            onClick={() => { setParty(p); setShowPartyDrop(false); setPartySearch(''); }}>
                            <span className="font-medium">{p.nameAr}</span>
                            <span className="font-mono text-xs text-muted-foreground">{p.accountCode}</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>
              )}
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs" onClick={openAddParty}>
                <UserPlus className="h-3.5 w-3.5" /> {addPartyLabel}
              </Button>
            </div>
          </div>

          {/* ── التابات ── */}
          <div>
            {/* شريط التابات */}
            <div className="flex overflow-x-auto border-b border-border/60 scrollbar-none">
              <TabBtn active={activeTab === 'lines'} onClick={() => setActiveTab('lines')} count={regularLinesWithIdx.length}>
                <Receipt className="h-3.5 w-3.5" /> البنود
              </TabBtn>
              <TabBtn active={activeTab === 'gifts'} onClick={() => setActiveTab('gifts')} count={giftLinesWithIdx.length}>
                <Package className="h-3.5 w-3.5" /> الهدايا
              </TabBtn>
              <TabBtn active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} count={expenseLines.length}>
                <CreditCard className="h-3.5 w-3.5" /> المصاريف
              </TabBtn>
              <TabBtn active={activeTab === 'settlement'} onClick={() => setActiveTab('settlement')}>
                <Wallet className="h-3.5 w-3.5" /> التسديد
              </TabBtn>
            </div>

            {/* محتوى التاب — عند الطباعة تظهر جميع التابات */}
            <div className="pt-3">
              <div className={activeTab === 'lines' ? '' : 'hidden print:block'}>
                {(activeTab === 'lines' || true) && renderItemsTab('lines')}
              </div>
              {giftLinesWithIdx.length > 0 && (
                <div className={activeTab === 'gifts' ? '' : 'hidden print:block'}>
                  <div className="print:mt-4 print:border-t print:pt-3">
                    {activeTab !== 'gifts' && <div className="hidden print:block text-sm font-semibold mb-2 flex items-center gap-1"><Package className="h-3.5 w-3.5 inline ml-1" />الهدايا</div>}
                    {renderItemsTab('gifts')}
                  </div>
                </div>
              )}
              {expenseLines.length > 0 && (
                <div className={activeTab === 'expenses' ? '' : 'hidden print:block'}>
                  <div className="print:mt-4 print:border-t print:pt-3">
                    {activeTab !== 'expenses' && <div className="hidden print:block text-sm font-semibold mb-2"><CreditCard className="h-3.5 w-3.5 inline ml-1" />المصاريف</div>}
                    {renderExpensesTab()}
                  </div>
                </div>
              )}
              <div className={activeTab === 'settlement' ? '' : 'hidden print:block'}>
                <div className="print:mt-4 print:border-t print:pt-3">
                  {activeTab !== 'settlement' && <div className="hidden print:block text-sm font-semibold mb-2"><Wallet className="h-3.5 w-3.5 inline ml-1" />التسديد</div>}
                  {renderSettlementTab()}
                </div>
              </div>
            </div>
          </div>

          {/* ── الخصم والإجماليات ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="invoice-section-title">{t('invoices.create.discountAndTax')}</div>
              <div className="grid grid-cols-2 gap-2">
                {/* الخصم % */}
                <div>
                  <Label className="invoice-field-label">الخصم %</Label>
                  <div className="relative">
                    <Input type="text" inputMode="decimal"
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={discountPct || ''}
                      placeholder="0"
                      onChange={e => handleDiscountPct(parseDecimalInput(e.target.value))} />
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                {/* الخصم مبلغ */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.discountAmt')}</Label>
                  <Input type="text" inputMode="decimal" className={NUMERIC_INPUT_CLS} placeholder="0"
                    value={discountAmt || ''} onChange={e => handleDiscountAmt(parseDecimalInput(e.target.value))} />
                </div>
                {/* الإضافة % */}
                <div>
                  <Label className="invoice-field-label">الإضافة %</Label>
                  <div className="relative">
                    <Input type="text" inputMode="decimal"
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={additionPct || ''}
                      placeholder="0"
                      onChange={e => handleAdditionPct(parseDecimalInput(e.target.value))} />
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                {/* الإضافة مبلغ */}
                <div>
                  <Label className="invoice-field-label">الإضافة</Label>
                  <Input type="text" inputMode="decimal" className={NUMERIC_INPUT_CLS} placeholder="0"
                    value={additionAmt || ''} onChange={e => handleAdditionAmt(parseDecimalInput(e.target.value))} />
                </div>
                {/* الضريبة % */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.taxPct')}</Label>
                  <div className="relative">
                    <Input type="text" inputMode="decimal"
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={taxRate || ''}
                      placeholder="0"
                      onChange={e => setTaxRate(parseDecimalInput(e.target.value))} />
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                {/* ملاحظات */}
                <div>
                  <Label className="invoice-field-label">{t('common.notes')}</Label>
                  <Input className="h-8 text-xs" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <div className="invoice-section-title">{t('invoices.create.totals')}</div>
              <InvoiceTotalsPanel currency={currency} subTotal={subTotal} discount={effectiveDiscount} addition={additionAmt} tax={taxAmount} total={total} />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── مودال بطاقة المادة ── */}
      {itemCardId !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setItemCardId(null)}>
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-primary" /> بطاقة المادة</div>
              <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setItemCardId(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-4">
              {itemCardQuery.isLoading
                ? <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
                : itemCardQuery.data
                  ? (() => {
                      const d = itemCardQuery.data;
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><span className="text-muted-foreground">الاسم:</span> <span className="font-semibold">{d.nameAr}</span></div>
                            {d.nameEn && <div><span className="text-muted-foreground">Name:</span> <span>{d.nameEn}</span></div>}
                            <div><span className="text-muted-foreground">الرمز:</span> <span className="font-mono">{d.code}</span></div>
                            <div><span className="text-muted-foreground">الباركود:</span> <span className="font-mono">{d.barcode}</span></div>
                            {d.categoryName && <div><span className="text-muted-foreground">الصنف:</span> <span>{d.categoryName}</span></div>}
                            {d.indexName && <div><span className="text-muted-foreground">الفهرس:</span> <span>{d.indexName}</span></div>}
                            {d.manufacturer && <div><span className="text-muted-foreground">الشركة المصنّعة:</span> <span>{d.manufacturer}</span></div>}
                            {d.originCountryName && <div><span className="text-muted-foreground">البلد:</span> <span>{d.originCountryName}</span></div>}
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-3 gap-2 text-sm text-center">
                            <div><div className="text-xs text-muted-foreground">سعر الشراء</div><div className="font-semibold num-display">{formatMoney(d.purchasePrice, 'IQD')}</div></div>
                            <div><div className="text-xs text-muted-foreground">سعر البيع</div><div className="font-semibold num-display text-primary">{formatMoney(d.baseSalesPrice, 'IQD')}</div></div>
                            <div><div className="text-xs text-muted-foreground">المخزون</div><div className={cn('font-bold text-lg', d.stockBaseQuantity <= d.minimumStockLevel ? 'text-destructive' : 'text-green-600')}>{d.stockBaseQuantity}</div></div>
                          </div>
                          {d.units.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-muted-foreground">الوحدات والأسعار</div>
                              <table className="w-full text-xs border rounded-lg overflow-hidden">
                                <thead className="bg-muted/50"><tr><th className="py-1 px-2 text-right">الوحدة</th><th className="py-1 px-2 text-center">معامل التحويل</th><th className="py-1 px-2 text-left">سعر البيع</th></tr></thead>
                                <tbody>
                                  {d.units.map(u => (
                                    <tr key={u.id ?? u.unitOfMeasureId} className="border-t">
                                      <td className="py-1 px-2">{u.unitName ?? '—'}{u.isBase ? ' (أساسية)' : ''}</td>
                                      <td className="py-1 px-2 text-center">{u.conversionFactor}</td>
                                      <td className="py-1 px-2 text-left num-display">{formatMoney(u.prices.find(p => p.priceType === 4)?.amount ?? 0, 'IQD')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  : <div className="py-8 text-center text-sm text-muted-foreground">لم يتم العثور على المادة</div>
              }
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── مودال حركة المادة ── */}
      {itemMovementsId !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setItemMovementsId(null)}>
          <div className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> حركة المادة — {itemMovementsId.name}</div>
              <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setItemMovementsId(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              {itemMovementsQuery.isLoading
                ? <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
                : (itemMovementsQuery.data?.length ?? 0) === 0
                  ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد حركات مسجّلة</div>
                  : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">التاريخ</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">النوع</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">الكمية</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">الوحدة</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">قبل</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">بعد</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">المرجع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(itemMovementsQuery.data as ItemMovementDto[]).map(m => {
                          const info = MOVEMENT_TYPE_LABELS[m.type] ?? { label: String(m.type), color: '' };
                          return (
                            <tr key={m.id} className="border-t border-border/40 hover:bg-accent/30">
                              <td className="py-1.5 px-2 text-muted-foreground">{new Date(m.movementDate).toLocaleDateString('ar-IQ')}</td>
                              <td className={cn('py-1.5 px-2 font-medium', info.color)}>{info.label}</td>
                              <td className="py-1.5 px-2 text-center num-display font-semibold">{m.quantity}</td>
                              <td className="py-1.5 px-2 text-center">{m.unitName}</td>
                              <td className="py-1.5 px-2 text-center num-display text-muted-foreground">{m.quantityBefore}</td>
                              <td className="py-1.5 px-2 text-center num-display font-semibold">{m.quantityAfter}</td>
                              <td className="py-1.5 px-2 text-muted-foreground">{m.referenceNumber ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
              }
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── مودال جرد المخزون ── */}
      {itemStockId !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setItemStockId(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4 text-primary" /> جرد المخزون — {itemStockId.name}</div>
              <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setItemStockId(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-1">
              {itemStockQuery.isLoading
                ? <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
                : (itemStockQuery.data?.length ?? 0) === 0
                  ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات مخزون</div>
                  : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="py-2 px-3 text-right font-medium">المستودع</th>
                          <th className="py-2 px-3 text-center font-medium">الرمز</th>
                          <th className="py-2 px-3 text-left font-medium">المخزون</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(itemStockQuery.data as ItemWarehouseStockDto[]).map(s => (
                          <tr key={s.warehouseId} className="border-t border-border/40">
                            <td className="py-2 px-3">{s.warehouseName}</td>
                            <td className="py-2 px-3 text-center font-mono text-xs text-muted-foreground">{s.warehouseCode}</td>
                            <td className={cn('py-2 px-3 text-left num-display font-bold', s.netStock > 0 ? 'text-green-600' : 'text-destructive')}>{s.netStock}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                          <td className="py-2 px-3">الإجمالي</td>
                          <td />
                          <td className="py-2 px-3 text-left num-display">
                            {(itemStockQuery.data as ItemWarehouseStockDto[]).reduce((s, r) => s + r.netStock, 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )
              }
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* حوار الحذف */}
      {showDeleteConfirm && loadedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleteMutation.isPending && setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /><h3 className="text-base font-bold">حذف الفاتورة</h3></div>
            <p className="mt-3 text-sm text-muted-foreground">سيتم حذف الفاتورة <span className="font-semibold text-foreground">{loadedInvoice.invoiceNumber}</span> وحذف قيدها المحاسبي وعكس أثرها على المخزون ورصيد الطرف. لا يمكن التراجع.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={deleteMutation.isPending} onClick={() => setShowDeleteConfirm(false)}>إلغاء</Button>
              <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                <Trash2 className="h-4 w-4" /> {deleteMutation.isPending ? 'جارٍ الحذف...' : 'حذف نهائي'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
