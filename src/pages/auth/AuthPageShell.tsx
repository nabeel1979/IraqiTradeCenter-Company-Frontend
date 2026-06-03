import type { ReactNode } from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="absolute inset-0">
        <div className="absolute right-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[100px] sm:h-[500px] sm:w-[500px] sm:blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[480px] w-[480px] rounded-full bg-primary/10 blur-[120px] sm:h-[600px] sm:w-[600px] sm:blur-[140px]" />
        <div className="pattern-meso absolute inset-0 opacity-30" />
      </div>

      <button
        type="button"
        onClick={toggleLocale}
        title={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        className={cn(
          'absolute top-3 z-20 flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 text-muted-foreground backdrop-blur-md transition-colors hover:bg-card hover:text-primary sm:top-4',
          isRtl ? 'left-3 sm:left-4' : 'right-3 sm:right-4',
        )}
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {locale === 'ar' ? 'EN' : 'ع'}
        </span>
      </button>

      <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[min(100%,22rem)] sm:max-w-[26rem] md:max-w-[28rem]">
          {header ?? (showBrand && (
            <div className="mb-4 text-center sm:mb-5">
              <div className="mb-2 inline-flex sm:mb-3">
                <img
                  src="/logo.png?v=3"
                  alt={t('app.name')}
                  className="h-[4.5rem] w-[4.5rem] object-contain sm:h-20 sm:w-20"
                  draggable={false}
                />
              </div>
              <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {t('app.name')}
              </h1>
              <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-primary/70 sm:text-[10px] sm:tracking-[0.22em]">
                {t('app.wholesale')}
              </p>
              <div className="mx-auto mt-2 h-px w-10 bg-gradient-to-r from-transparent via-primary to-transparent" />
            </div>
          ))}

          <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl animate-slide-up sm:p-5 md:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
