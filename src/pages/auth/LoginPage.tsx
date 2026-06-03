import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  User, Lock, ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { authApi } from '@/lib/api/auth';
import { clearToken, getToken, setToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { readMustChangePasswordFromToken } from '@/lib/auth/jwt';
import { primeSidebarPrefsFromServer } from '@/lib/sidebarPreferences';
import { useLocale } from '@/lib/i18n';
import { cn, extractApiError } from '@/lib/utils';
import { AuthPageShell } from './AuthPageShell';

const REMEMBER_KEY = 'iqtc_remember';
type Step = 'login' | 'change';

interface RememberedCreds {
  username: string;
  password: string;
}

type LegacyCreds = { phone?: string; username?: string; password: string };

function loadRemembered(): RememberedCreds | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw)) as LegacyCreds;
    const username = parsed.username ?? parsed.phone ?? '';
    if (!username) return null;
    return { username, password: parsed.password };
  } catch {
    return null;
  }
}

function saveRemembered(creds: RememberedCreds) {
  try {
    localStorage.setItem(REMEMBER_KEY, btoa(JSON.stringify(creds)));
  } catch {
    // ignore
  }
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_KEY);
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const setUser = useAuthStore(s => s.setUser);
  const storeUser = useAuthStore(s => s.user);

  const [step, setStep] = useState<Step>('login');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadRemembered();
    if (saved) {
      setUsername(saved.username);
      setCurrentPassword(saved.password);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const mustChangeParam = searchParams.get('mustChange') === '1';
    const token = getToken();
    const mustChange = storeUser?.mustChangePassword || readMustChangePasswordFromToken();
    if (mustChangeParam && token && mustChange && storeUser) {
      setStep('change');
      setProfileName(storeUser.fullName);
      setProfileAvatar(storeUser.avatarBase64 ?? null);
      setUsername(storeUser.phone || storeUser.fullName);
    }
  }, [searchParams, storeUser]);

  const loginMutation = useMutation({
    mutationFn: () => authApi.login({ phone: username.trim(), password: currentPassword }),
    onSuccess: async res => {
      if (!res.success || !res.data) return;
      setToken(res.data.token);
      setUser(res.data.user);
      if (rememberMe) {
        saveRemembered({ username: username.trim(), password: currentPassword });
      } else {
        clearRemembered();
      }
      const needsChange = !!res.data.user.mustChangePassword;
      if (needsChange) {
        setProfileName(res.data.user.fullName);
        setProfileAvatar(res.data.user.avatarBase64 ?? null);
        setStep('change');
        setNewPassword('');
        setConfirmPassword('');
        toast.info(t('login.mustChangeOnSamePage'));
        return;
      }
      toast.success(t('login.welcomeUser', { name: res.data.user.fullName }));
      try { await primeSidebarPrefsFromServer(res.data.user.id); } catch { /* non-critical */ }
      navigate('/', { replace: true });
    },
    onError: (e: unknown) => {
      toast.error(extractApiError(e, t('login.errors.failed')));
    },
  });

  const changeMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: async res => {
      if (!res.success || !res.data) return;
      setUser(res.data.user);
      toast.success(t('changePassword.success'));
      try { await primeSidebarPrefsFromServer(res.data.user.id); } catch { /* non-critical */ }
      navigate('/', { replace: true });
    },
    onError: (e: unknown) => {
      toast.error(extractApiError(e, t('changePassword.failed')));
    },
  });

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (u.length < 3) {
      toast.error(t('login.errors.usernameTooShort'));
      return;
    }
    if (currentPassword.length < 4) {
      toast.error(t('login.errors.passwordTooShort'));
      return;
    }
    loginMutation.mutate();
  };

  const handleChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error(t('changePassword.errors.currentRequired'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('changePassword.minLength'));
      return;
    }
    if (newPassword === currentPassword) {
      toast.error(t('changePassword.errors.sameAsCurrent'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('changePassword.mismatch'));
      return;
    }
    changeMutation.mutate();
  };

  const handleBackToLogin = () => {
    clearToken();
    localStorage.removeItem('iqtc_auth');
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      permissionSet: new Set(),
      cashBoxIds: [],
    });
    setStep('login');
    setNewPassword('');
    setConfirmPassword('');
    setProfileName('');
    setProfileAvatar(null);
    navigate('/login', { replace: true });
  };

  const iconPad = isRtl ? 'pr-10' : 'pl-10';
  const pwdPad = isRtl ? 'pl-10 pr-10' : 'pr-10 pl-10';
  const isPending = loginMutation.isPending || changeMutation.isPending;

  const passwordField = (
    id: string,
    label: string,
    hint: string | undefined,
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    onToggle: () => void,
    autoComplete: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs sm:text-sm">{label}</Label>
      <div className="relative">
        <Lock className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn('h-10 sm:h-11', pwdPad)}
          autoComplete={autoComplete}
          disabled={isPending}
        />
        <button
          type="button"
          onClick={onToggle}
          className={cn('absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground', isRtl ? 'left-3' : 'right-3')}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{hint}</p>}
    </div>
  );

  return (
    <AuthPageShell
      showBrand={step === 'login'}
      header={step === 'change' ? (
        <div className="mb-4 text-center sm:mb-5">
          <div className="mx-auto mb-2 flex justify-center sm:mb-3">
            <UserAvatar name={profileName} src={profileAvatar} size="lg" />
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {t('changePassword.title')}
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
            {t('login.mustChangeOnSamePage')}
          </p>
          {profileName && (
            <p className="mt-1 text-[11px] text-primary/80 sm:text-xs">{profileName}</p>
          )}
        </div>
      ) : undefined}
    >
      {step === 'login' ? (
        <>
          <div className="mb-3 sm:mb-4">
            <h2 className="font-display text-base font-medium sm:text-lg">{t('login.welcome')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-3 sm:space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="username" className="text-xs sm:text-sm">{t('login.username')}</Label>
              <div className="relative">
                <User className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
                <Input
                  id="username"
                  type="text"
                  placeholder={t('login.usernamePlaceholder')}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={cn('h-10 sm:h-11', iconPad)}
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isPending}
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{t('login.usernameHint')}</p>
            </div>

            {passwordField(
              'currentPassword',
              t('login.password'),
              t('login.passwordHint'),
              currentPassword,
              setCurrentPassword,
              showCurrent,
              () => setShowCurrent(s => !s),
              'current-password',
            )}

            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:text-sm">
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => {
                    setRememberMe(e.target.checked);
                    if (!e.target.checked) clearRemembered();
                  }}
                  disabled={isPending}
                  className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border bg-secondary/40 checked:border-primary checked:bg-primary disabled:opacity-50"
                />
                <svg viewBox="0 0 16 16" className="pointer-events-none absolute h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 8 7 12 13 4" />
                </svg>
              </span>
              <span>{t('login.rememberMe')}</span>
            </label>

            <Button type="submit" size="lg" className="h-10 w-full font-medium glow-primary sm:h-11" disabled={isPending}>
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('login.submitting')}
                </>
              ) : (
                <>
                  {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  {t('login.submit')}
                </>
              )}
            </Button>
          </form>

          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground sm:mt-4 sm:gap-3 sm:text-[11px]">
            <div className="h-px flex-1 bg-border" />
            <span>{t('login.secured')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="mt-2.5 text-center text-[10px] text-muted-foreground sm:mt-3 sm:text-[11px]">
            {t('login.needAccount')}
          </p>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleBackToLogin}
            disabled={isPending}
          >
            {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {t('login.backToLogin')}
          </Button>

          <form onSubmit={handleChangeSubmit} className="space-y-3 sm:space-y-3.5">
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm">{t('login.username')}</Label>
            <Input value={username} readOnly disabled className="h-10 bg-secondary/30 sm:h-11" dir="ltr" />
          </div>

          {passwordField(
            'tempPassword',
            t('login.tempPassword'),
            t('changePassword.currentHint'),
            currentPassword,
            setCurrentPassword,
            showCurrent,
            () => setShowCurrent(s => !s),
            'current-password',
          )}

          {passwordField(
            'newPassword',
            t('changePassword.new'),
            t('changePassword.newHint'),
            newPassword,
            setNewPassword,
            showNew,
            () => setShowNew(s => !s),
            'new-password',
          )}

          {passwordField(
            'confirmPassword',
            t('changePassword.confirm'),
            undefined,
            confirmPassword,
            setConfirmPassword,
            showNew,
            () => setShowNew(s => !s),
            'new-password',
          )}

          <Button type="submit" size="lg" className="h-10 w-full gap-2 glow-primary sm:h-11" disabled={isPending}>
            {changeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {t('changePassword.submit')}
          </Button>
        </form>
        </>
      )}
    </AuthPageShell>
  );
}
