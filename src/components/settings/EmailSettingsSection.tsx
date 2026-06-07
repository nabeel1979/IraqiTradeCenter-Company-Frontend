import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Mail, Save, TestTube2, ExternalLink, CheckCircle2, XCircle, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  emailSettingsApi,
  ZOHO_SMTP_PRESET,
  type EmailSettingsDto,
} from '@/lib/api/emailSettings';
import { cn } from '@/lib/utils';

const ZOHO_SETUP_URL = 'https://www.zoho.com/mail/help/zoho-smtp.html';
const ZOHO_APP_PASSWORD_URL = 'https://accounts.zoho.com/home#security/app-passwords';

type FormState = {
  isEnabled: boolean;
  provider: 'Zoho' | 'Custom';
  smtpHost: string;
  smtpPort: number;
  securityMode: 'StartTls' | 'Ssl';
  username: string;
  appPassword: string;
  fromEmail: string;
  fromDisplayName: string;
  replyToEmail: string;
  signatureHtml: string;
};

function toForm(data: EmailSettingsDto): FormState {
  const isZoho = (data.provider ?? 'Zoho') !== 'Custom';
  return {
    isEnabled: data.isEnabled,
    provider: isZoho ? 'Zoho' : 'Custom',
    smtpHost: data.smtpHost || ZOHO_SMTP_PRESET.smtpHost,
    smtpPort: data.smtpPort || ZOHO_SMTP_PRESET.smtpPort,
    securityMode: data.securityMode === 'Ssl' ? 'Ssl' : 'StartTls',
    username: data.username ?? '',
    appPassword: '',
    fromEmail: data.fromEmail ?? '',
    fromDisplayName: data.fromDisplayName ?? '',
    replyToEmail: data.replyToEmail ?? '',
    signatureHtml: data.signatureHtml ?? '',
  };
}

function snapshot(f: FormState) {
  return JSON.stringify({
    ...f,
    appPassword: f.appPassword.trim() ? '__new__' : '',
  });
}

export function EmailSettingsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; detail?: string | null } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['email-settings'],
    queryFn: emailSettingsApi.get,
  });

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(s => (s ? { ...s, [k]: v } : s));
  };

  const applyZohoPreset = () => {
    setForm(s => s ? {
      ...s,
      provider: 'Zoho',
      smtpHost: ZOHO_SMTP_PRESET.smtpHost,
      smtpPort: ZOHO_SMTP_PRESET.smtpPort,
      securityMode: ZOHO_SMTP_PRESET.securityMode,
    } : s);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('no_form');
      return emailSettingsApi.update({
        isEnabled: form.isEnabled,
        provider: form.provider,
        smtpHost: form.smtpHost.trim(),
        smtpPort: form.smtpPort,
        securityMode: form.securityMode,
        username: form.username.trim() || null,
        appPassword: form.appPassword.trim() || undefined,
        fromEmail: form.fromEmail.trim() || null,
        fromDisplayName: form.fromDisplayName.trim() || null,
        replyToEmail: form.replyToEmail.trim() || null,
        signatureHtml: form.signatureHtml.trim() || null,
      });
    },
    onSuccess: saved => {
      toast.success(t('settings.email.saveSuccess'));
      qc.setQueryData(['email-settings'], saved);
      setForm(toForm(saved));
      setTestResult(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t('common.error');
      toast.error(msg);
    },
  });

  const testMut = useMutation({
    mutationFn: () => emailSettingsApi.test(testTo || form?.fromEmail || form?.username),
    onSuccess: res => {
      setTestResult(res);
      if (res.success) toast.success(res.message ?? t('settings.email.test.success'));
      else toast.error(res.message ?? t('settings.email.test.failed'));
    },
    onError: () => toast.error(t('common.error')),
  });

  const isDirty = useMemo(() => {
    if (!data || !form) return false;
    return snapshot(form) !== snapshot(toForm(data));
  }, [form, data]);

  if (isLoading || !form) {
    return (
      <Card><CardContent className="p-8 flex justify-center"><LoadingSpinner /></CardContent></Card>
    );
  }

  if (isError || !data) {
    return (
      <Card><CardContent className="p-5 text-sm text-destructive">{t('settings.email.loadError')}</CardContent></Card>
    );
  }

  const saved = data;

  return (
    <div className="space-y-4">
      {/* دليل Zoho */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            {t('settings.email.zohoGuide.title')}
          </CardTitle>
          <CardDescription>{t('settings.email.zohoGuide.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1.5 pe-4 ps-4">
            <li>{t('settings.email.zohoGuide.step1')}</li>
            <li>{t('settings.email.zohoGuide.step2')}</li>
            <li>{t('settings.email.zohoGuide.step3')}</li>
            <li>{t('settings.email.zohoGuide.step4')}</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={ZOHO_APP_PASSWORD_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.email.zohoGuide.appPasswordLink')}
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={ZOHO_SETUP_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.email.zohoGuide.smtpDocLink')}
              </a>
            </Button>
          </div>
          <p className="text-xs">{t('settings.email.zohoGuide.presetNote')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.isEnabled}
              onChange={e => set('isEnabled', e.target.checked)}
            />
            {t('settings.email.enabled')}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('settings.email.provider')}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.provider}
                onChange={e => {
                  const p = e.target.value as 'Zoho' | 'Custom';
                  if (p === 'Zoho') applyZohoPreset();
                  else set('provider', 'Custom');
                }}
              >
                <option value="Zoho">Zoho Mail</option>
                <option value="Custom">{t('settings.email.providerCustom')}</option>
              </select>
            </div>
            {form.provider === 'Zoho' && (
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" onClick={applyZohoPreset}>
                  {t('settings.email.applyZohoPreset')}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label>{t('settings.email.smtpHost')}</Label>
              <Input
                value={form.smtpHost}
                onChange={e => set('smtpHost', e.target.value)}
                disabled={form.provider === 'Zoho'}
                dir="ltr"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('settings.email.smtpPort')}</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={form.smtpPort}
                onChange={e => set('smtpPort', Number(e.target.value) || 587)}
                disabled={form.provider === 'Zoho'}
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t('settings.email.securityMode')}</Label>
            <select
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
              value={form.securityMode}
              onChange={e => set('securityMode', e.target.value as 'StartTls' | 'Ssl')}
              disabled={form.provider === 'Zoho'}
            >
              <option value="StartTls">{t('settings.email.securityStartTls')} (587)</option>
              <option value="Ssl">{t('settings.email.securitySsl')} (465)</option>
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('settings.email.username')}</Label>
              <Input
                type="email"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="info@iraqi-trade-center.iq"
                dir="ltr"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t('settings.email.usernameHint')}</p>
            </div>
            <div className="space-y-1">
              <Label>{t('settings.email.appPassword')}</Label>
              <div className="relative">
                <Input
                  type={showAppPassword ? 'text' : 'password'}
                  value={form.appPassword}
                  onChange={e => set('appPassword', e.target.value)}
                  placeholder={saved.appPasswordSet ? (saved.appPasswordMasked ?? '••••••••') : ''}
                  dir="ltr"
                  className="pe-9 font-mono text-sm"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAppPassword(s => !s)}
                >
                  {showAppPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.email.appPasswordHint')}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('settings.email.fromEmail')}</Label>
              <Input
                type="email"
                value={form.fromEmail}
                onChange={e => set('fromEmail', e.target.value)}
                placeholder={form.username || 'info@company.iq'}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('settings.email.fromDisplayName')}</Label>
              <Input
                value={form.fromDisplayName}
                onChange={e => set('fromDisplayName', e.target.value)}
                placeholder={t('settings.email.fromDisplayNamePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t('settings.email.replyTo')}</Label>
            <Input
              type="email"
              value={form.replyToEmail}
              onChange={e => set('replyToEmail', e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1">
            <Label>{t('settings.email.signature')}</Label>
            <textarea
              value={form.signatureHtml}
              onChange={e => set('signatureHtml', e.target.value)}
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('settings.email.signaturePlaceholder')}
            />
          </div>

          {saved.updatedAtUtc && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {new Date(saved.updatedAtUtc).toLocaleString()}
              {saved.updatedBy ? ` — ${saved.updatedBy}` : ''}
            </p>
          )}

          <div className="flex justify-end border-t border-border/40 pt-3">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isDirty} className="gap-2">
              <Save className="h-4 w-4" />
              {saveMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* اختبار الإرسال */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.email.test.title')}</CardTitle>
          <CardDescription>{t('settings.email.test.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder={form.fromEmail || form.username || 'test@example.com'}
              className="max-w-sm font-mono text-sm"
              dir="ltr"
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
              {t('settings.email.test.send')}
            </Button>
          </div>

          {testResult && (
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                testResult.success
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <div>
                  <p className="font-medium">{testResult.message}</p>
                  {testResult.detail && (
                    <p className="mt-1 font-mono text-xs opacity-80" dir="ltr">{testResult.detail}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
