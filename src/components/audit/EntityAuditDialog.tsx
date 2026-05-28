import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, X, Plus, Pencil, Trash2, Printer, CheckCircle2, RotateCcw, Eye, LogIn, LogOut } from 'lucide-react';
import { auditApi, type AuditLogDto } from '@/lib/api/audit';
import { useLocale } from '@/lib/i18n/useLocale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Maps action codes to a small icon and color tint to make the timeline
 * easier to scan at a glance. Anything unknown falls back to a neutral
 * "activity" icon.
 */
const ACTION_VISUALS: Record<string, { icon: typeof Activity; tone: string }> = {
  Create:  { icon: Plus,         tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Update:  { icon: Pencil,       tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  Delete:  { icon: Trash2,       tone: 'text-destructive bg-destructive/10 border-destructive/30' },
  Print:   { icon: Printer,      tone: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  Post:    { icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Unpost:  { icon: RotateCcw,    tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  Reverse: { icon: RotateCcw,    tone: 'text-destructive bg-destructive/10 border-destructive/30' },
  View:    { icon: Eye,          tone: 'text-muted-foreground bg-secondary/40 border-border' },
  Login:   { icon: LogIn,        tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  Logout:  { icon: LogOut,       tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

/**
 * صياغة التاريخ بالإنجليزي/الميلادي دائماً (24h) لاتساق سجل المراقبة مع
 * IDs والـ IP. هذا متعمَّد ولا يعتمد على الـ locale.
 */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Baghdad',
  }).format(d);
}

export interface EntityAuditDialogProps {
  open: boolean;
  onClose: () => void;
  /** نوع الكيان كما يحفظه الـ AuditLogger (Voucher / JournalEntry / …). */
  entityType: string;
  /** مُعرّف الكيان (نص أو رقم). */
  entityId: string | number;
  /** عنوان فرعي اختياري يظهر تحت "سجل العمليات على هذا الكيان" (مثلاً رقم السند). */
  subtitle?: string;
}

/**
 * نافذة "مراقبة": تعرض كل العمليات التي جرت على كيان واحد (سند/قيد/…).
 * تُفتَح من أيقونة (مراقبة) داخل كرت السند، ومن صفحة سجل المراقبة العامة عند
 * النقر على سطر "عرض تاريخ هذا الكيان".
 */
export function EntityAuditDialog({
  open,
  onClose,
  entityType,
  entityId,
  subtitle,
}: EntityAuditDialogProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-entity', entityType, String(entityId)],
    queryFn: () => auditApi.byEntity(entityType, entityId),
    enabled: open,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{t('audit.entityHistoryTitle')}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4">
          {isLoading && <LoadingSpinner text={t('common.loading')} />}
          {isError && (
            <EmptyState
              icon={Activity}
              title={t('audit.loadError')}
              description={t('common.serverConnectionError')}
            />
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <EmptyState
              icon={Activity}
              title={t('audit.noResultsForEntity')}
              description=""
            />
          )}
          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <ol className="relative space-y-3 ps-4">
              <span className="absolute inset-y-1 start-1.5 w-px bg-border" aria-hidden />
              {(data ?? []).map((row: AuditLogDto) => {
                const visual = ACTION_VISUALS[row.action] ?? { icon: Activity, tone: 'text-muted-foreground bg-secondary/40 border-border' };
                const Icon = visual.icon;
                return (
                  <li key={row.id} className="relative">
                    <span
                      className={cn(
                        'absolute -start-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-card',
                        visual.tone,
                      )}
                    />
                    <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', visual.tone)}>
                          <Icon className="h-3 w-3" />
                          {t(`audit.actions.${row.action}`, { defaultValue: row.action })}
                        </span>
                        <span className="num-display text-[11px] text-muted-foreground" dir="ltr">
                          {formatWhen(row.occurredAtUtc)}
                        </span>
                        {row.userName && (
                          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                            {row.userName}
                          </span>
                        )}
                        {row.ipAddress && (
                          <span className="num-display rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground" dir="ltr">
                            {row.ipAddress}
                          </span>
                        )}
                      </div>
                      {row.summary && (
                        <p className="mt-1.5 text-sm text-foreground/90 break-words">{row.summary}</p>
                      )}
                      {row.detailsJson && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                            {t('audit.details.raw')}
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] text-muted-foreground" dir="ltr">
                            {prettyJson(row.detailsJson)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
