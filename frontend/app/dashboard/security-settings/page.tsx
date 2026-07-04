'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type SecuritySettings = {
  enforce_strong_passwords: boolean;
  require_two_factor: boolean;
  lockout_enabled: boolean;
  max_failed_attempts: number;
  session_timeout_minutes: number;
  password_expiry_days: number;
};

const defaultSettings: SecuritySettings = {
  enforce_strong_passwords: true,
  require_two_factor: false,
  lockout_enabled: true,
  max_failed_attempts: 5,
  session_timeout_minutes: 120,
  password_expiry_days: 90,
};

export default function SecuritySettingsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SecuritySettings>(defaultSettings);

  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const bootstrap = async () => {
      try {
        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .join(' ')
          .toLowerCase();

        const adminUser =
          !employeeId ||
          roleNames.includes('super admin') ||
          roleNames.includes('superadmin') ||
          roleNames.includes('administrator') ||
          roleNames.includes('admin');

        setIsAdmin(adminUser);

        if (!adminUser) {
          router.push('/dashboard');
          return;
        }

        await fetchSettings(token);
      } catch (error) {
        console.error('Error loading security settings access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    bootstrap();
  }, [token, router]);

  const fetchSettings = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      const res = await axios.get('/api/security-settings', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      setSettings({
        enforce_strong_passwords: Boolean(res.data?.enforce_strong_passwords),
        require_two_factor: Boolean(res.data?.require_two_factor),
        lockout_enabled: Boolean(res.data?.lockout_enabled),
        max_failed_attempts: Number(res.data?.max_failed_attempts || 5),
        session_timeout_minutes: Number(res.data?.session_timeout_minutes || 120),
        password_expiry_days: Number(res.data?.password_expiry_days || 90),
      });
    } catch (error) {
      console.error('Error fetching security settings:', error);
      alert('Failed to load security settings.');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await axios.put('/api/security-settings', settings, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Security settings saved successfully.');
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to save security settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'enforce_strong_passwords' | 'require_two_factor' | 'lockout_enabled') => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const shieldScore = [
    settings.enforce_strong_passwords,
    settings.require_two_factor,
    settings.lockout_enabled,
    settings.max_failed_attempts <= 5,
    settings.session_timeout_minutes <= 240,
    settings.password_expiry_days <= 120,
  ].filter(Boolean).length;

  const shieldPercent = Math.round((shieldScore / 6) * 100);

  const securityLevel = shieldPercent >= 84 ? 'High' : shieldPercent >= 50 ? 'Medium' : 'Low';

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-10 -left-16 w-72 h-72 bg-rose-200/60 rounded-full blur-3xl"></div>
        <div className="absolute top-24 right-0 w-80 h-80 bg-orange-200/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-200/50 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Security Settings</h1>
              <p className="text-xs text-gray-500">Configure authentication hardening and access protection policies.</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-2xl border border-white/70 bg-white/80 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Security Control Center</h2>
              <p className="text-sm text-gray-600 mt-1">Tune identity and session controls to balance risk reduction and user experience.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                Security Level: {securityLevel}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                Lockout: {settings.max_failed_attempts} Attempts
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-rose-700 font-semibold">Shield Score</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{shieldPercent}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-rose-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-500" style={{ width: `${shieldPercent}%` }}></div>
              </div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-orange-700 font-semibold">Two-Factor</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{settings.require_two_factor ? 'Required' : 'Optional'}</p>
              <p className="text-xs text-gray-600 mt-1">{settings.require_two_factor ? 'Extra verification is enforced.' : 'Single-factor login allowed.'}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">Session Policy</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{settings.session_timeout_minutes}m</p>
              <p className="text-xs text-gray-600 mt-1">Password expiry every {settings.password_expiry_days} days.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Authentication Controls</h3>
          <p className="text-sm text-gray-600 mb-4">Apply baseline account and session protection settings.</p>

          {loading ? (
            <div className="text-sm text-gray-500">Loading security settings...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enforce Strong Passwords</p>
                  <p className="text-xs text-gray-500">Require complex password rules for all users.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('enforce_strong_passwords')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.enforce_strong_passwords ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.enforce_strong_passwords ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Require Two-Factor Authentication</p>
                  <p className="text-xs text-gray-500">Prompt users for an additional verification step.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('require_two_factor')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.require_two_factor ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.require_two_factor ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Account Lockout</p>
                  <p className="text-xs text-gray-500">Temporarily lock users after repeated failed login attempts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('lockout_enabled')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.lockout_enabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.lockout_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Max Failed Attempts</label>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={settings.max_failed_attempts}
                    onChange={(e) => setSettings((prev) => ({ ...prev, max_failed_attempts: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                  />
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Session Timeout (Minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={1440}
                    value={settings.session_timeout_minutes}
                    onChange={(e) => setSettings((prev) => ({ ...prev, session_timeout_minutes: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                  />
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password Expiry (Days)</label>
                  <input
                    type="number"
                    min={30}
                    max={365}
                    value={settings.password_expiry_days}
                    onChange={(e) => setSettings((prev) => ({ ...prev, password_expiry_days: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Apply strict policies carefully to avoid unintended lockouts during peak operations.
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={loading || saving}
              className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-rose-700 hover:to-orange-700 shadow-lg shadow-rose-200/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => fetchSettings()}
              disabled={loading || saving}
              className="px-5 py-2.5 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Refresh
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
