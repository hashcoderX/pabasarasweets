'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';

interface DashboardSummarySnapshot {
  totalItems: number;
  lowStockItems: number;
  totalSuppliers: number;
  outOfStockItems: number;
  cachedAt: number;
}

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const STOCK_DASHBOARD_CACHE_KEY = 'stock-dashboard-summary-v1';
const STOCK_DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

const stockWidgetItems = [
  { id: 'stock-dashboard-hero-card', name: 'Stock Hero Card' },
  { id: 'stock-dashboard-hero-action-button', name: 'Stock Hero Action Button' },
  { id: 'stock-dashboard-stats-section', name: 'Stock Stats Section' },
  { id: 'stock-dashboard-stat-total-items', name: 'Stock Total Items Card' },
  { id: 'stock-dashboard-stat-low-stock-items', name: 'Stock Low Stock Card' },
  { id: 'stock-dashboard-stat-total-suppliers', name: 'Stock Total Suppliers Card' },
  { id: 'stock-dashboard-stat-out-of-stock-items', name: 'Stock Out Of Stock Card' },
  { id: 'stock-dashboard-quick-actions-card', name: 'Stock Quick Actions Card' },
  { id: 'stock-dashboard-quick-action-inventory', name: 'Stock Quick Action Inventory' },
  { id: 'stock-dashboard-quick-action-suppliers', name: 'Stock Quick Action Suppliers' },
  { id: 'stock-dashboard-quick-action-levels', name: 'Stock Quick Action Levels' },
  { id: 'stock-dashboard-quick-action-reports', name: 'Stock Quick Action Reports' },
  { id: 'stock-dashboard-quick-action-transfers', name: 'Stock Quick Action Transfers' },
  { id: 'stock-dashboard-recent-activity-card', name: 'Stock Recent Activity Card' },
];

const quickActions = [
  {
    key: 'stock-dashboard-quick-action-inventory',
    href: '/dashboard/stock/inventory',
    icon: '📦',
    title: 'View Inventory',
    subtitle: 'Items, pricing, batches',
    className: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
    titleClassName: 'text-orange-900',
    subtitleClassName: 'text-orange-700',
  },
  {
    key: 'stock-dashboard-quick-action-suppliers',
    href: '/dashboard/stock/suppliers',
    icon: '🚚',
    title: 'Manage Suppliers',
    subtitle: 'Partners and sourcing',
    className: 'border-sky-200 bg-sky-50 hover:bg-sky-100',
    titleClassName: 'text-sky-900',
    subtitleClassName: 'text-sky-700',
  },
  {
    key: 'stock-dashboard-quick-action-levels',
    href: '/dashboard/stock/levels',
    icon: '📊',
    title: 'Stock Levels',
    subtitle: 'Monitor thresholds',
    className: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    titleClassName: 'text-emerald-900',
    subtitleClassName: 'text-emerald-700',
  },
  {
    key: 'stock-dashboard-quick-action-reports',
    href: '/dashboard/stock/reports',
    icon: '📈',
    title: 'Reports',
    subtitle: 'Usage and valuation',
    className: 'border-violet-200 bg-violet-50 hover:bg-violet-100',
    titleClassName: 'text-violet-900',
    subtitleClassName: 'text-violet-700',
  },
  {
    key: 'stock-dashboard-quick-action-transfers',
    href: '/dashboard/stock/transfers',
    icon: '🔄',
    title: 'Transfer to Outlets',
    subtitle: 'Internal distribution',
    className: 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100',
    titleClassName: 'text-indigo-900',
    subtitleClassName: 'text-indigo-700',
  },
];

export default function StockManagement() {
  const [token, setToken] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [lowStockItems, setLowStockItems] = useState(0);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [outOfStockItems, setOutOfStockItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);
  const router = useRouter();

  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = stockWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const statCards = useMemo(() => ([
    {
      key: 'stock-dashboard-stat-total-items',
      title: 'Total Items',
      value: totalItems.toLocaleString(),
      icon: '📦',
      tone: 'from-orange-500 to-amber-500',
      panel: 'from-orange-50 to-amber-50 border-orange-200',
    },
    {
      key: 'stock-dashboard-stat-low-stock-items',
      title: 'Low Stock Items',
      value: lowStockItems.toLocaleString(),
      icon: '⚠️',
      tone: 'from-red-500 to-rose-500',
      panel: 'from-red-50 to-rose-50 border-red-200',
    },
    {
      key: 'stock-dashboard-stat-total-suppliers',
      title: 'Total Suppliers',
      value: totalSuppliers.toLocaleString(),
      icon: '🚚',
      tone: 'from-sky-500 to-cyan-500',
      panel: 'from-sky-50 to-cyan-50 border-sky-200',
    },
    {
      key: 'stock-dashboard-stat-out-of-stock-items',
      title: 'Out of Stock',
      value: outOfStockItems.toLocaleString(),
      icon: '❌',
      tone: 'from-slate-500 to-slate-600',
      panel: 'from-slate-50 to-gray-100 border-slate-200',
    },
  ]), [totalItems, lowStockItems, totalSuppliers, outOfStockItems]);

  const readDashboardSummaryCache = (): DashboardSummarySnapshot | null => {
    try {
      const raw = localStorage.getItem(STOCK_DASHBOARD_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<DashboardSummarySnapshot>;
      if (
        typeof parsed.totalItems !== 'number' ||
        typeof parsed.lowStockItems !== 'number' ||
        typeof parsed.totalSuppliers !== 'number' ||
        typeof parsed.outOfStockItems !== 'number' ||
        typeof parsed.cachedAt !== 'number'
      ) {
        return null;
      }
      if (Date.now() - parsed.cachedAt > STOCK_DASHBOARD_CACHE_TTL_MS) {
        return null;
      }
      return parsed as DashboardSummarySnapshot;
    } catch {
      return null;
    }
  };

  const writeDashboardSummaryCache = (snapshot: Omit<DashboardSummarySnapshot, 'cachedAt'>) => {
    const payload: DashboardSummarySnapshot = { ...snapshot, cachedAt: Date.now() };
    localStorage.setItem(STOCK_DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  };

  const applyDashboardSummary = (snapshot: Omit<DashboardSummarySnapshot, 'cachedAt'>) => {
    setTotalItems(snapshot.totalItems);
    setLowStockItems(snapshot.lowStockItems);
    setTotalSuppliers(snapshot.totalSuppliers);
    setOutOfStockItems(snapshot.outOfStockItems);
  };

  const getPaginatedTotal = (responseData: unknown): number => {
    if (!responseData || typeof responseData !== 'object') return 0;
    const paginated = (responseData as { data?: unknown }).data;
    if (!paginated || typeof paginated !== 'object') return 0;
    const total = (paginated as { total?: unknown }).total;
    return typeof total === 'number' ? total : 0;
  };

  const fetchWidgetVisibility = useCallback(async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  }, [token]);

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: isVisible }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) setWidgetVisibility(widgetVisibilitySnapshot);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const openSuperAdminConfirmation = (changes: WidgetVisibilityChange[] = [], mode: SuperAdminModalMode = 'apply') => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setPendingWidgetChanges(changes);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply' || !pendingWidgetChanges.length || !token) return;
    if (!superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put('/api/dashboard/widgets/me', {
          widget_key: change.widget_key,
          is_visible: change.is_visible,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const showRestoreWidgetList = () => {
    const hiddenKeys = stockWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: widgetKey,
        is_visible: true,
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = stockWidgetItems[0]?.id || 'stock-dashboard-hero-card';
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  const fetchDashboardData = useCallback(async () => {
    const cachedSnapshot = readDashboardSummaryCache();
    if (cachedSnapshot) {
      applyDashboardSummary(cachedSnapshot);
      setLoading(false);
    }

    try {
      setLoading(true);
      const requestConfig = {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 20000,
      };

      const [inventoryTotalResponse, inventoryLowStockResponse, inventoryOutOfStockResponse, suppliersResponse] = await Promise.all([
        axios.get('/api/stock/inventory', {
          ...requestConfig,
          params: { per_page: 1 },
        }),
        axios.get('/api/stock/inventory', {
          ...requestConfig,
          params: { per_page: 1, low_stock: 'true' },
        }),
        axios.get('/api/stock/inventory', {
          ...requestConfig,
          params: { per_page: 1, out_of_stock: 'true' },
        }),
        axios.get('/api/stock/suppliers', {
          ...requestConfig,
          params: { per_page: 1 },
        }),
      ]);

      const nextSnapshot = {
        totalItems: getPaginatedTotal(inventoryTotalResponse.data),
        lowStockItems: getPaginatedTotal(inventoryLowStockResponse.data),
        totalSuppliers: getPaginatedTotal(suppliersResponse.data),
        outOfStockItems: getPaginatedTotal(inventoryOutOfStockResponse.data),
      };

      applyDashboardSummary(nextSnapshot);
      writeDashboardSummaryCache(nextSnapshot);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (!cachedSnapshot) {
        applyDashboardSummary({
          totalItems: 0,
          lowStockItems: 0,
          totalSuppliers: 0,
          outOfStockItems: 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDashboardData();
      fetchWidgetVisibility(token);
    }
  }, [token, fetchDashboardData, fetchWidgetVisibility]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-28 right-10 w-80 h-80 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-16 left-1/3 w-80 h-80 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <div className="relative z-10 space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Widget Controls</h3>
              <p className="text-xs text-slate-500">Hide widgets, fix controls, restore hidden widgets, and unlock controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')} disabled={widgetControlsLocked || pendingWidgetChanges.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Fix Widgets</button>
              <button type="button" onClick={showRestoreWidgetList} disabled={hiddenWidgetCount === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Restore Widgets ({hiddenWidgetCount})</button>
              <button type="button" onClick={openUnlockWidgetsAfterFix} disabled={!widgetControlsLocked} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60">Unlock Widgets</button>
            </div>
          </div>
        </section>

        {isWidgetVisible('stock-dashboard-hero-card') && <section className="rounded-3xl border border-white/60 bg-white/75 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Warehouse Intelligence
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900">Stock Management Dashboard</h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                Track inventory health, supplier coverage, and stock risks with one operational cockpit.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isWidgetVisible('stock-dashboard-hero-action-button') && <Link
                href="/dashboard/stock/inventory"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/70 hover:from-orange-600 hover:to-amber-600 transition"
              >
                <span>Open Inventory</span>
                <span>→</span>
              </Link>}
              {!widgetControlsLocked && isWidgetVisible('stock-dashboard-hero-action-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('stock-dashboard-hero-action-button', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
            </div>
          </div>
          {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('stock-dashboard-hero-card', false)} className="mt-4 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
        </section>}

        {isWidgetVisible('stock-dashboard-stats-section') && <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.filter((stat) => isWidgetVisible(stat.key)).map((stat) => (
            <article key={stat.key} className={`relative rounded-2xl border bg-gradient-to-br ${stat.panel} p-5 shadow-md hover:shadow-lg transition`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600">{stat.title}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${stat.tone} text-white flex items-center justify-center text-lg shadow`}>
                  {stat.icon}
                </div>
              </div>
              {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange(stat.key, false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
            </article>
          ))}
          {!widgetControlsLocked && <div className="sm:col-span-2 xl:col-span-4">
            <button type="button" onClick={() => stageWidgetVisibilityChange('stock-dashboard-stats-section', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>
          </div>}
        </section>}

        {isWidgetVisible('stock-dashboard-quick-actions-card') && <section className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Quick Actions</h3>
              <p className="text-sm text-slate-600 mt-1">Jump directly into day-to-day stock operations.</p>
            </div>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('stock-dashboard-quick-actions-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {quickActions.filter((action) => isWidgetVisible(action.key)).map((action) => (
              <div key={action.key} className="relative">
                <Link href={action.href} className={`group block rounded-xl border p-4 transition ${action.className}`}>
                  <div className="text-2xl">{action.icon}</div>
                  <div className={`mt-2 text-sm font-semibold ${action.titleClassName}`}>{action.title}</div>
                  <div className={`text-xs mt-1 ${action.subtitleClassName}`}>{action.subtitle}</div>
                </Link>
                {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange(action.key, false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
              </div>
            ))}
          </div>
        </section>}

        {isWidgetVisible('stock-dashboard-recent-activity-card') && <section className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-semibold text-slate-900">Recent Activity</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Coming Soon</span>
              {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('stock-dashboard-recent-activity-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-sm text-slate-500">Recent stock activities will appear here once event tracking is enabled.</p>
          </div>
        </section>}
      </div>

      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{stockWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
