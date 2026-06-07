import { Link } from 'react-router-dom';
import { Palette, Ruler, FolderTree, Settings2, ChevronLeft, Warehouse } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SECTIONS = [
  {
    to: '/inventory/colors',
    title: 'الألوان',
    description: 'إدارة ألوان المواد وربطها ببطاقة المادة',
    icon: Palette,
  },
  {
    to: '/inventory/units',
    title: 'وحدات القياس',
    description: 'تعريف وحدات القياس المستخدمة في المواد والفواتير',
    icon: Ruler,
  },
  {
    to: '/inventory/categories',
    title: 'أصناف المواد',
    description: 'شجرة أصناف المواد الرئيسية والفرعية',
    icon: FolderTree,
  },
  {
    to: '/inventory/warehouses',
    title: 'المستودعات',
    description: 'تعريف مستودعات التخزين وربطها بالفروع',
    icon: Warehouse,
  },
] as const;

export function ItemConstantsPage() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-xl font-bold">ثوابت المادة</h1>
          <p className="text-sm text-muted-foreground">إعدادات مرجعية مشتركة لبطاقات المواد</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="group block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                <Button variant="outline" size="sm" className="pointer-events-none group-hover:bg-primary group-hover:text-primary-foreground">
                  <ChevronLeft className="h-4 w-4" />
                  فتح
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
