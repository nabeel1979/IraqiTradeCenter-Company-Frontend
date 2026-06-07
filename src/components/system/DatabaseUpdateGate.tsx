import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, extractApiError } from '@/lib/utils';
import { databaseUpdateApi, type DatabaseUpdatePhase, type DatabaseUpdateStatusDto } from '@/lib/api/databaseUpdate';
import { useAuthStore } from '@/lib/auth/auth-store';

const RUNNING_PHASES: DatabaseUpdatePhase[] = ['BackingUp', 'BackupComplete', 'Migrating'];

function StepRow({
  label,
  state,
}: {
  label: string;
  state: 'pending' | 'active' | 'done' | 'error';
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
      state === 'active' && 'border-primary/40 bg-primary/5',
      state === 'done' && 'border-emerald-500/30 bg-emerald-500/5',
      state === 'error' && 'border-destructive/30 bg-destructive/5',
      state === 'pending' && 'border-border/40 opacity-60',
    )}>
      {state === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
      {state === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
      {state === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
      {state === 'pending' && <div className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/30" />}
      <span>{label}</span>
    </div>
  );
}

function stepState(phase: DatabaseUpdatePhase, target: DatabaseUpdatePhase): 'pending' | 'active' | 'done' | 'error' {
  const order: DatabaseUpdatePhase[] = ['AwaitingConfirmation', 'BackingUp', 'BackupComplete', 'Migrating', 'Success'];
  const phaseIdx = order.indexOf(phase);
  const targetIdx = order.indexOf(target);
  if (phase === 'Failed') {
    if (target === 'BackingUp' || target === 'Migrating') return 'error';
    if (targetIdx < 2) return 'done';
    return 'pending';
  }
  if (phase === 'Success') return 'done';
  if (phaseIdx > targetIdx) return 'done';
  if (phaseIdx === targetIdx) return 'active';
  return 'pending';
}

export function DatabaseUpdateGate() {
  const qc = useQueryClient();
  const isSuperAdmin = useAuthStore(s => s.user?.isSuperAdmin ?? false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['database-update-status'],
    queryFn: () => databaseUpdateApi.status(),
    refetchInterval: q => {
      const d = q.state.data;
      if (!d?.isLocked && !d?.pendingUpdate) return false;
      if (d.phase === 'Success') return false;
      return applying || RUNNING_PHASES.includes(d.phase) ? 1500 : 3000;
    },
    retry: 2,
  });

  const data: DatabaseUpdateStatusDto | undefined = statusQuery.data;
  const visible = !!(data?.isLocked || (data?.pendingUpdate && data.phase !== 'Idle'));

  const handleApply = useCallback(async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const res = await databaseUpdateApi.apply();
      if (!res.success) throw new Error(res.errors?.[0] ?? 'فشل التحديث');
      await qc.invalidateQueries({ queryKey: ['database-update-status'] });
    } catch (e: unknown) {
      setApplyError(extractApiError(e) ?? 'فشل تحديث قاعدة البيانات');
      await qc.invalidateQueries({ queryKey: ['database-update-status'] });
    } finally {
      setApplying(false);
    }
  }, [qc]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!visible) return null;

  const phase = data?.phase ?? 'AwaitingConfirmation';
  const isSuccess = phase === 'Success';
  const isFailed = phase === 'Failed';
  const isRunning = applying || RUNNING_PHASES.includes(phase);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className={cn(
            'mb-3 flex h-14 w-14 items-center justify-center rounded-full',
            isSuccess ? 'bg-emerald-500/10' : isFailed ? 'bg-destructive/10' : 'bg-primary/10',
          )}>
            {isSuccess ? (
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            ) : (
              <Lock className={cn('h-7 w-7', isFailed ? 'text-destructive' : 'text-primary')} />
            )}
          </div>
          <h2 className="text-lg font-bold">تحديث قاعدة البيانات</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.message || 'سوف يتم تحديث قاعدة البيانات'}
          </p>
        </div>

        <div className="space-y-2">
          <StepRow label="سوف يتم تحديث قاعدة البيانات" state={stepState(phase, 'AwaitingConfirmation')} />
          <StepRow label="أخذ نسخة احتياطية" state={stepState(phase, 'BackingUp')} />
          <StepRow
            label="تمت عملية النسخ الاحتياطي بنجاح"
            state={phase === 'BackupComplete' ? 'active' : stepState(phase, 'BackupComplete')}
          />
          <StepRow label="جاري تحديث قاعدة البيانات" state={stepState(phase, 'Migrating')} />
          {isSuccess && <StepRow label="تمت عملية التحديث بنجاح" state="done" />}
        </div>

        {(applyError || data?.error) && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {applyError || data?.error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {isSuccess ? (
            <Button className="w-full gap-2" onClick={() => window.location.reload()}>
              <Database className="h-4 w-4" />
              متابعة استخدام النظام
            </Button>
          ) : isSuperAdmin ? (
            <>
              {(phase === 'AwaitingConfirmation' || isFailed) && !isRunning && (
                <Button className="w-full gap-2" disabled={applying} onClick={handleApply}>
                  <Lock className="h-4 w-4" />
                  متابعة التحديث
                </Button>
              )}
              {isRunning && (
                <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  لا تغلق الصفحة أثناء التحديث
                </p>
              )}
            </>
          ) : (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-600 dark:text-amber-400">
              النظام مقفل مؤقتاً — يرجى التواصل مع المدير العام لإتمام التحديث.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
