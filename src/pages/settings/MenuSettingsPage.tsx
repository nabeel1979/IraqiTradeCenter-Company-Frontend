import { ListChecks, Lock, ArrowRight, Settings as SettingsIcon, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NAV_GROUPS } from '@/components/layout/Sidebar';
import { useSidebarPrefs } from '@/lib/sidebarPreferences';

export function MenuSettingsPage() {
  const navigate = useNavigate();
  const { isHidden, isCollapsed, setHidden, setAllCollapsed } = useSidebarPrefs();
  const visibleCount = NAV_GROUPS.filter(g => g.mandatory || !isHidden(g.key)).length;
  // الأقسام القابلة للطي فقط (الأقسام direct لا تُطوى)
  const allKeys = NAV_GROUPS.filter(g => !g.direct).map(g => g.key);

  const resetAll = () => {
    // أظهر الكل وافتح الكل
    NAV_GROUPS.forEach(g => {
      if (!g.mandatory) setHidden(g.key, false);
    });
    setAllCollapsed(allKeys, false);
  };

  return (
    <div className="space-y-4">
      {/* شريط أدوات */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings')}
            className="h-8 gap-1 px-2"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>إعدادات الشركة</span>
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="h-5 w-5 text-primary" />
            إعدادات القائمة الجانبية
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetAll}
          className="h-8 gap-1.5"
          title="إعادة كل الإعدادات إلى الافتراضي"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          إعادة تعيين
        </Button>
      </div>

      {/* بطاقة إظهار/إخفاء الأقسام */}
      <Card>
        <CardHeader>
          <CardTitle>إظهار / إخفاء الأقسام</CardTitle>
          <CardDescription>
            اختر الأقسام التي تريد إظهارها في القائمة الجانبية
            ({visibleCount} من {NAV_GROUPS.length} ظاهر)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {NAV_GROUPS.map(group => {
            const Icon = group.icon;
            const hidden = !group.mandatory && isHidden(group.key);
            return (
              <label
                key={group.key}
                className={`flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 transition-colors ${
                  group.mandatory ? 'cursor-not-allowed opacity-90' : 'cursor-pointer hover:bg-secondary/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{group.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {group.items.length} عنصر فرعي
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.mandatory ? (
                    <span className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">
                      <Lock className="h-3 w-3" />
                      أساسي - دائماً مرئي
                    </span>
                  ) : (
                    <>
                      <span className={`text-[10px] ${hidden ? 'text-muted-foreground' : 'text-emerald-400'}`}>
                        {hidden ? 'مخفي' : 'ظاهر'}
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-primary"
                        checked={!hidden}
                        onChange={e => setHidden(group.key, !e.target.checked)}
                      />
                    </>
                  )}
                </div>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {/* بطاقة طي/فتح الأقسام */}
      <Card>
        <CardHeader>
          <CardTitle>طي / فتح الأقسام</CardTitle>
          <CardDescription>تحكّم بأي الأقسام مفتوحة افتراضياً عند فتح التطبيق</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllCollapsed(allKeys, false)}
              className="h-8"
            >
              فتح كل الأقسام
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllCollapsed(allKeys, true)}
              className="h-8"
            >
              طي كل الأقسام
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {NAV_GROUPS.map(group => {
              const Icon = group.icon;
              const collapsed = isCollapsed(group.key);
              const hidden = !group.mandatory && isHidden(group.key);
              if (hidden || group.direct) return null;
              return (
                <label
                  key={group.key}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 px-3 py-2 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm">{group.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {collapsed ? 'مطوي' : 'مفتوح'}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={!collapsed}
                      onChange={e => {
                        const map: Record<string, boolean> = {};
                        NAV_GROUPS.forEach(g => { map[g.key] = isCollapsed(g.key); });
                        map[group.key] = !e.target.checked;
                        setAllCollapsed(
                          Object.keys(map).filter(k => map[k]),
                          true
                        );
                        // open the rest
                        const openKeys = Object.keys(map).filter(k => !map[k]);
                        if (openKeys.length > 0) setAllCollapsed(openKeys, false);
                      }}
                    />
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed bg-secondary/20">
        <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
          <SettingsIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p>
              <strong className="text-foreground">المحاسبة</strong> و
              <strong className="text-foreground"> النظام</strong> أساسيان ولا يمكن إخفاؤهما.
            </p>
            <p>
              التفضيلات محفوظة على حسابك في الخادم — تظهر نفسها على أي جهاز تسجّل دخوله.
              كل مستخدم له تفضيلاته الخاصة المستقلّة.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
