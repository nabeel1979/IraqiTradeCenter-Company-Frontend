import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { invoicesApi } from '@/lib/api/invoices';
import { formatIQD, formatDate } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    Paid: { label: 'مدفوعة', variant: 'success' },
    PartiallyPaid: { label: 'جزئياً', variant: 'warning' },
    Issued: { label: 'مصدرة', variant: 'default' },
    Draft: { label: 'مسودة', variant: 'muted' },
    Cancelled: { label: 'ملغاة', variant: 'destructive' },
  };
  const cfg = map[status] ?? { label: status, variant: 'muted' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function InvoicesListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', search, status],
    queryFn: () => invoicesApi.list({ search: search || undefined, status: status || undefined, pageSize: 50 }),
  });

  if (isLoading) return <LoadingSpinner text="جاري تحميل الفواتير..." />;
  if (isError) {
    return (
      <EmptyState
        icon={Receipt}
        title="تعذّر تحميل الفواتير"
        description="حدث خطأ في الاتصال بالخادم"
      />
    );
  }

  const invoices = data?.items ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="رقم الفاتورة..."
              className="pr-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-secondary/40 px-3 text-sm"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="Paid">مدفوعة</option>
            <option value="PartiallyPaid">جزئياً</option>
            <option value="Issued">مصدرة</option>
            <option value="Draft">مسودة</option>
            <option value="Cancelled">ملغاة</option>
          </select>
          <Link to="/invoices/new" className="mr-auto">
            <Button>
              <Plus className="h-4 w-4" />
              فاتورة جديدة
            </Button>
          </Link>
        </CardContent>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="لا توجد فواتير"
          description="ابدأ بإنشاء أول فاتورة مبيعات"
          action={
            <Link to="/invoices/new">
              <Button><Plus className="h-4 w-4" />فاتورة جديدة</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th className="text-left">الإجمالي</th>
                  <th className="text-left">المدفوع</th>
                  <th className="text-left">المتبقي</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <span className="num-display text-xs">{inv.invoiceNumber}</span>
                    </td>
                    <td className="text-sm text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                    <td className="font-medium">{inv.customerName ?? '—'}</td>
                    <td className="text-left num-display">{formatIQD(inv.totalAmount)}</td>
                    <td className="text-left num-display text-success">{formatIQD(inv.paidAmount)}</td>
                    <td className="text-left num-display text-muted-foreground">
                      {formatIQD(inv.remainingAmount)}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>
                      <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <FileText className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data && data.totalCount > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          {data.totalCount} فاتورة
        </div>
      )}
    </div>
  );
}
