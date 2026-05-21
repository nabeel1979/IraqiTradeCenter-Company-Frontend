import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { User, Lock, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { setToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';

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
    onSuccess: res => {
      if (res.success && res.data) {
        setToken(res.data.token);
        setUser(res.data.user);
        if (rememberMe) {
          saveRemembered({ username: username.trim(), password });
        } else {
          clearRemembered();
        }
        toast.success(`أهلاً ${res.data.user.fullName}`);
        // بعد تسجيل الدخول نوجّه دائماً للصفحة الرئيسية (نتجاهل أي from سابق)
        navigate('/', { replace: true });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (u.length < 3) {
      toast.error('اسم المستخدم قصير جداً');
      return;
    }
    if (password.length < 4) {
      toast.error('كلمة المرور قصيرة جداً');
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

      <div className="relative flex min-h-screen items-center justify-center px-4 py-6">
        <div className="w-full max-w-[420px]">
          {/* Brand */}
          <div className="mb-5 text-center">
            <div className="mb-3 inline-flex">
              <img
                src="/logo.png?v=3"
                alt="مركز التجارة العراقي"
                className="h-28 w-28 object-contain"
                draggable={false}
              />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              مركز التجارة العراقي
            </h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-primary/70">
              Iraqi Trade Center · Wholesale Dashboard
            </p>
            <div className="mx-auto mt-2.5 h-px w-10 bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>

          {/* Card */}
          <div className="rounded-xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl shadow-2xl shadow-black/20 animate-slide-up">
            <div className="mb-4">
              <h2 className="font-display text-lg font-medium">أهلاً بعودتك</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                سجّل دخول لإدارة شركتك
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="username">اسم المستخدم</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="اسم المستخدم"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="pr-10"
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
                  <Label htmlFor="password">كلمة المرور</Label>
                  <button type="button" className="text-xs text-primary/80 hover:text-primary">
                    نسيت كلمة المرور؟
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pr-10 pl-10"
                    autoComplete="current-password"
                    disabled={loginMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showPassword ? 'إخفاء' : 'إظهار'}
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
                <span>تذكّرني على هذا الجهاز</span>
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
                    جاري التحقق...
                  </>
                ) : (
                  <>
                    <ArrowLeft className="h-4 w-4" />
                    دخول
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>محمي بـ JWT + bcrypt</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>

          {/* Footer */}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            بحاجة لحساب جديد؟ تواصل مع مدير المنصة
          </p>
        </div>
      </div>
    </div>
  );
}
