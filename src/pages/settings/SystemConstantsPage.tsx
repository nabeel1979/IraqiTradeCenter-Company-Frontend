import { Link } from 'react-router-dom';
import { Building2, Globe, MapPin, Settings2, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { isParentHost } from '@/lib/platform';

const SECTIONS = [
  {
    to: '/settings/branches',
    title: 'الفروع',
    description: 'إدارة فروع الشركة وربطها بالعمليات والمستخدمين',
    icon: Building2,
    permission: PERMS.Branches.Branches.Read,
    companyOnly: true,
  },
  {
    to: '/settings/countries',
    title: 'البلدان',
    description: 'تعريف البلدان المستخدمة في النظام وبطاقات المواد',
    icon: Globe,
    permission: PERMS.System.CompanySettings.Read,
    companyOnly: false,
  },
  {
    to: '/settings/cities',
    title: 'المدن',
    description: 'تعريف المدن وربطها بالبلدان',
    icon: MapPin,
    permission: PERMS.System.CompanySettings.Read,
    companyOnly: false,
  },
] as const;

export function SystemConstantsPage() {
  const { can } = usePermissions();
  const parent = isParentHost();
  const visible = SECTIONS.filter(s => can(s.permission) && !(s.companyOnly && parent));

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-xl font-bold">ثوابت النظام</h1>
          <p className="text-sm text-muted-foreground">إعدادات مرجعية مشتركة للفروع والجغرافيا</p>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            لا توجد صلاحيات لعرض ثوابت النظام
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ to, title, description, icon: Icon }) => (
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
      )}
    </div>
  );
}
