import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Save, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  invoiceSettingsApi,
  COST_CALCULATION_METHODS,
  type CostCalculationMethod,
} from '@/lib/api/invoiceTypes';
import { extractApiError } from '@/lib/utils';
import { useState, useEffect } from 'react';

export function InvoiceSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: () => invoiceSettingsApi.get(),
  });

  const [costMethod, setCostMethod] = useState<CostCalculationMethod>(1);

  useEffect(() => {
    if (!data) return;
    setCostMethod(data.costCalculationMethod);
  }, [data]);

  const saveMut = useMutation({
    // ‎الجرد مُعتمد دائماً على الطريقة المستمرة (حساب المستودع) — لا خيار دوري.
    mutationFn: () => invoiceSettingsApi.update({ inventoryMethod: 1, costCalculationMethod: costMethod }),
    onSuccess: () => {
      toast.success('تم حفظ ثوابت الفواتير');
      qc.invalidateQueries({ queryKey: ['invoice-settings'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/invoices/constants">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ArrowRight className="h-4 w-4" />
            إعدادات الفواتير
          </Button>
        </Link>
        <h1 className="text-xl font-bold">ثوابت الفواتير</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">احتساب التكلفة</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>احتساب التكلفة</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={costMethod}
              onChange={e => setCostMethod(Number(e.target.value) as CostCalculationMethod)}
            >
              {COST_CALCULATION_METHODS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Button className="gap-2" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            <Save className="h-4 w-4" />حفظ
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
