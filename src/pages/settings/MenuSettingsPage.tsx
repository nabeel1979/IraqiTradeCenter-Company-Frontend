import { useMemo } from 'react';
import { ListChecks, Lock, ArrowRight, ArrowLeft, Settings as SettingsIcon, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NAV_GROUPS, type NavGroup } from '@/components/layout/Sidebar';
import { useSidebarPrefs } from '@/lib/sidebarPreferences';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useLocale } from '@/lib/i18n';

export function MenuSettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const { isHidden, isCollapsed, setHidden, setAllCollapsed } = useSidebarPrefs();
  const { can } = usePermissions();

  // ‎نُسقط من قائمة الإعدادات أي قسم لا يملك المستخدم صلاحية القراءة على
  // ‎أي عنصر فرعي بداخله.
  const groups: NavGroup[] = useMemo(() => {
    return NAV_GROUPS
      .map(g => ({
        ...g,
        items: g.items.filter(i => !i.permission || can(i.permission)),
      }))
      .filter(g => g.direct || g.items.length > 0);
  }, [can]);

  const visibleCount = groups.filter(g => g.mandatory || !isHidden(g.key)).length;
  const allKeys = groups.filter(g => !g.direct).map(g => g.key);

  const resetAll = () => {
    groups.forEach(g => {
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
            {isRtl ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            <span>{t('menuSettings.backToSettings')}</span>
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="h-5 w-5 text-primary" />
            {t('menuSettings.title')}
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetAll}
          className="h-8 gap-1.5"
          title={t('menuSettings.resetTooltip')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('common.reset')}
        </Button>
      </div>

      {/* بطاقة إظهار/إخفاء الأقسام */}
      <Card>
        <CardHeader>
          <CardTitle>{t('menuSettings.showHide.title')}</CardTitle>
          <CardDescription>
            {t('menuSettings.showHide.description')}
            {' '}
            {t('menuSettings.showHide.visibleCount', { visible: visibleCount, total: groups.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.map(group => {
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
                    <div className="text-sm font-medium">{t(group.titleKey)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t('menuSettings.showHide.subItemsCount', { count: group.items.length })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.mandatory ? (
                    <span className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">
                      <Lock className="h-3 w-3" />
                      {t('menuSettings.showHide.alwaysVisible')}
                    </span>
                  ) : (
                    <>
                      <span className={`text-[10px] ${hidden ? 'text-muted-foreground' : 'text-emerald-400'}`}>
                        {hidden ? t('menuSettings.showHide.hidden') : t('menuSettings.showHide.shown')}
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
          <CardTitle>{t('menuSettings.collapse.title')}</CardTitle>
          <CardDescription>{t('menuSettings.collapse.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllCollapsed(allKeys, false)}
              className="h-8"
            >
              {t('menuSettings.collapse.expandAll')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllCollapsed(allKeys, true)}
              className="h-8"
            >
              {t('menuSettings.collapse.collapseAll')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map(group => {
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
                    <span className="text-sm">{t(group.titleKey)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {collapsed ? t('menuSettings.collapse.collapsed') : t('menuSettings.collapse.expanded')}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={!collapsed}
                      onChange={e => {
                        const map: Record<string, boolean> = {};
                        groups.forEach(g => { map[g.key] = isCollapsed(g.key); });
                        map[group.key] = !e.target.checked;
                        setAllCollapsed(
                          Object.keys(map).filter(k => map[k]),
                          true
                        );
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
              <Trans
                i18nKey="menuSettings.info.line1"
                components={{ bold: <strong className="text-foreground" /> }}
              />
            </p>
            <p>{t('menuSettings.info.line2')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
