import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { isCompanyHost } from '@/lib/platform';
import { useCompanyIdentity } from '@/lib/company/useCompanyIdentity';
import { useLocale } from '@/lib/i18n/useLocale';
import { cn } from '@/lib/utils';

interface SidebarBrandProps {
  onClose?: () => void;
}

export function SidebarBrand({ onClose }: SidebarBrandProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const isCompany = isCompanyHost();
  const { show, companyCode, nameAr, nameEn, logoBase64 } = useCompanyIdentity();

  const linkClass =
    'group relative flex min-h-[5rem] items-center gap-3 border-b border-border px-5 py-3 transition-colors hover:bg-primary/10';

  if (isCompany && show && companyCode) {
    const titleAr = nameAr?.trim() || companyCode;
    const titleEn = nameEn?.trim();

    return (
      <NavLink to="/" title={t('sidebar.homeLink')} onClick={onClose} className={linkClass}>
        {logoBase64 ? (
          <img
            src={logoBase64}
            alt={titleAr}
            className="h-12 w-12 shrink-0 rounded-md object-contain transition-transform group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
          <h1
            className="w-full truncate font-display text-sm font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary sm:text-base"
            title={titleAr}
          >
            {titleAr}
          </h1>
          {titleEn && (
            <p
              className={cn(
                'w-full truncate text-xs leading-snug text-muted-foreground sm:text-sm',
                isRtl ? 'text-right' : 'text-left',
              )}
              dir="ltr"
              title={titleEn}
            >
              {titleEn}
            </p>
          )}
          <p className="mt-0.5 w-full font-mono text-sm font-semibold tracking-[0.14em] text-primary sm:text-base">
            {companyCode}
          </p>
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink to="/" title={t('sidebar.homeLink')} onClick={onClose} className={linkClass}>
      <img
        src="/logo.png?v=3"
        alt={t('app.name')}
        className="h-12 w-12 shrink-0 object-contain transition-transform group-hover:scale-105"
        draggable={false}
      />
      <div className="min-w-0">
        <h1 className="font-display text-base font-semibold leading-none tracking-tight transition-colors group-hover:text-primary">
          {t('app.name')}
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary/70">
          {t('app.subtitle')}
        </p>
      </div>
    </NavLink>
  );
}
