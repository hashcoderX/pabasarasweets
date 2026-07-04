'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type BackupSettings = {
  auto_backup_enabled: boolean;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
  retention_days: number;
  include_uploaded_files: boolean;
  encryption_enabled: boolean;
  cloud_sync_enabled: boolean;
};

const defaultSettings: BackupSettings = {
  auto_backup_enabled: true,
  backup_frequency: 'daily',
  retention_days: 30,
  include_uploaded_files: true,
  encryption_enabled: true,
  cloud_sync_enabled: false,
};

export default function BackupRestoreSettingsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BackupSettings>(defaultSettings);

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
        console.error('Error loading backup settings access:', error);
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
      const res = await axios.get('/api/backup-settings', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      setSettings({
        auto_backup_enabled: Boolean(res.data?.auto_backup_enabled),
        backup_frequency: (res.data?.backup_frequency || 'daily') as BackupSettings['backup_frequency'],
        retention_days: Number(res.data?.retention_days || 30),
        include_uploaded_files: Boolean(res.data?.include_uploaded_files),
        encryption_enabled: Boolean(res.data?.encryption_enabled),
        cloud_sync_enabled: Boolean(res.data?.cloud_sync_enabled),
      });
    } catch (error) {
      console.error('Error fetching backup settings:', error);
      alert('Failed to load backup settings.');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await axios.put('/api/backup-settings', settings, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Backup settings saved successfully.');
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to save backup settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'auto_backup_enabled' | 'include_uploaded_files' | 'encryption_enabled' | 'cloud_sync_enabled') => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const readinessScore = [
    settings.auto_backup_enabled,
    settings.include_uploaded_files,
    settings.encryption_enabled,
    settings.cloud_sync_enabled,
    settings.retention_days >= 30,
  ].filter(Boolean).length;

  const readinessPercent = Math.round((readinessScore / 5) * 100);

  const backupFrequencyLabel = {
    daily: 'Daily Snapshot',
    weekly: 'Weekly Rollup',
    monthly: 'Monthly Archive',
  }[settings.backup_frequency];

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-emerald-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-12 -left-16 w-72 h-72 bg-cyan-200/60 rounded-full blur-3xl"></div>
        <div className="absolute top-24 right-0 w-80 h-80 bg-emerald-200/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-teal-200/50 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Backup &amp; Restore</h1>
              <p className="text-xs text-gray-500">Configure policy, resilience, and restore readiness for business continuity.</p>
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Disaster Recovery Command Center</h2>
              <p className="text-sm text-gray-600 mt-1">Fine-tune automated backups and keep recovery posture consistently healthy.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 border border-cyan-200">
                {backupFrequencyLabel}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                Retention {settings.retention_days} Days
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-700 font-semibold">Readiness Score</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{readinessPercent}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-cyan-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500" style={{ width: `${readinessPercent}%` }}></div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Primary Mode</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{settings.auto_backup_enabled ? 'Automated' : 'Manual'}</p>
              <p className="text-xs text-gray-600 mt-1">{settings.auto_backup_enabled ? 'Backups run by schedule.' : 'Backups require manual operation.'}</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">Storage Security</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{settings.encryption_enabled ? 'Encrypted' : 'Unencrypted'}</p>
              <p className="text-xs text-gray-600 mt-1">{settings.cloud_sync_enabled ? 'Cloud replication enabled.' : 'Local-only backup storage.'}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Backup Policy</h3>
          <p className="text-sm text-gray-600 mb-4">Set cadence, retention, and protection controls for reliable restore operations.</p>

          {loading ? (
            <div className="text-sm text-gray-500">Loading backup settings...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Automatic Backups</p>
                  <p className="text-xs text-gray-500">Run scheduled backups without manual action.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('auto_backup_enabled')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.auto_backup_enabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.auto_backup_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Backup Frequency</label>
                  <select
                    value={settings.backup_frequency}
                    onChange={(e) => setSettings((prev) => ({ ...prev, backup_frequency: e.target.value as BackupSettings['backup_frequency'] }))}
                    className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Retention (Days)</label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={settings.retention_days}
                    onChange={(e) => setSettings((prev) => ({ ...prev, retention_days: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Include Uploaded Files</p>
                  <p className="text-xs text-gray-500">Include documents and media files in each backup.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('include_uploaded_files')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.include_uploaded_files ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.include_uploaded_files ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Backup Encryption</p>
                  <p className="text-xs text-gray-500">Encrypt backup artifacts before storage.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('encryption_enabled')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.encryption_enabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.encryption_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Cloud Sync</p>
                  <p className="text-xs text-gray-500">Replicate backups to cloud storage for disaster recovery.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle('cloud_sync_enabled')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${settings.cloud_sync_enabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}
                >
                  {settings.cloud_sync_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Restore operations should be performed only during approved maintenance windows.
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={loading || saving}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-200/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
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
