import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Save, Search, Trash2, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customersApi } from '@/lib/api/customers';
import { inventoryApi } from '@/lib/api/inventory';
import { invoicesApi, type CreateInvoicePayload } from '@/lib/api/invoices';
import { formatIQD } from '@/lib/utils';
import type { CustomerDto, ItemDto } from '@/types/api';

interface InvoiceLine {
  itemId: number;
  itemName: string;
  unitOfMeasureId: number;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
}

export function CreateInvoicePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDrop, setShowItemDrop] = useState(false);

  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [notes, setNotes] = useState('');

  // ── جلب العملاء (autocomplete)
  const customersQuery = useQuery({
    queryKey: ['customers', customerSearch],
    queryFn: () => customersApi.list({ search: customerSearch, pageSize: 10 }),
    enabled: showCustomerDrop,
  });

  // ── جلب المواد (autocomplete)
  const itemsQuery = useQuery({
    queryKey: ['items', itemSearch],
    queryFn: () => inventoryApi.list({ search: itemSearch, pageSize: 10 }),
    enabled: showItemDrop,
  });

  // ── الحسابات
  const subTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice - l.lineDiscount), 0),
    [lines]
  );
  const effectiveDiscount = useMemo(
    () => (discountPct > 0 ? Math.round((subTotal * discountPct) / 100) : discountAmt),
    [subTotal, discountPct, discountAmt]
  );
  const afterDiscount = subTotal - effectiveDiscount;
  const taxAmount = useMemo(() => Math.round((afterDiscount * taxRate) / 100), [afterDiscount, taxRate]);
  const total = afterDiscount + taxAmount;

  const overCredit =
    customer && customer.creditLimit > 0 && customer.currentBalance + total > customer.creditLimit;

  // ── إضافة مادة كسطر
  const addItem = (item: ItemDto) => {
    setLines(prev => [
      ...prev,
      {
        itemId: item.id,
        itemName: item.nameAr,
        unitOfMeasureId: 0,
        quantity: 1,
        unitPrice: item.baseSalesPrice,
        lineDiscount: 0,
      },
    ]);
    setItemSearch('');
    setShowItemDrop(false);
  };

  const updateLine = (idx: number, patch: Partial<InvoiceLine>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  // ── إنشاء الفاتورة
  const createMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => invoicesApi.create(payload),
    onSuccess: res => {
      if (res.success) {
        toast.success(t('invoices.create.issued', { number: res.data?.invoiceNumber }));
        navigate('/invoices');
      } else {
        res.errors?.forEach(e => toast.error(e));
      }
    },
  });

  const handleSave = () => {
    if (!customer) return toast.error(t('invoices.create.selectCustomer'));
    if (lines.length === 0) return toast.error(t('invoices.create.addLines'));
    if (lines.some(l => l.unitOfMeasureId === 0))
      return toast.error(t('invoices.create.selectUom'));
    if (overCredit) return toast.error(t('invoices.create.overCreditLimit'));

    createMutation.mutate({
      customerId: customer.id,
      taxRate,
      discountPercentage: discountPct,
      discountAmount: discountPct > 0 ? 0 : discountAmt,
      notes: notes || undefined,
      lines: lines.map(l => ({
        itemId: l.itemId,
        unitOfMeasureId: l.unitOfMeasureId,
        quantity: l.quantity,
        unitPriceOverride: l.unitPrice,
        lineDiscount: l.lineDiscount,
      })),
    });
  };

  return (
    <div className="space-y-5">
      {/* العميل */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('invoices.create.customer')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customer ? (
            <div className="flex items-center justify-between rounded-md border bg-secondary/40 p-3">
              <div>
                <div className="font-medium">{customer.businessName}</div>
                <div className="text-xs text-muted-foreground">
                  {customer.ownerName} · {customer.phone} · {t('invoices.create.balance')}:{' '}
                  <span className="num-display">{formatIQD(customer.currentBalance)}</span>
                  {customer.creditLimit > 0 && (
                    <> · {t('invoices.create.creditLimit')}: <span className="num-display">{formatIQD(customer.creditLimit)}</span></>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('invoices.create.customerSearch')}
                className="pr-10"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onFocus={() => setShowCustomerDrop(true)}
              />
              {showCustomerDrop && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-lg">
                  {customersQuery.isLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                  ) : (customersQuery.data?.items.length ?? 0) === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">{t('common.noResults')}</div>
                  ) : (
                    customersQuery.data!.items.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 border-b border-border/40 p-3 text-right hover:bg-accent"
                        onClick={() => {
                          setCustomer(c);
                          setShowCustomerDrop(false);
                          setCustomerSearch('');
                        }}
                      >
                        <span className="font-medium">{c.businessName}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.ownerName} · {c.phone}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* البنود */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('invoices.create.lines')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('invoices.create.itemSearch')}
              className="pr-10"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              onFocus={() => setShowItemDrop(true)}
            />
            {showItemDrop && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-lg">
                {itemsQuery.isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : (itemsQuery.data?.items.length ?? 0) === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('common.noResults')}</div>
                ) : (
                  itemsQuery.data!.items.map(i => (
                    <button
                      key={i.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-border/40 p-3 text-right hover:bg-accent"
                      onClick={() => addItem(i)}
                    >
                      <div>
                        <div className="font-medium">{i.nameAr}</div>
                        <div className="text-xs text-muted-foreground">
                          {i.code} · {t('invoices.create.stock')}: {i.stockBaseQuantity}
                        </div>
                      </div>
                      <span className="num-display text-sm">{formatIQD(i.baseSalesPrice)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('invoices.create.noLines')}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('invoices.create.colItem')}</th>
                  <th>{t('invoices.create.colUom')}</th>
                  <th className="text-left">{t('invoices.create.colQty')}</th>
                  <th className="text-left">{t('invoices.create.colPrice')}</th>
                  <th className="text-left">{t('invoices.create.colDiscount')}</th>
                  <th className="text-left">{t('invoices.create.colTotal')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const lineTotal = l.quantity * l.unitPrice - l.lineDiscount;
                  return (
                    <tr key={idx}>
                      <td className="font-medium">{l.itemName}</td>
                      <td>
                        <Input
                          type="number"
                          className="h-8 w-20"
                          value={l.unitOfMeasureId || ''}
                          placeholder="ID"
                          onChange={e => updateLine(idx, { unitOfMeasureId: +e.target.value || 0 })}
                        />
                      </td>
                      <td className="text-left">
                        <Input
                          type="number"
                          step="0.001"
                          className="h-8 w-24 text-left num-display"
                          value={l.quantity}
                          onChange={e => updateLine(idx, { quantity: +e.target.value || 0 })}
                        />
                      </td>
                      <td className="text-left">
                        <Input
                          type="number"
                          className="h-8 w-28 text-left num-display"
                          value={l.unitPrice}
                          onChange={e => updateLine(idx, { unitPrice: +e.target.value || 0 })}
                        />
                      </td>
                      <td className="text-left">
                        <Input
                          type="number"
                          className="h-8 w-24 text-left num-display"
                          value={l.lineDiscount}
                          onChange={e => updateLine(idx, { lineDiscount: +e.target.value || 0 })}
                        />
                      </td>
                      <td className="text-left num-display font-semibold">{formatIQD(lineTotal)}</td>
                      <td>
                        <button
                          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* الإجماليات والإعدادات */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoices.create.discountAndTax')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('invoices.create.discountPct')}</Label>
                <Input
                  type="number"
                  className="num-display"
                  value={discountPct}
                  onChange={e => {
                    setDiscountPct(+e.target.value || 0);
                    setDiscountAmt(0);
                  }}
                />
              </div>
              <div>
                <Label>{t('invoices.create.discountAmt')}</Label>
                <Input
                  type="number"
                  className="num-display"
                  value={discountAmt}
                  disabled={discountPct > 0}
                  onChange={e => setDiscountAmt(+e.target.value || 0)}
                />
              </div>
            </div>
            <div>
              <Label>{t('invoices.create.taxPct')}</Label>
              <Input
                type="number"
                className="num-display"
                value={taxRate}
                onChange={e => setTaxRate(+e.target.value || 0)}
              />
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoices.create.totals')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('common.subtotal')}</span>
              <span className="num-display">{formatIQD(subTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('invoices.create.discount')}</span>
              <span className="num-display text-destructive">- {formatIQD(effectiveDiscount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('invoices.create.tax')}</span>
              <span className="num-display">{formatIQD(taxAmount)}</span>
            </div>
            <div className="my-2 border-t" />
            <div className="flex items-center justify-between text-base font-semibold">
              <span>{t('common.total')}</span>
              <span className="num-display">{formatIQD(total)}</span>
            </div>

            {overCredit && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t('invoices.create.overCreditLimitWarning', { limit: formatIQD(customer!.creditLimit) })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* الأزرار */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/invoices')}>
          <X className="h-4 w-4" />
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={createMutation.isPending || lines.length === 0 || !customer}>
          {createMutation.isPending ? (
            <>{t('invoices.create.issuing')}</>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('invoices.create.issue')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
