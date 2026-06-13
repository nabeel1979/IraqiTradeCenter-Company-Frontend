import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle, Save, TestTube2, Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { whatsappSettingsApi, type WhatsAppSettingsDto } from '@/lib/api/whatsappSettings';

const ULTRAMSG_URL = 'https://user.ultramsg.com/';

type FormState = {
  isEnabled: boolean;
  useEmailForOtp: boolean;
  instanceId: string;
  token: string;
  otpTemplate: string;
  invoiceTemplate: string;
  reportTemplate: string;
  generalTemplate: string;
};

function toForm(data: WhatsAppSettingsDto): FormState {
  return {
    isEnabled: data.isEnabled,
    useEmailForOtp: data.useEmailForOtp ?? true,
    instanceId: data.instanceId ?? '',
    token: '',
    otpTemplate: data.otpTemplate ?? '',
    invoiceTemplate: data.invoiceTemplate ?? '',
    reportTemplate: data.reportTemplate ?? '',
    generalTemplate: data.generalTemplate ?? '',
  };
}

export function WhatsAppSettingsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['whatsapp-settings'],
    queryFn: whatsappSettingsApi.get,
  });

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(s => (s ? { ...s, [k]: v } : s));
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('no_form');
      return whatsappSettingsApi.update({
        isEnabled: form.isEnabled,
        useEmailForOtp: form.useEmailForOtp,
        instanceId: form.instanceId.trim() || null,
        token: form.token.trim() || undefined,
        otpTemplate: form.otpTemplate.trim() || null,
        invoiceTemplate: form.invoiceTemplate.trim() || null,
        reportTemplate: form.reportTemplate.trim() || null,
        generalTemplate: form.generalTemplate.trim() || null,
      });
    },
    onSuccess: saved => {
      toast.success(t('settings.whatsapp.saveSuccess'));
      qc.setQueryData(['whatsapp-settings'], saved);
      setForm(toForm(saved));
    },
    onError: () => toast.error(t('common.error')),
  });

  const testMut = useMutation({
    mutationFn: () => whatsappSettingsApi.test(testPhone.trim()),
    onSuccess: res => {
      if (res.success) toast.success(res.message ?? t('settings.whatsapp.testSuccess'));
      else toast.error(res.message ?? t('settings.whatsapp.testFailed'));
    },
    onError: () => toast.error(t('settings.whatsapp.testFailed')),
  });

  if (isLoading || !form) return <LoadingSpinner className="py-16" />;
  if (isError) return <p className="text-sm text-destructive">{t('settings.whatsapp.loadError')}</p>;

  const status = data?.instanceStatus?.toLowerCase() ?? '';
  const isBanned = status.includes('ban') || status.includes('block') || status.includes('restrict') || status.includes('suspend');
  const showStatusAlert = data?.isEnabled && (!data.instanceReady || isBanned);

  return (
    <div className="space-y-4">
      {showStatusAlert && (
        <div className={`flex gap-3 rounded-lg border p-4 text-sm ${isBanned ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {isBanned ? t('settings.whatsapp.bannedTitle') : t('settings.whatsapp.notReadyTitle')}
            </p>
            <p className="mt-1">
              {data?.instanceStatusMessage ?? t('settings.whatsapp.notReadyHint')}
            </p>
            {isBanned && (
              <p className="mt-2 text-xs opacity-90">{t('settings.whatsapp.bannedHint')}</p>
            )}
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            {t('settings.whatsapp.title')}
          </CardTitle>
          <CardDescription>{t('settings.whatsapp.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={e => set('isEnabled', e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            {t('settings.whatsapp.enabled')}
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <input
              type="checkbox"
              checked={form.useEmailForOtp}
              onChange={e => set('useEmailForOtp', e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <span>{t('settings.whatsapp.useEmailForOtp')}</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('settings.whatsapp.instanceId')}</Label>
              <Input
                dir="ltr"
                placeholder="instance167281"
                value={form.instanceId}
                onChange={e => set('instanceId', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('settings.whatsapp.token')}</Label>
              <div className="relative">
                <Input
                  dir="ltr"
                  type={showToken ? 'text' : 'password'}
                  placeholder={data?.tokenSet ? '••••••••' : 'token'}
                  value={form.token}
                  onChange={e => set('token', e.target.value)}
                />
                <button
                  type="button"
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowToken(v => !v)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.whatsapp.tokenHint')}</p>
            </div>
          </div>

          <a
            href={ULTRAMSG_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('settings.whatsapp.ultramsgLink')}
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.whatsapp.templatesTitle')}</CardTitle>
          <CardDescription>{t('settings.whatsapp.templatesHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['otpTemplate', 'settings.whatsapp.otpTemplate', '{{otp}} {{name}} {{password}}'],
            ['invoiceTemplate', 'settings.whatsapp.invoiceTemplate', '{{invoiceNo}} {{link}} {{name}}'],
            ['reportTemplate', 'settings.whatsapp.reportTemplate', '{{reportName}} {{link}} {{name}}'],
            ['generalTemplate', 'settings.whatsapp.generalTemplate', '{{message}} {{name}}'],
          ] as const).map(([key, labelKey, vars]) => (
            <div key={key} className="space-y-1">
              <Label>{t(labelKey)}</Label>
              <textarea
                className="w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                value={form[key]}
                onChange={e => set(key, e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground" dir="ltr">{vars}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.whatsapp.testTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>{t('settings.whatsapp.testPhone')}</Label>
            <Input dir="ltr" placeholder="9647XXXXXXXXX" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
          </div>
          <Button type="button" variant="outline" disabled={testMut.isPending} onClick={() => testMut.mutate()}>
            <TestTube2 className="h-4 w-4" />
            {t('settings.whatsapp.testSend')}
          </Button>
        </CardContent>
      </Card>

      <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        <Save className="h-4 w-4" />
        {t('common.save')}
      </Button>
    </div>
  );
}
