'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';
import { clearOfflineSession, readOfflineSession } from '@/lib/offlineSession';
import { syncDistributionOfflineQueues } from '@/lib/distributionSync';

type DashboardModule = {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  path?: string;
  comingSoon?: boolean;
  adminOnly?: boolean;
  accessKeywords: string[];
  description?: string;
};

type SalesTargetPreview = {
  id: number;
  period_key?: string;
  target_amount?: number | string;
  achieved_amount?: number | string;
  target_quantity?: number | string;
  achieved_quantity?: number | string;
};

type DashboardAccessCache = {
  savedAt: number;
  userRoles: string[];
  userPermissions: string[];
  isAdminUser: boolean;
  isSalesRefUser: boolean;
  userDisplayName?: string;
  userDisplayId?: string;
  widgetVisibility: Record<string, boolean>;
  widgetControlsLocked: boolean;
};

type SalesTargetCache = {
  savedAt: number;
  rows: SalesTargetPreview[];
};

type CompanyRow = {
  id?: number;
  name?: string;
};

type WidgetVisibilityChange = {
  widget_key: string;
  is_visible: boolean;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';

type NetworkStrength = 'critical' | 'normal' | 'good';

type BrowserConnectionInfo = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type UiAlertModalState = {
  open: boolean;
  title: string;
  message: string;
};

const backgroundParticles = [
  { left: '6%', top: '14%', size: 10, delay: '0s', duration: '10s' },
  { left: '18%', top: '72%', size: 8, delay: '1.5s', duration: '11s' },
  { left: '31%', top: '24%', size: 7, delay: '0.8s', duration: '9s' },
  { left: '42%', top: '82%', size: 9, delay: '2.2s', duration: '12s' },
  { left: '55%', top: '18%', size: 6, delay: '1.1s', duration: '9.5s' },
  { left: '66%', top: '68%', size: 10, delay: '0.2s', duration: '13s' },
  { left: '74%', top: '30%', size: 8, delay: '2.8s', duration: '10.5s' },
  { left: '83%', top: '78%', size: 7, delay: '1.9s', duration: '11.5s' },
  { left: '90%', top: '20%', size: 9, delay: '0.6s', duration: '12.5s' },
];

const DASHBOARD_RECENT_ROUTES_KEY = 'dashboard_recent_routes_v1';
const DASHBOARD_RECENT_ROUTES_MAX = 8;
const DASHBOARD_ACCESS_CACHE_PREFIX = 'dashboard_access_cache_';
const DASHBOARD_ACCESS_CACHE_MAX_ROLES = 40;
const DASHBOARD_ACCESS_CACHE_MAX_PERMISSIONS = 220;
const SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY = 'dashboard_sidebar_widget_visibility_v1';
const SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY = 'dashboard_widget_controls_locked_v1';
const SIDEBAR_WIDGET_STATE_CHANGED_EVENT = 'dashboard-widget-controls-updated';

const getConnectionStrength = (connection?: BrowserConnectionInfo | null): NetworkStrength => {
  if (!connection) return 'normal';

  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  const downlink = Number(connection.downlink ?? 0);
  const rtt = Number(connection.rtt ?? 0);

  if (effectiveType.includes('slow-2g') || effectiveType === '2g' || downlink > 0 && downlink < 1 || rtt >= 350) {
    return 'critical';
  }

  if (effectiveType === '3g' || (downlink >= 1 && downlink < 5) || (rtt >= 150 && rtt < 350)) {
    return 'normal';
  }

  return 'good';
};

export default function Dashboard() {
  const [token, setToken] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [showLockedWidgetControlsModal, setShowLockedWidgetControlsModal] = useState(false);
  const [isSalesRefUser, setIsSalesRefUser] = useState(false);
  const [salesTargets, setSalesTargets] = useState<SalesTargetPreview[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [companyDisplayName, setCompanyDisplayName] = useState('Ceylon-ERP');
  const [navigatingPath, setNavigatingPath] = useState<string | null>(null);
  const [loggedUserName, setLoggedUserName] = useState('User');
  const [loggedUserId, setLoggedUserId] = useState('-');
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [networkStrength, setNetworkStrength] = useState<NetworkStrength>('normal');
  const [uiAlertModal, setUiAlertModal] = useState<UiAlertModalState>({
    open: false,
    title: '',
    message: '',
  });
  const router = useRouter();
  const pathname = usePathname();
  const apiClient = createApiClient();
  const syncInFlightRef = useRef(false);
  const hasPrefetchedRoutesRef = useRef(false);

  const getAccessCacheKey = (authToken: string) => `dashboard_access_cache_${authToken.slice(-16)}`;
  const getSalesTargetCacheKey = (authToken: string) => `dashboard_sales_targets_cache_${authToken.slice(-16)}`;

  const compactAccessCachePayload = (payload: DashboardAccessCache): DashboardAccessCache => ({
    ...payload,
    userRoles: Array.isArray(payload.userRoles)
      ? payload.userRoles.slice(0, DASHBOARD_ACCESS_CACHE_MAX_ROLES)
      : [],
    userPermissions: Array.isArray(payload.userPermissions)
      ? payload.userPermissions.slice(0, DASHBOARD_ACCESS_CACHE_MAX_PERMISSIONS)
      : [],
  });

  const writeAccessCacheSafely = (authToken: string, payload: DashboardAccessCache) => {
    if (!authToken || typeof window === 'undefined') return;

    const cacheKey = getAccessCacheKey(authToken);
    const compactPayload = compactAccessCachePayload(payload);
    const minimalPayload: DashboardAccessCache = {
      ...compactPayload,
      userRoles: compactPayload.userRoles.slice(0, 10),
      userPermissions: [],
    };

    const attempts = [payload, compactPayload, minimalPayload];

    for (const candidate of attempts) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(candidate));
        return;
      } catch {
        // Try next, smaller payload.
      }
    }

    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key || key === cacheKey) continue;
        if (key.startsWith(DASHBOARD_ACCESS_CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }

      localStorage.setItem(cacheKey, JSON.stringify(minimalPayload));
    } catch {
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        // Ignore final cache cleanup errors.
      }
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      const offlineSession = readOfflineSession();
      if (offlineSession?.token) {
        localStorage.setItem('token', offlineSession.token);
        setToken(offlineSession.token);
        if (offlineSession.user?.name) setLoggedUserName(String(offlineSession.user.name));
        if (offlineSession.user?.id) setLoggedUserId(String(offlineSession.user.id));
      } else {
        router.push('/');
      }
    } else {
      setToken(storedToken);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    clearOfflineSession();
    router.push('/');
  };

  useEffect(() => {
    if (!token) return;

    const hydrateAccessFromCache = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(getAccessCacheKey(token)) || 'null') as DashboardAccessCache | null;
        if (!cached) return false;
        setUserRoles(Array.isArray(cached.userRoles) ? cached.userRoles : []);
        setUserPermissions(Array.isArray(cached.userPermissions) ? cached.userPermissions : []);
        setIsAdminUser(Boolean(cached.isAdminUser));
        setIsSalesRefUser(Boolean(cached.isSalesRefUser));
        if (cached.userDisplayName) setLoggedUserName(cached.userDisplayName);
        if (cached.userDisplayId) setLoggedUserId(cached.userDisplayId);
        setWidgetVisibility(cached.widgetVisibility || {});
        setWidgetControlsLocked(Boolean(cached.widgetControlsLocked));
        return true;
      } catch {
        return false;
      }
    };

    const fetchUserAccess = async () => {
      try {
        const userRes = await apiClient.get('/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const resolvedDisplayName = String(
          userData?.name || userData?.employee?.name || userData?.employee?.full_name || userData?.email || 'User'
        );
        const resolvedDisplayId = String(
          userData?.employee_id || userData?.employee?.id || userData?.id || '-'
        );
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) =>
                    String(permission?.name || '').trim().toLowerCase()
                  )
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const adminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const isOutletUser = roleNames.some((role) => role.includes('outlet_user'));
        const salesRefUser = roleNames.some(
          (role) => role.includes('sales ref') || role.includes('sales representative') || role.includes('sales_ref')
        );
        if (!adminUser && isOutletUser) {
          router.push('/outlet-pos');
          return;
        }

        setUserRoles(Array.from(new Set(roleNames)));
        setUserPermissions(Array.from(new Set(permissionNames.filter(Boolean))));
        setIsAdminUser(adminUser);
        setIsSalesRefUser(salesRefUser);
        setLoggedUserName(resolvedDisplayName);
        setLoggedUserId(resolvedDisplayId);

        try {
          const widgetRes = await apiClient.get('/dashboard/widgets/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const widgetMap = widgetRes.data?.data?.widgets || {};
          const controlsLocked = Boolean(widgetRes.data?.data?.widget_controls_locked);
          setWidgetVisibility(widgetMap);
          setWidgetControlsLocked(controlsLocked);
          localStorage.setItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY, JSON.stringify(widgetMap));
          localStorage.setItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY, controlsLocked ? '1' : '0');
          window.dispatchEvent(new Event(SIDEBAR_WIDGET_STATE_CHANGED_EVENT));
          writeAccessCacheSafely(token, {
            savedAt: Date.now(),
            userRoles: Array.from(new Set(roleNames)),
            userPermissions: Array.from(new Set(permissionNames.filter(Boolean))),
            isAdminUser: adminUser,
            isSalesRefUser: salesRefUser,
            userDisplayName: resolvedDisplayName,
            userDisplayId: resolvedDisplayId,
            widgetVisibility: widgetMap,
            widgetControlsLocked: controlsLocked,
          } satisfies DashboardAccessCache);
        } catch (widgetError) {
          console.error('Error fetching widget visibility:', widgetError);
          setWidgetVisibility({});
          setWidgetControlsLocked(false);
          writeAccessCacheSafely(token, {
            savedAt: Date.now(),
            userRoles: Array.from(new Set(roleNames)),
            userPermissions: Array.from(new Set(permissionNames.filter(Boolean))),
            isAdminUser: adminUser,
            isSalesRefUser: salesRefUser,
            userDisplayName: resolvedDisplayName,
            userDisplayId: resolvedDisplayId,
            widgetVisibility: {},
            widgetControlsLocked: false,
          } satisfies DashboardAccessCache);
        }
      } catch (error) {
        console.error('Error fetching dashboard access profile:', error);
        const usedCache = hydrateAccessFromCache();
        if (!usedCache) {
          setUserRoles([]);
          setUserPermissions([]);
          setIsAdminUser(false);
          setIsSalesRefUser(false);
          setWidgetVisibility({});
        }
      } finally {
        setAccessReady(true);
      }
    };

    fetchUserAccess();
  }, [token, router]);

  useEffect(() => {
    if (!token) return;

    const hydrateSalesTargetsFromCache = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(getSalesTargetCacheKey(token)) || 'null') as SalesTargetCache | null;
        if (!cached || !Array.isArray(cached.rows)) return false;
        setSalesTargets(cached.rows);
        return true;
      } catch {
        return false;
      }
    };

    const fetchSalesTargetPreview = async () => {
      try {
        setTargetsLoading(true);
        const response = await apiClient.get('/sales-targets', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 500 },
        });

        const payload = response.data?.data;
        const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setSalesTargets(items);
        localStorage.setItem(
          getSalesTargetCacheKey(token),
          JSON.stringify({
            savedAt: Date.now(),
            rows: items,
          } satisfies SalesTargetCache),
        );
      } catch (error) {
        console.error('Error loading sales target preview:', error);
        const usedCache = hydrateSalesTargetsFromCache();
        if (!usedCache) {
          setSalesTargets([]);
        }
      } finally {
        setTargetsLoading(false);
      }
    };

    fetchSalesTargetPreview();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const fetchCompanyName = async () => {
      try {
        const response = await apiClient.get('/companies', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const companies: CompanyRow[] = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        const companyName = String(companies[0]?.name || '').trim();
        if (companyName) {
          setCompanyDisplayName(companyName);
        }
      } catch (error) {
        console.error('Error loading company name for dashboard:', error);
      }
    };

    void fetchCompanyName();
  }, [token]);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;

    const syncWhenOnline = async () => {
      if (!window.navigator.onLine) return;
      if (syncInFlightRef.current) return;

      syncInFlightRef.current = true;
      try {
        await syncDistributionOfflineQueues(token);
      } catch (error) {
        console.error('Error syncing distribution offline queues from dashboard:', error);
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void syncWhenOnline();
    window.addEventListener('online', syncWhenOnline);
    window.addEventListener('focus', syncWhenOnline);

    return () => {
      window.removeEventListener('online', syncWhenOnline);
      window.removeEventListener('focus', syncWhenOnline);
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const connection = (navigator as Navigator & {
      connection?: BrowserConnectionInfo;
      mozConnection?: BrowserConnectionInfo;
      webkitConnection?: BrowserConnectionInfo;
    }).connection
      || (navigator as Navigator & { mozConnection?: BrowserConnectionInfo }).mozConnection
      || (navigator as Navigator & { webkitConnection?: BrowserConnectionInfo }).webkitConnection;

    const updateConnectionState = () => {
      setIsNetworkOnline(window.navigator.onLine);
      if (!window.navigator.onLine) {
        setNetworkStrength('critical');
        return;
      }
      setNetworkStrength(getConnectionStrength(connection));
    };

    updateConnectionState();
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    connection?.addEventListener?.('change', updateConnectionState);

    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
      connection?.removeEventListener?.('change', updateConnectionState);
    };
  }, []);

  const networkLabel = useMemo(() => {
    if (!isNetworkOnline) {
      return {
        dotClass: 'bg-rose-500',
        textClass: 'text-rose-700',
        label: 'Internet Critical',
      };
    }

    if (networkStrength === 'critical') {
      return {
        dotClass: 'bg-orange-500',
        textClass: 'text-orange-700',
        label: 'Internet Critical',
      };
    }

    if (networkStrength === 'normal') {
      return {
        dotClass: 'bg-amber-500',
        textClass: 'text-amber-700',
        label: 'Internet Normal',
      };
    }

    return {
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700',
      label: 'Internet Good',
    };
  }, [isNetworkOnline, networkStrength]);

  const targetsSummary = useMemo(() => {
    const safeNumber = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    const totalTargetAmount = salesTargets.reduce((sum, item) => sum + safeNumber(item.target_amount), 0);
    const totalAchievedAmount = salesTargets.reduce((sum, item) => sum + safeNumber(item.achieved_amount), 0);
    const totalTargetQty = salesTargets.reduce((sum, item) => sum + safeNumber(item.target_quantity), 0);
    const totalAchievedQty = salesTargets.reduce((sum, item) => sum + safeNumber(item.achieved_quantity), 0);

    const amountProgress = totalTargetAmount > 0 ? Math.min(100, (totalAchievedAmount / totalTargetAmount) * 100) : 0;
    const qtyProgress = totalTargetQty > 0 ? Math.min(100, (totalAchievedQty / totalTargetQty) * 100) : 0;

    return {
      totalTargetAmount,
      totalAchievedAmount,
      totalTargetQty,
      totalAchievedQty,
      amountProgress,
      qtyProgress,
    };
  }, [salesTargets]);

  const hasModuleAccess = (keywords: string[]) => {
    if (isAdminUser) return true;
    if (keywords.length === 0) return false;

    return userPermissions.some((permission) => keywords.some((keyword) => permission.includes(keyword)));
  };

  const modules: DashboardModule[] = [
    {
      id: 'hrm',
      name: 'HRM (Human Resource Management)',
      icon: '👥',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/hrm',
      accessKeywords: ['hrm', 'employee', 'department', 'designation', 'attendance', 'leave', 'payroll', 'candidate', 'role', 'permission'],
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: '📈',
      color: 'from-rose-500 to-red-500',
      bgColor: 'from-rose-50 to-red-50',
      path: '/dashboard/reports',
      accessKeywords: ['report'],
    },
    {
      id: 'production',
      name: 'Production',
      icon: '🏭',
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'from-emerald-50 to-teal-50',
      path: '/dashboard/production',
      accessKeywords: ['production', 'bom', 'formula', 'batch', 'planning', 'quality', 'qc', 'packaging'],
    },
    {
      id: 'purchasing',
      name: 'Purchasing / Procurement',
      icon: '🛒',
      color: 'from-cyan-500 to-blue-500',
      bgColor: 'from-cyan-50 to-blue-50',
      path: '/dashboard/purchasing',
      accessKeywords: ['purchasing', 'procurement', 'purchesing', 'purchase', 'grn'],
    },
    {
      id: 'outlets',
      name: 'Outlets',
      icon: '🏪',
      color: 'from-violet-500 to-purple-500',
      bgColor: 'from-violet-50 to-purple-50',
      path: '/dashboard/outlets',
      accessKeywords: ['outlet', 'branch'],
    },
    {
      id: 'stock',
      name: 'Manage Stock',
      icon: '📦',
      color: 'from-orange-500 to-red-500',
      bgColor: 'from-orange-50 to-red-50',
      path: '/dashboard/stock',
      accessKeywords: ['stock', 'inventory', 'supplier', 'transfer'],
    },
    {
      id: 'vehicle-loading',
      name: 'Vehicle Loading',
      icon: '🚛',
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'from-blue-50 to-indigo-50',
      path: '/dashboard/vehicle-loading',
      accessKeywords: ['vehicle-loading', 'vehicle', 'load', 'route'],
    },
    {
      id: 'distribution',
      name: 'Distribution',
      icon: '🚚',
      color: 'from-green-500 to-teal-500',
      bgColor: 'from-green-50 to-teal-50',
      path: '/dashboard/distribution',
      accessKeywords: ['distribution', 'customer', 'invoice', 'return', 'payment'],
    },
    {
      id: 'accounts',
      name: 'Accounts',
      icon: '💼',
      color: 'from-emerald-500 to-cyan-500',
      bgColor: 'from-emerald-50 to-cyan-50',
      path: '/dashboard/accounts',
      accessKeywords: ['account', 'accounts', 'ledger', 'cash', 'petty', 'finance'],
    },
  ];

  const adminSettingCards: DashboardModule[] = [
    {
      id: 'company-settings',
      name: 'Company Settings',
      icon: '🏢',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'from-blue-50 to-cyan-50',
      path: '/dashboard/company-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage company profile for invoices and documents',
    },
    {
      id: 'user-management',
      name: 'User Management',
      icon: '👥',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'from-green-50 to-emerald-50',
      path: '/dashboard/hrm/roles',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage users and permissions',
    },
    {
      id: 'system-settings',
      name: 'System Settings',
      icon: '⚙️',
      color: 'from-purple-500 to-indigo-500',
      bgColor: 'from-purple-50 to-indigo-50',
      path: '/dashboard/system-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Configure system preferences',
    },
    {
      id: 'security-settings',
      name: 'Security Settings',
      icon: '🔒',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/security-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage security configurations',
    },
    {
      id: 'backup-restore',
      name: 'Backup & Restore',
      icon: '💾',
      color: 'from-teal-500 to-green-500',
      bgColor: 'from-teal-50 to-green-50',
      path: '/dashboard/backup-restore',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage data backups',
    },
  ];

  const allWidgetCards = [...modules, ...adminSettingCards];
  const dashboardSectionWidgets = [
    { id: 'sales-target-preview', name: 'Sales Target Preview' },
    { id: 'sales-target-actions', name: 'Sales Target Actions' },
    { id: 'sales-target-amount-card', name: 'Sales Target Amount Progress' },
    { id: 'sales-target-quantity-card', name: 'Sales Target Quantity Progress' },
    { id: 'sales-target-vs-achieved-card', name: 'Sales Target vs Achieved' },
    { id: 'settings-configuration', name: 'Settings & System Configuration' },
    { id: 'settings-configuration-note', name: 'Settings Configuration Help Note' },
  ];
  const allWidgetItems = [...allWidgetCards, ...dashboardSectionWidgets];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;

  const visibleModules = modules.filter((module) => {
    if (module.adminOnly) return isAdminUser;
    const widgetAllowed = widgetVisibility[module.id] !== false;
    if (!widgetAllowed) return false;
    if (module.id === 'hrm') {
      // Keep HRM entry visible so every employee can access leave requests.
      return true;
    }
    if (isAdminUser) return true;
    const roleAllowed = hasModuleAccess(module.accessKeywords);
    return roleAllowed && widgetAllowed;
  });

  const visibleAdminSettingCards = adminSettingCards.filter((card) => widgetVisibility[card.id] !== false);
  const isSalesTargetWidgetVisible = isWidgetVisible('sales-target-preview');
  const isSalesTargetActionsVisible = isWidgetVisible('sales-target-actions');
  const isSalesTargetAmountCardVisible = isWidgetVisible('sales-target-amount-card');
  const isSalesTargetQuantityCardVisible = isWidgetVisible('sales-target-quantity-card');
  const isSalesTargetVsAchievedCardVisible = isWidgetVisible('sales-target-vs-achieved-card');
  const isSettingsConfigurationVisible = isWidgetVisible('settings-configuration');
  const isSettingsConfigurationNoteVisible = isWidgetVisible('settings-configuration-note');

  useEffect(() => {
    if (!accessReady || hasPrefetchedRoutesRef.current) return;
    hasPrefetchedRoutesRef.current = true;

    const defaultPaths = [
      '/dashboard/reports',
      '/dashboard/distribution',
      '/dashboard/stock',
      '/dashboard/purchasing',
      '/dashboard/reports/distribution/sales',
      '/dashboard/hrm/sales-targets',
    ];

    let recentPaths: string[] = [];
    try {
      const raw = localStorage.getItem(DASHBOARD_RECENT_ROUTES_KEY);
      recentPaths = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(recentPaths)) recentPaths = [];
    } catch {
      recentPaths = [];
    }

    const modulePaths = visibleModules
      .map((module) => module.path)
      .filter((path): path is string => Boolean(path));

    const paths = Array.from(new Set([...modulePaths, ...defaultPaths, ...recentPaths])).filter((path) => path !== '/dashboard');

    const prefetchWork = () => {
      paths.forEach((path) => {
        try {
          router.prefetch(path);
        } catch {
          // Ignore prefetch failures to keep navigation resilient.
        }
      });
    };

    setTimeout(prefetchWork, 0);
  }, [accessReady, router, visibleModules]);

  useEffect(() => {
    setNavigatingPath(null);
  }, [pathname]);

  useEffect(() => {
    if (!navigatingPath) return;
    const timeoutId = window.setTimeout(() => {
      setNavigatingPath(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [navigatingPath]);

  const rememberRecentRoute = (path: string) => {
    try {
      const raw = localStorage.getItem(DASHBOARD_RECENT_ROUTES_KEY);
      const prev = raw ? (JSON.parse(raw) as string[]) : [];
      const safePrev = Array.isArray(prev) ? prev : [];
      const next = [path, ...safePrev.filter((entry) => entry !== path)].slice(0, DASHBOARD_RECENT_ROUTES_MAX);
      localStorage.setItem(DASHBOARD_RECENT_ROUTES_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage failures.
    }
  };

  const navigateFast = (path: string) => {
    setNavigatingPath(path);
    rememberRecentRoute(path);
    try {
      router.prefetch(path);
    } catch {
      // Ignore prefetch failures and continue navigation.
    }
    router.push(path);
  };

  const openSuperAdminConfirmation = (
    changes: WidgetVisibilityChange[] = [],
    mode: SuperAdminModalMode = 'apply'
  ) => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setPendingWidgetChanges(changes);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const queueWidgetVisibilityChange = (change: WidgetVisibilityChange) => {
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== change.widget_key);
      return [...remaining, change];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) {
      setWidgetVisibility(widgetVisibilitySnapshot);
    }
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const lockWidgetControls = () => {
    setWidgetControlsLocked(true);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setSuperAdminModalMode('apply');
    try {
      localStorage.setItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY, '1');
      window.dispatchEvent(new Event(SIDEBAR_WIDGET_STATE_CHANGED_EVENT));
      if (!token) return;
      const raw = localStorage.getItem(getAccessCacheKey(token));
      const cached = raw ? (JSON.parse(raw) as DashboardAccessCache) : null;
      if (cached) {
        writeAccessCacheSafely(token, {
          ...cached,
          widgetControlsLocked: true,
        } satisfies DashboardAccessCache);
      }
    } catch (cacheError) {
      console.error('Error caching widget control lock state:', cacheError);
    }
  };

  const unlockWidgetControlsInState = () => {
    setWidgetControlsLocked(false);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    try {
      localStorage.setItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY, '0');
      window.dispatchEvent(new Event(SIDEBAR_WIDGET_STATE_CHANGED_EVENT));
      if (!token) return;
      const raw = localStorage.getItem(getAccessCacheKey(token));
      const cached = raw ? (JSON.parse(raw) as DashboardAccessCache) : null;
      if (cached) {
        writeAccessCacheSafely(token, {
          ...cached,
          widgetControlsLocked: false,
        } satisfies DashboardAccessCache);
      }
    } catch (cacheError) {
      console.error('Error caching widget control unlock state:', cacheError);
    }
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply') return;
    if (!pendingWidgetChanges.length) return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openUiAlertModal('Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }

    try {
      setSuperAdminConfirmLoading(true);

      for (const change of pendingWidgetChanges) {
        await apiClient.put(
          '/dashboard/widgets/me',
          {
            widget_key: change.widget_key,
            is_visible: change.is_visible,
            super_admin_email: superAdminEmail.trim(),
            super_admin_password: superAdminPassword,
            lock_widget_controls: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      const visibilityPatch: Record<string, boolean> = {};
      pendingWidgetChanges.forEach((change) => {
        visibilityPatch[change.widget_key] = change.is_visible;
      });
      setWidgetVisibility((prev) => ({
        ...prev,
        ...visibilityPatch,
      }));
      syncSidebarVisibilityPatch(visibilityPatch);

      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
      setSuperAdminEmail('');
      setSuperAdminPassword('');
      lockWidgetControls();
    } catch (error) {
      console.error('Error applying widget visibility changes:', error);
      openUiAlertModal('Widget Update Failed', 'Super Admin confirmation failed or widget update failed.');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openUiAlertModal('Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }
    setRestoreWidgetListVisible(true);
  };

  const unlockWidgetControls = async () => {
    if (superAdminModalMode !== 'unlock') return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openUiAlertModal('Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }

    const fallbackWidgetKey = allWidgetItems[0]?.id ?? 'hrm';
    const fallbackVisibility = widgetVisibility[fallbackWidgetKey] !== false;

    try {
      setSuperAdminConfirmLoading(true);
      await apiClient.put(
        '/dashboard/widgets/me',
        {
          widget_key: fallbackWidgetKey,
          is_visible: fallbackVisibility,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: false,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      unlockWidgetControlsInState();
    } catch (error) {
      console.error('Error unlocking widget controls:', error);
      openUiAlertModal(
        'Unlock Failed',
        'Failed to unlock widget controls. Please verify Super Admin credentials and try again.'
      );
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openUiAlertModal('Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }

    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await apiClient.put(
        '/dashboard/widgets/me',
        {
          widget_key: widgetKey,
          is_visible: true,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setWidgetVisibility((prev) => ({
        ...prev,
        [widgetKey]: true,
      }));
      syncSidebarVisibilityPatch({ [widgetKey]: true });
      setPendingWidgetChanges((prev) => prev.filter((change) => change.widget_key !== widgetKey));
    } catch (error) {
      console.error('Error restoring widget:', error);
      openUiAlertModal(
        'Restore Failed',
        'Failed to restore widget. Please verify Super Admin credentials and try again.'
      );
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const setMyWidgetVisibility = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({
      ...prev,
      [widgetKey]: isVisible,
    }));
    queueWidgetVisibilityChange({ widget_key: widgetKey, is_visible: isVisible });
  };

  const restoreAllHiddenWidgets = () => {
    if (widgetControlsLocked) return;
    const hiddenKeys = allWidgetItems
      .map((card) => card.id)
      .filter((cardId) => widgetVisibility[cardId] === false);

    if (hiddenKeys.length === 0) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => {
      const next = { ...prev };
      hiddenKeys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });
    hiddenKeys.forEach((key) => {
      queueWidgetVisibilityChange({ widget_key: key, is_visible: true });
    });
  };

  const openUiAlertModal = (title: string, message: string) => {
    setUiAlertModal({
      open: true,
      title,
      message,
    });
  };

  const closeUiAlertModal = () => {
    setUiAlertModal((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const syncSidebarVisibilityPatch = (patch: Record<string, boolean>) => {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY);
      const current = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      const next = {
        ...(current && typeof current === 'object' ? current : {}),
        ...patch,
      };
      localStorage.setItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SIDEBAR_WIDGET_STATE_CHANGED_EVENT));
    } catch {
      // Ignore sidebar cache sync issues.
    }
  };

  const restoreHiddenWidgetsAfterFix = () => {
    const hiddenKeys = allWidgetItems
      .map((card) => card.id)
      .filter((cardId) => widgetVisibility[cardId] === false);

    if (hiddenKeys.length === 0) {
      openUiAlertModal('Nothing to Restore', 'All widgets are already visible.');
      return;
    }

    openSuperAdminConfirmation(
      hiddenKeys.map((key) => ({
        widget_key: key,
        is_visible: true,
      })),
      'restore'
    );
  };

  const openUnlockWidgetsAfterFix = () => {
    openSuperAdminConfirmation([], 'unlock');
  };

  const openLockWidgetsAfterUnlock = () => {
    const fallbackWidgetKey = allWidgetItems[0]?.id ?? 'hrm';
    const fallbackVisibility = widgetVisibility[fallbackWidgetKey] !== false;

    openSuperAdminConfirmation(
      [
        {
          widget_key: fallbackWidgetKey,
          is_visible: fallbackVisibility,
        },
      ],
      'apply'
    );
  };

  const hiddenWidgetCount = allWidgetItems.filter((card) => widgetVisibility[card.id] === false).length;

  const handleModuleClick = (module: DashboardModule) => {
    if (module.path) {
      navigateFast(module.path);
      return;
    }

    if (module.comingSoon) {
      openUiAlertModal('Coming Soon', `${module.name} module coming soon!`);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 px-3 sm:px-4 lg:px-6 py-8">
        <div className="mx-auto w-full space-y-6 animate-pulse">
          <div className="h-16 rounded-2xl border border-white/60 bg-white/70" />
          <div className="h-40 rounded-2xl border border-white/60 bg-white/70" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="h-48 rounded-2xl border border-white/60 bg-white/70" />
            <div className="h-48 rounded-2xl border border-white/60 bg-white/70" />
            <div className="h-48 rounded-2xl border border-white/60 bg-white/70" />
            <div className="h-48 rounded-2xl border border-white/60 bg-white/70" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl"></div>
      </div>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {backgroundParticles.map((particle, index) => (
          <span
            key={`bg-particle-${index}`}
            className="absolute rounded-full bg-white/40 shadow-[0_0_18px_rgba(236,72,153,0.22)]"
            style={{
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationName: 'dashboardFloat',
              animationDuration: particle.duration,
              animationDelay: particle.delay,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-in-out',
            }}
          />
        ))}
      </div>

      {navigatingPath && (
        <div className="fixed inset-0 z-[85] bg-white/75 backdrop-blur-[2px]">
          <div className="h-full w-full px-3 sm:px-4 lg:px-6 py-8">
            <div className="mx-auto w-full space-y-5 animate-pulse">
              <div className="h-10 w-52 rounded-lg bg-slate-200" />
              <div className="h-6 w-80 max-w-full rounded bg-slate-200" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="h-36 rounded-xl bg-slate-200" />
                <div className="h-36 rounded-xl bg-slate-200" />
                <div className="h-36 rounded-xl bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:h-16 h-auto py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">BMS</span>
                </div>
                <div>
                  <h1 className="text-gray-900 text-lg sm:text-xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">
                    Ceylon-ERP
                  </h1>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Welcome to {companyDisplayName}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="font-medium text-slate-700">{loggedUserName}</span>
                  <span className="text-slate-500">ID: {loggedUserId}</span>
                </div>
                <div className={`flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 shadow-sm ${networkLabel.textClass}`}>
                  <div className={`w-2 h-2 rounded-full ${networkLabel.dotClass} `}></div>
                  <span className="font-medium">{networkLabel.label}</span>
                </div>
              </div>
              <div className="md:hidden flex items-center">
                <span className={`text-xs font-semibold ${networkLabel.textClass}`}>{networkLabel.label}</span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
          {!widgetControlsLocked && hiddenWidgetCount > 0 && (
            <button
              type="button"
              onClick={restoreAllHiddenWidgets}
              className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Restore Hidden Widgets ({hiddenWidgetCount})
            </button>
          )}
          {!widgetControlsLocked && (
            <button
              type="button"
              onClick={openLockWidgetsAfterUnlock}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Lock Widgets
            </button>
          )}
          {!widgetControlsLocked && pendingWidgetChanges.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => openSuperAdminConfirmation(pendingWidgetChanges)}
                className="rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Fix Widget ({pendingWidgetChanges.length})
              </button>
              <button
                type="button"
                onClick={rollbackPendingWidgetChanges}
                className="rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Cancel Widget Changes
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowLockedWidgetControlsModal(true)}
          className="fixed right-5 top-1/2 z-[70] inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-300 bg-white text-lg font-semibold text-emerald-700 shadow-lg transition hover:bg-emerald-50"
          title="Open widget controls"
          aria-label="Open widget controls"
          style={{ animation: 'widgetControlPulse 1.8s ease-in-out infinite' }}
        >
          ⚙️
        </button>

        {/* Module Cards */}
        {isSalesTargetWidgetVisible && (
          <section className="relative mb-10 rounded-2xl border border-white/30 bg-white/80 p-5 shadow-xl backdrop-blur-sm">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMyWidgetVisibility('sales-target-preview', false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Sales Target Preview"
              >
                ×
              </button>
            )}
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Sales Target Preview</h3>
              <p className="text-sm text-gray-600">Quick view of total targets vs achieved values after login.</p>
            </div>
            {isSalesTargetActionsVisible && (
              <div className="relative flex flex-wrap items-center gap-2 pr-10">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMyWidgetVisibility('sales-target-actions', false);
                    }}
                    className="absolute right-0 top-0 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Sales Target Actions"
                  >
                    ×
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigateFast('/dashboard/reports/distribution/sales')}
                  className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                >
                  <span className="mr-2 text-base leading-none" aria-hidden="true">
                    📈
                  </span>
                  <span>View Team Performance</span>
                </button>
                {!isSalesRefUser && (
                  <button
                    type="button"
                    onClick={() => navigateFast('/dashboard/hrm/sales-targets')}
                    className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    <span className="mr-2 text-base leading-none" aria-hidden="true">
                      🎯
                    </span>
                    <span>Open Sales Targets</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {targetsLoading ? (
            <div className="rounded-xl border border-dashed border-red-200 bg-red-50/40 p-6 text-center text-sm text-red-700">
              Loading target preview...
            </div>
          ) : salesTargets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
              No sales targets available yet.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {isSalesTargetAmountCardVisible && (
                  <div className="relative rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-4">
                    {!widgetControlsLocked && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMyWidgetVisibility('sales-target-amount-card', false);
                        }}
                        className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                        title="Disable this widget"
                        aria-label="Disable Sales Target Amount Progress"
                      >
                        ×
                      </button>
                    )}
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-500">Amount Progress</p>
                  <div className="mt-2 flex items-end justify-between">
                    <p className="text-2xl font-bold text-gray-900">{targetsSummary.amountProgress.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">Target {targetsSummary.totalTargetAmount.toFixed(2)}</p>
                  </div>
                  <div className="mt-3 h-3 rounded-full bg-red-100">
                    <div className="h-3 rounded-full bg-gradient-to-r from-red-500 to-pink-500 transition-all" style={{ width: `${targetsSummary.amountProgress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-700">Achieved {targetsSummary.totalAchievedAmount.toFixed(2)}</p>
                  </div>
                )}

                {isSalesTargetQuantityCardVisible && (
                  <div className="relative rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
                    {!widgetControlsLocked && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMyWidgetVisibility('sales-target-quantity-card', false);
                        }}
                        className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                        title="Disable this widget"
                        aria-label="Disable Sales Target Quantity Progress"
                      >
                        ×
                      </button>
                    )}
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-600">Quantity Progress</p>
                  <div className="mt-2 flex items-end justify-between">
                    <p className="text-2xl font-bold text-gray-900">{targetsSummary.qtyProgress.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">Target {targetsSummary.totalTargetQty.toFixed(2)}</p>
                  </div>
                  <div className="mt-3 h-3 rounded-full bg-cyan-100">
                    <div className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${targetsSummary.qtyProgress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-700">Achieved {targetsSummary.totalAchievedQty.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {isSalesTargetVsAchievedCardVisible && (
                <div className="relative rounded-xl border border-gray-200 bg-white p-4">
                  {!widgetControlsLocked && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMyWidgetVisibility('sales-target-vs-achieved-card', false);
                      }}
                      className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label="Disable Sales Target vs Achieved"
                    >
                      ×
                    </button>
                  )}
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Target vs Achieved</p>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm text-gray-700">
                      <span>Amount</span>
                      <span>{targetsSummary.totalAchievedAmount.toFixed(2)} / {targetsSummary.totalTargetAmount.toFixed(2)}</span>
                    </div>
                    <div className="h-4 rounded-full bg-gray-100 p-0.5">
                      <div className="h-3 rounded-full bg-gradient-to-r from-red-500 to-pink-500" style={{ width: `${targetsSummary.amountProgress}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm text-gray-700">
                      <span>Quantity</span>
                      <span>{targetsSummary.totalAchievedQty.toFixed(2)} / {targetsSummary.totalTargetQty.toFixed(2)}</span>
                    </div>
                    <div className="h-4 rounded-full bg-gray-100 p-0.5">
                      <div className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${targetsSummary.qtyProgress}%` }} />
                    </div>
                  </div>
                </div>
                </div>
              )}
            </div>
          )}
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
          {visibleModules.map((module, index) => (
            <div
              key={index}
              onClick={() => handleModuleClick(module)}
              className={`group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105 ${
                module.name === 'HRM (Human Resource Management)' ? 'ring-2 ring-red-500/50' : ''
              } ${
                navigatingPath && module.path === navigatingPath ? 'opacity-80 pointer-events-none' : ''
              }`}
            >
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMyWidgetVisibility(module.id, false);
                  }}
                  className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label={`Disable ${module.name}`}
                >
                  ×
                </button>
              )}

              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              {/* Content */}
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {module.icon}
                  </div>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  {navigatingPath && module.path === navigatingPath && (
                    <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                      Opening...
                    </div>
                  )}
                  <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.name === 'HRM (Human Resource Management)'
                      ? 'Manage your workforce efficiently'
                      : module.name === 'Manage Stock'
                      ? 'Monitor and manage inventory levels'
                      : module.name === 'Vehicle Loading'
                      ? 'Manage vehicle loading operations'
                      : module.name === 'Production'
                      ? 'Oversee production processes and workflows'
                      : module.id === 'purchasing'
                      ? 'Handle procurement and supplier management'
                      : module.name === 'Outlets'
                      ? 'Manage retail outlets and sales points'
                      : module.name === 'Distribution'
                      ? 'Manage customers, invoices, returns and payments'
                      : module.name === 'Accounts'
                      ? 'Handle company books, cash accounts and balances'
                      : 'Access comprehensive management tools'
                    }
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-red-500 to-pink-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </div>
          ))}
        </div>

        {visibleModules.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-8">
            No feature modules are currently assigned to your role. Contact an administrator to grant view permissions.
          </div>
        )}

        {/* Settings & Configuration Section */}
        {isAdminUser && isSettingsConfigurationVisible && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMyWidgetVisibility('settings-configuration', false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Settings & System Configuration"
              >
                ×
              </button>
            )}
            <div className="bg-gradient-to-r from-red-500 to-pink-500 p-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Settings & System Configuration</h3>
                  <p className="text-white/80">Configure and customize your system preferences</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleAdminSettingCards.map((setting, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      if (setting.path) {
                        navigateFast(setting.path);
                        return;
                      }

                      
                    }}
                    className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  >
                    {!widgetControlsLocked && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMyWidgetVisibility(setting.id, false);
                        }}
                        className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                        title="Disable this widget"
                        aria-label={`Disable ${setting.name}`}
                      >
                        ×
                      </button>
                    )}

                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 bg-gradient-to-r ${setting.color} rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        {setting.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                          {setting.name}
                        </h4>
                        <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                          {setting.description || 'System setting card'}
                        </p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {isSettingsConfigurationNoteVisible && (
                <div className="relative mt-4 rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 pr-12 text-xs text-cyan-800">
                  {!widgetControlsLocked && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMyWidgetVisibility('settings-configuration-note', false);
                      }}
                      className="absolute right-3 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label="Disable Settings Configuration Help Note"
                    >
                      ×
                    </button>
                  )}
                  Widget hide/restore actions require Super Admin email and password confirmation.
                </div>
              )}
            </div>
          </div>
        )}

        {showSuperAdminConfirmModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">Super Admin Confirmation</h3>
                <button
                  type="button"
                  onClick={() => {
                    if (superAdminConfirmLoading) return;
                    rollbackPendingWidgetChanges();
                  }}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Super Admin Email</label>
                  <input
                    type="email"
                    value={superAdminEmail}
                    onChange={(e) => setSuperAdminEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="superadmin@company.com"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Super Admin Password</label>
                  <input
                    type="password"
                    value={superAdminPassword}
                    onChange={(e) => setSuperAdminPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>
                {superAdminModalMode !== 'unlock' && !restoreWidgetListVisible && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Pending widget updates: <strong>{pendingWidgetChanges.length}</strong>
                  </div>
                )}
                {superAdminModalMode === 'unlock' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Confirm Super Admin credentials to unlock widget controls and show close buttons again.
                  </div>
                )}

                {superAdminModalMode === 'restore' && restoreWidgetListVisible && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-indigo-700">
                      Hidden widgets
                    </p>
                    {pendingWidgetChanges.length === 0 ? (
                      <p className="text-sm text-indigo-800">All hidden widgets are restored.</p>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {pendingWidgetChanges.map((change) => {
                          const widgetName =
                            allWidgetItems.find((card) => card.id === change.widget_key)?.name ?? change.widget_key;
                          const isRestoring = restoreWidgetLoadingKey === change.widget_key;

                          return (
                            <div
                              key={change.widget_key}
                              className="flex items-center justify-between rounded-lg border border-indigo-100 bg-white px-3 py-2"
                            >
                              <span className="text-sm font-medium text-gray-800">{widgetName}</span>
                              <button
                                type="button"
                                disabled={Boolean(restoreWidgetLoadingKey)}
                                onClick={() => restoreHiddenWidgetOneByOne(change.widget_key)}
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                              >
                                {isRestoring ? 'Restoring...' : 'Restore'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (superAdminConfirmLoading) return;
                    rollbackPendingWidgetChanges();
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                {superAdminModalMode === 'apply' ? (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading}
                    onClick={applyWidgetVisibilityChanges}
                    className="rounded-xl bg-gradient-to-r from-red-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white hover:from-red-700 hover:to-pink-700 disabled:opacity-60"
                  >
                    {superAdminConfirmLoading ? 'Confirming...' : 'Confirm & Apply'}
                  </button>
                ) : superAdminModalMode === 'restore' ? (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading || restoreWidgetListVisible}
                    onClick={showRestoreWidgetList}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
                  >
                    Show Hidden Widgets
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading}
                    onClick={unlockWidgetControls}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
                  >
                    {superAdminConfirmLoading ? 'Unlocking...' : 'Unlock Widgets'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showLockedWidgetControlsModal && (
          <div className="fixed inset-0 z-[82] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-white/40 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">Widget Lock Controls</h3>
                <button
                  type="button"
                  onClick={() => setShowLockedWidgetControlsModal(false)}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {widgetControlsLocked ? (
                  <>
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                      Widget controls locked after Super Admin confirmation.
                    </div>
                    {hiddenWidgetCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowLockedWidgetControlsModal(false);
                          restoreHiddenWidgetsAfterFix();
                        }}
                        className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        Restore Widgets ({hiddenWidgetCount})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowLockedWidgetControlsModal(false);
                        openUnlockWidgetsAfterFix();
                      }}
                      className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      Unlock Widgets
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                      Widget controls currently unlocked.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLockedWidgetControlsModal(false);
                        openLockWidgetsAfterUnlock();
                      }}
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Lock Widgets
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {uiAlertModal.open && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">{uiAlertModal.title || 'Notice'}</h3>
                <button
                  type="button"
                  onClick={closeUiAlertModal}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-700">{uiAlertModal.message}</p>

              <div className="mt-5 flex justify-end border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={closeUiAlertModal}
                  className="rounded-xl bg-gradient-to-r from-red-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white hover:from-red-700 hover:to-pink-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <style jsx>{`
        @keyframes dashboardFloat {
          0% {
            transform: translate3d(0, 0, 0) scale(0.9);
            opacity: 0.2;
          }
          50% {
            transform: translate3d(0, -14px, 0) scale(1);
            opacity: 0.55;
          }
          100% {
            transform: translate3d(0, 0, 0) scale(0.9);
            opacity: 0.2;
          }
        }
        @keyframes widgetControlPulse {
          0% {
            transform: translateY(-50%) scale(1);
            box-shadow: 0 8px 18px rgba(16, 185, 129, 0.18);
          }
          50% {
            transform: translateY(-50%) scale(1.06);
            box-shadow: 0 12px 24px rgba(16, 185, 129, 0.3);
          }
          100% {
            transform: translateY(-50%) scale(1);
            box-shadow: 0 8px 18px rgba(16, 185, 129, 0.18);
          }
        }
      `}</style>
    </div>
  );
}
