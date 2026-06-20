import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle, Save, TestTube2, Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PhoneInput } from '@/components/shared/PhoneInput';
import {
  whatsappSettingsApi,
  type WhatsAppProvider,
  type WhatsAppSettingsDto,
} from '@/lib/api/whatsappSettings';

const ULTRAMSG_URL = 'https://user.ultramsg.com/';
const META_DEV_URL = 'https://developers.facebook.com/apps/';

type FormState = {
  isEnabled: boolean;
  useEmailForOtp: boolean;
  provider: WhatsAppProvider;
  instanceId: string;
  phoneNumberId: string;
  metaAppId: string;
  metaWabaId: string;
  token: string;
  metaOtpTemplateName: string;
  metaOtpTemplateLanguage: string;
  otpTemplate: string;
  invoiceTemplate: string;
  reportTemplate: string;
  generalTemplate: string;
};

function toForm(data: WhatsAppSettingsDto): FormState {
  return {
    isEnabled: data.isEnabled,
    useEmailForOtp: data.useEmailForOtp ?? true,
    provider: data.provider === 'MetaCloud' ? 'MetaCloud' : 'UltraMsg',
    instanceId: data.instanceId ?? '',
    phoneNumberId: data.phoneNumberId ?? '',
    metaAppId: data.metaAppId ?? '',
    metaWabaId: data.metaWabaId ?? '',
    token: '',
    metaOtpTemplateName: data.metaOtpTemplateName ?? '',
    metaOtpTemplateLanguage: data.metaOtpTemplateLanguage ?? 'ar',
    otpTemplate: data.otpTemplate ?? '',
    invoiceTemplate: data.invoiceTemplate ?? '',
    reportTemplate: data.reportTemplate ?? '',
    generalTemplate: data.generalTemplate ?? '',
  };
}

type TokenFieldProps = {
  label: string;
  hint: string;
  placeholderEmpty: string;
  formToken: string;
  onTokenChange: (v: string) => void;
  tokenSaved: boolean;
  tokenMasked?: string | null;
  tokenLength?: number;
  showToken: boolean;
  onToggleShow: () => void;
  replacing: boolean;
  onStartReplace: () => void;
};

function TokenField({
  label,
  hint,
  placeholderEmpty,
  formToken,
  onTokenChange,
  tokenSaved,
  tokenMasked,
  tokenLength = 0,
  showToken,
  onToggleShow,
  replacing,
  onStartReplace,
}: TokenFieldProps) {
  const { t } = useTranslation();
  const showSavedInField = tokenSaved && !replacing;
  const displayValue = showSavedInField
    ? `${tokenMasked ?? '••••••••••••'} (${tokenLength})`
    : formToken;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {showSavedInField && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onStartReplace}>
            {t('settings.whatsapp.replaceToken')}
          </Button>
        )}
      </div>
      <div className="relative">
        <Input
          dir="ltr"
          type={showSavedInField ? 'text' : showToken ? 'text' : 'password'}
          readOnly={showSavedInField}
          className={
            showSavedInField
              ? 'border-emerald-300 bg-emerald-50 pe-9 font-mono text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
              : undefined
          }
          placeholder={showSavedInField ? undefined : placeholderEmpty}
          value={displayValue}
          onChange={e => {
            if (!showSavedInField) onTokenChange(e.target.value);
          }}
        />
        {showSavedInField ? (
          <CheckCircle2 className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <button
            type="button"
            className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={onToggleShow}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {!tokenSaved && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('settings.whatsapp.tokenNotSet')}</p>
      )}
    </div>
  );
}

export function WhatsAppSettingsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [replaceToken, setReplaceToken] = useState(false);
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
        provider: form.provider,
        instanceId: form.instanceId.trim() || null,
        phoneNumberId: form.phoneNumberId.trim() || null,
        metaAppId: form.metaAppId.trim() || null,
        metaWabaId: form.metaWabaId.trim() || null,
        token: form.token.trim() || undefined,
        metaOtpTemplateName: form.metaOtpTemplateName.trim() || null,
        metaOtpTemplateLanguage: form.metaOtpTemplateLanguage.trim() || null,
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
      setReplaceToken(false);
      setShowToken(false);
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

  const startReplaceToken = () => {
    setReplaceToken(true);
    setShowToken(true);
    set('token', '');
  };

  const isMeta = form.provider === 'MetaCloud';
  const tokenSaved = Boolean(data?.tokenSet);
  const status = data?.instanceStatus?.toLowerCase() ?? '';
  const statusMsg = data?.instanceStatusMessage ?? '';
  const hasMetaAuthError = isMeta && (
    statusMsg.includes('Authentication')
    || statusMsg.includes('توكن Meta')
    || statusMsg.includes('Invalid OAuth')
  );
  const isBanned = !isMeta && (
    status.includes('ban') || status.includes('block') || status.includes('restrict') || status.includes('suspend')
  );
  const showStatusAlert = data?.isEnabled && (hasMetaAuthError || !data.instanceReady || isBanned);

  return (
    <div className="space-y-4">
      {showStatusAlert && (
        <div className={`flex gap-3 rounded-lg border p-4 text-sm ${isBanned ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {isBanned
                ? t('settings.whatsapp.bannedTitle')
                : hasMetaAuthError
                  ? t('settings.whatsapp.metaTokenInvalidTitle')
                : isMeta
                  ? t('settings.whatsapp.metaNotReadyTitle')
                  : t('settings.whatsapp.notReadyTitle')}
            </p>
            <p className="mt-1">
              {hasMetaAuthError
                ? (statusMsg || t('settings.whatsapp.metaAuthErrorHint', { phoneNumberId: form?.phoneNumberId.trim() || '—' }))
                : (data?.instanceStatusMessage
                ?? (isMeta ? t('settings.whatsapp.metaNotReadyHint') : t('settings.whatsapp.notReadyHint')))}
            </p>
            {hasMetaAuthError && (
              <p className="mt-2 text-xs opacity-90">{t('settings.whatsapp.metaTokenSteps')}</p>
            )}
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

          <div className="space-y-2">
            <Label>{t('settings.whatsapp.provider')}</Label>
            <div className="flex flex-wrap gap-2">
              {([
                ['UltraMsg', 'settings.whatsapp.providerUltraMsg'],
                ['MetaCloud', 'settings.whatsapp.providerMeta'],
              ] as const).map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('provider', value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.provider === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isMeta ? t('settings.whatsapp.providerMetaHint') : t('settings.whatsapp.providerUltraMsgHint')}
            </p>
          </div>

          {isMeta ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('settings.whatsapp.phoneNumberId')}</Label>
                  <Input
                    dir="ltr"
                    placeholder="123456789012345"
                    value={form.phoneNumberId}
                    onChange={e => set('phoneNumberId', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.whatsapp.phoneNumberIdHint')}</p>
                  {form.phoneNumberId.trim() && form.phoneNumberId.trim() === form.metaAppId.trim() && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      {t('settings.whatsapp.metaIdMismatchWarning', { id: form.phoneNumberId.trim() })}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t('settings.whatsapp.metaAppId')}</Label>
                  <Input
                    dir="ltr"
                    placeholder="888010923642640"
                    value={form.metaAppId}
                    onChange={e => set('metaAppId', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('settings.whatsapp.metaWabaId')}</Label>
                  <Input
                    dir="ltr"
                    placeholder="1774248193565647"
                    value={form.metaWabaId}
                    onChange={e => set('metaWabaId', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.whatsapp.metaWabaIdHint')}</p>
                </div>
              </div>
              <TokenField
                label={t('settings.whatsapp.metaAccessToken')}
                hint={t('settings.whatsapp.metaTokenHint')}
                placeholderEmpty="EAAxxxx..."
                formToken={form.token}
                onTokenChange={v => set('token', v)}
                tokenSaved={tokenSaved}
                tokenMasked={data?.tokenMasked}
                tokenLength={data?.tokenLength}
                showToken={showToken}
                onToggleShow={() => setShowToken(v => !v)}
                replacing={replaceToken}
                onStartReplace={startReplaceToken}
              />
              <a
                href={META_DEV_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.whatsapp.metaLink')}
              </a>
            </>
          ) : (
            <>
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
                <TokenField
                  label={t('settings.whatsapp.token')}
                  hint={t('settings.whatsapp.tokenHint')}
                  placeholderEmpty="token"
                  formToken={form.token}
                  onTokenChange={v => set('token', v)}
                  tokenSaved={tokenSaved}
                  tokenMasked={data?.tokenMasked}
                  tokenLength={data?.tokenLength}
                  showToken={showToken}
                  onToggleShow={() => setShowToken(v => !v)}
                  replacing={replaceToken}
                  onStartReplace={startReplaceToken}
                />
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isMeta ? t('settings.whatsapp.metaTemplatesTitle') : t('settings.whatsapp.templatesTitle')}
          </CardTitle>
          <CardDescription>
            {isMeta ? t('settings.whatsapp.metaTemplatesHint') : t('settings.whatsapp.templatesHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isMeta && (
            <>
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                {t('settings.whatsapp.metaTemplateNote')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('settings.whatsapp.metaOtpTemplateName')}</Label>
                  <Input
                    dir="ltr"
                    placeholder="verify_code"
                    value={form.metaOtpTemplateName}
                    onChange={e => set('metaOtpTemplateName', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.whatsapp.metaOtpTemplateNameHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label>{t('settings.whatsapp.metaOtpTemplateLanguage')}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    dir="ltr"
                    value={form.metaOtpTemplateLanguage}
                    onChange={e => set('metaOtpTemplateLanguage', e.target.value)}
                  >
                    <option value="ar">ar (عربي)</option>
                    <option value="ar_AR">ar_AR</option>
                    <option value="en_US">en_US</option>
                    <option value="en">en</option>
                  </select>
                  <p className="text-xs text-muted-foreground">{t('settings.whatsapp.metaOtpTemplateLanguageHint')}</p>
                </div>
              </div>
              {!form.metaOtpTemplateName.trim() && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {t('settings.whatsapp.metaOtpTemplateRequired')}
                </p>
              )}
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                {t('settings.whatsapp.metaPrimaryDeviceHint')}
              </p>
              <p className="text-xs font-medium text-muted-foreground">{t('settings.whatsapp.metaFallbackTemplates')}</p>
            </>
          )}
          {(() => {
            type TemplateKey = 'otpTemplate' | 'invoiceTemplate' | 'reportTemplate' | 'generalTemplate';
            type Row = readonly [TemplateKey, string, string];
            const rows: readonly Row[] = isMeta
              ? [['otpTemplate', 'settings.whatsapp.otpTemplateFallback', '{{otp}} {{name}} {{password}}']]
              : [
                  ['otpTemplate', 'settings.whatsapp.otpTemplate', '{{otp}} {{name}} {{password}}'],
                  ['invoiceTemplate', 'settings.whatsapp.invoiceTemplate', '{{invoiceNo}} {{link}} {{name}}'],
                  ['reportTemplate', 'settings.whatsapp.reportTemplate', '{{reportName}} {{link}} {{name}}'],
                  ['generalTemplate', 'settings.whatsapp.generalTemplate', '{{message}} {{name}}'],
                ];
            return rows.map(([key, labelKey, vars]) => (
              <div key={key} className="space-y-1">
                <Label>{t(labelKey)}</Label>
                <textarea
                  className="w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                  value={form[key] as string}
                  onChange={e => set(key, e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground" dir="ltr">{vars}</p>
              </div>
            ));
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.whatsapp.testTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isMeta && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" dir="ltr">
              <p className="mb-1 font-medium text-foreground" dir="rtl">{t('settings.whatsapp.metaConfigSummary')}</p>
              <p><span className="text-muted-foreground">{t('settings.whatsapp.metaConfigPhoneId')}:</span> {form.phoneNumberId.trim() || '—'}</p>
              <p><span className="text-muted-foreground">{t('settings.whatsapp.metaConfigAppId')}:</span> {form.metaAppId.trim() || '—'}</p>
              <p><span className="text-muted-foreground">{t('settings.whatsapp.metaConfigOtpTemplate')}:</span> {form.metaOtpTemplateName.trim() || '—'} ({form.metaOtpTemplateLanguage || 'ar'})</p>
              <p dir="rtl">
                <span className="text-muted-foreground">{t('settings.whatsapp.metaConfigToken')}:</span>{' '}
                {tokenSaved ? t('settings.whatsapp.metaConfigTokenOk') : t('settings.whatsapp.metaConfigTokenMissing')}
                {tokenSaved && data?.tokenLength ? ` (${data.tokenLength})` : ''}
              </p>
            </div>
          )}
          {isMeta && (
            <p className="text-xs text-muted-foreground">{t('settings.whatsapp.metaTestHint')}</p>
          )}
          {isMeta && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {t('settings.whatsapp.metaAuthErrorHint', { phoneNumberId: form.phoneNumberId.trim() || '—' })}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label>{t('settings.whatsapp.testPhone')}</Label>
              <PhoneInput value={testPhone} onChange={setTestPhone} />
            </div>
            <Button type="button" variant="outline" disabled={testMut.isPending} onClick={() => testMut.mutate()}>
              <TestTube2 className="h-4 w-4" />
              {t('settings.whatsapp.testSend')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        <Save className="h-4 w-4" />
        {t('common.save')}
      </Button>
    </div>
  );
}
