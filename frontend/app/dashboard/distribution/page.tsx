'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../lib/apiClient';
import { DISTRIBUTION_OFFLINE_KEYS, readOfflineQueue } from '@/lib/distributionOffline';
import { syncDistributionOfflineQueues } from '@/lib/distributionSync';

interface RouteCustomer {
  id: number;
  shop_name: string;
  customer_code: string;
  outstanding?: number;
  route_id?: number | null;
  created_at?: string;
}

interface AssignedLoadRoute {
  route_id?: number | null;
  sequence_no?: number | null;
  route?: {
    id?: number;
    name?: string;
    origin?: string;
    destination?: string;
  } | null;
}

interface SalesRefLoadAvailability {
  id: number;
  load_number?: string;
  status?: string;
  load_date?: string;
  delivery_date?: string | null;
  routeNames: string[];
  vehicleLabel?: string;
  salesRefLabel?: string;
  driverLabel?: string;
}

interface LoadAvailabilitySummary {
  load: {
    id: number;
    load_number: string;
    status: string;
    load_date: string;
    delivery_date: string | null;
  };
  period: {
    from: string;
    to: string;
  };
  invoices: {
    count: number;
    total_amount: number;
    total_cost: number;
    total_profit: number;
  };
  payments: {
    total_collected: number;
    by_method: Record<string, { total: number; count: number }>;
    cheques: Array<{
      id: number;
      payment_number: string;
      payment_date: string;
      amount: number;
      payment_method: string;
      reference_no: string | null;
      bank_name: string | null;
      status: string;
    }>;
  };
  items: Array<{
    item_code: string;
    item_name: string;
    unit: string | null;
    sold_qty: number;
    sold_value: number;
    return_qty: number;
    return_value: number;
    net_qty: number;
    net_value: number;
    cost_value: number;
    profit: number;
  }>;
}

interface LoadAvailabilityItem {
  id: number;
  load_id: number;
  product_code: string;
  name: string;
  qty: number; // current available qty in vehicle
}

interface DistributionDashboardCache {
  savedAt: number;
  stats: { customers: number; invoices: number; returns: number; payments: number };
  route: { id: number | null; ids: number[]; name: string; names: string[] };
  customers: RouteCustomer[];
}

const getDistributionCacheKey = (token: string) => `distribution_dashboard_cache_${token.slice(-16)}`;

export default function DistributionPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [routeResolving, setRouteResolving] = useState(true);
  const [assignedRouteId, setAssignedRouteId] = useState<number | null>(null);
  const [assignedRouteIds, setAssignedRouteIds] = useState<number[]>([]);
  const [assignedRouteName, setAssignedRouteName] = useState('');
  const [assignedRouteNames, setAssignedRouteNames] = useState<string[]>([]);
  const [isSuperAdminView, setIsSuperAdminView] = useState(false);
  const [customerCount, setCustomerCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [returnCount, setReturnCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [routeCustomers, setRouteCustomers] = useState<RouteCustomer[]>([]);
  const [routeCustomersLoading, setRouteCustomersLoading] = useState(false);
  const [customerPerfLoading, setCustomerPerfLoading] = useState(false);
  const [customerRegistrationPerf, setCustomerRegistrationPerf] = useState({
    currentMonth: 0,
    previousMonth: 0,
    currentLabel: '',
    previousLabel: '',
  });
  const [loadAvailability, setLoadAvailability] = useState<SalesRefLoadAvailability[]>([]);
  const [loadAvailabilityCount, setLoadAvailabilityCount] = useState(0);
  const [isLoadDetailModalOpen, setIsLoadDetailModalOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<SalesRefLoadAvailability | null>(null);
  const [selectedLoadSummary, setSelectedLoadSummary] = useState<LoadAvailabilitySummary | null>(null);
  const [selectedLoadItems, setSelectedLoadItems] = useState<LoadAvailabilityItem[]>([]);
  const [loadDetailLoading, setLoadDetailLoading] = useState(false);
  const [loadDetailError, setLoadDetailError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCounts, setPendingOfflineCounts] = useState({
    invoices: 0,
    payments: 0,
    returns: 0,
  });
  const cacheHydratedRef = useRef(false);
  const offlineSyncInFlightRef = useRef(false);
  const router = useRouter();

  const api = useMemo(() => createApiClient(token), [token]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      try {
        const cached = JSON.parse(localStorage.getItem(getDistributionCacheKey(storedToken)) || 'null') as DistributionDashboardCache | null;
        if (cached?.stats && cached.route) {
          setCustomerCount(cached.stats.customers);
          setInvoiceCount(cached.stats.invoices);
          setReturnCount(cached.stats.returns);
          setPaymentCount(cached.stats.payments);
          setAssignedRouteId(cached.route.id);
          setAssignedRouteIds(cached.route.ids || []);
          setAssignedRouteName(cached.route.name || '');
          setAssignedRouteNames(cached.route.names || []);
          setRouteCustomers(cached.customers || []);
          setLoading(false);
          setRouteResolving(false);
          cacheHydratedRef.current = true;
        }
      } catch {
        localStorage.removeItem(getDistributionCacheKey(storedToken));
      }
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      void Promise.all([fetchStats(), resolveAssignedRoute()]);
    }
  }, [token]);

  useEffect(() => {
    if (token && assignedRouteIds.length > 0) {
      fetchRouteCustomers();
    } else {
      setRouteCustomers([]);
    }
  }, [token, assignedRouteIds]);

  useEffect(() => {
    if (!token) return;
    void fetchCustomerRegistrationPerformance();
  }, [token, assignedRouteIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refreshOfflineSnapshot = () => {
      setIsOnline(window.navigator.onLine);
      setPendingOfflineCounts({
        invoices: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.invoices).length,
        payments: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.payments).length,
        returns: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.returns).length,
      });
    };

    refreshOfflineSnapshot();

    window.addEventListener('online', refreshOfflineSnapshot);
    window.addEventListener('offline', refreshOfflineSnapshot);
    window.addEventListener('focus', refreshOfflineSnapshot);

    return () => {
      window.removeEventListener('online', refreshOfflineSnapshot);
      window.removeEventListener('offline', refreshOfflineSnapshot);
      window.removeEventListener('focus', refreshOfflineSnapshot);
    };
  }, []);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;

    const syncWhenOnline = async () => {
      if (!window.navigator.onLine || offlineSyncInFlightRef.current) return;
      offlineSyncInFlightRef.current = true;
      try {
        const result = await syncDistributionOfflineQueues(token);
        setPendingOfflineCounts({
          invoices: result.pendingInvoices,
          payments: result.pendingPayments,
          returns: result.pendingReturns,
        });
      } catch (error) {
        console.error('Failed to sync distribution offline queues:', error);
      } finally {
        offlineSyncInFlightRef.current = false;
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

  const handleUnauthorized = (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('token');
      setToken('');
      router.push('/');
      return true;
    }

    return false;
  };

  const resolveAssignedRoute = async () => {
    const mapLoadsToAvailability = (rawLoads: any[]): SalesRefLoadAvailability[] => {
      return rawLoads.map((load: any) => {
        const entryRoutes: AssignedLoadRoute[] = Array.isArray(load.load_routes)
          ? [...load.load_routes].sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
          : [{ route_id: load.route_id, route: load.route }];

        const routeNames = entryRoutes
          .map((entry) => entry.route?.name || [entry.route?.origin, entry.route?.destination].filter(Boolean).join(' to ') || '')
          .filter(Boolean);

        return {
          id: Number(load.id),
          load_number: load.load_number,
          status: load.status,
          load_date: load.load_date,
          delivery_date: load.delivery_date,
          routeNames,
          vehicleLabel: load.vehicle?.registration_number || load.vehicle?.type || '-',
          salesRefLabel: [load.sales_ref?.employee_code, load.sales_ref?.first_name, load.sales_ref?.last_name]
            .filter(Boolean)
            .join(' ') || load.sales_ref?.name || '-',
          driverLabel: [load.driver?.employee_code, load.driver?.first_name, load.driver?.last_name]
            .filter(Boolean)
            .join(' ') || load.driver?.name || '-',
        };
      });
    };

    try {
      setRouteResolving(true);

      const [userRes, loadsRes] = await Promise.all([
        api.get('/user'),
        api.get('/vehicle-loading/loads'),
      ]);

      const userData = userRes.data || {};
      const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
      const roleNames = [
        String(userData?.role || ''),
        ...(Array.isArray(userData?.roles)
          ? userData.roles.map((role: any) => String(role?.name || role || ''))
          : []),
      ]
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);
      const roleBlob = roleNames.join(' ');
      const adminUser =
        !employeeId ||
        roleBlob.includes('super admin') ||
        roleBlob.includes('superadmin') ||
        roleBlob.includes('administrator') ||
        roleBlob.includes('admin');

      if (!employeeId && !adminUser) {
        setIsSuperAdminView(false);
        setAssignedRouteId(null);
        setAssignedRouteIds([]);
        setAssignedRouteName('');
        setAssignedRouteNames([]);
        localStorage.removeItem('distribution_assigned_route_id');
        localStorage.removeItem('distribution_assigned_route_name');
        return;
      }

      const loads = Array.isArray(loadsRes.data) ? loadsRes.data : (loadsRes.data?.data || []);
      if (adminUser) {
        setIsSuperAdminView(true);
        const activeLoads = loads
          .filter((load: any) => ['pending', 'in_transit'].includes(String(load.status || '').toLowerCase()))
          .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime());

        const availabilityRows = mapLoadsToAvailability(activeLoads);
        setLoadAvailability(availabilityRows);
        setLoadAvailabilityCount(availabilityRows.length);
        setAssignedRouteId(null);
        setAssignedRouteIds([]);
        setAssignedRouteName('');
        setAssignedRouteNames([]);
        persistDashboardCache({
          route: {
            id: null,
            ids: [],
            name: '',
            names: [],
          },
        });
        localStorage.removeItem('distribution_assigned_route_id');
        localStorage.removeItem('distribution_assigned_route_name');
        return;
      }

      setIsSuperAdminView(false);
      const inTransitAssignedLoads = loads
        .filter((load: any) => Number(load.sales_ref_id) === employeeId && String(load.status) === 'in_transit')
        .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime());

      const availabilityRows: SalesRefLoadAvailability[] = mapLoadsToAvailability(inTransitAssignedLoads);

      setLoadAvailability(availabilityRows);
      setLoadAvailabilityCount(availabilityRows.length);

      const assignedLoad = inTransitAssignedLoads[0];
      if (!assignedLoad?.route_id) {
        setAssignedRouteId(null);
        setAssignedRouteIds([]);
        setAssignedRouteName('');
        setAssignedRouteNames([]);
        localStorage.removeItem('distribution_assigned_route_id');
        localStorage.removeItem('distribution_assigned_route_name');
        return;
      }

      const routeId = Number(assignedLoad.route_id);
      const loadRoutes: AssignedLoadRoute[] = Array.isArray(assignedLoad.load_routes)
        ? [...assignedLoad.load_routes].sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
        : [];
      const routeEntries = loadRoutes.length > 0
        ? loadRoutes
        : [{ route_id: routeId, route: assignedLoad.route }];
      const routeNames = routeEntries
        .map((entry) => {
          const route = entry.route;
          return route?.name || [route?.origin, route?.destination].filter(Boolean).join(' to ') || '';
        })
        .filter(Boolean);
      const routeIds = routeEntries
        .map((entry) => Number(entry.route_id || entry.route?.id || 0))
        .filter((id) => id > 0);
      const routeName = routeNames[0] || assignedLoad.route?.name || '';

      setAssignedRouteId(routeId);
      setAssignedRouteIds(Array.from(new Set(routeIds)));
      setAssignedRouteName(routeName);
      setAssignedRouteNames(routeNames);
      persistDashboardCache({
        route: {
          id: routeId,
          ids: Array.from(new Set(routeIds)),
          name: routeName,
          names: routeNames,
        },
      });
      localStorage.setItem('distribution_assigned_route_id', String(routeId));
      localStorage.setItem('distribution_assigned_route_name', routeName);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error resolving assigned route:', error);
      setIsSuperAdminView(false);
      setLoadAvailability([]);
      setLoadAvailabilityCount(0);
      const cachedRouteId = localStorage.getItem('distribution_assigned_route_id');
      const cachedRouteName = localStorage.getItem('distribution_assigned_route_name') || '';
      if (cachedRouteId) {
        setAssignedRouteId(Number(cachedRouteId));
        setAssignedRouteIds([Number(cachedRouteId)]);
        setAssignedRouteName(cachedRouteName);
        setAssignedRouteNames(cachedRouteName ? [cachedRouteName] : []);
      }
    } finally {
      setRouteResolving(false);
    }
  };

  const fetchStats = async () => {
    const readTotal = (payload: unknown) => {
      const data = payload as { data?: { total?: number | string } } | null;
      return Number(data?.data?.total) || 0;
    };

    const isTimeoutError = (error: unknown) => {
      if (!isAxiosError(error)) return false;
      const code = String(error.code || '').toUpperCase();
      const message = String(error.message || '').toLowerCase();
      return code === 'ECONNABORTED' || message.includes('timeout');
    };

    try {
      const [customersRes, invoicesRes, returnsRes, paymentsRes] = await Promise.allSettled([
        api.get('/distribution/customers', { params: { per_page: 1 }, timeout: 30000 }),
        api.get('/distribution/invoices', { params: { per_page: 1 }, timeout: 30000 }),
        api.get('/distribution/returns', { params: { per_page: 1 }, timeout: 30000 }),
        api.get('/distribution/payments', { params: { per_page: 1 }, timeout: 30000 }),
      ]);

      const customersTotal = customersRes.status === 'fulfilled' ? readTotal(customersRes.value.data) : customerCount;
      const invoicesTotal = invoicesRes.status === 'fulfilled' ? readTotal(invoicesRes.value.data) : invoiceCount;
      const returnsTotal = returnsRes.status === 'fulfilled' ? readTotal(returnsRes.value.data) : returnCount;
      const paymentsTotal = paymentsRes.status === 'fulfilled' ? readTotal(paymentsRes.value.data) : paymentCount;

      setCustomerCount(customersTotal);
      setInvoiceCount(invoicesTotal);
      setReturnCount(returnsTotal);
      setPaymentCount(paymentsTotal);
      persistDashboardCache({
        stats: {
          customers: customersTotal,
          invoices: invoicesTotal,
          returns: returnsTotal,
          payments: paymentsTotal,
        },
      });

      const failures = [customersRes, invoicesRes, returnsRes, paymentsRes].filter(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult[];
      if (failures.length > 0) {
        const hasTimeout = failures.some((result) => isTimeoutError(result.reason));
        console.error(
          hasTimeout
            ? 'Distribution stats: partial timeout; keeping cached/last known values for failed endpoints.'
            : 'Distribution stats: partial failures; keeping cached/last known values for failed endpoints.',
          failures.map((result) => result.reason),
        );
      }
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error fetching distribution stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const persistDashboardCache = (updates: Partial<DistributionDashboardCache>) => {
    if (!token || typeof window === 'undefined') return;
    try {
      const key = getDistributionCacheKey(token);
      const previous = JSON.parse(localStorage.getItem(key) || '{}') as Partial<DistributionDashboardCache>;
      localStorage.setItem(key, JSON.stringify({
        ...previous,
        ...updates,
        savedAt: Date.now(),
      }));
    } catch {
      // Cache is an optimization; network data remains authoritative.
    }
  };

  const fetchRouteCustomers = async () => {
    try {
      setRouteCustomersLoading(true);
      const res = await api.get('/distribution/customers', {
        params: { per_page: 100 },
      });

      const allCustomers: RouteCustomer[] = res.data?.data?.data || [];
      const filtered = allCustomers.filter((customer) =>
        assignedRouteIds.map(String).includes(String(customer.route_id ?? ''))
      );

      setRouteCustomers(filtered);
      persistDashboardCache({ customers: filtered });
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error fetching route customers on distribution dashboard:', error);
      setRouteCustomers([]);
    } finally {
      setRouteCustomersLoading(false);
    }
  };

  const fetchCustomerRegistrationPerformance = async () => {
    try {
      setCustomerPerfLoading(true);
      const rows: RouteCustomer[] = [];
      let page = 1;
      let hasNextPage = true;

      while (hasNextPage && page <= 20) {
        const res = await api.get('/distribution/customers', {
          params: { per_page: 200, page },
        });

        const payload = res.data?.data;
        const pageRows: RouteCustomer[] = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        rows.push(...pageRows);
        hasNextPage = Boolean(payload?.next_page_url) && pageRows.length > 0;
        page += 1;
      }

      const routeIdSet = new Set(assignedRouteIds.map((id) => String(id)));
      const scopedRows = routeIdSet.size > 0
        ? rows.filter((customer) => routeIdSet.has(String(customer.route_id ?? '')))
        : rows;

      const now = new Date();
      const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const isInsideRange = (dateValue: string | undefined, from: Date, to: Date) => {
        if (!dateValue) return false;
        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) return false;
        return parsed >= from && parsed < to;
      };

      const currentMonth = scopedRows.filter((row) => isInsideRange(row.created_at, currentStart, nextStart)).length;
      const previousMonth = scopedRows.filter((row) => isInsideRange(row.created_at, previousStart, currentStart)).length;

      setCustomerRegistrationPerf({
        currentMonth,
        previousMonth,
        currentLabel: currentStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        previousLabel: previousStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      });
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error loading customer registration performance:', error);
      const now = new Date();
      const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setCustomerRegistrationPerf({
        currentMonth: 0,
        previousMonth: 0,
        currentLabel: currentStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        previousLabel: previousStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      });
    } finally {
      setCustomerPerfLoading(false);
    }
  };

  const openLoadDetailsModal = async (load: SalesRefLoadAvailability) => {
    setSelectedLoad(load);
    setIsLoadDetailModalOpen(true);
    setLoadDetailLoading(true);
    setLoadDetailError('');
    setSelectedLoadSummary(null);
    setSelectedLoadItems([]);

    try {
      const [summaryRes, itemsRes] = await Promise.all([
        api.get(`/vehicle-loading/loads/${load.id}/delivery-summary`),
        api.get('/vehicle-loading/load-items', { params: { load_id: load.id } }),
      ]);

      const summaryPayload = summaryRes.data?.data as LoadAvailabilitySummary | undefined;
      const rawItems = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.data || []);
      const mappedItems: LoadAvailabilityItem[] = rawItems.map((item: any) => ({
        id: Number(item.id),
        load_id: Number(item.load_id),
        product_code: String(item.product_code || ''),
        name: String(item.name || ''),
        qty: Number(item.qty || 0),
      }));

      setSelectedLoadSummary(summaryPayload || null);
      setSelectedLoadItems(mappedItems);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error loading load availability details:', error);
      setLoadDetailError('Unable to load load details. Please try again.');
    } finally {
      setLoadDetailLoading(false);
    }
  };

  const closeLoadDetailsModal = () => {
    setIsLoadDetailModalOpen(false);
    setSelectedLoad(null);
    setSelectedLoadSummary(null);
    setSelectedLoadItems([]);
    setLoadDetailError('');
  };

  const modules = [
    { name: 'Load Availability', icon: '🚛', path: '#load-availability', stat: loadAvailabilityCount, desc: 'See in-transit loads for your allocated route' },
    { name: 'Customers (Shops)', icon: '🏪', path: '/dashboard/distribution/customers', stat: customerCount, desc: 'Register and manage shops' },
    { name: 'Invoices', icon: '🧾', path: '/dashboard/distribution/invoices', stat: invoiceCount, desc: 'Create and track invoices' },
    { name: 'Returns', icon: '↩️', path: '/dashboard/distribution/returns', stat: returnCount, desc: 'Manage customer returns' },
    { name: 'Payments', icon: '💳', path: '/dashboard/distribution/payments', stat: paymentCount, desc: 'Check, cash, and bank transfers' },
    { name: 'Outstanding Payment', icon: '🧮', path: '/dashboard/distribution/payments?entry=outstanding', stat: paymentCount, desc: 'Collect outstanding without creating a new invoice' },
    { name: 'Live Locations', icon: '📍', path: '/dashboard/distribution/live-locations', stat: 0, desc: 'Track all ref locations on map' },
    { name: 'Reports', icon: '📊', path: '/dashboard/reports', stat: 2, desc: 'Sales and delivery balance reports' },
  ];

  const getModulePath = (path: string) => {
    if (path.startsWith('#')) return path;
    if (path === '/dashboard/reports') return path;
    if (!assignedRouteId) return path;
    if (path.includes('?')) {
      return `${path}&route_id=${assignedRouteId}`;
    }
    return `${path}?route_id=${assignedRouteId}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString();
  };

  const formatNumber = (value: number) => Number(value || 0).toFixed(2);

  const loadDetailRows = useMemo(() => {
    const summaryByCode = new Map<string, LoadAvailabilitySummary['items'][number]>();
    (selectedLoadSummary?.items || []).forEach((item) => {
      const key = String(item.item_code || item.item_name || '').trim().toLowerCase();
      if (key) summaryByCode.set(key, item);
    });

    const rows = selectedLoadItems.map((item) => {
      const key = String(item.product_code || item.name || '').trim().toLowerCase();
      const summary = summaryByCode.get(key);
      const soldQty = Number(summary?.sold_qty || 0);
      const returnQty = Number(summary?.return_qty || 0);
      const availableQty = Math.max(0, Number(item.qty || 0));
      const loadedQty = Math.max(0, availableQty + soldQty - returnQty);

      return {
        key: `${item.id}-${item.product_code}`,
        code: item.product_code,
        name: item.name,
        loadedQty,
        soldQty,
        returnQty,
        availableQty,
        returnValue: Number(summary?.return_value || 0),
      };
    });

    const loadedCodes = new Set(rows.map((row) => String(row.code || row.name).trim().toLowerCase()));
    (selectedLoadSummary?.items || []).forEach((summaryItem) => {
      const key = String(summaryItem.item_code || summaryItem.item_name || '').trim().toLowerCase();
      if (!key || loadedCodes.has(key)) return;

      rows.push({
        key: `summary-${key}`,
        code: summaryItem.item_code || '-',
        name: summaryItem.item_name || '-',
        loadedQty: Math.max(0, Number(summaryItem.sold_qty || 0) - Number(summaryItem.return_qty || 0)),
        soldQty: Number(summaryItem.sold_qty || 0),
        returnQty: Number(summaryItem.return_qty || 0),
        availableQty: 0,
        returnValue: Number(summaryItem.return_value || 0),
      });
    });

    return rows;
  }, [selectedLoadItems, selectedLoadSummary]);

  const loadDetailTotals = useMemo(() => {
    const loadedQty = loadDetailRows.reduce((sum, row) => sum + Number(row.loadedQty || 0), 0);
    const soldQty = loadDetailRows.reduce((sum, row) => sum + Number(row.soldQty || 0), 0);
    const returnQty = loadDetailRows.reduce((sum, row) => sum + Number(row.returnQty || 0), 0);
    const availableQty = loadDetailRows.reduce((sum, row) => sum + Number(row.availableQty || 0), 0);
    const returnValue = loadDetailRows.reduce((sum, row) => sum + Number(row.returnValue || 0), 0);
    const totalSales = Number(selectedLoadSummary?.invoices?.total_amount || 0);
    const totalCollected = Number(selectedLoadSummary?.payments?.total_collected || 0);
    const outstanding = Math.max(0, totalSales - totalCollected);

    return {
      loadedQty,
      soldQty,
      returnQty,
      availableQty,
      returnValue,
      totalSales,
      totalCollected,
      outstanding,
      invoiceCount: Number(selectedLoadSummary?.invoices?.count || 0),
    };
  }, [loadDetailRows, selectedLoadSummary]);

  const customerPerfTrend = useMemo(() => {
    const current = Number(customerRegistrationPerf.currentMonth || 0);
    const previous = Number(customerRegistrationPerf.previousMonth || 0);
    const difference = current - previous;
    const changePercent = previous > 0 ? (difference / previous) * 100 : (current > 0 ? 100 : 0);
    const peak = Math.max(current, previous, 1);

    return {
      difference,
      changePercent,
      currentBar: (current / peak) * 100,
      previousBar: (previous / peak) * 100,
    };
  }, [customerRegistrationPerf]);

  const collectionByMethod = useMemo(() => {
    const byMethod = selectedLoadSummary?.payments?.by_method || {};
    return {
      cash: Number(byMethod.cash?.total || 0),
      cheque: Number(byMethod.check?.total || 0),
      bankTransfer: Number(byMethod.bank_transfer?.total || 0),
    };
  }, [selectedLoadSummary]);

  const performanceMetrics = useMemo(() => {
    const sales = Number(loadDetailTotals.totalSales || 0);
    const collected = Number(loadDetailTotals.totalCollected || 0);
    const availableQty = Number(loadDetailTotals.availableQty || 0);
    const soldQty = Number(loadDetailTotals.soldQty || 0);
    const returnedQty = Number(loadDetailTotals.returnQty || 0);
    const totalProfit = Number(selectedLoadSummary?.invoices?.total_profit || 0);

    const collectionRate = sales > 0 ? Math.min(100, (collected / sales) * 100) : 0;
    const marginRate = sales > 0 ? Math.max(0, Math.min(100, (totalProfit / sales) * 100)) : 0;
    const soldVsHandledRate = soldQty + availableQty > 0 ? Math.min(100, (soldQty / (soldQty + availableQty)) * 100) : 0;
    const returnRate = soldQty > 0 ? Math.min(100, (returnedQty / soldQty) * 100) : 0;

    return {
      collectionRate,
      marginRate,
      soldVsHandledRate,
      returnRate,
      totalProfit,
    };
  }, [loadDetailTotals, selectedLoadSummary]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-green-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Distribution Active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <section className={`rounded-2xl border px-4 py-3 ${isOnline ? 'border-emerald-200 bg-emerald-50/90' : 'border-amber-200 bg-amber-50/90'}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className={`text-sm font-medium ${isOnline ? 'text-emerald-800' : 'text-amber-800'}`}>
              {isOnline ? 'Online mode: distribution entries sync to the server.' : 'Offline mode: distribution entries are saved locally and synced when internet returns.'}
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Pending Sync: Invoices {pendingOfflineCounts.invoices} | Payments {pendingOfflineCounts.payments} | Returns {pendingOfflineCounts.returns}
            </p>
          </div>
        </section>

        <div className="text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-green-500 to-teal-500 rounded-full mb-4">
            <div className="bg-white rounded-full p-4 text-4xl">🚚</div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Distribution Management</h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-2 px-2">Manage shops, invoices, returns, and payments.</p>
          {routeResolving ? (
            <p className="text-sm text-gray-500 mt-3">Detecting assigned route...</p>
          ) : isSuperAdminView ? (
            <p className="text-sm text-green-700 mt-3 font-medium">
              Superadmin view: showing all active loads.
            </p>
          ) : assignedRouteId ? (
            <p className="text-sm text-green-700 mt-3 font-medium">
              Auto route enabled: {assignedRouteNames.length > 0
                ? assignedRouteNames.join(' | ')
                : (assignedRouteName || `Route #${assignedRouteId}`)}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module) => (
            <Link key={module.name} href={getModulePath(module.path)} className="group bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/20 p-6 transition-all hover:-translate-y-1">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white text-2xl flex items-center justify-center">{module.icon}</div>
                <div className="text-xs text-gray-500">{loading ? '...' : `${module.stat} records`}</div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{module.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{module.desc}</p>
            </Link>
          ))}
        </div>

        <section id="load-availability" className="mt-8">
          <div className="bg-white/80 backdrop-blur-sm border border-white/40 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sales Ref Load Availability</h2>
                <p className="text-xs text-gray-500">Only in-transit loads on your allocated route are shown here.</p>
              </div>
            </div>

            {routeResolving ? (
              <p className="text-sm text-gray-500">Checking load availability...</p>
            ) : loadAvailability.length === 0 ? (
              <p className="text-sm text-gray-500">No active loads assigned right now.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loadAvailability.map((load) => (
                  <button key={load.id} type="button" onClick={() => openLoadDetailsModal(load)} className="text-left border border-gray-100 rounded-xl p-4 bg-white/70 hover:bg-green-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900">{load.load_number || `Load #${load.id}`}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${load.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {String(load.status || '').replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">Load date: <span className="font-medium text-gray-800">{formatDate(load.load_date)}</span></p>
                    <p className="text-xs text-gray-600 mt-1">Delivery date: <span className="font-medium text-gray-800">{formatDate(load.delivery_date)}</span></p>
                    <p className="text-xs text-gray-600 mt-2">Routes: <span className="font-medium text-gray-800">{load.routeNames.length ? load.routeNames.join(' | ') : '-'}</span></p>
                    <p className="text-[11px] text-green-700 mt-2 font-medium">Click to view load details</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="bg-white/80 backdrop-blur-sm border border-white/40 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">New Customer Registration Performance</h2>
                <p className="text-xs text-gray-500">Compare new customer registrations between previous month and current month.</p>
              </div>
            </div>

            {customerPerfLoading ? (
              <p className="text-sm text-gray-500">Loading registration performance...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-cyan-700">{customerRegistrationPerf.previousLabel || 'Previous Month'}</p>
                    <p className="mt-1 text-2xl font-bold text-cyan-900">{customerRegistrationPerf.previousMonth}</p>
                    <div className="mt-3 h-2.5 rounded-full bg-cyan-100">
                      <div className="h-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${customerPerfTrend.previousBar}%` }} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">{customerRegistrationPerf.currentLabel || 'Current Month'}</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-900">{customerRegistrationPerf.currentMonth}</p>
                    <div className="mt-3 h-2.5 rounded-full bg-emerald-100">
                      <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${customerPerfTrend.currentBar}%` }} />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Month-over-Month Trend</p>
                  <p className={`mt-1 text-base font-semibold ${customerPerfTrend.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {customerPerfTrend.difference >= 0 ? '+' : ''}{customerPerfTrend.difference} customers ({customerPerfTrend.difference >= 0 ? '+' : ''}{customerPerfTrend.changePercent.toFixed(1)}%)
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Based on customer registrations within your currently allocated route scope.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {isLoadDetailModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Load Details: {selectedLoad?.load_number || (selectedLoad ? `Load #${selectedLoad.id}` : '-')}</h3>
                  <p className="text-xs text-slate-500">In-transit availability, sold quantity, return details, and financial summary.</p>
                </div>
                <button type="button" onClick={closeLoadDetailsModal} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Close</button>
              </div>

              <div className="overflow-y-auto p-5 space-y-4 max-h-[78vh]">
                {loadDetailLoading ? (
                  <p className="text-sm text-slate-500">Loading load details...</p>
                ) : loadDetailError ? (
                  <p className="text-sm text-rose-600">{loadDetailError}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <p className="text-[11px] uppercase text-slate-500">Vehicle</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{selectedLoad?.vehicleLabel || '-'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <p className="text-[11px] uppercase text-slate-500">Sales Ref</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{selectedLoad?.salesRefLabel || '-'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <p className="text-[11px] uppercase text-slate-500">Driver</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{selectedLoad?.driverLabel || '-'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <p className="text-[11px] uppercase text-slate-500">Routes</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{selectedLoad?.routeNames?.length ? selectedLoad.routeNames.join(' | ') : '-'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50"><p className="text-[11px] uppercase text-slate-500">Loaded Qty</p><p className="text-lg font-semibold text-slate-900">{formatNumber(loadDetailTotals.loadedQty)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50"><p className="text-[11px] uppercase text-slate-500">Sold Qty</p><p className="text-lg font-semibold text-slate-900">{formatNumber(loadDetailTotals.soldQty)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50"><p className="text-[11px] uppercase text-slate-500">Return Qty</p><p className="text-lg font-semibold text-slate-900">{formatNumber(loadDetailTotals.returnQty)}</p></div>
                      <div className="rounded-xl border border-emerald-200 p-3 bg-emerald-50"><p className="text-[11px] uppercase text-emerald-700">Available Qty</p><p className="text-lg font-semibold text-emerald-800">{formatNumber(loadDetailTotals.availableQty)}</p></div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Invoices</p><p className="text-base font-semibold text-slate-900">{loadDetailTotals.invoiceCount}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Total Sales</p><p className="text-base font-semibold text-slate-900">{formatNumber(loadDetailTotals.totalSales)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Collected</p><p className="text-base font-semibold text-slate-900">{formatNumber(loadDetailTotals.totalCollected)}</p></div>
                      <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Outstanding</p><p className="text-base font-semibold text-slate-900">{formatNumber(loadDetailTotals.outstanding)}</p></div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-900">Selling Performance Preview</h4>
                        <span className="text-xs text-slate-500">Graphical KPI View</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <div className="flex items-center justify-between text-xs text-emerald-800 mb-1"><span>Collection Rate</span><span>{performanceMetrics.collectionRate.toFixed(1)}%</span></div>
                          <div className="h-2.5 rounded-full bg-emerald-100">
                            <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-green-500" style={{ width: `${performanceMetrics.collectionRate}%` }} />
                          </div>
                        </div>

                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <div className="flex items-center justify-between text-xs text-blue-800 mb-1"><span>Profit Margin</span><span>{performanceMetrics.marginRate.toFixed(1)}%</span></div>
                          <div className="h-2.5 rounded-full bg-blue-100">
                            <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${performanceMetrics.marginRate}%` }} />
                          </div>
                        </div>

                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <div className="flex items-center justify-between text-xs text-violet-800 mb-1"><span>Sold Ratio</span><span>{performanceMetrics.soldVsHandledRate.toFixed(1)}%</span></div>
                          <div className="h-2.5 rounded-full bg-violet-100">
                            <div className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${performanceMetrics.soldVsHandledRate}%` }} />
                          </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="flex items-center justify-between text-xs text-amber-800 mb-1"><span>Return Rate</span><span>{performanceMetrics.returnRate.toFixed(1)}%</span></div>
                          <div className="h-2.5 rounded-full bg-amber-100">
                            <div className="h-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${performanceMetrics.returnRate}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                          <p className="text-[11px] uppercase text-slate-500">Total Profit</p>
                          <p className="text-base font-semibold text-slate-900">{formatNumber(performanceMetrics.totalProfit)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                          <p className="text-[11px] uppercase text-slate-500">Collection Efficiency</p>
                          <p className="text-base font-semibold text-slate-900">{performanceMetrics.collectionRate >= 85 ? 'High' : performanceMetrics.collectionRate >= 60 ? 'Medium' : 'Needs Attention'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-emerald-200 p-3 bg-emerald-50">
                        <p className="text-[11px] uppercase text-emerald-700">Cash Collection</p>
                        <p className="text-base font-semibold text-emerald-900 mt-1">{formatNumber(collectionByMethod.cash)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-200 p-3 bg-blue-50">
                        <p className="text-[11px] uppercase text-blue-700">Bank Transfer</p>
                        <p className="text-base font-semibold text-blue-900 mt-1">{formatNumber(collectionByMethod.bankTransfer)}</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 p-3 bg-amber-50">
                        <p className="text-[11px] uppercase text-amber-700">Cheque Collection</p>
                        <p className="text-base font-semibold text-amber-900 mt-1">{formatNumber(collectionByMethod.cheque)}</p>
                      </div>
                    </div>

                    {selectedLoadSummary?.payments?.cheques?.length ? (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Collected Cheque Details</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-white text-slate-600 uppercase text-xs">
                              <tr>
                                <th className="px-3 py-2 text-left">Payment #</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Reference</th>
                                <th className="px-3 py-2 text-left">Bank</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedLoadSummary.payments.cheques.map((chq) => (
                                <tr key={chq.id}>
                                  <td className="px-3 py-2 text-slate-800">{chq.payment_number || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{formatDate(chq.payment_date)}</td>
                                  <td className="px-3 py-2 text-slate-700">{chq.reference_no || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{chq.bank_name || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{chq.status || '-'}</td>
                                  <td className="px-3 py-2 text-right text-slate-900 font-semibold">{formatNumber(Number(chq.amount || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <p className="text-xs text-slate-600">No cheque collections recorded for this load.</p>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                            <tr>
                              <th className="px-3 py-2 text-left">Item</th>
                              <th className="px-3 py-2 text-right">Loaded Qty</th>
                              <th className="px-3 py-2 text-right">Sold Qty</th>
                              <th className="px-3 py-2 text-right">Return Qty</th>
                              <th className="px-3 py-2 text-right">Available Qty</th>
                              <th className="px-3 py-2 text-right">Return Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {loadDetailRows.length === 0 ? (
                              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No item-level records found for this load.</td></tr>
                            ) : (
                              loadDetailRows.map((row) => (
                                <tr key={row.key}>
                                  <td className="px-3 py-2 text-slate-800">{row.code} - {row.name}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatNumber(row.loadedQty)}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatNumber(row.soldQty)}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatNumber(row.returnQty)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatNumber(row.availableQty)}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatNumber(row.returnValue)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {selectedLoadSummary?.period && (
                      <p className="text-xs text-slate-500">Period: {formatDate(selectedLoadSummary.period.from)} to {formatDate(selectedLoadSummary.period.to)}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {assignedRouteId && (
          <section className="mt-8">
            <div className="bg-white/80 backdrop-blur-sm border border-white/40 rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Allocated Route Customers</h2>
                  <p className="text-xs text-gray-500">
                    Shops on your auto-assigned route.
                  </p>
                </div>
                <Link
                  href={getModulePath('/dashboard/distribution/customers')}
                  className="text-xs font-medium text-green-700 hover:text-green-900"
                >
                  View all →
                </Link>
              </div>

              {routeCustomersLoading ? (
                <p className="text-sm text-gray-500">Loading customers...</p>
              ) : routeCustomers.length === 0 ? (
                <p className="text-sm text-gray-500">No customers found for this route.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {routeCustomers.slice(0, 9).map((customer) => (
                    <div
                      key={customer.id}
                      className="border border-gray-100 rounded-xl p-4 bg-white/70 hover:bg-green-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {customer.shop_name}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {customer.customer_code}
                        </span>
                      </div>
                      {typeof customer.outstanding === 'number' && (
                        <p className="text-xs text-gray-700 mt-1">
                          Outstanding: <span className="font-semibold">{customer.outstanding.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
