import { Link } from 'react-router-dom';
import { Receipt, Settings2, FileStack, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SECTIONS = [
  {
    to: '/invoices/types',
    title: 'أنواع الفواتير',
    description: 'تخصيص أنواع الفواتير وحساباتها الافتراضية وخيارات الترحيل',
    icon: FileStack,
  },
  {
    to: '/invoices/settings',
    title: 'ثوابت الفواتير',
    description: 'نوع الجرد وطريقة احتساب التكلفة',
    icon: Settings2,
  },
] as const;

export function InvoiceConstantsHubPage() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/invoices/sales">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ChevronLeft className="h-4 w-4" />
            الفواتير
          </Button>
        </Link>
        <Receipt className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-xl font-bold">إعدادات الفواتير</h1>
          <p className="text-sm text-muted-foreground">أنواع الفواتير والثوابت المرجعية</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map(s => (
          <Link key={s.to} to={s.to}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <s.icon className="h-5 w-5 text-primary" />
                  {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
