import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanyIdentity } from '@/lib/company/useCompanyIdentity';

interface CompanyHostBadgeProps {
  className?: string;
  /** نمط مضغوط لشريط الدخول */
  compact?: boolean;
}

export function CompanyHostBadge({ className, compact }: CompanyHostBadgeProps) {
  const { show, companyCode, companyName } = useCompanyIdentity();
  if (!show || !companyCode) return null;

  const title = companyName?.trim() || companyCode;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8',
        compact ? 'px-4 py-2 lg:gap-3 lg:px-5 lg:py-3' : 'px-6 py-3',
        className,
      )}
    >
      <Building2 className={cn('shrink-0 text-primary', compact ? 'h-4 w-4 lg:h-5 lg:w-5' : 'h-5 w-5')} />
      <div className="flex min-w-0 flex-col items-start leading-tight">
        <span
          className={cn(
            'max-w-[14rem] truncate font-semibold text-primary',
            compact ? 'text-sm lg:text-base' : 'text-base lg:text-lg',
          )}
          title={title}
        >
          {title}
        </span>
        {companyName && (
          <span
            className={cn(
              'mt-0.5 font-mono tracking-[0.2em] text-primary/70',
              compact ? 'text-[10px] lg:text-xs' : 'text-xs',
            )}
          >
            {companyCode}
          </span>
        )}
      </div>
    </div>
  );
}
