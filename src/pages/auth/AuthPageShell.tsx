import type { ReactNode } from 'react';
import { Languages, Maximize, Minimize } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { CompanyHostBadge } from '@/components/layout/CompanyHostBadge';
import { LogoViewer } from '@/components/LogoViewer';
import { useFullscreen } from '@/hooks/useFullscreen';
import { LogoViewer } from '@/components/LogoViewer';

interface AuthPageShellProps {
  children: ReactNode;
  /** عنوان فرعي تحت الشعار (افتراضي: اسم التطبيق) */
  showBrand?: boolean;
  /** محتوى أعلى البطاقة بدل الشعار الكامل */
  header?: ReactNode;
}

/** إطار موحّد لصفحات المصادقة (دخول / تغيير كلمة المرور). */
export function AuthPageShell({ children, showBrand = true, header }: AuthPageShellProps) {
  const { t } = useTranslation();
  const { locale, toggleLocale, isRtl } = useLocale();
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="absolute inset-0">
        <div className="absolute right-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[100px] sm:h-[500px] sm:w-[500px] sm:blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[480px] w-[480px] rounded-full bg-primary/10 blur-[120px] sm:h-[600px] sm:w-[600px] sm:blur-[140px]" />
        <div className="pattern-meso absolute inset-0 opacity-30" />
      </div>

      <div
        className={cn(
          'absolute top-3 z-20 flex items-center gap-2 sm:top-4',
          isRtl ? 'left-3 sm:left-4' : 'right-3 sm:right-4',
        )}
      >
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title={isFullscreen ? t('topbar.exitFullscreen') : t('topbar.fullscreen')}
          aria-label={isFullscreen ? t('topbar.exitFullscreen') : t('topbar.fullscreen')}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card/60 text-muted-foreground backdrop-blur-md transition-colors hover:bg-card hover:text-primary"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleLocale}
          title={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 text-muted-foreground backdrop-blur-md transition-colors hover:bg-card hover:text-primary"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {locale === 'ar' ? 'EN' : 'ع'}
          </span>
        </button>
      </div>

      <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        {/* تخطيط متجاوب: عمود واحد على الجوال، عمودان (هوية + نموذج) على الشاشات الكبيرة */}
        <div
          className={cn(
            'w-full',
            showBrand
              ? 'lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-center lg:gap-12 xl:gap-16'
              : 'max-w-[min(100%,22rem)] sm:max-w-[26rem] md:max-w-[28rem]',
          )}
        >
          {/* لوحة الهوية */}
          {header ?? (showBrand && (
            <div className="mb-4 text-center sm:mb-5 lg:mb-0 lg:text-start">
              <div className="mb-3 inline-flex sm:mb-4 lg:mb-5">
                <LogoViewer
                  alt={t('app.name')}
                  className="h-24 w-24 object-contain sm:h-28 sm:w-28 lg:h-36 lg:w-36"
                />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                {t('app.name')}
              </h1>
              <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-primary/70 sm:text-[11px] sm:tracking-[0.22em] lg:mt-2 lg:text-xs">
                {t('app.wholesale')}
              </p>
              <div className="mx-auto mt-2.5 h-px w-12 bg-gradient-to-r from-transparent via-primary to-transparent lg:mx-0 lg:w-20" />

              <CompanyHostBadge compact className="mt-4 lg:mt-6" />
            </div>
          ))}

          {/* بطاقة النموذج */}
          <div className="mx-auto w-full max-w-[min(100%,22rem)] rounded-xl border border-border/60 bg-card/40 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl animate-slide-up sm:max-w-[26rem] sm:p-5 md:p-6 lg:mx-0 lg:max-w-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
