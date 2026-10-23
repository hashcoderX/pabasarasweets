'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';

interface LoadItem {
  id: number;
  load_id: number;
  product_code: string;
  name: string;
  type: string;
  qty: number;
  sell_price: number;
}

interface DistributionInvoiceItem {
  item_code?: string;
  quantity?: number;
}

interface DistributionInvoiceRecord {
  items?: DistributionInvoiceItem[];
}

interface VehicleRecord {
  status?: string;
  capacity_kg?: number | string | null;
}

interface RouteRecord {
  id: number;
}

interface EmployeeRecord {
  designation?: {
    name?: string;
  };
}

interface PersonReference {
  name?: string;
  first_name?: string;
  last_name?: string;
}

interface LoadRecord {
  id: number;
  load_number?: string;
  status?: string;
  created_at?: string;
  vehicle?: {
    registration_number?: string;
  };
  route?: {
    destination?: string;
  };
  driver?: PersonReference | null;
  sales_ref?: PersonReference | null;
  salesRef?: PersonReference | null;
}

interface VehicleLoadingDashboardSnapshot {
  activeLoads: number;
  totalVehicles: number;
  availableVehicles: number;
  totalDrivers: number;
  activeRoutes: number;
  pendingLoads: number;
  completedLoads: number;
  totalCapacity: number;
  recentLoads: LoadRecord[];
  cachedAt: number;
}

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const VEHICLE_LOADING_DASHBOARD_CACHE_KEY = 'vehicle-loading-dashboard-summary-v1';
const VEHICLE_LOADING_DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

const vehicleLoadingWidgetItems = [
  { id: 'vehicle-loading-hero-card', name: 'Vehicle Loading Hero Card' },
  { id: 'vehicle-loading-stats-grid', name: 'Vehicle Loading Stats Grid' },
  { id: 'vehicle-loading-stat-active-loads', name: 'Vehicle Loading Active Loads Card' },
  { id: 'vehicle-loading-stat-total-vehicles', name: 'Vehicle Loading Total Vehicles Card' },
  { id: 'vehicle-loading-stat-total-drivers', name: 'Vehicle Loading Total Drivers Card' },
  { id: 'vehicle-loading-stat-active-routes', name: 'Vehicle Loading Active Routes Card' },
  { id: 'vehicle-loading-stat-pending-loads', name: 'Vehicle Loading Pending Loads Card' },
  { id: 'vehicle-loading-stat-completed-loads', name: 'Vehicle Loading Completed Loads Card' },
  { id: 'vehicle-loading-stat-total-capacity', name: 'Vehicle Loading Total Capacity Card' },
  { id: 'vehicle-loading-stat-efficiency-rate', name: 'Vehicle Loading Efficiency Rate Card' },
  { id: 'vehicle-loading-quick-actions-card', name: 'Vehicle Loading Quick Actions Card' },
  { id: 'vehicle-loading-quick-action-create-load', name: 'Vehicle Loading Create Load Button' },
  { id: 'vehicle-loading-quick-action-add-vehicle', name: 'Vehicle Loading Add Vehicle Button' },
  { id: 'vehicle-loading-quick-action-add-driver', name: 'Vehicle Loading Add Driver Button' },
  { id: 'vehicle-loading-quick-action-plan-route', name: 'Vehicle Loading Plan Route Button' },
  { id: 'vehicle-loading-recent-activity-card', name: 'Vehicle Loading Recent Activity Card' },
  { id: 'vehicle-loading-recent-activity-row-button', name: 'Vehicle Loading Recent Activity Row Button' },
  { id: 'vehicle-loading-load-items-modal-pane', name: 'Vehicle Loading Load Items Modal Pane' },
  { id: 'vehicle-loading-load-items-modal-close-button', name: 'Vehicle Loading Load Items Modal Close Button' },
  { id: 'vehicle-loading-load-items-modal-table-headings', name: 'Vehicle Loading Load Items Modal Table Headings' },
];

export default function VehicleLoading() {
  const [token, setToken] = useState('');
  const [activeLoads, setActiveLoads] = useState(0);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [availableVehicles, setAvailableVehicles] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [activeRoutes, setActiveRoutes] = useState(0);
  const [pendingLoads, setPendingLoads] = useState(0);
  const [completedLoads, setCompletedLoads] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentLoads, setRecentLoads] = useState<LoadRecord[]>([]);
  const [showLoadItemsModal, setShowLoadItemsModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<LoadRecord | null>(null);
  const [selectedLoadItems, setSelectedLoadItems] = useState<LoadItem[]>([]);
  const [soldQtyByCode, setSoldQtyByCode] = useState<Record<string, number>>({});
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
  const hiddenWidgetCount = vehicleLoadingWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const applyDashboardSnapshot = (snapshot: Omit<VehicleLoadingDashboardSnapshot, 'cachedAt'>) => {
    setActiveLoads(snapshot.activeLoads);
    setTotalVehicles(snapshot.totalVehicles);
    setAvailableVehicles(snapshot.availableVehicles);
    setTotalDrivers(snapshot.totalDrivers);
    setActiveRoutes(snapshot.activeRoutes);
    setPendingLoads(snapshot.pendingLoads);
    setCompletedLoads(snapshot.completedLoads);
    setTotalCapacity(snapshot.totalCapacity);
    setRecentLoads(snapshot.recentLoads);
  };

  const readDashboardSnapshot = (): VehicleLoadingDashboardSnapshot | null => {
    try {
      const raw = localStorage.getItem(VEHICLE_LOADING_DASHBOARD_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<VehicleLoadingDashboardSnapshot>;
      if (
        typeof parsed.activeLoads !== 'number' ||
        typeof parsed.totalVehicles !== 'number' ||
        typeof parsed.availableVehicles !== 'number' ||
        typeof parsed.totalDrivers !== 'number' ||
        typeof parsed.activeRoutes !== 'number' ||
        typeof parsed.pendingLoads !== 'number' ||
        typeof parsed.completedLoads !== 'number' ||
        typeof parsed.totalCapacity !== 'number' ||
        !Array.isArray(parsed.recentLoads) ||
        typeof parsed.cachedAt !== 'number'
      ) {
        return null;
      }
      if (Date.now() - parsed.cachedAt > VEHICLE_LOADING_DASHBOARD_CACHE_TTL_MS) {
        return null;
      }
      return parsed as VehicleLoadingDashboardSnapshot;
    } catch {
      return null;
    }
  };

  const writeDashboardSnapshot = (snapshot: Omit<VehicleLoadingDashboardSnapshot, 'cachedAt'>) => {
    const payload: VehicleLoadingDashboardSnapshot = { ...snapshot, cachedAt: Date.now() };
    localStorage.setItem(VEHICLE_LOADING_DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  };

  const stats = useMemo(() => ([
    {
      key: 'vehicle-loading-stat-active-loads',
      name: 'Active Loads',
      value: activeLoads,
      icon: '📦',
      color: 'bg-blue-500',
      description: 'Currently in transit',
    },
    {
      key: 'vehicle-loading-stat-total-vehicles',
      name: 'Total Vehicles',
      value: totalVehicles,
      icon: '🚛',
      color: 'bg-green-500',
      description: `${availableVehicles} available`,
    },
    {
      key: 'vehicle-loading-stat-total-drivers',
      name: 'Total Drivers',
      value: totalDrivers,
      icon: '👨‍🚗',
      color: 'bg-yellow-500',
      description: 'Active drivers',
    },
    {
      key: 'vehicle-loading-stat-active-routes',
      name: 'Active Routes',
      value: activeRoutes,
      icon: '🗺️',
      color: 'bg-purple-500',
      description: 'Routes in operation',
    },
    {
      key: 'vehicle-loading-stat-pending-loads',
      name: 'Pending Loads',
      value: pendingLoads,
      icon: '⏳',
      color: 'bg-orange-500',
      description: 'Awaiting dispatch',
    },
    {
      key: 'vehicle-loading-stat-completed-loads',
      name: 'Completed Loads',
      value: completedLoads,
      icon: '✅',
      color: 'bg-indigo-500',
      description: 'This month',
    },
    {
      key: 'vehicle-loading-stat-total-capacity',
      name: 'Total Capacity',
      value: `${totalCapacity}t`,
      icon: '⚖️',
      color: 'bg-red-500',
      description: 'Maximum load capacity',
    },
    {
      key: 'vehicle-loading-stat-efficiency-rate',
      name: 'Efficiency Rate',
      value: '94%',
      icon: '📈',
      color: 'bg-teal-500',
      description: 'On-time delivery',
    },
  ]), [activeLoads, totalVehicles, availableVehicles, totalDrivers, activeRoutes, pendingLoads, completedLoads, totalCapacity]);

  const fetchWidgetVisibility = async (authToken?: string) => {
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
  };

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
    const hiddenKeys = vehicleLoadingWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
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
    const fallbackWidgetKey = vehicleLoadingWidgetItems[0]?.id || 'vehicle-loading-hero-card';
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

  const fetchDashboardData = async () => {
    const cachedSnapshot = readDashboardSnapshot();
    if (cachedSnapshot) {
      applyDashboardSnapshot(cachedSnapshot);
      setLoading(false);
    }

    try {
      if (!cachedSnapshot) setLoading(true);
      const requestConfig = {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 20000,
      };

      const [vehiclesResult, loadsResult, routesResult, employeesResult] = await Promise.allSettled([
        axios.get('/api/vehicle-loading/vehicles', requestConfig),
        axios.get('/api/vehicle-loading/loads', requestConfig),
        axios.get('/api/vehicle-loading/routes', requestConfig),
        axios.get('/api/hr/employees', requestConfig),
      ]);

      const vehicles: VehicleRecord[] = vehiclesResult.status === 'fulfilled' && Array.isArray(vehiclesResult.value.data)
        ? vehiclesResult.value.data
        : [];

      const loads: LoadRecord[] = loadsResult.status === 'fulfilled' && Array.isArray(loadsResult.value.data)
        ? loadsResult.value.data
        : [];

      const routes: RouteRecord[] = routesResult.status === 'fulfilled' && Array.isArray(routesResult.value.data)
        ? routesResult.value.data
        : [];

      const employeePayload = employeesResult.status === 'fulfilled'
        ? (employeesResult.value.data?.data || employeesResult.value.data)
        : [];
      const employees: EmployeeRecord[] = Array.isArray(employeePayload) ? employeePayload : [];

      const nextSnapshot = {
        totalVehicles: vehicles.length,
        availableVehicles: vehicles.filter((vehicle) => vehicle.status === 'active').length,
        totalCapacity: vehicles.reduce((sum, vehicle) => sum + Number(vehicle.capacity_kg || 0), 0),
        activeLoads: loads.filter((load) => load.status === 'in_transit').length,
        pendingLoads: loads.filter((load) => load.status === 'pending').length,
        completedLoads: loads.filter((load) => load.status === 'delivered').length,
        activeRoutes: routes.length,
        totalDrivers: employees.filter((employee) => employee.designation?.name === 'Driver').length,
        recentLoads: [...loads]
          .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
          .slice(0, 5),
      };

      applyDashboardSnapshot(nextSnapshot);
      writeDashboardSnapshot(nextSnapshot);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (!cachedSnapshot) {
        applyDashboardSnapshot({
          activeLoads: 0,
          totalVehicles: 0,
          availableVehicles: 0,
          totalDrivers: 0,
          activeRoutes: 0,
          pendingLoads: 0,
          completedLoads: 0,
          totalCapacity: 0,
          recentLoads: [],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewLoadItems = async (load: LoadRecord) => {
    try {
      setShowLoadItemsModal(true);
      setModalLoading(true);
      setSelectedLoad(load);
      setSelectedLoadItems([]);
      setSoldQtyByCode({});

      const [itemsResponse, invoicesResponse] = await Promise.all([
        axios.get('/api/vehicle-loading/load-items', {
          headers: { Authorization: `Bearer ${token}` },
          params: { load_id: load.id },
        }),
        axios.get('/api/distribution/invoices', {
          headers: { Authorization: `Bearer ${token}` },
          params: { load_id: load.id, per_page: 1000 },
        }).catch(() => null),
      ]);

      const items: LoadItem[] = Array.isArray(itemsResponse.data) ? itemsResponse.data : [];
      setSelectedLoadItems(items);

      const soldByCode: Record<string, number> = {};
      const invoiceRows: DistributionInvoiceRecord[] = invoicesResponse?.data?.data?.data || [];
      invoiceRows.forEach((invoice) => {
        const invoiceItems = Array.isArray(invoice?.items) ? invoice.items : [];
        invoiceItems.forEach((line) => {
          const code = String(line?.item_code || '').trim();
          if (!code) return;
          soldByCode[code] = Number(soldByCode[code] || 0) + Number(line?.quantity || 0);
        });
      });
      setSoldQtyByCode(soldByCode);
    } catch (error) {
      console.error('Error fetching load items:', error);
      setSelectedLoadItems([]);
      setSoldQtyByCode({});
    } finally {
      setModalLoading(false);
    }
  };

  const totalSelectedQty = selectedLoadItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  const closeLoadItemsModal = () => {
    setShowLoadItemsModal(false);
    setSelectedLoad(null);
    setSelectedLoadItems([]);
    setSoldQtyByCode({});
  };

  const getPersonName = (person: PersonReference | null | undefined) => {
    if (!person) return '-';
    return person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || '-';
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchDashboardData();
      fetchWidgetVisibility(token);
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
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

      {isWidgetVisible('vehicle-loading-hero-card') && <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Vehicle Loading Dashboard</h1>
        <p className="text-gray-600">Manage your fleet, loads, and logistics operations</p>
        {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-hero-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </div>}

      {isWidgetVisible('vehicle-loading-stats-grid') && <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.filter((stat) => isWidgetVisible(stat.key)).map((stat) => (
          <div key={stat.key} className="relative rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-center">
              <div className={`rounded-lg p-3 ${stat.color}`}>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.description}</p>
              </div>
            </div>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange(stat.key, false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>
        ))}
        {!widgetControlsLocked && <div className="md:col-span-2 lg:col-span-4"><button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-stats-grid', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </div>}

      {isWidgetVisible('vehicle-loading-quick-actions-card') && <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isWidgetVisible('vehicle-loading-quick-action-create-load') && <div className="relative">
            <Link href="/dashboard/vehicle-loading/loads" className="flex items-center rounded-lg bg-green-50 p-4 transition-colors hover:bg-green-100"><span className="mr-3 text-2xl">📦</span><div><p className="font-medium text-gray-900">Create New Load</p><p className="text-sm text-gray-600">Schedule a new delivery</p></div></Link>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-quick-action-create-load', false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>}
          {isWidgetVisible('vehicle-loading-quick-action-add-vehicle') && <div className="relative">
            <Link href="/dashboard/vehicle-loading/vehicles" className="flex items-center rounded-lg bg-blue-50 p-4 transition-colors hover:bg-blue-100"><span className="mr-3 text-2xl">🚛</span><div><p className="font-medium text-gray-900">Add Vehicle</p><p className="text-sm text-gray-600">Register new vehicle</p></div></Link>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-quick-action-add-vehicle', false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>}
          {isWidgetVisible('vehicle-loading-quick-action-add-driver') && <div className="relative">
            <Link href="/dashboard/vehicle-loading/drivers" className="flex items-center rounded-lg bg-yellow-50 p-4 transition-colors hover:bg-yellow-100"><span className="mr-3 text-2xl">👨‍🚗</span><div><p className="font-medium text-gray-900">Add Driver</p><p className="text-sm text-gray-600">Register new driver</p></div></Link>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-quick-action-add-driver', false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>}
          {isWidgetVisible('vehicle-loading-quick-action-plan-route') && <div className="relative">
            <Link href="/dashboard/vehicle-loading/routes" className="flex items-center rounded-lg bg-purple-50 p-4 transition-colors hover:bg-purple-100"><span className="mr-3 text-2xl">🗺️</span><div><p className="font-medium text-gray-900">Plan Route</p><p className="text-sm text-gray-600">Create delivery route</p></div></Link>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-quick-action-plan-route', false)} className="absolute right-2 top-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>}
        </div>
        {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-quick-actions-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </div>}

      {isWidgetVisible('vehicle-loading-recent-activity-card') && <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Recent Activity</h2>
        <div className="space-y-4">
          {recentLoads.length === 0 ? (
            <div className="py-8 text-center">
              <span className="text-4xl">📦</span>
              <p className="mt-2 text-gray-500">No recent loads</p>
            </div>
          ) : (
            recentLoads.map((load) => {
              const row = <>
                <span className="mr-3 text-xl">{load.status === 'in_transit' ? '🚛' : load.status === 'delivered' ? '✅' : load.status === 'pending' ? '⏳' : '📦'}</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Load #{load.load_number}</p>
                  <p className="text-sm text-gray-600">
                    {load.vehicle?.registration_number || 'Unknown vehicle'} • {load.route?.destination || 'Unknown destination'} • {new Date(load.created_at || '').toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Click to view item-wise available quantity in vehicle</p>
                </div>
                <span className={`text-sm font-medium ${load.status === 'in_transit' ? 'text-green-600' : load.status === 'delivered' ? 'text-blue-600' : load.status === 'pending' ? 'text-orange-600' : 'text-gray-600'}`}>
                  {load.status === 'in_transit' ? 'In Transit' : load.status === 'delivered' ? 'Completed' : load.status === 'pending' ? 'Pending' : load.status}
                </span>
              </>;
              return isWidgetVisible('vehicle-loading-recent-activity-row-button')
                ? <button key={load.id} type="button" onClick={() => handleViewLoadItems(load)} className="flex w-full items-center rounded-lg bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100">{row}</button>
                : <div key={load.id} className="flex w-full items-center rounded-lg bg-gray-50 p-4 text-left">{row}</div>;
            })
          )}
        </div>
        {!widgetControlsLocked && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-recent-activity-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>
          {isWidgetVisible('vehicle-loading-recent-activity-row-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-recent-activity-row-button', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
        </div>}
      </div>}

      {isWidgetVisible('vehicle-loading-load-items-modal-pane') && showLoadItemsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Vehicle Load Item Availability</h3>
              <div className="flex items-center gap-2">
                {isWidgetVisible('vehicle-loading-load-items-modal-close-button') && <button type="button" onClick={closeLoadItemsModal} className="text-gray-500 hover:text-gray-700">✕</button>}
                {!widgetControlsLocked && isWidgetVisible('vehicle-loading-load-items-modal-close-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-load-items-modal-close-button', false)} className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
                {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-load-items-modal-pane', false)} className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
              </div>
            </div>

            <div className="space-y-4 p-6">
              {selectedLoad && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Load Number</p><p className="text-sm font-semibold text-gray-900">{selectedLoad.load_number}</p></div>
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Vehicle</p><p className="text-sm font-semibold text-gray-900">{selectedLoad.vehicle?.registration_number || '-'}</p></div>
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Status</p><p className="text-sm font-semibold text-gray-900">{(selectedLoad.status || '-').replace('_', ' ')}</p></div>
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Driver</p><p className="text-sm font-semibold text-gray-900">{getPersonName(selectedLoad.driver)}</p></div>
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Sales Ref</p><p className="text-sm font-semibold text-gray-900">{getPersonName(selectedLoad.sales_ref || selectedLoad.salesRef)}</p></div>
                  <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Total Qty</p><p className="text-sm font-semibold text-gray-900">{totalSelectedQty.toFixed(2)}</p></div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  {isWidgetVisible('vehicle-loading-load-items-modal-table-headings') && <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Product Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Item Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Loaded Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Sold Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Available Qty In Vehicle</th>
                    </tr>
                  </thead>}
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {modalLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">Loading item list...</td>
                      </tr>
                    ) : selectedLoadItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No items available for this vehicle load.</td>
                      </tr>
                    ) : (
                      selectedLoadItems.map((item) => {
                        const code = String(item.product_code || '').trim();
                        const availableQty = Number(item.qty || 0);
                        const soldQty = Number(soldQtyByCode[code] || 0);
                        const loadedQtyBefore = availableQty + soldQty;

                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2 text-sm text-gray-700">{item.product_code}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{item.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{item.type.replace('_', ' ')}</td>
                            <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">{loadedQtyBefore.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">{soldQty.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">{availableQty.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {!widgetControlsLocked && isWidgetVisible('vehicle-loading-load-items-modal-table-headings') && <button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-load-items-modal-table-headings', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
            </div>
          </div>
        </div>
      )}

      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{vehicleLoadingWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
