import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save, Search, Trash2, X, AlertTriangle, ArrowRight, Plus, UserPlus,
  Warehouse, Wallet, Hash, Calendar, Coins, MoreVertical, Package, CreditCard, Receipt,
  Printer, TrendingUp, ClipboardList, BookOpen, History, Archive, CheckCircle, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';
import { ItemImageViewerDialog } from '@/components/inventory/ItemImageViewerDialog';
import { inventoryApi, effectiveMovements, movementLineCost, ITEM_SALE_PRICE_TYPES, type ItemPriceType, type ItemListDto, type ItemDetailDto, type ItemMovementDto, type ItemWarehouseStockDto } from '@/lib/api/inventory';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { invoicesApi, type CreateInvoicePayload } from '@/lib/api/invoices';
import { invoiceTypesApi, type InvoiceTypeDto } from '@/lib/api/invoiceTypes';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printInvoice, type InvoicePrintData } from '@/lib/printUtils';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { currenciesApi } from '@/lib/api/currencies';
import { accountingApi } from '@/lib/api/accounting';
import { getFinancialManagementPath } from '@/pages/financial-management/routes';
import { writeFmFocus } from '@/pages/financial-management/fmFocus';
import { resolveUnitPriceForParty } from '@/lib/inventory/partyItemPrice';
import { invoiceListPathForCategory } from '@/pages/invoices/invoiceRoutes';
import { InvoiceTotalsPanel } from '@/pages/invoices/components/InvoiceTotalsPanel';
import { OrderStatusBadge } from '@/pages/orders/components/OrderStatusBadge';
import { cn, formatMoney, formatDate, formatAmount, extractApiError, roundAmount2 } from '@/lib/utils';
import { isStockInsufficientMessage, buildStockInsufficientMessage } from '@/lib/stockErrors';
import { StockInsufficientDialog } from '@/components/shared/StockInsufficientDialog';
import { EntityAuditDialog } from '@/components/audit/EntityAuditDialog';
import { VoucherAttachmentsDialog } from '@/components/accounting/VoucherAttachmentsDialog';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale, localizedName } from '@/lib/i18n';
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

type InvoiceTab = 'lines' | 'gifts' | 'expenses' | 'order' | 'settlement';

interface IssuePrintPrompt {
  invoiceNumber: string;
  printData: InvoicePrintData;
}

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

function invoiceLineBaseQty(line: InvoiceLine): number {
  const unit = line.itemDetail?.units.find(u => u.unitOfMeasureId === line.unitOfMeasureId);
  return line.quantity * (unit?.conversionFactor ?? 1);
}

// ‎حقل رقمي يحافظ على النص الخام أثناء الكتابة (يسمح بـ "0." و"0.0" و"0.01"…)
// ‎ويصدر القيمة الرقمية المُحلَّلة عبر onValueChange. يتزامن مع القيمة الخارجية عند فقد التركيز.
function DecimalInput({
  value, onValueChange, className, placeholder = '0', disabled,
}: {
  value: number;
  onValueChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ? String(value) : '');
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => { setFocused(false); }}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '');
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        onValueChange(parseDecimalInput(raw));
      }}
    />
  );
}

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
  const { t, i18n } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: idParam } = useParams();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canDelete = can(PERMS.Sales.Invoices.Delete);
  const editId = idParam ? Number(idParam) : null;
  const isEdit = editId != null && !Number.isNaN(editId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [issuePrintPrompt, setIssuePrintPrompt] = useState<IssuePrintPrompt | null>(null);
  // ‎بنود سعرها أقل من التكلفة — يُعرض حوار تأكيد قبل إصدار الفاتورة.
  const [belowCostConfirm, setBelowCostConfirm] = useState<Array<{ name: string; cost: number; price: number }> | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [lineImageViewer, setLineImageViewer] = useState<{
    itemId: number;
    imageId: number;
    imageIds?: number[];
    title: string;
  } | null>(null);

  // ── تاب نشط ──
  const [activeTab, setActiveTab] = useState<InvoiceTab>('lines');
  const [expAccountFocusId, setExpAccountFocusId] = useState<string | null>(null);

  // ── قائمة الإجراءات (Portal) ──
  interface LineMenu { origIdx: number; itemId: number; itemName: string; x: number; y: number; }
  const [lineMenu, setLineMenu] = useState<LineMenu | null>(null);

  const openLineMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, origIdx: number, itemId: number, itemName: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 170;
    // افتح القائمة نحو اليمين إذا كان هناك مساحة، وإلا نحو اليسار
    const spaceOnRight = window.innerWidth - rect.right;
    const x = spaceOnRight >= menuWidth ? rect.right : rect.left - menuWidth;
    setLineMenu({ origIdx, itemId, itemName, x, y: rect.bottom + 4 });
  }, []);

  // ── مودالات المادة ──
  const [itemCardId, setItemCardId] = useState<number | null>(null);
  const [itemMovementsId, setItemMovementsId] = useState<{ id: number; name: string } | null>(null);
  const [movFromDate, setMovFromDate] = useState('');
  const [movToDate, setMovToDate] = useState('');
  const [movGiftOnly, setMovGiftOnly] = useState(false);
  const [itemStockId, setItemStockId] = useState<{ id: number; name: string } | null>(null);
  const [stockUomId, setStockUomId] = useState<number | null>(null); // وحدة قياس جرد المخزون المختارة

  // ── إعدادات الشركة (للطباعة) ──
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 10 * 60_000,
  });

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

  // ‎رصيد متسلسل (قبل/بعد) محسوب من الحركات الفعّالة مرتبة زمنياً، مع فلترة الفترة في
  // ‎الواجهة حتى يبقى "قبل" مساوياً لرصيد نهاية الحركة السابقة وليس لقطة مخزَّنة قديمة.
  const movementRows = useMemo(() => {
    const all = effectiveMovements((itemMovementsQuery.data ?? []) as ItemMovementDto[])
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.movementDate).getTime();
        const tb = new Date(b.movementDate).getTime();
        return ta !== tb ? ta - tb : a.id - b.id;
      });
    const isOut = (t: number) => t === 2 || t === 4 || t === 7;
    const dayOf = (iso: string) => (iso || '').slice(0, 10);
    let running = 0;
    const out: (ItemMovementDto & { runBefore: number; runAfter: number })[] = [];
    for (const m of all) {
      const signed = isOut(m.type) ? -m.quantityInBase : m.quantityInBase;
      const before = running;
      running += signed;
      const d = dayOf(m.movementDate);
      if (movFromDate && d < movFromDate) continue;
      if (movToDate && d > movToDate) continue;
      if (movGiftOnly && !m.isGift) continue;
      out.push({ ...m, runBefore: before, runAfter: running });
    }
    return out;
  }, [itemMovementsQuery.data, movFromDate, movToDate, movGiftOnly]);
  const itemStockQuery = useQuery({
    queryKey: ['item-stock', itemStockId?.id],
    queryFn: () => inventoryApi.getStockPerWarehouse(itemStockId!.id),
    enabled: itemStockId != null,
  });
  // بيانات وحدات المادة للجرد (تستخدم نفس cache بطاقة المادة)
  const itemStockDetailQuery = useQuery({
    queryKey: ['item-card', itemStockId?.id],
    queryFn: () => inventoryApi.get(itemStockId!.id),
    enabled: itemStockId != null,
    staleTime: 5 * 60_000,
  });

  // ── بيانات الفاتورة المحمَّلة (تعديل) ──
  const invoiceQuery = useQuery({
    queryKey: ['invoice', editId],
    queryFn: () => invoicesApi.getById(editId!),
    enabled: isEdit,
    refetchOnMount: 'always',
  });
  const loadedInvoice = invoiceQuery.data;
  // فاتورة مسودّة (مثل المولّدة من طلب) تُعامَل كفاتورة جديدة في وضع الإصدار، لا التعديل.
  const isDraft = isEdit && loadedInvoice?.status === 'Draft';

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

  const partySectionTitle = t('invoices.create.partySection');
  const addPartyLabel = partyKind === 'Supplier' ? t('invoices.create.addSupplier') : t('invoices.create.addCustomer');
  const partyDisplayName = (p: FinancialPartyDto) => localizedName(locale, p.nameAr, p.nameEn);
  const isOrderInvoice = loadedInvoice?.incomingOrderId != null;
  const linkedOrder = loadedInvoice?.linkedOrder;

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
  const [warehouseStockByItem, setWarehouseStockByItem] = useState<Map<number, number>>(() => new Map());
  const savedItemBaseQtyRef = useRef<Map<number, number>>(new Map());
  const hydratedRef = useRef('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydratedRef.current = '';
    setHydrated(false);
    setParty(null);
    setLines([]);
    setManualRefNumber('');
  }, [editId]);

  // رأس الفاتورة
  const [enableCustomInvoiceNumber, setEnableCustomInvoiceNumber] = useState(false);
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState('');
  const [manualRefNumber, setManualRefNumber] = useState('');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [invoiceDate, setInvoiceDate] = useState(todayIso);
  const [currency, setCurrency] = useState('IQD');

  // التسديد
  const [settlementType, setSettlementType] = useState<number>(2);
  const [paymentMethodKind, setPaymentMethodKind] = useState<number>(1);
  const [paymentMeansAccountId, setPaymentMeansAccountId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const isCash = settlementType === 1;
  const incomingSettlementLabel = isCash
    ? t('invoices.create.settlementCash')
    : t('invoices.create.settlementCredit');
  const linkedOrderAddresses = useMemo(() => [
    linkedOrder?.storeUserCountry,
    linkedOrder?.storeUserCity,
    linkedOrder?.storeUserAddress,
    linkedOrder?.storeUserDetailedAddress,
  ].filter(Boolean).join(' — '), [linkedOrder]);

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
  const needsStockCheck = useMemo(
    () => showWarehouse && (invoiceType?.affectsInventory ?? true) && invoiceType?.movementType !== 1,
    [showWarehouse, invoiceType?.affectsInventory, invoiceType?.movementType],
  );
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

  const lineItemIdsKey = useMemo(
    () => [...new Set(lines.map(l => l.itemId))].sort((a, b) => a - b).join(','),
    [lines],
  );

  const selectableItems = useMemo(() => {
    const items = itemsQuery.data?.items ?? [];
    return items.filter(i => {
      if (usedItemIds.has(i.id)) return false;
      if (needsStockCheck && i.stockBaseQuantity <= 0) return false;
      return true;
    });
  }, [itemsQuery.data?.items, usedItemIds, needsStockCheck]);

  const fetchWarehouseStock = useCallback(async (itemId: number, whId: number) => {
    const stocks = await inventoryApi.getStockPerWarehouse(itemId);
    return stocks.find(s => s.warehouseId === whId)?.netStock ?? 0;
  }, []);

  const computeStockError = useCallback((
    allLines: InvoiceLine[],
    itemId: number,
    itemName: string,
    stockMap?: Map<number, number>,
  ): string | null => {
    if (!needsStockCheck || !warehouseId) return null;
    const totalRequired = allLines
      .filter(l => l.itemId === itemId)
      .reduce((s, l) => s + invoiceLineBaseQty(l), 0);
    let available = (stockMap ?? warehouseStockByItem).get(itemId) ?? 0;
    if (isEdit) available += savedItemBaseQtyRef.current.get(itemId) ?? 0;
    if (totalRequired > available + 1e-9) {
      return buildStockInsufficientMessage(itemName, totalRequired, available, invoiceDate);
    }
    return null;
  }, [needsStockCheck, warehouseId, warehouseStockByItem, isEdit, invoiceDate]);

  const showStockErrorIfNeeded = useCallback((
    allLines: InvoiceLine[],
    itemId: number,
    itemName: string,
    stockMap?: Map<number, number>,
  ) => {
    const msg = computeStockError(allLines, itemId, itemName, stockMap);
    if (msg) setStockError(msg);
  }, [computeStockError]);

  useEffect(() => {
    if (!needsStockCheck || !warehouseId || !lineItemIdsKey) return;
    const itemIds = lineItemIdsKey.split(',').map(Number);
    const snapshot = lines;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        itemIds.map(async id => [id, await fetchWarehouseStock(id, warehouseId)] as const),
      );
      if (cancelled) return;
      const map = new Map(entries);
      setWarehouseStockByItem(map);
      for (const id of itemIds) {
        const name = snapshot.find(l => l.itemId === id)?.itemName ?? '';
        const msg = computeStockError(snapshot, id, name, map);
        if (msg) { setStockError(msg); return; }
      }
    })();
    return () => { cancelled = true; };
  }, [warehouseId, needsStockCheck, lineItemIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── البنود المشتقة ──
  const regularLinesWithIdx = useMemo(() => lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => !l.isGift), [lines]);
  const giftLinesWithIdx = useMemo(() => lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => l.isGift), [lines]);

  // ── الحسابات ──
  const subTotal = useMemo(() => lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice - (l.isGift ? l.quantity * l.unitPrice : l.lineDiscount)), 0), [lines]);
  const effectiveDiscount = useMemo(() => (discountPct > 0 ? roundAmount2((subTotal * discountPct) / 100) : discountAmt), [subTotal, discountPct, discountAmt]);
  const afterDiscount = subTotal - effectiveDiscount;
  const taxAmount = useMemo(() => roundAmount2((afterDiscount * taxRate) / 100), [afterDiscount, taxRate]);
  const total = roundAmount2(afterDiscount + additionAmt + taxAmount);

  const buildPrintData = useCallback((issuedInvoiceNumber?: string): InvoicePrintData => {
    const warehouseName = activeWarehouses.find(w => w.id === warehouseId)?.nameAr ?? null;
    return {
      invoiceTypeName: invoiceType ? localizedName(locale, invoiceType.nameAr, invoiceType.nameEn) : t('invoices.create.defaultInvoiceType'),
      invoiceNumber: issuedInvoiceNumber ?? (isEdit ? loadedInvoice?.invoiceNumber : customInvoiceNumber || undefined),
      manualNumber: manualRefNumber.trim() || null,
      invoiceDate,
      warehouseName,
      partyName: party ? partyDisplayName(party) : '',
      partyAccountCode: party?.accountCode ?? null,
      currency,
      lines: lines.map(l => ({
        itemName: l.itemName,
        itemCode: l.itemCode,
        unitName: l.unitName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineDiscount: l.lineDiscount,
        isGift: l.isGift ?? false,
      })),
      discountPct,
      effectiveDiscount,
      additionPct,
      additionAmt,
      taxRate,
      taxAmount,
      subTotal,
      total,
      expenseLines: expenseLines.filter(e => e.accountId).map(e => ({
        debitAmount: e.debitAmount,
        creditAmount: e.creditAmount,
        accountName: e.accountName,
        accountCode: e.accountCode,
        description: e.description,
      })),
      isCash,
      dueDate: !isCash && dueDate ? dueDate : null,
      notes: notes || null,
    };
  }, [
    activeWarehouses, warehouseId, invoiceType, locale, t, isEdit, loadedInvoice?.invoiceNumber,
    customInvoiceNumber, manualRefNumber, invoiceDate, party, partyDisplayName, currency, lines,
    discountPct, effectiveDiscount, additionPct, additionAmt, taxRate, taxAmount, subTotal, total,
    expenseLines, isCash, dueDate, notes,
  ]);

  const resetForNewInvoice = useCallback(() => {
    setParty(null);
    setPartySearch('');
    setShowPartyDrop(false);
    setItemSearch('');
    setShowItemDrop(false);
    setLines([]);
    setTaxRate(0);
    setDiscountPct(0);
    setDiscountAmt(0);
    setAdditionPct(0);
    setAdditionAmt(0);
    setNotes('');
    setEnableCustomInvoiceNumber(false);
    setCustomInvoiceNumber('');
    setManualRefNumber('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setExpenseLines([]);
    setExpenseDistMethod('value');
    setActiveTab('lines');
    setWarehouseStockByItem(new Map());
    savedItemBaseQtyRef.current = new Map();
    setSettlementType(invoiceType?.settlementType ?? 2);
    setPaymentMethodKind(invoiceType?.paymentMethodKind ?? 1);
    setPaymentMeansAccountId(null);
    if (showWarehouse && activeWarehouses.length > 0) {
      const fromType = invoiceType?.defaultWarehouseId;
      if (fromType && activeWarehouses.some(w => w.id === fromType)) setWarehouseId(fromType);
      else setWarehouseId((activeWarehouses.find(w => w.isDefault) ?? activeWarehouses[0]).id);
    }
  }, [invoiceType, showWarehouse, activeWarehouses]);

  const pendingIssuePrintRef = useRef<InvoicePrintData | null>(null);

  const finishIssueFlow = useCallback((shouldPrint: boolean) => {
    if (!issuePrintPrompt) return;
    if (shouldPrint) {
      printInvoice(issuePrintPrompt.printData, companyQuery.data ?? null, locale);
    }
    setIssuePrintPrompt(null);
    resetForNewInvoice();
  }, [issuePrintPrompt, companyQuery.data, locale, resetForNewInvoice]);

  useEffect(() => { if (discountPct > 0) setDiscountAmt(roundAmount2(subTotal * discountPct / 100)); }, [subTotal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (additionPct > 0) setAdditionAmt(roundAmount2(subTotal * additionPct / 100)); }, [subTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiscountPct = useCallback((val: number) => { setDiscountPct(val); setDiscountAmt(val > 0 ? roundAmount2(subTotal * val / 100) : 0); }, [subTotal]);

  // ‎فاتورة مبيعات: نجلب نسبة خصم الطرف الافتراضية (إن فُعِّلت) عند اختياره.
  const isSalesInvoice = invoiceType?.category === 1;
  const handleSelectParty = useCallback((p: FinancialPartyDto) => {
    setParty(p);
    setShowPartyDrop(false);
    setPartySearch('');
    if (isSalesInvoice && p.salesDiscountEnabled && (p.salesDiscountPercentage ?? 0) > 0) {
      const pct = Math.min(100, Math.max(0, p.salesDiscountPercentage ?? 0));
      setDiscountPct(pct);
      setDiscountAmt(0);
      toast.success(t('invoices.create.partyDiscountApplied', { pct }));
    }
  }, [isSalesInvoice, t]);
  const handleDiscountAmt = useCallback((val: number) => { setDiscountAmt(roundAmount2(val)); setDiscountPct(val > 0 && subTotal > 0 ? parseFloat((val / subTotal * 100).toFixed(2)) : 0); }, [subTotal]);
  const handleAdditionPct = useCallback((val: number) => { setAdditionPct(val); setAdditionAmt(val > 0 ? roundAmount2(subTotal * val / 100) : 0); }, [subTotal]);
  const handleAdditionAmt = useCallback((val: number) => { setAdditionAmt(roundAmount2(val)); setAdditionPct(val > 0 && subTotal > 0 ? parseFloat((val / subTotal * 100).toFixed(2)) : 0); }, [subTotal]);

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
      toast.error(asGift ? t('invoices.create.duplicateGift') : t('invoices.create.duplicateLine'));
      setItemSearch(''); setShowItemDrop(false); return;
    }
    try {
      const detail = await inventoryApi.get(item.id);
      const defaultUnit = detail.units.find(u => u.isBase) ?? detail.units[0];
      const unitId = defaultUnit?.unitOfMeasureId ?? 0;
      const unitPrice = await resolveLineUnitPrice(detail, unitId);
      const units: LineUnit[] = detail.units.map(u => ({ unitOfMeasureId: u.unitOfMeasureId, unitName: u.unitName ?? '', isBase: u.isBase }));
      const primaryImageId = item.primaryImageId ?? detail.images.find(img => img.isPrimary)?.id ?? detail.images[0]?.id ?? null;
      const newLine: InvoiceLine = {
        itemId: item.id, itemCode: item.code, itemName: item.nameAr, primaryImageId, itemDetail: detail,
        units, unitOfMeasureId: unitId, unitName: defaultUnit?.unitName ?? '', quantity: 1, unitPrice, lineDiscount: 0, isGift: asGift,
      };
      if (needsStockCheck && warehouseId) {
        const stockNet = await fetchWarehouseStock(item.id, warehouseId);
        const stockMap = new Map(warehouseStockByItem).set(item.id, stockNet);
        setWarehouseStockByItem(stockMap);
        setLines(prev => {
          const next = [...prev, newLine];
          showStockErrorIfNeeded(next, item.id, item.nameAr, stockMap);
          return next;
        });
      } else {
        setLines(prev => [...prev, newLine]);
      }
      setItemSearch(''); setShowItemDrop(false);
    } catch { toast.error(t('invoices.create.itemLoadError')); }
  }, [lines, t, resolveLineUnitPrice, activeTab, needsStockCheck, warehouseId, fetchWarehouseStock, warehouseStockByItem, showStockErrorIfNeeded]);

  const updateLine = (idx: number, patch: Partial<InvoiceLine>) =>
    setLines(prev => { const current = prev[idx]; if (!current) return prev; return prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)); });
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleQuantityChange = useCallback((origIdx: number, quantity: number) => {
    setLines(prev => {
      const next = prev.map((l, i) => (i === origIdx ? { ...l, quantity } : l));
      const line = next[origIdx];
      if (line) showStockErrorIfNeeded(next, line.itemId, line.itemName);
      return next;
    });
  }, [showStockErrorIfNeeded]);

  const handleUnitChange = useCallback(async (idx: number, unitId: number) => {
    const line = lines[idx]; if (!line) return;
    const u = line.units.find(x => x.unitOfMeasureId === unitId);
    const unitPrice = line.itemDetail ? await resolveLineUnitPrice(line.itemDetail, unitId) : line.unitPrice;
    setLines(prev => {
      const next = prev.map((l, i) => (i === idx ? { ...l, unitOfMeasureId: unitId, unitName: u?.unitName ?? '', unitPrice } : l));
      showStockErrorIfNeeded(next, line.itemId, line.itemName);
      return next;
    });
  }, [lines, resolveLineUnitPrice, showStockErrorIfNeeded]);

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
    if (!isEdit || !loadedInvoice) return;
    const hydrationKey = [
      loadedInvoice.id,
      loadedInvoice.lines?.length ?? 0,
      loadedInvoice.financialPartyId ?? '',
      loadedInvoice.customerId ?? '',
      loadedInvoice.invoiceTypeId ?? '',
      loadedInvoice.platformOrderNumber ?? '',
      loadedInvoice.manualNumber ?? '',
    ].join(':');
    if (hydratedRef.current === hydrationKey) return;
    if (typeId != null && !invoiceType && !loadedInvoice.incomingOrderId) return;

    (async () => {
      setTaxRate(loadedInvoice.taxRate ?? 0);
      if ((loadedInvoice.discountPercentage ?? 0) > 0) { setDiscountPct(loadedInvoice.discountPercentage!); setDiscountAmt(0); }
      else { setDiscountPct(0); setDiscountAmt(loadedInvoice.discountAmount ?? 0); }
      setAdditionAmt(loadedInvoice.additionAmount ?? 0); setAdditionPct(0);
      setNotes(loadedInvoice.notes ?? '');
      if (loadedInvoice.currency) setCurrency(loadedInvoice.currency);
      setInvoiceDate((loadedInvoice.invoiceDate ?? '').slice(0, 10) || todayIso);
      setManualRefNumber(loadedInvoice.manualNumber ?? loadedInvoice.platformOrderNumber ?? '');
      setSettlementType(loadedInvoice.settlementType ?? 2);
      if (loadedInvoice.paymentMeansAccountId) setPaymentMeansAccountId(loadedInvoice.paymentMeansAccountId);
      if (loadedInvoice.warehouseId != null) setWarehouseId(loadedInvoice.warehouseId);

      try {
        const [customers, suppliers] = await Promise.all([
          financialManagementApi.getParties({ kind: 'Customer', includeInactive: true }),
          financialManagementApi.getParties({ kind: 'Supplier', includeInactive: true }),
        ]);
        const allParties = [...customers, ...suppliers];
        const found = loadedInvoice.financialPartyId
          ? allParties.find(p => p.id === loadedInvoice.financialPartyId)
          : allParties.find(p =>
              p.kind === partyKind
              && loadedInvoice.customerName
              && (p.nameAr === loadedInvoice.customerName || p.nameEn === loadedInvoice.customerName));
        if (found) setParty(found);
      } catch { /* تجاهل */ }

      try {
        const built = await Promise.all(loadedInvoice.lines.map(async (ln): Promise<InvoiceLine> => {
          let units: LineUnit[] = []; let itemDetail: ItemDetailDto | undefined; let itemCode = ''; let primaryImageId: number | null = null;
          try { const detail = await inventoryApi.get(ln.itemId); itemDetail = detail; itemCode = detail.code ?? ''; units = detail.units.map(u => ({ unitOfMeasureId: u.unitOfMeasureId, unitName: u.unitName ?? '', isBase: u.isBase })); primaryImageId = detail.images.find(i => i.isPrimary)?.id ?? detail.images[0]?.id ?? null; } catch { /* تجاهل */ }
          const uomId = ln.unitOfMeasureId ?? (units.find(u => u.isBase)?.unitOfMeasureId ?? 0);
          // ‎الهدية تُحفظ كبند بخصم يساوي قيمته (نفس منطق الخادم) — نعيد اكتشافها هنا
          const gross = ln.quantity * ln.unitPrice;
          const isGift = gross > 0 && ln.lineDiscount >= gross;
          return { itemId: ln.itemId, itemCode, itemName: ln.itemName, primaryImageId, itemDetail, units, unitOfMeasureId: uomId, unitName: ln.unitName ?? (units.find(u => u.unitOfMeasureId === uomId)?.unitName ?? ''), quantity: ln.quantity, unitPrice: ln.unitPrice, lineDiscount: isGift ? 0 : ln.lineDiscount, isGift };
        }));
        const savedMap = new Map<number, number>();
        for (const l of built) {
          savedMap.set(l.itemId, (savedMap.get(l.itemId) ?? 0) + invoiceLineBaseQty(l));
        }
        savedItemBaseQtyRef.current = savedMap;
        setLines(built);
      } catch { /* تجاهل */ }
      // ‎تحميل المصاريف المحفوظة
      if (loadedInvoice.expenses && loadedInvoice.expenses.length > 0) {
        setExpenseLines(loadedInvoice.expenses.map(e => ({
          id: `${e.id}`,
          debitAmount: e.debitAmount,
          creditAmount: e.creditAmount,
          accountId: e.accountId,
          accountName: e.accountName,
          accountCode: e.accountCode,
          description: e.description ?? '',
          accountSearch: '',
        })));
      }
      if (loadedInvoice.expenseDistributionMethod) {
        setExpenseDistMethod(loadedInvoice.expenseDistributionMethod === 2 ? 'volume'
          : loadedInvoice.expenseDistributionMethod === 3 ? 'weight' : 'value');
      }
      hydratedRef.current = hydrationKey;
      setHydrated(true);
    })();
  }, [isEdit, loadedInvoice, invoiceType, typeId, partyKind, todayIso]);

  // ── حفظ ──
  const invalidateInvoices = () => queryClient.invalidateQueries({ queryKey: ['invoices'] });

  const showSaveError = useCallback((message: string) => {
    if (isStockInsufficientMessage(message)) {
      setStockError(message);
      return;
    }
    toast.error(message);
  }, []);

  const createMutation = useMutation({
    mutationFn: (p: CreateInvoicePayload) => invoicesApi.create(p),
    onSuccess: res => {
      if (res.success && res.data?.invoiceNumber && pendingIssuePrintRef.current) {
        invalidateInvoices();
        setIssuePrintPrompt({
          invoiceNumber: res.data.invoiceNumber,
          printData: { ...pendingIssuePrintRef.current, invoiceNumber: res.data.invoiceNumber },
        });
        pendingIssuePrintRef.current = null;
      } else res.errors?.forEach(e => showSaveError(e));
    },
    onError: (e: unknown) => showSaveError(extractApiError(e) ?? t('invoices.create.saveFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: (p: CreateInvoicePayload) => invoicesApi.update(editId!, p),
    onSuccess: res => {
      if (res.success) {
        invalidateInvoices();
        queryClient.invalidateQueries({ queryKey: ['invoice', editId] });
        if (loadedInvoice?.incomingOrderId != null) {
          queryClient.invalidateQueries({ queryKey: ['incoming-orders'] });
          queryClient.invalidateQueries({ queryKey: ['incoming-order', loadedInvoice.incomingOrderId] });
        }
        if (loadedInvoice?.status === 'Draft') {
          const issuedNumber = res.data?.invoiceNumber ?? loadedInvoice?.invoiceNumber ?? '';
          toast.success(t('invoices.create.issued', { number: issuedNumber }));
        } else {
          toast.success(t('invoices.create.updateSuccess'));
        }
        navigate(listPath);
      } else res.errors?.forEach(e => showSaveError(e));
    },
    onError: (e: unknown) => showSaveError(extractApiError(e) ?? t('invoices.create.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.remove(editId!),
    onSuccess: res => {
      if (res.success) {
        invalidateInvoices();
        if (loadedInvoice?.incomingOrderId != null) {
          queryClient.invalidateQueries({ queryKey: ['incoming-orders'] });
          queryClient.invalidateQueries({ queryKey: ['incoming-order', loadedInvoice.incomingOrderId] });
        }
        queryClient.removeQueries({ queryKey: ['invoice', editId] });
        toast.success(t('invoices.create.deleteSuccess'));
        navigate(listPath);
      } else res.errors?.forEach(e => toast.error(e));
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? t('invoices.create.deleteFailed')),
  });

  const canDeleteInvoice = isEdit && canDelete && loadedInvoice?.status !== 'Cancelled';
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    const regularLines = lines.filter(l => !l.isGift);
    const hasGiftLine = lines.some(l => l.isGift);
    if (!party) return toast.error(partyKind === 'Supplier' ? t('invoices.create.selectSupplier') : t('invoices.create.selectCustomer'));
    // ‎يُسمح بفاتورة هدايا فقط (بدون بنود عادية) طالما يوجد سطر هدية واحد على الأقل.
    if (regularLines.length === 0 && !hasGiftLine) return toast.error(t('invoices.create.addLines'));
    if (lines.some(l => l.unitOfMeasureId === 0)) return toast.error(t('invoices.create.selectUom'));
    if (lines.some(l => l.quantity <= 0)) return toast.error(t('invoices.create.qtyMustBePositive'));
    if (regularLines.some(l => l.unitPrice <= 0)) return toast.error(t('invoices.create.priceMustBePositive'));
    if (showWarehouse && !warehouseId) return toast.error(t('invoices.create.selectWarehouse'));
    if (isCash && total > 0 && !paymentMeansAccountId) return toast.error(t('invoices.create.selectPaymentMeans'));
    if (enableCustomInvoiceNumber && !customInvoiceNumber.trim()) return toast.error(t('invoices.create.enterManualNumber'));
    if (!invoiceDate) return toast.error(t('invoices.create.selectInvoiceDate'));
    // ‎فاتورة الهدايا فقط إجماليها صفر — مسموحة.
    if (total <= 0 && !hasGiftLine) return toast.error(t('invoices.create.totalMustBePositive'));
    const activeExpenses = expenseLines.filter(e => e.debitAmount > 0 || e.creditAmount > 0);
    if (activeExpenses.length > 0) {
      if (activeExpenses.some(e => !e.accountId)) return toast.error(t('invoices.create.selectExpenseAccount'));
      const expDebit = activeExpenses.reduce((s, e) => s + e.debitAmount, 0);
      const expCredit = activeExpenses.reduce((s, e) => s + e.creditAmount, 0);
      if (Math.round((expDebit - expCredit) * 1000) !== 0)
        return toast.error(t('invoices.create.expenseUnbalanced', { debit: expDebit.toLocaleString(), credit: expCredit.toLocaleString() }));
    }

    // ‎تنبيه البيع بأقل من التكلفة (فواتير المبيعات فقط): نقارن سعر بيع
    // ‎البند بكلفة المادة لوحدة البند نفسها (كلفة الأساس × معامل التحويل).
    if (isSalesInvoice) {
      const below = regularLines
        .map(l => {
          const unit = l.itemDetail?.units.find(u => u.unitOfMeasureId === l.unitOfMeasureId);
          const cost = (l.itemDetail?.purchasePrice ?? 0) * (unit?.conversionFactor ?? 1);
          return { name: l.itemName, cost, price: l.unitPrice };
        })
        .filter(x => x.cost > 0 && x.price < x.cost);
      if (below.length > 0) {
        setBelowCostConfirm(below);
        return;
      }
    }

    submitInvoice();
  };

  // ‎بناء الحمولة وإرسالها — مستخرَجة لتُستدعى مباشرةً أو بعد تأكيد البيع بأقل من التكلفة.
  const submitInvoice = () => {
    if (!party) return;
    const payload: CreateInvoicePayload = {
      financialPartyId: party.id, invoiceTypeId: typeId ?? undefined,
      warehouseId: showWarehouse ? warehouseId ?? undefined : undefined,
      settlementType, paymentMeansAccountId: isCash ? paymentMeansAccountId ?? undefined : undefined,
      invoiceNumber: !isOrderInvoice && enableCustomInvoiceNumber && customInvoiceNumber.trim() ? customInvoiceNumber.trim() : undefined,
      manualNumber: manualRefNumber.trim() || undefined,
      invoiceDate, currency, taxRate,
      discountPercentage: discountPct, discountAmount: discountPct > 0 ? 0 : discountAmt,
      additionAmount: additionAmt, notes: notes || undefined,
      lines: lines.map(l => ({ itemId: l.itemId, unitOfMeasureId: l.unitOfMeasureId, quantity: l.quantity, unitPriceOverride: l.unitPrice, lineDiscount: l.isGift ? l.quantity * l.unitPrice : l.lineDiscount, isGift: l.isGift ?? false })),
      expenses: expenseLines
        .filter(e => e.accountId && (e.debitAmount > 0 || e.creditAmount > 0))
        .map(e => ({ accountId: e.accountId!, debitAmount: e.debitAmount, creditAmount: e.creditAmount, description: e.description || undefined })),
      expenseDistributionMethod: expenseDistMethod === 'value' ? 1 : expenseDistMethod === 'volume' ? 2 : 3,
    };
    if (isEdit) updateMutation.mutate(payload);
    else {
      pendingIssuePrintRef.current = buildPrintData();
      createMutation.mutate(payload);
    }
  };

  if (isEdit && invoiceQuery.isError) {
    return (<div className="flex flex-col items-center gap-3 py-20 text-center"><AlertTriangle className="h-8 w-8 text-destructive" /><p className="text-sm text-muted-foreground">{t('invoices.create.loadFailed')}</p><Button variant="outline" size="sm" onClick={() => navigate(listPath)}>{t('invoices.create.invoicesLink')}</Button></div>);
  }
  if (isEdit && (invoiceQuery.isLoading || !hydrated)) {
    return (<div className="flex items-center justify-center py-24 text-sm text-muted-foreground">{t('common.loading')}...</div>);
  }

  // ── مكوّن جدول البنود (مشترك بين الأصناف والهدايا) ──────────────────────
  const renderLineTable = (linesDisplay: Array<InvoiceLine & { origIdx: number }>, tab: 'lines' | 'gifts') => {
    if (linesDisplay.length === 0) {
      return (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {tab === 'lines' ? t('invoices.create.noLines') : t('invoices.create.giftsEmpty')}
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
                        ? (
                          <ItemImageThumb
                            itemId={l.itemId}
                            imageId={l.primaryImageId}
                            alt={l.itemName}
                            className="h-8 w-8 shrink-0 rounded border transition-opacity hover:opacity-90"
                            onClick={() => setLineImageViewer({
                              itemId: l.itemId,
                              imageId: l.primaryImageId!,
                              imageIds: l.itemDetail?.images?.map(img => img.id),
                              title: l.itemName,
                            })}
                          />
                        )
                        : <div className="h-8 w-8 shrink-0 rounded bg-muted" />}
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
                    <DecimalInput
                      className="invoice-table-input"
                      value={l.quantity}
                      onValueChange={v => handleQuantityChange(l.origIdx, v)}
                    />
                  </td>
                  <td>
                    <DecimalInput
                      className="invoice-table-input"
                      value={l.unitPrice}
                      disabled={l.isGift}
                      onValueChange={v => updateLine(l.origIdx, { unitPrice: v })}
                    />
                  </td>
                  <td>
                    <DecimalInput
                      className="invoice-table-input"
                      value={lineTotal}
                      disabled={l.isGift}
                      onValueChange={tot => updateLine(l.origIdx, { unitPrice: (tot + l.lineDiscount) / (l.quantity || 1) })}
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
              placeholder={tab === 'lines' ? t('invoices.create.itemSearch') : t('invoices.create.giftSearch')}
              className="h-8 pr-10 text-sm"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              onFocus={() => setShowItemDrop(true)}
            />
            {showItemDrop && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                {itemsQuery.isLoading
                  ? <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                  : selectableItems.length === 0
                    ? (
                      <div className="p-3 text-sm text-muted-foreground">
                        {needsStockCheck
                          ? t('invoices.create.noItemsInStock')
                          : t('common.noResults')}
                      </div>
                    )
                    : selectableItems.map(i => (
                      <div key={i.id} className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
                        <button type="button" className="min-w-0 flex-1 text-right hover:text-primary" onClick={() => addItem(i)}>
                          <div className="truncate text-sm font-medium">{i.nameAr}</div>
                          <div className="text-[11px] text-muted-foreground">{i.code} · {t('invoices.create.stockInList')}: {i.stockBaseQuantity}</div>
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
          ? <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">{t('invoices.create.selectPartyFirst', { party: partySectionTitle })}</div>
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
        <span className="text-xs font-medium text-muted-foreground">{t('invoices.create.expenseDistLabel')}</span>
        {([['value', t('invoices.create.expDistValue')], ['volume', t('invoices.create.expDistVolume')], ['weight', t('invoices.create.expDistWeight')]] as const).map(([val, label]) => (
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
              <th className="text-center">{t('invoices.create.debit')}</th>
              <th className="text-center">{t('invoices.create.credit')}</th>
              <th className="text-right">{t('invoices.create.account')}</th>
              <th className="text-right">{t('invoices.create.statement')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseLines.length === 0
              ? <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">{t('invoices.create.noExpenses')}</td></tr>
              : expenseLines.map((exp, idx) => (
                <tr key={exp.id}>
                  <td className="text-center text-[10px] text-muted-foreground">{idx + 1}</td>
                  {/* مدين */}
                  <td>
                    <DecimalInput
                      className="invoice-table-input"
                      value={exp.debitAmount}
                      onValueChange={v => updateExpenseLine(exp.id, { debitAmount: v })}
                    />
                  </td>
                  {/* دائن */}
                  <td>
                    <DecimalInput
                      className="invoice-table-input"
                      value={exp.creditAmount}
                      onValueChange={v => updateExpenseLine(exp.id, { creditAmount: v })}
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
                      placeholder={accountsQuery.isLoading ? t('common.loading') : t('invoices.create.searchAccount')}
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
                          <div className="px-3 py-3 text-xs text-muted-foreground">{t('invoices.create.loadingAccounts')}</div>
                        ) : expAccountResults.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground">{t('common.noResults')}</div>
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
          <Plus className="h-3.5 w-3.5" /> {t('invoices.create.addRow')}
        </Button>
        {totalExpenses > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('invoices.create.totalExpenses')}</span>
            <span className="num-display font-semibold">{formatMoney(totalExpenses, currency)}</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── محتوى تاب التسديد ───────────────────────────────────────────────────
  const renderOrderTab = () => {
    const orderNumber = linkedOrder?.platformOrderNumber ?? loadedInvoice?.platformOrderNumber ?? '—';
    const orderDate = linkedOrder?.receivedAt ? formatDate(linkedOrder.receivedAt) : '—';
    const userName = linkedOrder?.storeUserFullName ?? '—';
    const userId = linkedOrder?.storeUserCode ?? linkedOrder?.platformUserId ?? '—';
    const addresses = linkedOrderAddresses || '—';
    const orderStatus = linkedOrder?.status;
    const orderId = linkedOrder?.id ?? loadedInvoice?.incomingOrderId ?? null;

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.orderNumber')}</p>
          <p className="mt-1 font-mono text-sm" dir="ltr">{orderNumber}</p>
        </div>
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.orderDate')}</p>
          <p className="mt-1 text-sm">{orderDate}</p>
        </div>
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.incomingSettlementStatus')}</p>
          <p className="mt-1 text-sm">{incomingSettlementLabel}</p>
        </div>
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.storeUserName')}</p>
          <p className="mt-1 text-sm">{userName}</p>
        </div>
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.storeUserId')}</p>
          <p className="mt-1 font-mono text-sm" dir="ltr">{userId}</p>
        </div>
        <div className="rounded-lg border bg-card/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.orderStatus')}</p>
          <div className="mt-1">
            {orderStatus ? (
              orderId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/orders?status=${orderStatus}&orderId=${orderId}`)}
                  className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
                  title={t('invoices.create.openOrderInList')}
                >
                  <OrderStatusBadge status={orderStatus} />
                </button>
              ) : (
                <OrderStatusBadge status={orderStatus} />
              )
            ) : '—'}
          </div>
        </div>
        <div className="rounded-lg border bg-card/50 p-3 sm:col-span-2 lg:col-span-3">
          <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.orderAddresses')}</p>
          <p className="mt-1 text-sm leading-relaxed">{addresses}</p>
        </div>
      </div>
    );
  };

  const renderSettlementTab = () => (
    <div className="space-y-4">
      {isCash ? (
        <div className="rounded-lg border bg-card/50 p-4 text-sm">
          <p className="font-medium">{t('invoices.create.cashSettlementTitle')}</p>
          <p className="mt-1 text-muted-foreground">{t('invoices.create.cashSettlementHint')}</p>
          {paymentMeansAccountId && (
            <div className="mt-2 rounded-md bg-secondary/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('invoices.create.meansLabel')} </span>
              <span className="text-sm font-medium">{paymentMeansOptions.find(o => o.accountId === paymentMeansAccountId)?.label ?? '—'}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="invoice-field-label flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {t('invoices.create.dueDate')}
              </Label>
              <Input type="date" className="h-8 text-xs" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            {party && (
              <div className="rounded-lg border bg-card/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">{t('invoices.create.partyLabel')}</p>
                <p className="mt-1 font-semibold">{partyDisplayName(party)}</p>
                <p className="font-mono text-xs text-muted-foreground">{party.accountCode}</p>
              </div>
            )}
          </div>

          {/* ملخص ائتمان */}
          {party && partyCreditLimit > 0 && (
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('invoices.create.creditLimit')}</span>
                <span className="num-display font-semibold">{formatMoney(partyCreditLimit, currency)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-sm">
                <span className="text-muted-foreground">{t('invoices.create.thisInvoiceAmount')}</span>
                <span className={cn('num-display font-bold', total > partyCreditLimit ? 'text-destructive' : 'text-primary')}>
                  {formatMoney(total, currency)}
                </span>
              </div>
              {total > partyCreditLimit && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t('invoices.create.overCreditLimitShort')}
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
            className="fixed z-50 min-w-[170px] rounded-lg border bg-card py-1 shadow-2xl"
            style={{ left: lineMenu.x, top: lineMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemCardId(lineMenu.itemId); setLineMenu(null); }}
            >
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              {t('invoices.create.lineMenuCard')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemMovementsId({ id: lineMenu.itemId, name: lineMenu.itemName }); setLineMenu(null); }}
            >
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              {t('invoices.create.lineMenuMovements')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
              onClick={() => { setItemStockId({ id: lineMenu.itemId, name: lineMenu.itemName }); setStockUomId(null); setLineMenu(null); }}
            >
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
              {t('invoices.create.lineMenuStock')}
            </button>
            <div className="mx-3 my-1 border-t border-border/50" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => { removeLine(lineMenu.origIdx); setLineMenu(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('invoices.create.lineMenuDelete')}
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* ── شريط الأدوات ── */}
      <div className="invoice-toolbar">
        <Link to={listPath}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
            <ArrowRight className="h-4 w-4" /> {t('invoices.create.invoicesLink')}
          </Button>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-base font-bold sm:text-lg">
            {isEdit && !isDraft ? t('invoices.create.editTitle') : invoiceType ? localizedName(locale, invoiceType.nameAr, invoiceType.nameEn) : t('invoices.list.newInvoice')}
          </h1>
          {isEdit && loadedInvoice && <Badge variant="outline" className="shrink-0">{loadedInvoice.invoiceNumber}</Badge>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isEdit && editId != null && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!loadedInvoice?.journalEntryId}
                title={t('invoices.list.viewEntry')}
                onClick={() => {
                  if (!loadedInvoice?.journalEntryId) return;
                  navigate(`/accounting/journal/${loadedInvoice.journalEntryId}/view`, {
                    state: {
                      returnTo: `/invoices/${editId}/edit`,
                      returnLabel: loadedInvoice.invoiceNumber,
                    },
                  });
                }}
              >
                <BookOpen className="h-4 w-4" /> {t('invoices.list.viewEntry')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAudit(true)}
                title={t('audit.openButtonTip')}
                className="border-violet-500/60 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
              >
                <History className="h-4 w-4" /> {t('audit.openButton')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!loadedInvoice?.journalEntryId}
                onClick={() => setShowArchive(true)}
                title={t('attachments.openButtonTip')}
                className="border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
              >
                <Archive className="h-4 w-4" /> {t('attachments.openButton')}
              </Button>
            </>
          )}
          {canDeleteInvoice && (
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" /> {t('common.delete')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={lines.length === 0}
            onClick={() => printInvoice(buildPrintData(), companyQuery.data ?? null, locale)}
          >
            <Printer className="h-4 w-4" /> {t('invoices.create.print')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>
            <X className="h-4 w-4" /> {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || lines.length === 0 || !party}>
            <Save className="h-4 w-4" />
            {isEdit && !isDraft ? (saving ? t('invoices.create.savingChanges') : t('invoices.create.saveChanges')) : (saving ? t('invoices.create.issuing') : t('invoices.create.issue'))}
          </Button>
        </div>
      </div>

      <Card className="invoice-document border-0 shadow-md">
        <div className="invoice-document-accent" />
        <CardContent className="space-y-3 p-3 sm:p-4">

          {/* ── رأس الفاتورة ── */}
          <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', isOrderInvoice ? 'lg:grid-cols-7' : 'lg:grid-cols-6')}>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="invoice-field-label mb-0 flex items-center gap-1"><Hash className="h-3 w-3" /> {t('invoices.create.invoiceNumber')}</Label>
                {!isOrderInvoice && (
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={enableCustomInvoiceNumber}
                      onChange={e => {
                        setEnableCustomInvoiceNumber(e.target.checked);
                        if (!e.target.checked) setCustomInvoiceNumber('');
                      }}
                    />
                    {t('invoices.create.enableManual')}
                  </label>
                )}
              </div>
              {isEdit && loadedInvoice ? (
                <div className="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 px-2 font-mono text-xs text-muted-foreground" dir="ltr">
                  {loadedInvoice.invoiceNumber}
                </div>
              ) : enableCustomInvoiceNumber ? (
                <Input
                  className="h-8 text-xs font-mono"
                  dir="ltr"
                  placeholder={t('invoices.create.manualPlaceholder', { code: invoiceType?.code ?? '' })}
                  value={customInvoiceNumber}
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => setCustomInvoiceNumber(e.target.value)}
                />
              ) : (
                <div className="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 px-2 font-mono text-xs text-muted-foreground">
                  {invoiceType?.code
                    ? <span title={t('invoices.create.autoOnSave')} dir="ltr">{invoiceType.code}-<span className="opacity-50">?</span></span>
                    : t('invoices.create.auto')}
                </div>
              )}
            </div>
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Hash className="h-3 w-3" /> {t('invoices.create.manualNumber')}</Label>
              <Input
                className="h-8 text-xs font-mono"
                dir="ltr"
                placeholder={isOrderInvoice ? '—' : '—'}
                value={manualRefNumber}
                disabled={isOrderInvoice}
                readOnly={isOrderInvoice}
                onFocus={e => e.currentTarget.select()}
                onChange={e => setManualRefNumber(e.target.value)}
              />
            </div>
            {isOrderInvoice && (
              <div>
                <Label className="invoice-field-label flex items-center gap-1"><Hash className="h-3 w-3" /> {t('invoices.create.orderNumber')}</Label>
                <div className="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 px-2 font-mono text-xs text-muted-foreground" dir="ltr">
                  {loadedInvoice?.platformOrderNumber ?? '—'}
                </div>
              </div>
            )}
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Calendar className="h-3 w-3" /> {t('common.date')}</Label>
              <Input type="date" className="h-8 text-xs" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label className="invoice-field-label flex items-center gap-1"><Wallet className="h-3 w-3" /> {t('invoices.create.settlementMethod')}</Label>
              <select className={SELECT_CLS} value={settlementType} onChange={e => setSettlementType(Number(e.target.value))}>
                <option value={1}>{t('invoices.create.settlementCash')}</option>
                <option value={2}>{t('invoices.create.settlementCredit')}</option>
              </select>
            </div>
            {showWarehouse && (
              <div>
                <Label className="invoice-field-label flex items-center gap-1"><Warehouse className="h-3 w-3" /> {t('invoices.create.warehouse')}</Label>
                {warehousesQuery.isLoading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                  : activeWarehouses.length === 0 ? <p className="text-xs text-muted-foreground">{t('invoices.create.noWarehouses')}</p>
                  : <select className={SELECT_CLS} value={warehouseId ?? ''} onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{t('invoices.create.selectOption')}</option>
                    {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.nameAr}{w.isDefault ? ' ★' : ''}</option>)}
                  </select>
                }
              </div>
            )}
            <div>
              <Label className="invoice-field-label flex items-center gap-1">
                <Coins className="h-3 w-3" /> {t('common.currency')}
                {currencyLocked && <span className="text-[9px] text-muted-foreground">{t('invoices.create.currencyAuto')}</span>}
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
                <Label className="invoice-field-label">{t('invoices.create.paymentMeans')}</Label>
                <select className={SELECT_CLS} value={paymentMethodKind} onChange={e => setPaymentMethodKind(Number(e.target.value))}>
                  <option value={1}>{t('invoices.create.paymentMethodCashBox')}</option>
                  <option value={2}>{t('invoices.create.paymentMethodCompany')}</option>
                  <option value={3}>{t('invoices.create.paymentMethodBank')}</option>
                </select>
              </div>
              <div>
                <Label className="invoice-field-label">{paymentMethodKind === 1 ? t('invoices.create.cashBox') : paymentMethodKind === 2 ? t('invoices.create.paymentCompany') : t('invoices.create.bank')}</Label>
                {meansLoading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                  : !paymentMeansOptions.length ? <p className="text-xs text-muted-foreground">{t('invoices.create.noOptions')}</p>
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
                    <span className="font-semibold">{partyDisplayName(party)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{party.accountCode}</span>
                    {(party.contactPerson || party.mobile || party.phone) && <span className="text-xs text-muted-foreground">{party.contactPerson ?? party.mobile ?? party.phone}</span>}
                    {partyPriceLabel && <Badge variant="outline" className="text-[10px]">{partyPriceLabel}</Badge>}
                    {partyCreditLimit > 0 && <span className="text-xs text-muted-foreground">{t('invoices.create.creditLimitShort')}: <span className="num-display">{formatMoney(partyCreditLimit, currency)}</span></span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setParty(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder={t('invoices.create.partySearch')} className="h-8 pr-10 text-sm" value={partySearch} onChange={e => setPartySearch(e.target.value)} onFocus={() => setShowPartyDrop(true)} />
                  {showPartyDrop && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-card shadow-xl">
                      {partiesQuery.isLoading ? <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                        : !visibleParties.length ? (
                          <div className="space-y-2 p-3">
                            <p className="text-sm text-muted-foreground">{isCash && (partiesQuery.data?.length ?? 0) > 0 ? t('invoices.create.noPartyForCurrency', { currency }) : t('common.noResults')}</p>
                            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={openAddParty}><Plus className="h-3.5 w-3.5" /> {addPartyLabel}</Button>
                          </div>
                        ) : visibleParties.map(p => (
                          <button key={p.id} type="button" className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-right hover:bg-accent"
                            onClick={() => handleSelectParty(p)}>
                            <span className="font-medium">{partyDisplayName(p)}</span>
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
            {/* شريط التابات — مخفي عند الطباعة */}
            <div className="flex overflow-x-auto border-b border-border/60 scrollbar-none print:hidden">
              <TabBtn active={activeTab === 'lines'} onClick={() => setActiveTab('lines')} count={regularLinesWithIdx.length}>
                <Receipt className="h-3.5 w-3.5" /> {t('invoices.create.lines')}
              </TabBtn>
              <TabBtn active={activeTab === 'gifts'} onClick={() => setActiveTab('gifts')} count={giftLinesWithIdx.length}>
                <Package className="h-3.5 w-3.5" /> {t('invoices.create.tabsGifts')}
              </TabBtn>
              <TabBtn active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} count={expenseLines.length}>
                <CreditCard className="h-3.5 w-3.5" /> {t('invoices.create.tabsExpenses')}
              </TabBtn>
              {isOrderInvoice && (
                <TabBtn active={activeTab === 'order'} onClick={() => setActiveTab('order')}>
                  <Inbox className="h-3.5 w-3.5" /> {t('invoices.create.tabsOrder')}
                </TabBtn>
              )}
              <TabBtn active={activeTab === 'settlement'} onClick={() => setActiveTab('settlement')}>
                <Wallet className="h-3.5 w-3.5" /> {t('invoices.create.tabsSettlement')}
              </TabBtn>
            </div>

            {/* محتوى التاب — عند الطباعة تظهر جميع التابات المستخدمة */}
            <div className="pt-3">
              {/* البنود */}
              <div className={activeTab === 'lines' ? '' : 'hidden print:block'}>
                {renderItemsTab('lines')}
              </div>

              {/* الهدايا — يظهر دائماً عند تحديده، وعند الطباعة فقط إذا كانت هناك هدايا */}
              <div className={activeTab === 'gifts' ? '' : (giftLinesWithIdx.length > 0 ? 'hidden print:block' : 'hidden')}>
                <div className="print:mt-4 print:border-t print:pt-3">
                  {activeTab !== 'gifts' && giftLinesWithIdx.length > 0 && (
                    <div className="hidden print:block text-sm font-semibold mb-2 flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 inline ml-1" />{t('invoices.create.tabsGifts')}
                    </div>
                  )}
                  {renderItemsTab('gifts')}
                </div>
              </div>

              {/* المصاريف — يظهر دائماً عند تحديده، وعند الطباعة فقط إذا كانت هناك مصاريف */}
              <div className={activeTab === 'expenses' ? '' : (expenseLines.length > 0 ? 'hidden print:block' : 'hidden')}>
                <div className="print:mt-4 print:border-t print:pt-3">
                  {activeTab !== 'expenses' && expenseLines.length > 0 && (
                    <div className="hidden print:block text-sm font-semibold mb-2">
                      <CreditCard className="h-3.5 w-3.5 inline ml-1" />{t('invoices.create.tabsExpenses')}
                    </div>
                  )}
                  {renderExpensesTab()}
                </div>
              </div>

              {/* الطلب */}
              {isOrderInvoice && (
                <div className={activeTab === 'order' ? '' : 'hidden print:block'}>
                  <div className="print:mt-4 print:border-t print:pt-3">
                    {activeTab !== 'order' && (
                      <div className="hidden print:block text-sm font-semibold mb-2">
                        <Inbox className="h-3.5 w-3.5 inline ml-1" />{t('invoices.create.tabsOrder')}
                      </div>
                    )}
                    {renderOrderTab()}
                  </div>
                </div>
              )}

              {/* التسديد */}
              <div className={activeTab === 'settlement' ? '' : 'hidden print:block'}>
                <div className="print:mt-4 print:border-t print:pt-3">
                  {activeTab !== 'settlement' && (
                    <div className="hidden print:block text-sm font-semibold mb-2">
                      <Wallet className="h-3.5 w-3.5 inline ml-1" />{t('invoices.create.tabsSettlement')}
                    </div>
                  )}
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
                  <Label className="invoice-field-label">{t('invoices.create.discountPct')}</Label>
                  <div className="relative">
                    <DecimalInput
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={discountPct}
                      onValueChange={handleDiscountPct} />
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                {/* الخصم مبلغ */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.discountAmt')}</Label>
                  <DecimalInput className={NUMERIC_INPUT_CLS}
                    value={discountAmt} onValueChange={handleDiscountAmt} />
                </div>
                {/* الإضافة % */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.additionPct')}</Label>
                  <div className="relative">
                    <DecimalInput
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={additionPct}
                      onValueChange={handleAdditionPct} />
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                {/* الإضافة مبلغ */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.additionAmt')}</Label>
                  <DecimalInput className={NUMERIC_INPUT_CLS}
                    value={additionAmt} onValueChange={handleAdditionAmt} />
                </div>
                {/* الضريبة % */}
                <div>
                  <Label className="invoice-field-label">{t('invoices.create.taxPct')}</Label>
                  <div className="relative">
                    <DecimalInput
                      className={cn(NUMERIC_INPUT_CLS, 'pl-7 text-center')}
                      value={taxRate}
                      onValueChange={setTaxRate} />
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
          <div className="w-full max-w-5xl rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> حركة المادة — {itemMovementsId.name}</div>
              <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setItemMovementsId(null)}><X className="h-4 w-4" /></button>
            </div>
            {/* شريط الفلاتر */}
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs">
              <span className="text-muted-foreground">الفترة:</span>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">من</span>
                <input
                  type="date"
                  className="h-7 rounded border border-border/60 bg-background px-2 text-xs"
                  value={movFromDate}
                  onChange={e => setMovFromDate(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">إلى</span>
                <input
                  type="date"
                  className="h-7 rounded border border-border/60 bg-background px-2 text-xs"
                  value={movToDate}
                  onChange={e => setMovToDate(e.target.value)}
                />
              </label>
              {(movFromDate || movToDate) && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setMovFromDate(''); setMovToDate(''); }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={movGiftOnly}
                  onChange={e => setMovGiftOnly(e.target.checked)}
                />
                <span className="text-emerald-600">الهدايا فقط</span>
              </label>
              <span className="ms-auto text-muted-foreground num-display">
                {movementRows.length} حركة
              </span>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {itemMovementsQuery.isLoading
                ? <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
                : movementRows.length === 0
                  ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد حركات مسجّلة</div>
                  : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">التاريخ</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">النوع</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">المورد/العميل</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">المستودع</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">الكمية</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">وحدة الجرد</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">قبل</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">بعد</th>
                          <th className="py-2 px-2 text-center font-medium text-muted-foreground">التكلفة</th>
                          <th className="py-2 px-2 text-right font-medium text-muted-foreground">المرجع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movementRows.map(m => {
                          const info = MOVEMENT_TYPE_LABELS[m.type] ?? { label: String(m.type), color: '' };
                          return (
                            <tr key={m.id} className="border-t border-border/40 hover:bg-accent/30">
                              <td className="py-1.5 px-2 text-muted-foreground">{formatDate(m.movementDate, { short: true })}</td>
                              <td className={cn('py-1.5 px-2 font-medium', info.color)}>
                                {info.label}
                                {m.isGift && <span className="ms-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-semibold text-emerald-600">هدية</span>}
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground">{m.partyName ?? '—'}</td>
                              <td className="py-1.5 px-2">{m.warehouseName}</td>
                              <td className="py-1.5 px-2 text-center num-display font-semibold">{m.quantity}</td>
                              <td className="py-1.5 px-2 text-center">{m.unitName}</td>
                              <td className="py-1.5 px-2 text-center num-display text-muted-foreground">{formatAmount(m.runBefore, 2)}</td>
                              <td className="py-1.5 px-2 text-center num-display font-semibold">{formatAmount(m.runAfter, 2)}</td>
                              <td className="py-1.5 px-2 text-center num-display font-medium">
                                {movementLineCost(m) != null ? formatAmount(movementLineCost(m)!, 2) : '—'}
                              </td>
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
              <div className="flex items-center gap-2 font-semibold">
                <ClipboardList className="h-4 w-4 text-primary" /> جرد المخزون — {itemStockId.name}
              </div>
              <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setItemStockId(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* مختار وحدة القياس */}
            {(itemStockDetailQuery.data?.units?.length ?? 0) > 1 && (() => {
              const units = itemStockDetailQuery.data!.units;
              const activeUomId = stockUomId ?? units.find(u => u.isBase)?.unitOfMeasureId ?? units[0].unitOfMeasureId;
              return (
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <span className="text-xs text-muted-foreground">وحدة القياس:</span>
                  <div className="flex gap-1 flex-wrap">
                    {units.map(u => (
                      <button
                        key={u.unitOfMeasureId}
                        type="button"
                        onClick={() => setStockUomId(u.unitOfMeasureId)}
                        className={cn(
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                          activeUomId === u.unitOfMeasureId
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-accent'
                        )}
                      >
                        {u.unitName ?? '—'}
                        {u.isBase && <span className="ml-1 text-[9px] opacity-60">أساسية</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="max-h-[55vh] overflow-auto p-1">
              {itemStockQuery.isLoading
                ? <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
                : (itemStockQuery.data?.length ?? 0) === 0
                  ? <div className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات مخزون</div>
                  : (() => {
                      const units = itemStockDetailQuery.data?.units ?? [];
                      const activeUomId = stockUomId ?? units.find(u => u.isBase)?.unitOfMeasureId ?? null;
                      const activeUnit = units.find(u => u.unitOfMeasureId === activeUomId);
                      const factor = activeUnit?.conversionFactor ?? 1;
                      const unitName = activeUnit?.unitName ?? (units.find(u => u.isBase)?.unitName ?? '');
                      const stocks = itemStockQuery.data as ItemWarehouseStockDto[];
                      const convertQty = (base: number) => {
                        const converted = base / factor;
                        return Number.isInteger(converted) ? converted : parseFloat(converted.toFixed(3));
                      };
                      const totalBase = stocks.reduce((s, r) => s + r.netStock, 0);
                      return (
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="py-2 px-3 text-right font-medium">المستودع</th>
                              <th className="py-2 px-3 text-center font-medium text-xs text-muted-foreground">الرمز</th>
                              <th className="py-2 px-3 text-left font-medium">
                                المخزون {unitName && <span className="text-xs font-normal text-muted-foreground">({unitName})</span>}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {stocks.map(s => (
                              <tr key={s.warehouseId} className="border-t border-border/40">
                                <td className="py-2 px-3">{s.warehouseName}</td>
                                <td className="py-2 px-3 text-center font-mono text-xs text-muted-foreground">{s.warehouseCode}</td>
                                <td className={cn('py-2 px-3 text-left num-display font-bold', s.netStock > 0 ? 'text-green-600' : 'text-destructive')}>
                                  {convertQty(s.netStock)}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                              <td className="py-2 px-3">الإجمالي</td>
                              <td />
                              <td className="py-2 px-3 text-left num-display">
                                {convertQty(totalBase)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()
              }
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* حوار تنبيه: سعر البيع أقل من التكلفة */}
      {belowCostConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBelowCostConfirm(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">{t('invoices.create.belowCost.title', { defaultValue: 'انتباه: سعر أقل من التكلفة' })}</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {belowCostConfirm.length === 1
                ? t('invoices.create.belowCost.single', {
                    defaultValue: 'كلفة المادة «{{name}}» {{cost}} وسعر البيع {{price}} أقل من التكلفة. هل تريد الاستمرار في إصدار الفاتورة؟',
                    name: belowCostConfirm[0].name,
                    cost: formatAmount(belowCostConfirm[0].cost, 2),
                    price: formatAmount(belowCostConfirm[0].price, 2),
                  })
                : t('invoices.create.belowCost.multi', {
                    defaultValue: 'توجد {{count}} مواد سعر بيعها أقل من التكلفة. هل تريد الاستمرار في إصدار الفاتورة؟',
                    count: belowCostConfirm.length,
                  })}
            </p>
            {belowCostConfirm.length > 1 && (
              <div className="mt-3 max-h-40 overflow-auto rounded-md border bg-secondary/30 text-xs">
                {belowCostConfirm.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-0">
                    <span className="truncate">{b.name}</span>
                    <span className="num-display shrink-0 text-muted-foreground">
                      {t('invoices.create.belowCost.row', {
                        defaultValue: 'الكلفة {{cost}} • البيع {{price}}',
                        cost: formatAmount(b.cost, 2),
                        price: formatAmount(b.price, 2),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBelowCostConfirm(null)}>
                {t('common.no')}
              </Button>
              <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={() => { setBelowCostConfirm(null); submitInvoice(); }}>
                {t('common.yes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* حوار الطباعة بعد الإصدار */}
      {issuePrintPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle className="h-5 w-5" />
              <h3 className="text-base font-bold">{t('invoices.create.issuePrintTitle')}</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t('invoices.create.issuePrintPrompt', { number: issuePrintPrompt.invoiceNumber })}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => finishIssueFlow(false)}>
                {t('common.no')}
              </Button>
              <Button size="sm" onClick={() => finishIssueFlow(true)}>
                <Printer className="h-4 w-4" /> {t('common.yes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* حوار الحذف */}
      {showDeleteConfirm && loadedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleteMutation.isPending && setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /><h3 className="text-base font-bold">{t('invoices.create.deleteTitle')}</h3></div>
            <p className="mt-3 text-sm text-muted-foreground">{t('invoices.create.deleteConfirm', { number: loadedInvoice.invoiceNumber })}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={deleteMutation.isPending} onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel')}</Button>
              <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                <Trash2 className="h-4 w-4" /> {deleteMutation.isPending ? t('common.deleting') : t('invoices.create.deleteFinal')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAudit && isEdit && editId != null && (
        <EntityAuditDialog
          open={showAudit}
          onClose={() => setShowAudit(false)}
          entityType="SalesInvoice"
          entityId={editId}
          subtitle={loadedInvoice?.invoiceNumber}
        />
      )}

      {showArchive && isEdit && loadedInvoice?.journalEntryId != null && (
        <VoucherAttachmentsDialog
          open={showArchive}
          onClose={() => setShowArchive(false)}
          entryId={loadedInvoice.journalEntryId}
          subtitle={loadedInvoice.invoiceNumber}
        />
      )}

      <StockInsufficientDialog
        open={!!stockError}
        message={stockError}
        onClose={() => setStockError(null)}
        locale={i18n.language.startsWith('en') ? 'en' : 'ar'}
      />

      {lineImageViewer && (
        <ItemImageViewerDialog
          open
          itemId={lineImageViewer.itemId}
          imageId={lineImageViewer.imageId}
          imageIds={lineImageViewer.imageIds}
          onImageIdChange={id => setLineImageViewer(v => (v ? { ...v, imageId: id } : null))}
          title={lineImageViewer.title}
          onClose={() => setLineImageViewer(null)}
        />
      )}
    </div>
  );
}
