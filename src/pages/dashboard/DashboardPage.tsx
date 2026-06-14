import { useState } from 'react';
import {
  Receipt, Package, Users, Wallet, AlertTriangle, ShoppingBag,
  Store, ExternalLink, Copy, Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatIQD } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useLocale } from '@/lib/i18n';
import { ShortcutsBar } from '@/components/dashboard/ShortcutsBar';
import { getCompanyCode } from '@/lib/platform';
import { getRuntimeConfig } from '@/lib/runtime-config';
import { LogoViewer } from '@/components/LogoViewer';

// بيانات تجريبية - في الإنتاج تُجلب من الـ API
// ‎نستخدم مفاتيح ترجمة لليوم/العميل/المندوب/المخزون كي يتبدل النص مع اللغة.
const salesData = [
  { dayKey: 'sat', sales: 4200000, orders: 12 },
  { dayKey: 'sun', sales: 3850000, orders: 9 },
  { dayKey: 'mon', sales: 5100000, orders: 14 },
  { dayKey: 'tue', sales: 6300000, orders: 18 },
  { dayKey: 'wed', sales: 4900000, orders: 13 },
  { dayKey: 'thu', sales: 7200000, orders: 21 },
  { dayKey: 'fri', sales: 5800000, orders: 16 },
];

const topRepsData = [
  { nameKey: 'rep1', sales: 18500000 },
  { nameKey: 'rep2', sales: 14200000 },
  { nameKey: 'rep3', sales: 11800000 },
  { nameKey: 'rep4', sales: 9300000 },
];

const recentInvoices = [
  { id: 'INV-20250513-A8F2', customerKey: 'store1', amount: 1250000, status: 'Paid' },
  { id: 'INV-20250513-B3D9', customerKey: 'store2', amount: 875000, status: 'PartiallyPaid' },
  { id: 'INV-20250513-C7E1', customerKey: 'store3', amount: 2400000, status: 'Issued' },
  { id: 'INV-20250513-D2F4', customerKey: 'store4', amount: 540000, status: 'Paid' },
];

const lowStockItems = [
  { nameKey: 'milk', remaining: 12, unitKey: 'carton' },
  { nameKey: 'oil', remaining: 3, unitKey: 'carton' },
  { nameKey: 'sugar', remaining: 28, unitKey: 'bag' },
];

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

export function DashboardPage() {
  const { t } = useTranslation();
  const { isRtl } = useLocale();

  // رابط متجر الشركة داخل المتجر الرئيسي: iraqi-trade-center.iq/store/{CODE}
  const companyCode = getCompanyCode();
  const storeBaseDomain = (getRuntimeConfig().companyDomainSuffix || '.iraqi-trade-center.iq').replace(/^\./, '');
  const storeUrl = companyCode ? `https://${storeBaseDomain}/store/${companyCode}` : null;
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyStoreLink() {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setLinkCopied(true);
      toast.success(t('dashboard.storeLinkCopied', { defaultValue: 'تم نسخ رابط المتجر' }));
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error(t('dashboard.storeLinkCopyFailed', { defaultValue: 'تعذّر نسخ الرابط' }));
    }
  }

  const todayDate = new Intl.DateTimeFormat(
    isRtl ? 'ar-IQ-u-nu-latn' : 'en-GB',
    {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      ...(isRtl ? { numberingSystem: 'latn' } : {}),
    },
  ).format(new Date());

  // ‎ألوان الرسم البياني تتكيّف مع الوضع الفعّال — لا hardcoded.
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

  const salesChartData = salesData.map(d => ({ ...d, day: t(`dashboard.weekDays.${d.dayKey}`) }));

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <div className="gradient-hero relative overflow-hidden rounded-xl border border-primary/25 p-4 shadow-md sm:p-6">
        <div className="pattern-meso absolute inset-0 opacity-50" />
        <div className="gold-underline absolute bottom-0 left-0 right-0" />
        <div className="relative flex items-center gap-3 sm:gap-5">
          <div className="shrink-0">
            <LogoViewer
              alt={t('app.name')}
              className="h-16 w-16 object-contain sm:h-24 sm:w-24"
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
                <span className="font-medium tnum text-foreground">{formatIQD(5800000)}</span>
              </span>
              {' · '}
              <span className="whitespace-nowrap text-success">
                {t('dashboard.vsYesterday', { value: 18 })}
              </span>
            </p>
          </div>

          {/* بطاقة متجر الشركة: زيارة + نسخ رابط المشاركة */}
          {storeUrl && (
            <div className="hidden shrink-0 flex-col gap-2 rounded-xl border border-primary/25 bg-background/50 p-3 shadow-sm backdrop-blur-sm sm:flex">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <Store className="h-4 w-4 text-primary" />
                {t('dashboard.companyStore', { defaultValue: 'متجر الشركة' })}
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('dashboard.visitStore', { defaultValue: 'زيارة' })}
                </a>
                <button
                  type="button"
                  onClick={copyStoreLink}
                  title={storeUrl}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary/10"
                >
                  {linkCopied
                    ? <Check className="h-3.5 w-3.5 text-success" />
                    : <Copy className="h-3.5 w-3.5" />}
                  {linkCopied
                    ? t('dashboard.linkCopied', { defaultValue: 'تم النسخ' })
                    : t('dashboard.copyShareLink', { defaultValue: 'نسخ الرابط' })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick shortcuts */}
      <ShortcutsBar />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.monthlySales')}
          value={formatIQD(142500000)}
          icon={Receipt}
          change={{ value: 23, positive: true }}
          hint={t('dashboard.vsLastMonth')}
          variant="primary"
        />
        <StatCard
          label={t('dashboard.invoicesCount')}
          value="342"
          icon={ShoppingBag}
          change={{ value: 12, positive: true }}
          hint={t('dashboard.thisMonth')}
        />
        <StatCard
          label={t('dashboard.activeCustomers')}
          value="68"
          icon={Users}
          change={{ value: 5, positive: true }}
          hint={t('dashboard.outOf', { total: 84 })}
        />
        <StatCard
          label={t('dashboard.customerReceivables')}
          value={formatIQD(28400000)}
          icon={Wallet}
          hint={t('dashboard.totalUnpaid')}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sales chart */}
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
            </div>
          </CardContent>
        </Card>

        {/* Top reps */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.topSalesReps')}</CardTitle>
            <CardDescription>{t('dashboard.thisMonth')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topRepsData.map((rep, i) => {
                const pct = (rep.sales / topRepsData[0].sales) * 100;
                const repName = t(`dashboard.demoReps.${rep.nameKey}`);
                return (
                  <div key={rep.nameKey} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ' +
                          (i === 0 ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'bg-secondary text-muted-foreground')
                        }>
                          {i + 1}
                        </span>
                        <span className="font-medium">{repName}</span>
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
          </CardContent>
        </Card>
      </div>

      {/* Recent + Low stock */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent invoices */}
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
                    <td><span className="num-display text-xs text-muted-foreground">{inv.id}</span></td>
                    <td className="font-medium">{t(`dashboard.demoCustomers.${inv.customerKey}`)}</td>
                    <td><span className="num-display">{formatIQD(inv.amount)}</span></td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <CardTitle>{t('dashboard.lowStock')}</CardTitle>
            </div>
            <CardDescription>{t('dashboard.lowStockCount', { count: lowStockItems.length })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStockItems.map(item => (
              <div key={item.nameKey} className="flex items-center justify-between rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{t(`dashboard.demoStock.${item.nameKey}`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.remaining', {
                      count: item.remaining,
                      unit: t(`dashboard.demoStock.${item.unitKey}`),
                    })}
                  </p>
                </div>
                <Package className="h-4 w-4 text-warning" />
              </div>
            ))}
            <Link to="/inventory?lowStock=true" className="mt-2 block text-center text-xs text-primary hover:underline">
              {t('dashboard.viewAllLowStock')} {isRtl ? '←' : '→'}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
