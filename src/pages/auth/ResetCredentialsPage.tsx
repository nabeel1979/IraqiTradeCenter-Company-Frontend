import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api/auth';
import { copyToClipboard } from '@/lib/auth/password';
import { useLocale } from '@/lib/i18n';
import { cn, extractApiError } from '@/lib/utils';
import { AuthPageShell } from './AuthPageShell';

export function ResetCredentialsPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const copyTarget = searchParams.get('copy');
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [copiedAuto, setCopiedAuto] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reset-credentials', token],
    queryFn: () => authApi.getResetCredentials(token!),
    enabled: !!token && token.length === 32,
    retry: false,
  });

  const creds = data?.success ? data.data : null;

  const copyField = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(t('login.resetView.copied', { field: label }));
    else toast.error(t('login.resetView.copyFailed'));
  };

  useEffect(() => {
    if (!creds || copiedAuto || !copyTarget) return;
    const value =
      copyTarget === 'password' ? creds.password
      : copyTarget === 'username' ? creds.username
      : null;
    if (!value) return;
    const label =
      copyTarget === 'password' ? t('login.resetView.password')
      : t('login.resetView.username');
    void copyToClipboard(value).then(ok => {
      setCopiedAuto(true);
      if (ok) toast.success(t('login.resetView.copied', { field: label }));
    });
  }, [creds, copyTarget, copiedAuto, t]);

  return (
    <AuthPageShell showBrand>
      <div className="mx-auto w-full max-w-md" dir={isRtl ? 'rtl' : 'ltr'}>
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{t('login.resetView.loading')}</p>
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{extractApiError(error, t('login.resetView.invalid'))}</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/login">{t('login.backToLogin')}</Link>
            </Button>
          </div>
        )}

        {creds && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
                <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
              </div>
              <h1 className="mt-4 font-display text-xl font-semibold">{t('login.resetView.title')}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t('login.resetView.subtitle')}</p>
            </div>

            <div className="mt-6 rounded-lg border border-border/80 bg-amber-500/5 px-5 py-4 dark:bg-secondary/40">
              <p className="mb-4 text-center text-sm font-semibold">{t('login.resetView.boxTitle')}</p>

              <CredentialRow
                label={t('login.resetView.username')}
                value={creds.username}
                onCopy={() => void copyField(t('login.resetView.username'), creds.username)}
              />

              <CredentialRow
                label={t('login.resetView.password')}
                value={creds.password}
                masked={!showPassword}
                onCopy={() => void copyField(t('login.resetView.password'), creds.password)}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <p className="mt-3 text-center text-xs text-muted-foreground">{t('login.resetView.mustChange')}</p>
            </div>

            <div className="mt-6 flex justify-center">
              <Button asChild className="min-w-[140px]">
                <Link to="/login">{t('login.resetView.goLogin')}</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AuthPageShell>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  masked,
  trailing,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  masked?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/40 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="shrink-0 text-sm text-muted-foreground">{label}:</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground" dir="ltr">
          {masked ? '••••••••••••' : value}
        </span>
        {trailing}
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          'shrink-0 rounded p-1.5 text-primary transition-colors hover:bg-primary/10',
        )}
        title={label}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
