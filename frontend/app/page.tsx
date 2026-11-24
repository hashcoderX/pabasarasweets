'use client';

import PageSkeleton from '@/app/components/PageSkeleton';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';
import {
  canUseOfflineSession,
  writeOfflineSession,
} from '@/lib/offlineSession';
import { isAxiosError } from '@/lib/http';

function HomeContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const router = useRouter();
  const params = useSearchParams();
  const apiClient = createApiClient();

  const showNotice = (title: string, message: string) => {
    setNoticeTitle(title);
    setNoticeMessage(message);
    setNoticeOpen(true);
  };

  const closeNotice = () => {
    setNoticeOpen(false);
    setNoticeTitle('');
    setNoticeMessage('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await apiClient.post('/login', {
        email,
        password,
      });
      const nextToken = response.data.token;
      localStorage.setItem('token', nextToken);

      try {
        const userRes = await apiClient.get('/user', {
          headers: { Authorization: `Bearer ${nextToken}` },
        });

        const userData = userRes.data || {};
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const isOutletUser = roleNames.some((role) => role.includes('outlet_user'));
        const nextPath = params.get('next');
        const preferredPath = isOutletUser
          ? (nextPath && nextPath.startsWith('/') ? nextPath : '/outlet-pos')
          : (nextPath && nextPath.startsWith('/dashboard') ? nextPath : '/dashboard');

        writeOfflineSession({
          token: nextToken,
          user: {
            id: Number(userData?.id || userData?.user_id || 0) || undefined,
            name: String(userData?.name || userData?.employee?.name || ''),
            email: String(userData?.email || email || ''),
            role: String(userData?.role || ''),
            roles: roleNames,
          },
          isOutletUser,
          preferredPath,
          savedAt: Date.now(),
        });

        if (isOutletUser) {
          router.push(preferredPath);
          return;
        }

        if (nextPath && nextPath.startsWith('/dashboard')) {
          router.push(preferredPath);
          return;
        }
      } catch (profileError) {
        console.error('Error loading user profile after login:', profileError);
      }

      router.push('/dashboard');
    } catch (error) {
      if (isAxiosError(error) && !error.response) {
        const offlineSession = canUseOfflineSession(email);
        if (offlineSession) {
          localStorage.setItem('token', offlineSession.token);
          showNotice(
            'Offline Login',
            'Internet is not available. Signed in using your last verified session.',
          );
          router.push(offlineSession.preferredPath || '/dashboard');
          return;
        }
      }

      const axiosError = error as {
        response?: {
          data?: {
            message?: string;
            errors?: { email?: string[] };
          };
        };
      } | null;
      const serverMessage =
        axiosError?.response?.data?.message ||
        axiosError?.response?.data?.errors?.email?.[0] ||
        'Login failed. Please check your credentials.';
      showNotice('Login Failed', serverMessage);
    } finally {
      setLoading(false);
    }
  };

  const particles = [
    { left: '6%', size: 10, dur: 22, delay: 0, drift: 30, color: 'bg-cyan-300/50' },
    { left: '14%', size: 16, dur: 28, delay: 6, drift: -20, color: 'bg-emerald-300/40' },
    { left: '23%', size: 8, dur: 19, delay: 3, drift: 40, color: 'bg-sky-300/50' },
    { left: '34%', size: 14, dur: 26, delay: 11, drift: -30, color: 'bg-teal-300/40' },
    { left: '45%', size: 9, dur: 21, delay: 8, drift: 25, color: 'bg-cyan-300/50' },
    { left: '56%', size: 18, dur: 30, delay: 2, drift: -35, color: 'bg-emerald-300/30' },
    { left: '67%', size: 11, dur: 24, delay: 13, drift: 20, color: 'bg-sky-300/50' },
    { left: '76%', size: 7, dur: 18, delay: 5, drift: -15, color: 'bg-teal-300/50' },
    { left: '85%', size: 15, dur: 27, delay: 9, drift: 35, color: 'bg-cyan-300/40' },
    { left: '93%', size: 10, dur: 23, delay: 1, drift: -25, color: 'bg-emerald-300/40' },
  ];

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-100';

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-cyan-50 to-emerald-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="login-blob absolute -top-24 -left-20 h-96 w-96 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="login-blob absolute top-1/4 -right-24 h-[26rem] w-[26rem] rounded-full bg-sky-300/35 blur-3xl" style={{ animationDelay: '-6s' }} />
        <div className="login-blob absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-emerald-300/40 blur-3xl" style={{ animationDelay: '-12s' }} />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(circle_at_1px_1px,rgba(14,116,144,0.18)_1px,transparent_0)] [background-size:28px_28px]" />
        {particles.map((p, i) => (
          <span
            key={i}
            className={`login-particle ${p.color}`}
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `-${p.delay}s`,
              ['--drift' as string]: `${p.drift}px`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="login-enter grid w-full grid-cols-1 overflow-hidden rounded-[28px] border border-white/70 bg-white/70 shadow-[0_40px_120px_-40px_rgba(8,145,178,0.55)] backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]">
          <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-cyan-900 to-emerald-800 p-10 text-white lg:flex xl:p-14">
            <div className="login-blob absolute -top-20 -right-16 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" aria-hidden="true" />
            <div className="login-blob absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" style={{ animationDelay: '-9s' }} aria-hidden="true" />
            <div className="relative my-auto w-full">
              <div className="flex items-center gap-3">
                <img src="/icon-192.png" alt="Pabasara Sweets" className="h-12 w-12 rounded-xl bg-white/90 p-1 shadow-lg" />
                <div>
                  <p className="text-lg font-bold leading-tight">Pabasara Sweets</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Business Management System</p>
                </div>
              </div>

              <h1 className="mt-10 text-4xl font-bold leading-tight xl:text-5xl">
                Run every operation
                <br />
                <span className="login-sheen bg-gradient-to-r from-cyan-200 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                  from one workspace
                </span>
              </h1>
              <p className="mt-4 max-w-md text-sm text-white/80 xl:text-base">
                HR, purchasing, stock, production, distribution and accounts, connected and updated in real time.
              </p>

              <ul className="mt-8 space-y-3">
                {['Real-time stock and sales insights', 'Distribution, invoicing and payments', 'Secure role-based access control'].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-sm text-white/90">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/25 ring-1 ring-emerald-300/40">
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-emerald-200"><path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4L16.8 6.4l-1.1-1.1z" /></svg>
                    </span>
                    {t}
                  </li>
                ))}
              </ul>

              <div className="mt-10 grid grid-cols-3 gap-3">
                {[['6+', 'Modules'], ['24/7', 'Access'], ['100%', 'Secure']].map(([v, l]) => (
                  <div key={l} className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                    <p className="text-xl font-bold">{v}</p>
                    <p className="text-[11px] uppercase tracking-wide text-white/65">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white/80 p-6 sm:p-10 xl:p-14">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <img src="/icon-192.png" alt="Pabasara Sweets" className="h-11 w-11 rounded-xl shadow" />
                <p className="text-lg font-bold text-slate-900">Pabasara Sweets</p>
              </div>

              <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                Welcome back
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
              <p className="mt-2 text-sm text-slate-500">Enter your credentials to access your dashboard and modules.</p>

              <form className="mt-8 space-y-5" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
                  <div className="relative">
                    <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 fill-none stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                    </svg>
                    <input
                      suppressHydrationWarning
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={inputClass}
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 fill-none stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    <input
                      suppressHydrationWarning
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className={`${inputClass} pr-16`}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:text-cyan-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  suppressHydrationWarning
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:-translate-y-0.5 hover:from-emerald-700 hover:to-cyan-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              <div className="mt-8 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" />
                </svg>
                Protected workspace. Contact your administrator if you cannot sign in.
              </div>
            </div>
          </section>
        </div>
      </div>

      {noticeOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-100 bg-gradient-to-r from-red-50 to-white flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800">{noticeTitle || 'Notice'}</h3>
              <button
                type="button"
                onClick={closeNotice}
                className="h-7 w-7 rounded-full border border-red-200 text-red-700 hover:bg-red-50"
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-700">{noticeMessage}</p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={closeNotice}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-emerald-100 flex items-center justify-center">
          <PageSkeleton />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
