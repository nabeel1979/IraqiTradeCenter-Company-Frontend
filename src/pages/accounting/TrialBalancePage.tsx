import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Calendar, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { accountingApi } from '@/lib/api/accounting';
import { formatIQD } from '@/lib/utils';

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function TrialBalancePage() {
  const def = getDefaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [appliedRange, setAppliedRange] = useState(def);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trial-balance', appliedRange.from, appliedRange.to],
    queryFn: () => accountingApi.getTrialBalance(appliedRange.from, appliedRange.to),
  });

  const totalDebit = data?.reduce((s, r) => s + r.debit, 0) ?? 0;
  const totalCredit = data?.reduce((s, r) => s + r.credit, 0) ?? 0;
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const exportCsv = () => {
    if (!data || data.length === 0) return;
    const rows = [
      ['الكود', 'الحساب', 'مدين', 'دائن', 'الرصيد'],
      ...data.map(r => [r.accountCode, r.accountName, r.debit, r.credit, r.balance]),
      ['', 'الإجمالي', totalDebit, totalCredit, ''],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${appliedRange.from}_${appliedRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[160px]">
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              من
            </Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              إلى
            </Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={() => setAppliedRange({ from, to })}>تطبيق</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data?.length}>
            <Download className="h-4 w-4" />
            تصدير CSV
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner text="جاري حساب الميزان..." />
      ) : isError ? (
        <EmptyState icon={Calculator} title="تعذّر تحميل الميزان" description="حدث خطأ في الاتصال" />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Calculator}
          title="لا حركات مسجَّلة"
          description="لا توجد قيود مرحَّلة في الفترة المختارة"
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">ميزان المراجعة</CardTitle>
              <div className="text-xs">
                {balanced ? (
                  <span className="rounded-full bg-success/10 px-3 py-1 text-success">متوازن ✓</span>
                ) : (
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">غير متوازن</span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الحساب</th>
                  <th className="text-left">المدين</th>
                  <th className="text-left">الدائن</th>
                  <th className="text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {data!.map(r => (
                  <tr key={r.accountId}>
                    <td><span className="num-display text-xs text-muted-foreground">{r.accountCode}</span></td>
                    <td className="font-medium">{r.accountName}</td>
                    <td className="text-left num-display">{r.debit > 0 ? formatIQD(r.debit) : '—'}</td>
                    <td className="text-left num-display">{r.credit > 0 ? formatIQD(r.credit) : '—'}</td>
                    <td className="text-left num-display font-semibold">
                      {r.balance > 0 ? formatIQD(r.balance) : r.balance < 0 ? `(${formatIQD(Math.abs(r.balance))})` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/30 bg-secondary/40 font-semibold">
                <tr>
                  <td colSpan={2}>الإجمالي</td>
                  <td className="text-left num-display">{formatIQD(totalDebit)}</td>
                  <td className="text-left num-display">{formatIQD(totalCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
