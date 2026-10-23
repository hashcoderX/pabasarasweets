'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
};

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  customer_id?: number;
  customer?: CustomerInfo | null;
  invoice_date?: string;
  load_id?: number | null;
  total?: number;
  paid_amount?: number;
  status?: InvoiceStatus;
};

type PaymentRow = {
  id: number;
  distribution_invoice_id?: number | null;
  amount?: number;
  payment_date?: string;
  status?: string;
};

type LoadRoute = {
  route_id?: number;
  sequence_no?: number;
  route?: {
    id?: number;
    name?: string;
    origin?: string;
    destination?: string;
  } | null;
};

type LoadRow = {
  id: number;
  load_number?: string;
  load_date?: string;
  delivery_date?: string | null;
  status?: string;
  sales_ref_id?: number | null;
  sales_ref?: {
    id?: number;
    employee_code?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
  } | null;
  vehicle?: {
    registration_number?: string;
    type?: string;
  } | null;
  driver?: {
    employee_code?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
  } | null;
  route?: {
    id?: number;
    name?: string;
    origin?: string;
    destination?: string;
  } | null;
  load_routes?: LoadRoute[];
  loadRoutes?: LoadRoute[];
};

type PaginatedPayload<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type PermissionLike = { name?: string };
type RoleLike = { name?: string; permissions?: PermissionLike[] };
type UserProfile = {
  employee_id?: number | null;
  employee?: { id?: number | null } | null;
  role?: string | null;
  roles?: Array<string | RoleLike>;
};

type SalesSummaryRow = {
  key: string;
  loadId: number | null;
  loadLabel: string;
  routeName: string;
  invoiceCount: number;
  customerCount: number;
  grossSales: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
};

type SalesSummaryCache = {
  cachedAt: number;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  loads: LoadRow[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const SALES_SUMMARY_CACHE_TTL_MS = 3 * 60 * 1000;
const SALES_SUMMARY_CACHE_MAX_CHARS = 2_000_000;

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateLabel = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const parseDateValue = (value?: string): Date | null => {
  if (!value) return null;
  const normalized = value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const routeLabel = (route?: { name?: string; origin?: string; destination?: string } | null) => {
  if (!route) return '-';
  return route.name || [route.origin, route.destination].filter(Boolean).join(' -> ') || '-';
};

const summarizePayload = <T,>(payload: unknown): { data: T[]; next_page_url: string | null } => {
  if (Array.isArray(payload)) {
    return { data: payload as T[], next_page_url: null };
  }

  if (typeof payload === 'object' && payload !== null) {
    const row = payload as Partial<PaginatedPayload<T>>;
    return {
      data: Array.isArray(row.data) ? row.data : [],
      next_page_url: typeof row.next_page_url === 'string' ? row.next_page_url : null,
    };
  }

  return { data: [], next_page_url: null };
};

const extractPagePayload = (responseData: unknown): unknown => {
  if (Array.isArray(responseData)) return responseData;
  if (typeof responseData !== 'object' || responseData === null) return responseData;

  const root = responseData as Record<string, unknown>;

  if (Array.isArray(root.data) && 'next_page_url' in root) {
    return root;
  }

  if (typeof root.data === 'object' && root.data !== null) {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.data) || 'next_page_url' in nested) {
      return nested;
    }
  }

  if (Array.isArray(root.data)) {
    return root.data;
  }

  return root;
};

export default function DistributionSalesSummaryReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loadFilter, setLoadFilter] = useState('all');
  const [salesRefFilter, setSalesRefFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentEmployeeId, setCurrentEmployeeId] = useState(0);
  const [isSalesRefUser, setIsSalesRefUser] = useState(false);
  const [cacheKey, setCacheKey] = useState('');
  const [allocatedPage, setAllocatedPage] = useState(1);
  const [allocatedRowsPerPage, setAllocatedRowsPerPage] = useState(10);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryRowsPerPage, setSummaryRowsPerPage] = useState(10);
  const [latestPage, setLatestPage] = useState(1);
  const [latestRowsPerPage, setLatestRowsPerPage] = useState(10);
  const [loadingStep, setLoadingStep] = useState<'idle' | 'loads' | 'invoices' | 'payments'>('idle');

  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const fetchPaginated = useCallback(async <T,>(endpoint: string, authToken: string): Promise<T[]> => {
    const rows: T[] = [];
    const normalizedEndpoint = endpoint.replace(/^\/+/, '');
    const queryJoiner = normalizedEndpoint.includes('?') ? '&' : '?';
    let nextUrl: string | null = `${API_URL}/api/${normalizedEndpoint}${queryJoiner}per_page=200`;
    let pageCount = 0;

    while (nextUrl && pageCount < 100) {
      const response = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });

      const rawPayload = extractPagePayload(response.data);
      const payload = summarizePayload<T>(rawPayload);

      rows.push(...payload.data);
      nextUrl = payload.next_page_url;
      pageCount += 1;
    }

    return rows;
  }, []);

  const readSummaryCache = useCallback((key: string): SalesSummaryCache | null => {
    if (!key) return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const data = parsed as Record<string, unknown>;

      if (
        typeof data.cachedAt !== 'number' ||
        !Array.isArray(data.invoices) ||
        !Array.isArray(data.payments) ||
        !Array.isArray(data.loads)
      ) {
        return null;
      }

      return {
        cachedAt: data.cachedAt,
        invoices: data.invoices as InvoiceRow[],
        payments: data.payments as PaymentRow[],
        loads: data.loads as LoadRow[],
      };
    } catch (error) {
      console.error('Error reading sales summary cache:', error);
      return null;
    }
  }, []);

  const writeSummaryCache = useCallback((key: string, rows: Omit<SalesSummaryCache, 'cachedAt'>) => {
    if (!key) return;
    try {
      const payload: SalesSummaryCache = {
        cachedAt: Date.now(),
        invoices: rows.invoices.map((invoice) => ({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          customer: invoice.customer
            ? {
                id: invoice.customer.id,
                shop_name: invoice.customer.shop_name,
                customer_code: invoice.customer.customer_code,
              }
            : null,
          invoice_date: invoice.invoice_date,
          load_id: invoice.load_id,
          total: invoice.total,
          paid_amount: invoice.paid_amount,
          status: invoice.status,
        })),
        payments: rows.payments.map((payment) => ({
          id: payment.id,
          distribution_invoice_id: payment.distribution_invoice_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          status: payment.status,
        })),
        loads: rows.loads.map((load) => ({
          id: load.id,
          load_number: load.load_number,
          load_date: load.load_date,
          delivery_date: load.delivery_date,
          status: load.status,
          sales_ref_id: load.sales_ref_id,
          sales_ref: load.sales_ref
            ? {
                id: load.sales_ref.id,
                employee_code: load.sales_ref.employee_code,
                first_name: load.sales_ref.first_name,
                last_name: load.sales_ref.last_name,
                name: load.sales_ref.name,
              }
            : null,
          vehicle: load.vehicle
            ? {
                registration_number: load.vehicle.registration_number,
                type: load.vehicle.type,
              }
            : null,
          driver: load.driver
            ? {
                employee_code: load.driver.employee_code,
                first_name: load.driver.first_name,
                last_name: load.driver.last_name,
                name: load.driver.name,
              }
            : null,
          route: load.route
            ? {
                id: load.route.id,
                name: load.route.name,
                origin: load.route.origin,
                destination: load.route.destination,
              }
            : null,
          load_routes: Array.isArray(load.load_routes)
            ? load.load_routes.map((entry) => ({
                route_id: entry.route_id,
                sequence_no: entry.sequence_no,
                route: entry.route
                  ? {
                      id: entry.route.id,
                      name: entry.route.name,
                      origin: entry.route.origin,
                      destination: entry.route.destination,
                    }
                  : null,
              }))
            : [],
          loadRoutes: Array.isArray(load.loadRoutes)
            ? load.loadRoutes.map((entry) => ({
                route_id: entry.route_id,
                sequence_no: entry.sequence_no,
                route: entry.route
                  ? {
                      id: entry.route.id,
                      name: entry.route.name,
                      origin: entry.route.origin,
                      destination: entry.route.destination,
                    }
                  : null,
              }))
            : [],
        })),
      };

      const serialized = JSON.stringify(payload);
      if (serialized.length > SALES_SUMMARY_CACHE_MAX_CHARS) {
        sessionStorage.removeItem(key);
        console.warn('Skipping sales summary cache: payload too large.');
        return;
      }

      sessionStorage.setItem(key, serialized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('quota')) {
        sessionStorage.removeItem(key);
        console.warn('Skipping sales summary cache: storage quota exceeded.');
        return;
      }
      console.error('Error writing sales summary cache:', error);
    }
  }, []);

  const loadReportData = useCallback(async (authToken?: string, options?: { skipLoading?: boolean; cacheKeyOverride?: string }) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    const key = options?.cacheKeyOverride || cacheKey;

    if (!options?.skipLoading) setLoading(true);
    setLoadingStep('loads');
    setErrorMessage('');

    try {
      const loadRows = await fetchPaginated<LoadRow>('vehicle-loading/loads', tokenToUse);
      setLoads(loadRows);
      setLoadingStep('invoices');

      const invoiceRows = await fetchPaginated<InvoiceRow>('distribution/invoices?exclude_cancelled=1', tokenToUse);
      setInvoices(invoiceRows);
      setLoadingStep('payments');

      const paymentRows = await fetchPaginated<PaymentRow>('distribution/payments', tokenToUse);
      setPayments(paymentRows);

      writeSummaryCache(key, {
        invoices: invoiceRows,
        payments: paymentRows,
        loads: loadRows,
      });
    } catch (error) {
      console.error('Error loading sales summary report data:', error);
      setErrorMessage('Failed to load sales summary report data.');
    } finally {
      setLoadingStep('idle');
      if (!options?.skipLoading) setLoading(false);
    }
  }, [fetchPaginated, token, cacheKey, writeSummaryCache]);

  useEffect(() => {
    if (!token) return;

    const verifyAndLoad = async () => {
      try {
        const userRes = await axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });

        const rawUser = userRes.data;
        const userData = ((rawUser?.data?.user ?? rawUser?.data ?? rawUser?.user ?? rawUser) || {}) as UserProfile;
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);

        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role) => (typeof role === 'string' ? role : String(role?.name || '')))
            : []),
        ]
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role) => {
              if (typeof role === 'string') return [] as string[];
              return Array.isArray(role.permissions)
                ? role.permissions.map((permission) => String(permission?.name || '').trim().toLowerCase()).filter(Boolean)
                : [];
            })
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission) => permission.includes('report'));
        const salesRefRole =
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref');

        if (!isAdminUser && !hasReportPermission && !salesRefRole) {
          router.push('/dashboard');
          return;
        }

        setCurrentEmployeeId(employeeId);
        setIsSalesRefUser(salesRefRole && !isAdminUser);
        if (salesRefRole && employeeId > 0) {
          setSalesRefFilter(String(employeeId));
        }

        const resolvedCacheKey = `distribution-sales-summary:v1:employee:${employeeId > 0 ? employeeId : 'admin'}`;
        setCacheKey(resolvedCacheKey);

        const cachedRows = readSummaryCache(resolvedCacheKey);
        const cacheHasData = Boolean(
          cachedRows &&
          (cachedRows.invoices.length > 0 || cachedRows.payments.length > 0 || cachedRows.loads.length > 0)
        );
        const cacheIsFresh = cachedRows ? (Date.now() - cachedRows.cachedAt) < SALES_SUMMARY_CACHE_TTL_MS : false;

        if (cachedRows) {
          setInvoices(cachedRows.invoices);
          setPayments(cachedRows.payments);
          setLoads(cachedRows.loads);
        }

        setAccessReady(true);

        if (!cacheIsFresh || !cacheHasData) {
          void loadReportData(token, {
            skipLoading: Boolean(cachedRows),
            cacheKeyOverride: resolvedCacheKey,
          });
        }
      } catch (error) {
        console.error('Error validating sales summary report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    void verifyAndLoad();
  }, [token, router, loadReportData, readSummaryCache]);

  const loadById = useMemo(() => {
    const map = new Map<number, LoadRow>();
    loads.forEach((load) => map.set(Number(load.id), load));
    return map;
  }, [loads]);

  const paymentsByInvoice = useMemo(() => {
    const map = new Map<number, number>();
    payments.forEach((payment) => {
      if (String(payment.status || '').toLowerCase() === 'bounced') return;
      const invoiceId = Number(payment.distribution_invoice_id || 0);
      if (!invoiceId) return;
      map.set(invoiceId, (map.get(invoiceId) || 0) + Number(payment.amount || 0));
    });
    return map;
  }, [payments]);

  const loadOptions = useMemo(() => {
    const optionMap = new Map<string, string>();

    loads.forEach((load) => {
      const label = [load.load_number || `Load #${load.id}`, routeLabel(load.route)].filter(Boolean).join(' | ');
      optionMap.set(String(load.id), label);
    });

    invoices.forEach((invoice) => {
      const loadId = Number(invoice.load_id || 0);
      if (!loadId || optionMap.has(String(loadId))) return;
      optionMap.set(String(loadId), `Load #${loadId}`);
    });

    return Array.from(optionMap.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [loads, invoices]);

  const salesRefOptions = useMemo(() => {
    const map = new Map<number, string>();
    loads.forEach((load) => {
      const salesRefId = Number(load.sales_ref_id || load.sales_ref?.id || 0);
      if (!salesRefId) return;
      const label =
        [load.sales_ref?.employee_code, load.sales_ref?.first_name, load.sales_ref?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        load.sales_ref?.name ||
        `Sales Ref #${salesRefId}`;
      if (!map.has(salesRefId)) map.set(salesRefId, label);
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({ id: String(id), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [loads]);

  const filteredInvoices = useMemo(() => {
    const fromBoundary = fromDate ? parseDateValue(`${fromDate}T00:00:00`) : null;
    const toBoundary = toDate ? parseDateValue(`${toDate}T23:59:59`) : null;
    const term = searchTerm.trim().toLowerCase();

    return invoices
      .filter((invoice) => {
        if (String(invoice.status || '').toLowerCase() === 'cancelled') return false;

        const loadId = Number(invoice.load_id || 0);
        if (loadFilter !== 'all' && loadId !== Number(loadFilter)) return false;

        const linkedLoad = loadId ? loadById.get(loadId) : null;
        const salesRefId = Number(linkedLoad?.sales_ref_id || linkedLoad?.sales_ref?.id || 0);
        if (salesRefFilter !== 'all' && salesRefId !== Number(salesRefFilter)) return false;
        if (isSalesRefUser && currentEmployeeId > 0 && salesRefId !== currentEmployeeId) return false;

        const invoiceDate = parseDateValue(invoice.invoice_date);
        if (fromBoundary && invoiceDate && invoiceDate < fromBoundary) return false;
        if (toBoundary && invoiceDate && invoiceDate > toBoundary) return false;

        if (!term) return true;
        const text = [
          invoice.invoice_number,
          invoice.customer?.shop_name,
          invoice.customer?.customer_code,
          linkedLoad?.load_number,
          routeLabel(linkedLoad?.route),
        ]
          .map((item) => String(item || '').toLowerCase())
          .join(' ');

        return text.includes(term);
      })
      .sort((a, b) => {
        const aTime = parseDateValue(a.invoice_date)?.getTime() || 0;
        const bTime = parseDateValue(b.invoice_date)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [invoices, loadFilter, salesRefFilter, isSalesRefUser, currentEmployeeId, fromDate, toDate, searchTerm, loadById]);

  const summaryRows = useMemo(() => {
    const grouped = new Map<string, SalesSummaryRow>();

    filteredInvoices.forEach((invoice) => {
      const loadId = Number(invoice.load_id || 0) || null;
      const load = loadId ? loadById.get(loadId) : null;
      const key = loadId ? `load-${loadId}` : `load-unassigned`;
      const loadLabel = load?.load_number || (loadId ? `Load #${loadId}` : 'Unassigned Load');
      const routeName = routeLabel(load?.route);

      const grossSales = Number(invoice.total || 0);
      const collected = paymentsByInvoice.get(Number(invoice.id)) ?? Number(invoice.paid_amount || 0);
      const outstanding = Math.max(0, grossSales - collected);

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          loadId,
          loadLabel,
          routeName,
          invoiceCount: 0,
          customerCount: 0,
          grossSales: 0,
          collected: 0,
          outstanding: 0,
          collectionRate: 0,
        });
      }

      const target = grouped.get(key);
      if (!target) return;
      target.invoiceCount += 1;
      if (Number(invoice.customer_id || 0) > 0) target.customerCount += 1;
      target.grossSales += grossSales;
      target.collected += collected;
      target.outstanding += outstanding;
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        collectionRate: row.grossSales > 0 ? (row.collected / row.grossSales) * 100 : 0,
      }))
      .sort((a, b) => {
        if (a.loadLabel === b.loadLabel) return b.grossSales - a.grossSales;
        return a.loadLabel.localeCompare(b.loadLabel);
      });
  }, [filteredInvoices, loadById, paymentsByInvoice]);

  const totals = useMemo(() => {
    const invoiceCount = filteredInvoices.length;
    const loadCount = summaryRows.length;
    const grossSales = summaryRows.reduce((sum, row) => sum + row.grossSales, 0);
    const collected = summaryRows.reduce((sum, row) => sum + row.collected, 0);
    const outstanding = summaryRows.reduce((sum, row) => sum + row.outstanding, 0);
    const collectionRate = grossSales > 0 ? (collected / grossSales) * 100 : 0;
    return { invoiceCount, loadCount, grossSales, collected, outstanding, collectionRate };
  }, [filteredInvoices.length, summaryRows]);

  const allocatedLoads = useMemo(() => {
    const selectedSalesRefId = salesRefFilter !== 'all' ? Number(salesRefFilter) : 0;
    const targetSalesRefId = selectedSalesRefId || (isSalesRefUser ? currentEmployeeId : 0);

    return loads
      .filter((load) => {
        const salesRefId = Number(load.sales_ref_id || load.sales_ref?.id || 0);
        if (!salesRefId) return false;
        if (targetSalesRefId > 0) return salesRefId === targetSalesRefId;
        return true;
      })
      .map((load) => {
        const routeEntries = Array.isArray(load.load_routes)
          ? [...load.load_routes]
          : Array.isArray(load.loadRoutes)
            ? [...load.loadRoutes]
            : [];
        routeEntries.sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
        const routeNames = routeEntries
          .map((entry) => routeLabel(entry.route || null))
          .filter((name) => name !== '-');
        const routeValue = routeNames.length > 0 ? routeNames.join(', ') : routeLabel(load.route);
        const salesRefLabel =
          [load.sales_ref?.employee_code, load.sales_ref?.first_name, load.sales_ref?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          load.sales_ref?.name ||
          '-';
        const vehicleLabel = load.vehicle?.registration_number || load.vehicle?.type || '-';
        const driverLabel =
          [load.driver?.employee_code, load.driver?.first_name, load.driver?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          load.driver?.name ||
          '-';

        return {
          id: Number(load.id),
          loadNumber: load.load_number || `Load #${load.id}`,
          loadDate: load.load_date || '',
          deliveryDate: load.delivery_date || '',
          status: String(load.status || '-'),
          routeValue,
          salesRefLabel,
          vehicleLabel,
          driverLabel,
        };
      })
      .sort((a, b) => {
        const aTime = parseDateValue(a.loadDate)?.getTime() || 0;
        const bTime = parseDateValue(b.loadDate)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [loads, salesRefFilter, isSalesRefUser, currentEmployeeId]);

  const allocatedTotalPages = useMemo(
    () => Math.max(1, Math.ceil(allocatedLoads.length / allocatedRowsPerPage)),
    [allocatedLoads.length, allocatedRowsPerPage]
  );

  const paginatedAllocatedLoads = useMemo(() => {
    const startIndex = (allocatedPage - 1) * allocatedRowsPerPage;
    return allocatedLoads.slice(startIndex, startIndex + allocatedRowsPerPage);
  }, [allocatedLoads, allocatedPage, allocatedRowsPerPage]);

  useEffect(() => {
    setAllocatedPage(1);
  }, [salesRefFilter, allocatedRowsPerPage, isSalesRefUser, currentEmployeeId]);

  useEffect(() => {
    if (allocatedPage > allocatedTotalPages) {
      setAllocatedPage(allocatedTotalPages);
    }
  }, [allocatedPage, allocatedTotalPages]);

  const summaryTotalPages = useMemo(
    () => Math.max(1, Math.ceil(summaryRows.length / summaryRowsPerPage)),
    [summaryRows.length, summaryRowsPerPage]
  );

  const paginatedSummaryRows = useMemo(() => {
    const startIndex = (summaryPage - 1) * summaryRowsPerPage;
    return summaryRows.slice(startIndex, startIndex + summaryRowsPerPage);
  }, [summaryRows, summaryPage, summaryRowsPerPage]);

  useEffect(() => {
    setSummaryPage(1);
  }, [fromDate, toDate, loadFilter, salesRefFilter, searchTerm, summaryRowsPerPage]);

  useEffect(() => {
    if (summaryPage > summaryTotalPages) {
      setSummaryPage(summaryTotalPages);
    }
  }, [summaryPage, summaryTotalPages]);

  const latestSalesRows = useMemo(() => {
    return filteredInvoices.map((invoice) => {
      const loadId = Number(invoice.load_id || 0);
      const load = loadId ? loadById.get(loadId) : null;
      const gross = Number(invoice.total || 0);
      const collected = paymentsByInvoice.get(Number(invoice.id)) ?? Number(invoice.paid_amount || 0);
      return {
        id: Number(invoice.id),
        invoiceNumber: String(invoice.invoice_number || '-'),
        invoiceDate: invoice.invoice_date || '',
        customerName: invoice.customer?.shop_name || '-',
        customerCode: invoice.customer?.customer_code || '-',
        loadLabel: load?.load_number || (loadId ? `Load #${loadId}` : '-'),
        routeName: routeLabel(load?.route),
        status: String(invoice.status || 'pending'),
        gross,
        collected,
        outstanding: Math.max(0, gross - collected),
      };
    });
  }, [filteredInvoices, loadById, paymentsByInvoice]);

  const latestTotalPages = useMemo(
    () => Math.max(1, Math.ceil(latestSalesRows.length / latestRowsPerPage)),
    [latestSalesRows.length, latestRowsPerPage]
  );

  const paginatedLatestSalesRows = useMemo(() => {
    const startIndex = (latestPage - 1) * latestRowsPerPage;
    return latestSalesRows.slice(startIndex, startIndex + latestRowsPerPage);
  }, [latestSalesRows, latestPage, latestRowsPerPage]);

  useEffect(() => {
    setLatestPage(1);
  }, [fromDate, toDate, loadFilter, salesRefFilter, searchTerm, latestRowsPerPage]);

  useEffect(() => {
    if (latestPage > latestTotalPages) {
      setLatestPage(latestTotalPages);
    }
  }, [latestPage, latestTotalPages]);

  const stepMessage = useMemo(() => {
    if (loadingStep === 'loads') return 'Step 1/3: Loading allocated loads preview...';
    if (loadingStep === 'invoices') return 'Step 2/3: Loading invoices...';
    if (loadingStep === 'payments') return 'Step 3/3: Loading payments and finalizing totals...';
    return '';
  }, [loadingStep]);

  const isRefreshing = loading || loadingStep !== 'idle';

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-cyan-50 to-slate-100">
        <div className="h-11 w-11 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-slate-100 text-slate-800">
      <nav className="bg-white/85 backdrop-blur border-b border-white/60 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/reports" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            ← Back to Reports
          </Link>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Distribution
          </span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-7 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-3xl border border-white/60 bg-white/85 shadow-xl p-6">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Sales Summary Report</h1>
          <p className="mt-2 text-slate-600">
            Latest sales details with load/date filters and sales-ref allocated load preview.
          </p>
          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          {stepMessage && (
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
              {stepMessage}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <label className="text-sm font-semibold text-slate-700">
              From date
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Load
              <select
                value={loadFilter}
                onChange={(event) => setLoadFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All Loads</option>
                {loadOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sales ref
              <select
                value={salesRefFilter}
                onChange={(event) => setSalesRefFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All Sales Refs</option>
                {salesRefOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Search
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Invoice, customer, load..."
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setLoadFilter('all');
                setSearchTerm('');
                setSalesRefFilter(isSalesRefUser && currentEmployeeId > 0 ? String(currentEmployeeId) : 'all');
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={() => void loadReportData()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <article className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Loads</p>
            <p className="mt-2 text-2xl font-black text-emerald-900">{totals.loadCount}</p>
          </article>
          <article className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Invoices</p>
            <p className="mt-2 text-2xl font-black text-blue-900">{totals.invoiceCount}</p>
          </article>
          <article className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Gross Sales</p>
            <p className="mt-2 text-2xl font-black text-cyan-900">{money(totals.grossSales)}</p>
          </article>
          <article className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Collected</p>
            <p className="mt-2 text-2xl font-black text-teal-900">{money(totals.collected)}</p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</p>
            <p className="mt-2 text-2xl font-black text-amber-900">{money(totals.outstanding)}</p>
            <p className="mt-1 text-xs text-amber-700">Collection Rate: {totals.collectionRate.toFixed(2)}%</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900">Sales Ref Allocated Load Details</h2>
            <p className="text-xs text-slate-600 mt-0.5">Preview of allocated loads for selected sales ref.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Load</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Sales Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Route(s)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Load Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {allocatedLoads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No allocated loads found for current sales-ref filter.</td>
                  </tr>
                ) : (
                  paginatedAllocatedLoads.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.loadNumber}</td>
                      <td className="px-4 py-3 text-slate-700">{row.salesRefLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.routeValue}</td>
                      <td className="px-4 py-3 text-slate-700">{row.vehicleLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.driverLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{dateLabel(row.loadDate)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {allocatedLoads.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-600">
                {(() => {
                  const startRow = (allocatedPage - 1) * allocatedRowsPerPage + 1;
                  const endRow = Math.min(allocatedLoads.length, allocatedPage * allocatedRowsPerPage);
                  return `Showing ${startRow}-${endRow} of ${allocatedLoads.length}`;
                })()}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="allocated-loads-rows-per-page">Rows</label>
                <select
                  id="allocated-loads-rows-per-page"
                  value={allocatedRowsPerPage}
                  onChange={(event) => setAllocatedRowsPerPage(Number(event.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  type="button"
                  onClick={() => setAllocatedPage((page) => Math.max(1, page - 1))}
                  disabled={allocatedPage <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-700">Page {allocatedPage} of {allocatedTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setAllocatedPage((page) => Math.min(allocatedTotalPages, page + 1))}
                  disabled={allocatedPage >= allocatedTotalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900">Load-wise Sales Summary</h2>
            <p className="text-xs text-slate-600 mt-0.5">Summary after applying current filters.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Load</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Route</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Invoices</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Customers</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No summary rows for current filters.</td>
                  </tr>
                ) : (
                  paginatedSummaryRows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.loadLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.routeName}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.invoiceCount}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.customerCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-cyan-700">{money(row.grossSales)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-700">{money(row.collected)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">{money(row.outstanding)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.collectionRate.toFixed(2)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {summaryRows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-600">
                {(() => {
                  const startRow = (summaryPage - 1) * summaryRowsPerPage + 1;
                  const endRow = Math.min(summaryRows.length, summaryPage * summaryRowsPerPage);
                  return `Showing ${startRow}-${endRow} of ${summaryRows.length}`;
                })()}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="summary-rows-per-page">Rows</label>
                <select
                  id="summary-rows-per-page"
                  value={summaryRowsPerPage}
                  onChange={(event) => setSummaryRowsPerPage(Number(event.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSummaryPage((page) => Math.max(1, page - 1))}
                  disabled={summaryPage <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-700">Page {summaryPage} of {summaryTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setSummaryPage((page) => Math.min(summaryTotalPages, page + 1))}
                  disabled={summaryPage >= summaryTotalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
            <h2 className="font-semibold text-slate-900">Latest Sales Details</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Auto-loaded on page open; currently showing {latestSalesRows.length} invoices after filters.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Load</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Route</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {latestSalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No invoices match current filters.</td>
                  </tr>
                ) : (
                  paginatedLatestSalesRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-700">{dateLabel(row.invoiceDate)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.customerName} ({row.customerCode})</td>
                      <td className="px-4 py-3 text-slate-700">{row.loadLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.routeName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-cyan-700">{money(row.gross)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-700">{money(row.collected)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">{money(row.outstanding)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {latestSalesRows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-600">
                {(() => {
                  const startRow = (latestPage - 1) * latestRowsPerPage + 1;
                  const endRow = Math.min(latestSalesRows.length, latestPage * latestRowsPerPage);
                  return `Showing ${startRow}-${endRow} of ${latestSalesRows.length}`;
                })()}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-600" htmlFor="latest-rows-per-page">Rows</label>
                <select
                  id="latest-rows-per-page"
                  value={latestRowsPerPage}
                  onChange={(event) => setLatestRowsPerPage(Number(event.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  type="button"
                  onClick={() => setLatestPage((page) => Math.max(1, page - 1))}
                  disabled={latestPage <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-700">Page {latestPage} of {latestTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setLatestPage((page) => Math.min(latestTotalPages, page + 1))}
                  disabled={latestPage >= latestTotalPages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
