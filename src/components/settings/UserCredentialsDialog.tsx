import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Copy, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/auth/password';
import { useLocale } from '@/lib/i18n/useLocale';

export interface UserCredentialsDialogProps {
  /** اسم الدخول (هاتف أو معرّف) */
  username: string;
  password: string;
  /** عنوان مخصّص — وإلا يُستخدم عنوان «تم تغيير كلمة المرور» */
  titleKey?: 'users.credentials.passwordChanged' | 'users.credentials.newUser';
  /** رابط صفحة العرض والنسخ (30 دقيقة) */
  credentialsUrl?: string;
  credentialsUrlCopyPassword?: string;
  onDone: () => void;
}

export function UserCredentialsDialog({
  username,
  password,
  titleKey = 'users.credentials.passwordChanged',
  credentialsUrl,
  credentialsUrlCopyPassword,
  onDone,
}: UserCredentialsDialogProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const isRtl = locale === 'ar';
  const [showPassword, setShowPassword] = useState(false);

  const copyField = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(t('users.credentials.copied', { field: label }));
    else toast.error(t('users.credentials.copyFailed'));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-card p-8 shadow-2xl"
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-labelledby="user-credentials-title"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>
          <h2 id="user-credentials-title" className="mt-4 text-xl font-semibold text-foreground">
            {t(titleKey)}
          </h2>
        </div>

        <div className="mt-6 rounded-lg border border-border/80 bg-amber-500/5 px-5 py-4 dark:bg-secondary/40">
          <p className="mb-4 text-center text-sm font-semibold text-foreground">
            {t('users.credentials.boxTitle')}
          </p>

          <CredentialRow
            label={t('users.credentials.username')}
            value={username}
            isRtl={isRtl}
            onCopy={() => void copyField(t('users.credentials.username'), username)}
          />

          <CredentialRow
            label={t('users.credentials.password')}
            value={password}
            isRtl={isRtl}
            masked={!showPassword}
            onCopy={() => void copyField(t('users.credentials.password'), password)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                aria-label={showPassword ? t('users.credentials.hidePassword') : t('users.credentials.showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          {credentialsUrl && (
            <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium text-foreground">{t('users.credentials.viewLink')}</p>
              <div className="flex items-center gap-1.5">
                <a
                  href={credentialsUrlCopyPassword ?? credentialsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate rounded border border-border/60 bg-background px-2 py-1.5 font-mono text-[11px] text-primary hover:underline"
                  dir="ltr"
                >
                  {credentialsUrlCopyPassword ?? credentialsUrl}
                </a>
                <button
                  type="button"
                  onClick={() => void copyField(t('users.credentials.viewLink'), credentialsUrlCopyPassword ?? credentialsUrl)}
                  className="shrink-0 rounded p-1.5 text-primary hover:bg-primary/10"
                  title={t('users.credentials.viewLink')}
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={credentialsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  title={t('users.credentials.openLink')}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">{t('users.credentials.viewLinkHint')}</p>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('users.credentials.mustChangeNote')}
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Button type="button" className="min-w-[120px]" onClick={onDone}>
            {t('users.credentials.done')}
          </Button>
        </div>
      </div>
    </div>
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
  isRtl: boolean;
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
        className="shrink-0 rounded p-1.5 text-primary hover:bg-primary/10"
        title={label}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
