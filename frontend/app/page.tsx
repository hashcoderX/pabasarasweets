'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';

function HomeContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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

        if (isOutletUser) {
          if (nextPath && nextPath.startsWith('/')) {
            router.push(nextPath);
          } else {
            router.push('/outlet-pos');
          }
          return;
        }

        if (nextPath && nextPath.startsWith('/dashboard')) {
          router.push(nextPath);
          return;
        }
      } catch (profileError) {
        console.error('Error loading user profile after login:', profileError);
      }

      router.push('/dashboard');
    } catch (error: any) {
      const serverMessage =
        error?.response?.data?.message ||
        error?.response?.data?.errors?.email?.[0] ||
        'Login failed. Please check your credentials.';
      showNotice('Login Failed', serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-sky-50 to-emerald-50 relative overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-16 -left-12 w-72 h-72 rounded-full bg-cyan-200/70 blur-3xl"></div>
        <div className="absolute top-20 right-0 w-80 h-80 rounded-full bg-sky-200/60 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-emerald-200/60 blur-3xl"></div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl min-h-[calc(100vh-4rem)] flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <section className="hidden lg:flex rounded-3xl border border-white/60 bg-gradient-to-br from-cyan-600 via-sky-600 to-emerald-600 p-8 xl:p-10 text-white shadow-2xl">
            <div className="my-auto">
              <p className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                Corporate ERP
              </p>
              <h1 className="mt-4 text-4xl xl:text-5xl font-bold leading-tight">
                Unified Operations,
                <br />
                Better Decisions
              </h1>
              <p className="mt-4 text-sm xl:text-base text-white/90 max-w-md">
                Access HR, purchasing, stock, production, and distribution in one integrated workspace.
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/25 bg-white/10 p-3">
                  <p className="text-xs uppercase tracking-wide text-white/70">Workflow</p>
                  <p className="text-lg font-semibold mt-1">Streamlined</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/10 p-3">
                  <p className="text-xs uppercase tracking-wide text-white/70">Insights</p>
                  <p className="text-lg font-semibold mt-1">Real-Time</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-2xl p-6 sm:p-8 lg:p-10">
            <div>
              <p className="inline-flex rounded-full bg-cyan-100 text-cyan-700 px-3 py-1 text-xs font-semibold border border-cyan-200">
                Welcome Back
              </p>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-gray-900">Sign in to continue</h2>
              <p className="mt-2 text-sm text-gray-600">
                Use your account credentials to access your dashboard and modules.
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  suppressHydrationWarning
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-cyan-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  suppressHydrationWarning
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-cyan-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                suppressHydrationWarning
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/60 hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 text-xs text-gray-500">
              Protected workspace. Contact your administrator if you cannot sign in.
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
