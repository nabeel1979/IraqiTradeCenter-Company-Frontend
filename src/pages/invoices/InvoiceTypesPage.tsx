import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, FileStack, ArrowRight, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { accountingApi } from '@/lib/api/accounting';
import type { AccountDto } from '@/types/api';
import {
  invoiceTypesApi,
  INVOICE_MOVEMENT_TYPES,
  INVOICE_CATEGORIES,
  INVOICE_PARTY_KINDS,
  INVOICE_SETTLEMENT_TYPES,
  INVOICE_PAYMENT_METHODS,
  AUTO_PRICE_SOURCES,
  type InvoiceTypeDto,
  type UpsertInvoiceTypePayload,
} from '@/lib/api/invoiceTypes';
import { inventoryApi } from '@/lib/api/inventory';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { extractApiError } from '@/lib/utils';

const EMPTY: UpsertInvoiceTypePayload = {
  code: '',
  nameAr: '',
  nameEn: '',
  movementType: 2,
  category: 1,
  defaultPartyKind: 1,
  defaultWarehouseId: null,
  defaultCashBoxId: null,
  debitAccountId: null,
  creditAccountId: null,
  inventoryAccountId: null,
  discountAccountId: null,
  additionAccountId: null,
  profitAccountId: null,
  lossAccountId: null,
  postDiscountAndAddition: false,
  generatesJournalEntry: true,
  affectsInventory: true,
  affectsCost: true,
  saveAndPostAtOnce: true,
  enableExpensesWindow: false,
  settlementType: 1,
  paymentMethodKind: 1,
  paymentCashBoxId: null,
  paymentCompanyId: null,
  paymentBankId: null,
  autoPriceSource: 2,
  isEnabled: true,
  displayOrder: 100,
};

function movementLabel(v: number) {
  return INVOICE_MOVEMENT_TYPES.find(x => x.value === v)?.label ?? String(v);
}
function categoryLabel(v: number) {
  return INVOICE_CATEGORIES.find(x => x.value === v)?.label ?? String(v);
}

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

export function InvoiceTypesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceTypeDto | null>(null);
  const [form, setForm] = useState<UpsertInvoiceTypePayload>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['invoice-types'],
    queryFn: () => invoiceTypesApi.list(),
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-manage'],
    queryFn: () => inventoryApi.listWarehousesManage(),
  });

  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'active'],
    queryFn: () => cashBoxesApi.getAll(true),
  });

  const paymentCompaniesQuery = useQuery({
    queryKey: ['financial-parties', 'PaymentCompany'],
    queryFn: () => financialManagementApi.getParties({ kind: 'PaymentCompany', includeInactive: false }),
    staleTime: 60_000,
  });

  const banksQuery = useQuery({
    queryKey: ['financial-parties', 'Bank'],
    queryFn: () => financialManagementApi.getParties({ kind: 'Bank', includeInactive: false }),
    staleTime: 60_000,
  });

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });
  const leafAccounts = treeQuery.data ? flattenLeafAccounts(treeQuery.data) : [];

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, code: editing ? editing.code : form.code.trim().toUpperCase() };
      if (editing) await invoiceTypesApi.update(editing.id, payload);
      else await invoiceTypesApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم التحديث' : 'تم الإضافة');
      qc.invalidateQueries({ queryKey: ['invoice-types'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => invoiceTypesApi.remove(id),
    onSuccess: () => {
      toast.success('تم الحذف');
      qc.invalidateQueries({ queryKey: ['invoice-types'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحذف'),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(row: InvoiceTypeDto) {
    setEditing(row);
    setForm({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? '',
      movementType: row.movementType,
      category: row.category,
      defaultPartyKind: row.defaultPartyKind ?? null,
      defaultWarehouseId: row.defaultWarehouseId ?? null,
      defaultCashBoxId: row.defaultCashBoxId ?? null,
      debitAccountId: row.debitAccountId ?? null,
      creditAccountId: row.creditAccountId ?? null,
      inventoryAccountId: row.inventoryAccountId ?? null,
      discountAccountId: row.discountAccountId ?? null,
      additionAccountId: row.additionAccountId ?? null,
      profitAccountId: row.profitAccountId ?? null,
      lossAccountId: row.lossAccountId ?? null,
      postDiscountAndAddition: row.postDiscountAndAddition ?? false,
      generatesJournalEntry: row.generatesJournalEntry,
      affectsInventory: row.affectsInventory,
      affectsCost: row.affectsCost,
      saveAndPostAtOnce: row.saveAndPostAtOnce,
      enableExpensesWindow: row.enableExpensesWindow,
      settlementType: row.settlementType,
      paymentMethodKind: row.paymentMethodKind,
      paymentCashBoxId: row.paymentCashBoxId ?? null,
      paymentCompanyId: row.paymentCompanyId ?? null,
      paymentBankId: row.paymentBankId ?? null,
      autoPriceSource: row.autoPriceSource ?? 2,
      isEnabled: row.isEnabled,
      displayOrder: row.displayOrder,
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  const warehouses = warehousesQuery.data ?? [];
  const cashBoxes = cashBoxesQuery.data ?? [];
  const paymentCompanies = paymentCompaniesQuery.data ?? [];
  const banks = banksQuery.data ?? [];

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/invoices/constants">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowRight className="h-4 w-4" />
              إعدادات الفواتير
            </Button>
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileStack className="h-5 w-5 text-primary" />
            أنواع الفواتير
          </h1>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />نوع جديد</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>اسم الفاتورة</th>
                  <th>الحركة</th>
                  <th>التصنيف</th>
                  <th>الحالة</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد أنواع — أضف الأول</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.code}</td>
                    <td>
                      {r.nameAr}
                      {r.isSystem && <Badge variant="outline" className="ms-2 text-[10px]"><Lock className="h-3 w-3 inline" /> نظامي</Badge>}
                    </td>
                    <td>{movementLabel(r.movementType)}</td>
                    <td>{categoryLabel(r.category)}</td>
                    <td>{r.isEnabled ? <Badge variant="success">مفعّل</Badge> : <Badge variant="muted">موقوف</Badge>}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {!r.isSystem && (
                          <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-3xl my-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{editing ? `تعديل: ${editing.nameAr}` : 'نوع فاتورة جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>اسم الفاتورة *</Label>
                  <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>الاسم (إنجليزي)</Label>
                  <Input dir="ltr" value={form.nameEn ?? ''} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
                </div>
                {!editing && (
                  <div className="space-y-1">
                    <Label>الرمز *</Label>
                    <Input dir="ltr" className="font-mono uppercase" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>نوع الفاتورة (حركة)</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.movementType}
                    onChange={e => setForm(f => ({ ...f, movementType: Number(e.target.value) as UpsertInvoiceTypePayload['movementType'] }))}>
                    {INVOICE_MOVEMENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>التصنيف</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: Number(e.target.value) as UpsertInvoiceTypePayload['category'] }))}>
                    {INVOICE_CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>الحساب الافتراضي (طرف)</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.defaultPartyKind ?? ''}
                    onChange={e => setForm(f => ({ ...f, defaultPartyKind: e.target.value ? Number(e.target.value) as 1 | 2 : null }))}>
                    <option value="">—</option>
                    {INVOICE_PARTY_KINDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>المستودع الافتراضي</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.defaultWarehouseId ?? ''}
                    onChange={e => setForm(f => ({ ...f, defaultWarehouseId: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">—</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.nameAr}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>الصندوق الافتراضي</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.defaultCashBoxId ?? ''}
                    onChange={e => setForm(f => ({ ...f, defaultCashBoxId: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">—</option>
                    {cashBoxes.map(c => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>جلب السعر التلقائي</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.autoPriceSource}
                    onChange={e => setForm(f => ({ ...f, autoPriceSource: Number(e.target.value) as UpsertInvoiceTypePayload['autoPriceSource'] }))}>
                    {AUTO_PRICE_SOURCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground md:col-span-2">
                  حسابات المدين/الدائن/المخزون تُؤخذ تلقائياً من حساب المستودع المرتبط — لا حاجة لتحديدها هنا.
                </p>
                <div className="space-y-1">
                  <Label>حساب الخصم</Label>
                  <AccountPicker accounts={leafAccounts} value={form.discountAccountId ?? null}
                    onChange={id => setForm(f => ({ ...f, discountAccountId: id }))} allowClear />
                </div>
                <div className="space-y-1">
                  <Label>حساب الإضافة</Label>
                  <AccountPicker accounts={leafAccounts} value={form.additionAccountId ?? null}
                    onChange={id => setForm(f => ({ ...f, additionAccountId: id }))} allowClear />
                </div>
                {form.category === 1 && (
                  <>
                    <p className="text-xs text-muted-foreground md:col-span-2">
                      في فواتير البيع: تُرحَّل الكلفة إلى حساب المخزون، ويُرحَّل الفارق (البيع − الكلفة) إلى حساب الأرباح أو الخسائر.
                      يُفضّل قفل هذين الحسابين للقيد اليدوي من شجرة الحسابات.
                    </p>
                    <div className="space-y-1">
                      <Label>حساب الأرباح</Label>
                      <AccountPicker accounts={leafAccounts} value={form.profitAccountId ?? null}
                        onChange={id => setForm(f => ({ ...f, profitAccountId: id }))} allowClear />
                    </div>
                    <div className="space-y-1">
                      <Label>حساب الخسائر</Label>
                      <AccountPicker accounts={leafAccounts} value={form.lossAccountId ?? null}
                        onChange={id => setForm(f => ({ ...f, lossAccountId: id }))} allowClear />
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
                <div className="space-y-1">
                  <Label>طريقة التسديد</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.settlementType}
                    onChange={e => setForm(f => ({ ...f, settlementType: Number(e.target.value) as 1 | 2 }))}>
                    {INVOICE_SETTLEMENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>طريقة الدفع</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.paymentMethodKind}
                    onChange={e => setForm(f => ({ ...f, paymentMethodKind: Number(e.target.value) as 1 | 2 | 3 }))}>
                    {INVOICE_PAYMENT_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.paymentMethodKind === 1 && (
                  <div className="space-y-1">
                    <Label>صندوق الدفع</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.paymentCashBoxId ?? ''}
                      onChange={e => setForm(f => ({ ...f, paymentCashBoxId: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">—</option>
                      {cashBoxes.map(c => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                    </select>
                  </div>
                )}
                {form.paymentMethodKind === 2 && (
                  <div className="space-y-1">
                    <Label>شركة الدفع</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.paymentCompanyId ?? ''}
                      onChange={e => setForm(f => ({ ...f, paymentCompanyId: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">—</option>
                      {paymentCompanies.map(p => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
                    </select>
                  </div>
                )}
                {form.paymentMethodKind === 3 && (
                  <div className="space-y-1">
                    <Label>المصرف</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.paymentBankId ?? ''}
                      onChange={e => setForm(f => ({ ...f, paymentBankId: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">—</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 border-t pt-3 text-sm">
                {[
                  ['generatesJournalEntry', 'يُولّد قيداً محاسبياً'],
                  ['affectsInventory', 'يؤثر على المخزون'],
                  ['affectsCost', 'يؤثر على الكلفة'],
                  ['postDiscountAndAddition', 'تحريك الإضافة والخصم في القيد'],
                  ['saveAndPostAtOnce', 'الحفظ والترحيل مرة واحدة'],
                  ['enableExpensesWindow', 'نافذة المصاريف'],
                  ['isEnabled', 'مفعّل'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" checked={!!form[key as keyof UpsertInvoiceTypePayload]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>

              <Button className="w-full gap-2" disabled={saveMut.isPending} onClick={() => {
                if (!form.nameAr.trim()) { toast.error('اسم الفاتورة مطلوب'); return; }
                if (!editing && !form.code.trim()) { toast.error('الرمز مطلوب'); return; }
                saveMut.mutate();
              }}>
                <Save className="h-4 w-4" />حفظ
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
