import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  User, Lock, ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, Languages,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { setToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { primeSidebarPrefsFromServer } from '@/lib/sidebarPreferences';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// مفتاح حفظ بيانات الدخول للمرة القادمة (مشفّر بسيطاً بـ Base64)
const REMEMBER_KEY = 'iqtc_remember';

interface RememberedCreds {
  username: string;
  password: string;
}

// قبلة: حقول كان اسمها phone — نقرأها لو لقيناها لأجل التوافق الخلفي.
type LegacyCreds = { phone?: string; username?: string; password: string };

function loadRemembered(): RememberedCreds | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const decoded = atob(raw);
    const parsed = JSON.parse(decoded) as LegacyCreds;
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
    // ignore (storage full / disabled)
  }
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_KEY);
}

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { locale, toggleLocale, isRtl } = useLocale();
  const setUser = useAuthStore(s => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // تحميل البيانات المحفوظة عند فتح الصفحة
  useEffect(() => {
    const saved = loadRemembered();
    if (saved) {
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberMe(true);
    }
  }, []);

  const loginMutation = useMutation({
    // ‎الـ backend ما زال يقرأ الحقل باسم phone — نرسلها مع نفس الاسم لكن من حقل username.
    mutationFn: () => authApi.login({ phone: username.trim(), password }),
    onSuccess: async res => {
      if (res.success && res.data) {
        setToken(res.data.token);
        setUser(res.data.user);
        if (rememberMe) {
          saveRemembered({ username: username.trim(), password });
        } else {
          clearRemembered();
        }
        toast.success(t('login.welcomeUser', { name: res.data.user.fullName }));
        // ‎جلب تفضيلات الـ Sidebar من الخادم وحفظها محلياً قبل التوجيه،
        // حتى يستخدم الـ Sidebar حالة الطي/الفتح المحفوظة من أول render
        // ‎(بدلاً من ومضة الافتراضي → الفعلي بعد ms قليلة).
        try { await primeSidebarPrefsFromServer(res.data.user.id); } catch { /* non-critical */ }
        // ‎بعد تسجيل الدخول نوجّه دائماً للصفحة الرئيسية (نتجاهل أي from سابق)
        navigate('/', { replace: true });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (u.length < 3) {
      toast.error(t('login.errors.usernameTooShort'));
      return;
    }
    if (password.length < 4) {
      toast.error(t('login.errors.passwordTooShort'));
      return;
    }
    loginMutation.mutate();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative background */}
      <div className="absolute inset-0">
        <div className="absolute right-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[140px]" />
        <div className="pattern-meso absolute inset-0 opacity-30" />
      </div>

      {/* ‎زر تبديل اللغة العائم — يبقى ظاهراً في صفحة تسجيل الدخول */}
      <button
        type="button"
        onClick={toggleLocale}
        title={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        className={cn(
          'absolute top-4 z-20 flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 text-muted-foreground backdrop-blur-md transition-colors hover:bg-card hover:text-primary',
          isRtl ? 'left-4' : 'right-4',
        )}
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {locale === 'ar' ? 'EN' : 'ع'}
        </span>
      </button>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-6">
        <div className="w-full max-w-[420px]">
          {/* Brand */}
          <div className="mb-5 text-center">
            <div className="mb-3 inline-flex">
              <img
                src="/logo.png?v=3"
                alt={t('app.name')}
                className="h-28 w-28 object-contain"
                draggable={false}
              />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t('app.name')}
            </h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-primary/70">
              {t('app.wholesale')}
            </p>
            <div className="mx-auto mt-2.5 h-px w-10 bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>

          {/* Card */}
          <div className="rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl shadow-2xl shadow-black/20 animate-slide-up">
            <div className="mb-4">
              <h2 className="font-display text-lg font-medium">{t('login.welcome')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('login.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="username">{t('login.username')}</Label>
                <div className="relative">
                  <User className={cn(
                    'absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground',
                    isRtl ? 'right-3' : 'left-3',
                  )} />
                  <Input
                    id="username"
                    type="text"
                    placeholder={t('login.usernamePlaceholder')}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className={isRtl ? 'pr-10' : 'pl-10'}
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loginMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <button type="button" className="text-xs text-primary/80 hover:text-primary">
                    {t('login.forgotPassword')}
                  </button>
                </div>
                <div className="relative">
                  <Lock className={cn(
                    'absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground',
                    isRtl ? 'right-3' : 'left-3',
                  )} />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={isRtl ? 'pl-10 pr-10' : 'pr-10 pl-10'}
                    autoComplete="current-password"
                    disabled={loginMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground',
                      isRtl ? 'left-3' : 'right-3',
                    )}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    title={showPassword ? t('login.hide') : t('login.show')}
                    tabIndex={-1}
                    disabled={loginMutation.isPending}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* تذكّرني */}
              <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <span className="relative flex h-4 w-4 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => {
                      setRememberMe(e.target.checked);
                      if (!e.target.checked) clearRemembered();
                    }}
                    disabled={loginMutation.isPending}
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border bg-secondary/40 checked:border-primary checked:bg-primary disabled:opacity-50"
                  />
                  <svg
                    viewBox="0 0 16 16"
                    className="pointer-events-none absolute h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 8 7 12 13 4" />
                  </svg>
                </span>
                <span>{t('login.rememberMe')}</span>
              </label>

              <Button
                type="submit"
                size="default"
                className="w-full font-medium glow-primary"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('login.submitting')}
                  </>
                ) : (
                  <>
                    {/* ‎السهم يشير ناحية تدفّق الدخول: في RTL إلى اليسار، LTR إلى اليمين. */}
                    {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                    {t('login.submit')}
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>{t('login.secured')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>

          {/* Footer */}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {t('login.needAccount')}
          </p>
        </div>
      </div>
    </div>
  );
}
