'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type CompanyRow = {
  id: number;
  name: string;
  logo_path?: string | null;
  logo_url?: string | null;
  updated_at?: string;
};

const toSafeStorageUrl = (value: string, apiBase: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const baseOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : apiBase || '';

  if (raw.startsWith('/storage/')) {
    return `${baseOrigin}${raw}`;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/storage/')) {
        return `${baseOrigin}${parsed.pathname}${parsed.search || ''}`;
      }
    } catch {
      return raw;
    }
  }

  return raw;
};

export default function SystemSettingsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoLoadError, setLogoLoadError] = useState(false);

  const API_BASE = '';

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

        await fetchSystemSetting(token);
        await fetchCompanyLogo(token);
      } catch (error) {
        console.error('Error loading system settings access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    bootstrap();
  }, [token, router]);

  const fetchSystemSetting = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      const res = await axios.get('/api/system-settings', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      setSystemEnabled(Boolean(res?.data?.system_enabled));
    } catch (error) {
      console.error('Error fetching system settings:', error);
      alert('Failed to load system settings.');
    } finally {
      setLoading(false);
    }
  };

  const buildLogoUrl = (company: CompanyRow): string => {
    const rawUrl = String(company.logo_url || '').trim();
    const logoPath = String(company.logo_path || '').trim();
    const cacheSuffix = company.updated_at ? `?v=${encodeURIComponent(company.updated_at)}` : '';

    if (rawUrl) {
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return `${toSafeStorageUrl(rawUrl, API_BASE)}${cacheSuffix}`;
      }

      if (rawUrl.startsWith('/')) {
        return `${toSafeStorageUrl(`${API_BASE}${rawUrl}`, API_BASE)}${cacheSuffix}`;
      }

      return `${toSafeStorageUrl(`${API_BASE}/${rawUrl}`, API_BASE)}${cacheSuffix}`;
    }

    if (logoPath) {
      const normalized = logoPath.replace(/^\/+/, '');
      return `${toSafeStorageUrl(`${API_BASE}/storage/${normalized}`, API_BASE)}${cacheSuffix}`;
    }

    return '';
  };

  const fetchCompanyLogo = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLogoLoading(true);
      setLogoLoadError(false);
      const res = await axios.get(`${API_BASE}/api/companies`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      const companies: CompanyRow[] = Array.isArray(res.data) ? res.data : [];
      const company = companies[0];

      if (!company) {
        setCompanyName('');
        setCompanyLogoUrl('');
        return;
      }

      setCompanyName(company.name || '');
      setCompanyLogoUrl(buildLogoUrl(company));
    } catch (error) {
      console.error('Error fetching company logo:', error);
      setCompanyLogoUrl('');
      setCompanyName('');
    } finally {
      setLogoLoading(false);
    }
  };

  const saveSystemSetting = async () => {
    try {
      setSaving(true);
      await axios.put(
        '/api/system-settings',
        { system_enabled: systemEnabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(systemEnabled ? 'System enabled successfully.' : 'System disabled. Employee login is now restricted.');
    } catch (error: any) {
      console.error('Error updating system setting:', error);
      alert(error?.response?.data?.message || 'Failed to update system setting.');
    } finally {
      setSaving(false);
    }
  };

  const uptimeMode = systemEnabled ? 'Live' : 'Maintenance';
  const accessHealth = systemEnabled ? 100 : 35;
  const accessHealthLabel = systemEnabled ? 'Healthy' : 'Restricted';

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-10 -left-16 w-72 h-72 bg-emerald-200/60 rounded-full blur-3xl"></div>
        <div className="absolute top-24 right-0 w-80 h-80 bg-teal-200/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-200/50 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">System Settings</h1>
              <p className="text-xs text-gray-500">Control global system access and platform operating mode.</p>
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">System Operations Center</h2>
              <p className="text-sm text-gray-600 mt-1">Toggle platform accessibility and supervise login posture in real time.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                Mode: {uptimeMode}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 border border-cyan-200">
                Access: {accessHealthLabel}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Platform Status</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{systemEnabled ? 'Online' : 'Limited'}</p>
              <p className="text-xs text-gray-600 mt-1">{systemEnabled ? 'All employee logins are enabled.' : 'Non-admin employee login is blocked.'}</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">Access Health</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{accessHealth}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-teal-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500" style={{ width: `${accessHealth}%` }}></div>
              </div>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-700 font-semibold">Admin Override</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">Always On</p>
              <p className="text-xs text-gray-600 mt-1">Admins retain secure access during restricted mode.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">System Access Control</h3>
          <p className="text-sm text-gray-600 mb-4">
            Use this switch to control whether employees can log in. Admin users can still log in when disabled.
          </p>

          {loading ? (
            <div className="text-sm text-gray-500">Loading current setting...</div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">System Status</p>
                <p className="text-xs text-gray-500 mt-1">
                  {systemEnabled
                    ? 'System is enabled. Employees can log in.'
                    : 'System is disabled. Employee login is blocked.'}
                </p>
              </div>

              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemEnabled}
                  onChange={(e) => setSystemEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-12 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-600 transition-colors duration-200 shadow-inner">
                  <span className="absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-6"></span>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {systemEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={saveSystemSetting}
              disabled={loading || saving}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-200/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => fetchSystemSetting()}
              disabled={loading || saving}
              className="px-5 py-2.5 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Refresh
            </button>
          </div>

          {!systemEnabled && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Employee login is currently restricted. Only admin-level users can sign in.
            </div>
          )}
        </section>
      </main>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Company Logo</h3>
          <p className="text-sm text-gray-600 mb-4">This logo is loaded from Company Settings and used for branding across the system.</p>

          {logoLoading ? (
            <div className="text-sm text-gray-500">Loading logo...</div>
          ) : companyLogoUrl && !logoLoadError ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-20 w-44 rounded-xl border border-gray-200 bg-white p-2 flex items-center justify-center overflow-hidden">
                <img
                  src={companyLogoUrl}
                  alt={`${companyName || 'Company'} logo`}
                  className="max-h-full max-w-full object-contain"
                  onError={() => setLogoLoadError(true)}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{companyName || 'Company'}</p>
                <p className="text-xs text-gray-500 mt-1 break-all">{companyLogoUrl}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Logo not available or failed to load. Please verify logo upload in Company Settings.
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => fetchCompanyLogo()}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reload Logo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
