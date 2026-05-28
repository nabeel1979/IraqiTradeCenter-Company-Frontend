import { LucideIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  change?: { value: number; positive?: boolean };
  hint?: string;
  variant?: 'default' | 'primary';
}

export function StatCard({ label, value, icon: Icon, change, hint, variant = 'default' }: StatCardProps) {
  return (
    <div className={cn(
      'card-interactive group relative overflow-hidden rounded-lg border bg-card p-5',
      variant === 'primary' && 'border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card'
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="kpi-value">{value}</p>
          {(change || hint) && (
            <div className="flex items-center gap-2 text-xs">
              {change && (
                <span className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  change.positive !== false ? 'text-success' : 'text-destructive'
                )}>
                  {change.positive !== false ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(change.value)}%
                </span>
              )}
              {hint && <span className="text-muted-foreground">{hint}</span>}
            </div>
          )}
        </div>
        <div className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
          variant === 'primary'
            ? 'bg-primary/20 text-primary ring-1 ring-primary/30 glow-primary'
            : 'bg-secondary text-muted-foreground ring-1 ring-border group-hover:bg-primary/15 group-hover:text-primary group-hover:ring-primary/25'
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
