import {
  Receipt, Package, Users, Wallet, AlertTriangle, ShoppingBag, BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatIQD } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useLocale, localizedName } from '@/lib/i18n';
import { ShortcutsBar } from '@/components/dashboard/ShortcutsBar';
import { dashboardApi } from '@/lib/api/dashboard';

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variantMap: Record<string, 'success' | 'warning' | 'default' | 'muted'> = {
    Paid: 'success',
    PartiallyPaid: 'warning',
    Issued: 'default',
    Draft: 'muted',
  };
  const variant = variantMap[status] ?? 'muted';
  const label = t(`dashboard.invoiceStatus.${status}`, { defaultValue: status });
  return <Badge variant={variant}>{label}</Badge>;
}

function pctChange(value: number | null | undefined, positiveDefault = true) {
  if (value == null) return undefined;
  return { value: Math.abs(value), positive: value >= 0 ? positiveDefault : !positiveDefault };
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { isRtl, locale } = useLocale();

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats(),
    staleTime: 60_000,
  });

  const stats = statsQuery.data;

  const todayDate = new Intl.DateTimeFormat(
    isRtl ? 'ar-IQ-u-nu-latn' : 'en-GB',
    {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      ...(isRtl ? { numberingSystem: 'latn' } : {}),
    },
  ).format(new Date());

  const { theme } = useTheme();
  const chartColors = theme === 'dark'
    ? {
        primary: 'hsl(38 72% 58%)',
        primaryFaint: 'hsl(38 72% 58% / 0.08)',
        grid: 'hsl(228 10% 18%)',
        axis: 'hsl(35 8% 55%)',
        tooltipBg: 'hsl(228 12% 11%)',
        tooltipBorder: 'hsl(228 10% 18%)',
        tooltipText: 'hsl(40 18% 92%)',
      }
    : {
        primary: 'hsl(38 92% 42%)',
        primaryFaint: 'hsl(38 92% 42% / 0.08)',
        grid: 'hsl(220 14% 78%)',
        axis: 'hsl(220 10% 38%)',
        tooltipBg: 'hsl(42 28% 97%)',
        tooltipBorder: 'hsl(220 14% 78%)',
        tooltipText: 'hsl(222 38% 11%)',
      };

  const salesChartData = (stats?.weeklySales ?? []).map(d => ({
    ...d,
    day: t(`dashboard.weekDays.${d.dayKey}`),
    sales: d.sales,
  }));

  const topReps = stats?.topSalesReps ?? [];
  const topRepMax = topReps[0]?.sales ?? 1;
  const recentInvoices = stats?.recentInvoices ?? [];
  const lowStockItems = stats?.lowStockItems ?? [];

  if (statsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner className="min-h-[40vh]" />
      </div>
    );
  }

  if (statsQuery.isError || !stats) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t('dashboard.loadError')}
        description={t('dashboard.loadErrorDesc')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <div className="gradient-hero relative overflow-hidden rounded-xl border border-primary/25 p-4 shadow-md sm:p-6">
        <div className="pattern-meso absolute inset-0 opacity-50" />
        <div className="gold-underline absolute bottom-0 left-0 right-0" />
        <div className="relative flex items-center gap-3 sm:gap-5">
          <div className="shrink-0">
            <img
              src="/logo.png?v=3"
              alt={t('app.name')}
              className="h-16 w-16 object-contain sm:h-24 sm:w-24"
              draggable={false}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] uppercase tracking-[0.14em] text-primary/70 sm:text-xs sm:tracking-[0.18em]">
              {todayDate}
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold leading-tight sm:mt-1.5 sm:text-2xl md:text-3xl">
              {t('app.name')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              <span className="font-medium text-foreground/90">{t('dashboard.goodMorning')}</span>
              {' · '}
              <span className="whitespace-nowrap">
                {t('dashboard.todaySales')}:{' '}
                <span className="font-medium tnum text-foreground">{formatIQD(stats.todaySales)}</span>
              </span>
              {stats.todaySalesChangePct != null && (
                <>
                  {' · '}
                  <span className={`whitespace-nowrap ${stats.todaySalesChangePct >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {t('dashboard.vsYesterday', { value: Math.abs(stats.todaySalesChangePct) })}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <ShortcutsBar />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.monthlySales')}
          value={formatIQD(stats.monthlySales)}
          icon={Receipt}
          change={pctChange(stats.monthlySalesChangePct)}
          hint={t('dashboard.vsLastMonth')}
          variant="primary"
        />
        <StatCard
          label={t('dashboard.invoicesCount')}
          value={String(stats.invoicesThisMonth)}
          icon={ShoppingBag}
          change={pctChange(stats.invoicesChangePct)}
          hint={t('dashboard.thisMonth')}
        />
        <StatCard
          label={t('dashboard.activeCustomers')}
          value={String(stats.activeCustomers)}
          icon={Users}
          change={pctChange(stats.activeCustomersChangePct)}
          hint={t('dashboard.outOf', { total: stats.totalCustomers })}
        />
        <StatCard
          label={t('dashboard.customerReceivables')}
          value={formatIQD(stats.customerReceivables)}
          icon={Wallet}
          hint={t('dashboard.totalUnpaid')}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.weeklySales')}</CardTitle>
                <CardDescription>{t('dashboard.last7Days')}</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {t('dashboard.salesLegend')}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {salesChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('dashboard.noSalesData', { defaultValue: 'لا توجد مبيعات في آخر 7 أيام' })}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColors.primary} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={chartColors.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                      dataKey="day"
                      stroke={chartColors.axis}
                      fontSize={12}
                      reversed={isRtl}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke={chartColors.axis} fontSize={12} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                      orientation={isRtl ? 'right' : 'left'}
                    />
                    <Tooltip
                      contentStyle={{
                        background: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: 8,
                        color: chartColors.tooltipText,
                        fontFamily: isRtl
                          ? '"IBM Plex Sans Arabic", sans-serif'
                          : 'system-ui, -apple-system, sans-serif',
                      }}
                      formatter={(v: number) => [formatIQD(v), t('dashboard.salesLegend')]}
                      cursor={{ fill: chartColors.primaryFaint }}
                    />
                    <Area type="monotone" dataKey="sales" stroke={chartColors.primary} strokeWidth={2} fill="url(#salesGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.topSalesReps')}</CardTitle>
            <CardDescription>{t('dashboard.thisMonth')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topReps.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('dashboard.noRepsData', { defaultValue: 'لا توجد مبيعات للمندوبين هذا الشهر' })}
              </p>
            ) : (
              <div className="space-y-4">
                {topReps.map((rep, i) => {
                  const pct = topRepMax > 0 ? (rep.sales / topRepMax) * 100 : 0;
                  return (
                    <div key={rep.salesRepId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ' +
                            (i === 0 ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'bg-secondary text-muted-foreground')
                          }>
                            {i + 1}
                          </span>
                          <span className="font-medium">{rep.name}</span>
                        </div>
                        <span className="num-display text-muted-foreground">{formatIQD(rep.sales)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full bg-gradient-to-${isRtl ? 'l' : 'r'} from-primary to-primary/60 transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent + Low stock */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.recentInvoices')}</CardTitle>
                <CardDescription>{t('dashboard.lastFourInvoices')}</CardDescription>
              </div>
              <Link to="/invoices/sales" className="text-xs text-primary hover:underline">
                {t('dashboard.viewAll')} {isRtl ? '←' : '→'}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentInvoices.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('dashboard.noInvoices', { defaultValue: 'لا توجد فواتير بعد' })}
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.tableHeaders.invoiceNumber')}</th>
                    <th>{t('dashboard.tableHeaders.customer')}</th>
                    <th>{t('dashboard.tableHeaders.amount')}</th>
                    <th>{t('dashboard.tableHeaders.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <Link to={`/invoices/${inv.id}/edit`} className="num-display text-xs text-primary hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="font-medium">{inv.customerName ?? '—'}</td>
                      <td><span className="num-display">{formatIQD(inv.amount)}</span></td>
                      <td><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <CardTitle>{t('dashboard.lowStock')}</CardTitle>
            </div>
            <CardDescription>{t('dashboard.lowStockCount', { count: lowStockItems.length })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStockItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('dashboard.noLowStock', { defaultValue: 'لا توجد مواد تحت الحد الأدنى' })}
              </p>
            ) : (
              lowStockItems.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">
                      {localizedName(locale, item.nameAr, item.nameEn)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('dashboard.remaining', {
                        count: item.remaining,
                        unit: item.unitName || '—',
                      })}
                    </p>
                  </div>
                  <Package className="h-4 w-4 text-warning" />
                </div>
              ))
            )}
            <Link to="/inventory?lowStock=true" className="mt-2 block text-center text-xs text-primary hover:underline">
              {t('dashboard.viewAllLowStock')} {isRtl ? '←' : '→'}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
