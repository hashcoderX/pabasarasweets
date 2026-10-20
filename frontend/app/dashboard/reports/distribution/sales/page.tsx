'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
  route_id?: number | null;
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

type LoadRow = {
  id: number;
  load_number?: string;
  load_date?: string;
  delivery_date?: string | null;
  sales_ref_id?: number | null;
  sales_ref?: {
    id?: number;
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
  loadRoutes?: Array<{
    route_id?: number;
    route?: {
      id?: number;
      name?: string;
      origin?: string;
      destination?: string;
    } | null;
  }>;
  load_routes?: Array<{
    route_id?: number;
    route?: {
      id?: number;
      name?: string;
      origin?: string;
      destination?: string;
    } | null;
  }>;
};

type RolePermission = { name?: string };
type UserRole = string | { name?: string; permissions?: RolePermission[] };
type RouteShape = { name?: string; origin?: string; destination?: string };
type EmployeeLite = { id: number; reporting_person_id?: number | null; employee_code?: string; first_name?: string; last_name?: string };

const getRouteLabel = (route?: RouteShape | null) => {
  if (!route) return '-';
  return route.name || [route.origin, route.destination].filter(Boolean).join(' -> ') || '-';
};

const getLoadRouteEntries = (load?: LoadRow | null) => {
  if (!load) return [] as Array<{ routeId: number; label: string }>;

  const primaryRouteId = Number(load.route?.id || 0);
  const primaryEntry = primaryRouteId > 0
    ? [{ routeId: primaryRouteId, label: getRouteLabel(load.route) }]
    : [];

  const extraEntries = (Array.isArray(load.loadRoutes) ? load.loadRoutes : Array.isArray(load.load_routes) ? load.load_routes : [])
    .map((entry) => {
      const routeId = Number(entry?.route_id || entry?.route?.id || 0);
      if (!routeId) return null;
      const label = getRouteLabel(entry?.route || null);
      return { routeId, label };
    })
    .filter((entry): entry is { routeId: number; label: string } => entry !== null);

  const all = [...primaryEntry, ...extraEntries];
  const map = new Map<number, { routeId: number; label: string }>();
  all.forEach((entry) => {
    if (!map.has(entry.routeId)) map.set(entry.routeId, entry);
  });

  return Array.from(map.values());
};

type PaginatedExtractResult<T> = {
  rows: T[];
  nextPageUrl: string | null;
};

type SalesViewRow = {
  id: number;
  rowKey: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string;
  customerName: string;
  loadId: number;
  loadNumber: string;
  routeId: number | null;
  routeKey: string;
  routeName: string;
  status: InvoiceStatus;
  salesAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
};

type SalesRowsCache = {
  cachedAt: number;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  loads: LoadRow[];
};

const SALES_ROWS_CACHE_KEY = 'distribution-sales-report:rows:v1';
const SALES_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
const SALES_ROWS_CACHE_MAX_CHARS = 2_000_000;
const SALES_ROWS_CACHE_LIMITS = {
  invoices: 1200,
  payments: 2500,
  loads: 1000,
} as const;

const extractPaginatedRows = <T,>(responseData: unknown): PaginatedExtractResult<T> => {
  if (!responseData || typeof responseData !== 'object') {
    return { rows: [], nextPageUrl: null };
  }

  const root = responseData as Record<string, unknown>;
  const directData = root.data;

  if (directData && typeof directData === 'object' && !Array.isArray(directData)) {
    const nested = directData as Record<string, unknown>;
    const rows = Array.isArray(nested.data) ? (nested.data as T[]) : [];
    const nextPageUrl = typeof nested.next_page_url === 'string' ? nested.next_page_url : null;
    return { rows, nextPageUrl };
  }

  if (Array.isArray(directData)) {
    return { rows: directData as T[], nextPageUrl: null };
  }

  if (Array.isArray(responseData)) {
    return { rows: responseData as T[], nextPageUrl: null };
  }

  const rows = Array.isArray(root.data) ? (root.data as T[]) : [];
  const nextPageUrl = typeof root.next_page_url === 'string' ? root.next_page_url : null;
  return { rows, nextPageUrl };
};

export default function DistributionSalesReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [loadFilter, setLoadFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentEmployeeId, setCurrentEmployeeId] = useState(0);
  const [teamMemberIds, setTeamMemberIds] = useState<number[]>([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [viewScope, setViewScope] = useState<'all' | 'my' | 'team'>('all');
  const [salesRefFilter, setSalesRefFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  const fetchPaginated = useCallback(async <T,>(endpoint: string, authToken: string) => {
    const rows: T[] = [];
    let nextUrl: string | null = `${API_URL}/api/${endpoint}?per_page=200`;
    let pageCount = 0;
    const visitedUrls = new Set<string>();

    while (nextUrl && pageCount < 50) {
      if (visitedUrls.has(nextUrl)) {
        console.warn(`Stopping pagination loop for ${endpoint}: repeated next_page_url`, nextUrl);
        break;
      }
      visitedUrls.add(nextUrl);

      const { data: responseData } = await axios.get<unknown>(nextUrl, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });

      const extracted: PaginatedExtractResult<T> = extractPaginatedRows<T>(responseData);
      rows.push(...extracted.rows);
      nextUrl = extracted.nextPageUrl;
      pageCount += 1;
    }

    return rows;
  }, [API_URL]);

  const readSalesRowsCache = useCallback((): SalesRowsCache | null => {
    try {
      const raw = localStorage.getItem(SALES_ROWS_CACHE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const data = parsed as Record<string, unknown>;
      const cachedAt = data.cachedAt;
      const invoices = data.invoices;
      const payments = data.payments;
      const loads = data.loads;

      if (
        typeof cachedAt !== 'number' ||
        !Array.isArray(invoices) ||
        !Array.isArray(payments) ||
        !Array.isArray(loads)
      ) {
        return null;
      }

      return {
        cachedAt,
        invoices: invoices as InvoiceRow[],
        payments: payments as PaymentRow[],
        loads: loads as LoadRow[],
      };
    } catch (error) {
      console.error('Error reading sales rows cache:', error);
      return null;
    }
  }, []);

  const writeSalesRowsCache = useCallback((rows: Omit<SalesRowsCache, 'cachedAt'>) => {
    try {
      const compactInvoices: InvoiceRow[] = rows.invoices.map((invoice) => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        customer: invoice.customer
          ? {
              id: invoice.customer.id,
              shop_name: invoice.customer.shop_name,
              customer_code: invoice.customer.customer_code,
              route_id: invoice.customer.route_id,
            }
          : null,
        invoice_date: invoice.invoice_date,
        load_id: invoice.load_id,
        total: invoice.total,
        paid_amount: invoice.paid_amount,
        status: invoice.status,
      }));

      const compactPayments: PaymentRow[] = rows.payments.map((payment) => ({
        id: payment.id,
        distribution_invoice_id: payment.distribution_invoice_id,
        amount: payment.amount,
        payment_date: payment.payment_date,
        status: payment.status,
      }));

      const compactLoads: LoadRow[] = rows.loads.map((load) => ({
        id: load.id,
        load_number: load.load_number,
        load_date: load.load_date,
        delivery_date: load.delivery_date,
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
        route: load.route
          ? {
              id: load.route.id,
              name: load.route.name,
              origin: load.route.origin,
              destination: load.route.destination,
            }
          : null,
        loadRoutes: Array.isArray(load.loadRoutes)
          ? load.loadRoutes.map((entry) => ({
              route_id: entry.route_id,
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
        load_routes: Array.isArray(load.load_routes)
          ? load.load_routes.map((entry) => ({
              route_id: entry.route_id,
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
      }));

      const payload: SalesRowsCache = {
        cachedAt: Date.now(),
        invoices: compactInvoices,
        payments: compactPayments,
        loads: compactLoads,
      };
      let serialized = JSON.stringify(payload);

      if (serialized.length > SALES_ROWS_CACHE_MAX_CHARS) {
        const reducedPayload: SalesRowsCache = {
          cachedAt: payload.cachedAt,
          invoices: compactInvoices.slice(0, SALES_ROWS_CACHE_LIMITS.invoices),
          payments: compactPayments.slice(0, SALES_ROWS_CACHE_LIMITS.payments),
          loads: compactLoads.slice(0, SALES_ROWS_CACHE_LIMITS.loads),
        };
        serialized = JSON.stringify(reducedPayload);
      }

      if (serialized.length > SALES_ROWS_CACHE_MAX_CHARS) {
        localStorage.removeItem(SALES_ROWS_CACHE_KEY);
        console.warn('Sales rows cache skipped: payload exceeds localStorage quota budget.');
        return;
      }

      localStorage.setItem(SALES_ROWS_CACHE_KEY, serialized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('quota')) {
        localStorage.removeItem(SALES_ROWS_CACHE_KEY);
        console.warn('Sales rows cache skipped: localStorage quota exceeded.');
        return;
      }
      console.error('Error writing sales rows cache:', error);
    }
  }, []);

  const fetchRows = useCallback(async (authToken?: string, options?: { skipLoading?: boolean }) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      if (!options?.skipLoading) setLoading(true);
      setErrorMessage('');

      const [invoiceRows, paymentRows, loadRows] = await Promise.all([
        fetchPaginated<InvoiceRow>('distribution/invoices', tokenToUse),
        fetchPaginated<PaymentRow>('distribution/payments', tokenToUse),
        axios
          .get(`${API_URL}/api/vehicle-loading/loads`, {
            headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          })
          .then((res) => (Array.isArray(res.data) ? (res.data as LoadRow[]) : [])),
      ]);

      setInvoices(invoiceRows);
      setPayments(paymentRows);
      setLoads(loadRows);
      writeSalesRowsCache({
        invoices: invoiceRows,
        payments: paymentRows,
        loads: loadRows,
      });
    } catch (error) {
      console.error('Error fetching sales report rows:', error);
      setErrorMessage('Failed to load sales report data.');
    } finally {
      if (!options?.skipLoading) setLoading(false);
    }
  }, [API_URL, fetchPaginated, token, writeSalesRowsCache]);

  const buildTeamMemberIds = useCallback((employees: EmployeeLite[], managerId: number) => {
    const teamIds: number[] = [];
    const visited = new Set<number>([managerId]);
    let frontier = [managerId];
    let depth = 0;

    while (frontier.length > 0 && depth < 12) {
      const frontierSet = new Set(frontier);
      const children = employees
        .filter((employee) => {
          const reportingPersonId = Number(employee.reporting_person_id || 0);
          return reportingPersonId > 0 && frontierSet.has(reportingPersonId);
        })
        .map((employee) => Number(employee.id))
        .filter((id) => id > 0 && !visited.has(id));

      children.forEach((id) => {
        visited.add(id);
        teamIds.push(id);
      });

      frontier = children;
      depth += 1;
    }

    return teamIds;
  }, []);

  useEffect(() => {
    if (!token) return;

    const verifyAccess = async () => {
      try {
        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);

        const roles: UserRole[] = Array.isArray(userData?.roles) ? (userData.roles as UserRole[]) : [];

        const roleNames = [
          String(userData?.role || ''),
          ...roles.map((role) => (typeof role === 'string' ? role : String(role?.name || ''))),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = roles.flatMap((role) => {
          if (typeof role === 'string') return [];
          return Array.isArray(role?.permissions)
            ? role.permissions.map((permission) => String(permission?.name || '').trim().toLowerCase())
            : [];
        });

        const roleBlob = roleNames.join(' ');
        const adminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));
        const isSalesRef =
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref');

        setCurrentEmployeeId(employeeId);
        setIsAdminUser(adminUser);

        if (employeeId > 0) {
          try {
            const employeesRes = await axios.get('/api/hr/employees', {
              headers: { Authorization: `Bearer ${token}` },
            });

            const employeeRows = Array.isArray(employeesRes.data) ? (employeesRes.data as EmployeeLite[]) : [];
            const teamIds = buildTeamMemberIds(employeeRows, employeeId);
            setTeamMemberIds(teamIds);

            if (adminUser) {
              setViewScope('all');
            } else if (teamIds.length > 0) {
              setViewScope('team');
            } else {
              setViewScope(isSalesRef ? 'my' : 'all');
            }
          } catch (employeeError) {
            console.error('Error loading team hierarchy:', employeeError);
            setTeamMemberIds([]);
            if (!adminUser) {
              setViewScope(isSalesRef ? 'my' : 'all');
            }
          }
        } else {
          setTeamMemberIds([]);
          setViewScope('all');
        }

        if (!adminUser && !hasReportPermission && !isSalesRef) {
          router.push('/dashboard');
          return;
        }

        const cachedRows = readSalesRowsCache();
        const cacheHasData = Boolean(
          cachedRows &&
          (cachedRows.invoices.length > 0 || cachedRows.payments.length > 0 || cachedRows.loads.length > 0)
        );
        const cacheIsFresh = cachedRows ? (Date.now() - cachedRows.cachedAt) < SALES_ROWS_CACHE_TTL_MS : false;
        if (cachedRows) {
          setInvoices(cachedRows.invoices);
          setPayments(cachedRows.payments);
          setLoads(cachedRows.loads);
        }

        setAccessReady(true);

        if (!cacheIsFresh || !cacheHasData) {
          await fetchRows(token, { skipLoading: Boolean(cachedRows) });
        }
      } catch (error) {
        console.error('Error checking sales report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router, fetchRows, buildTeamMemberIds, readSalesRowsCache]);

  const loadById = useMemo(() => {
    const map = new Map<number, LoadRow>();
    loads.forEach((load) => map.set(Number(load.id), load));
    return map;
  }, [loads]);

  const paymentsByInvoice = useMemo(() => {
    const map = new Map<number, number>();

    payments.forEach((payment) => {
      const paymentStatus = String(payment.status || '').trim().toLowerCase();
      if (paymentStatus === 'bounced' || paymentStatus === 'pending') return;
      const invoiceId = Number(payment.distribution_invoice_id || 0);
      if (!invoiceId) return;

      map.set(invoiceId, (map.get(invoiceId) || 0) + Number(payment.amount || 0));
    });

    return map;
  }, [payments]);

  const customerOptions = useMemo(() => {
    return Array.from(
      new Set(
        invoices
          .map((row) => row.customer?.shop_name)
          .filter((name): name is string => Boolean(name && name.trim()))
      )
    ).sort();
  }, [invoices]);

  const loadOptions = useMemo(() => {
    const map = new Map<string, string>();

    invoices.forEach((row) => {
      const loadId = Number(row.load_id || 0);
      if (!loadId) return;

      const load = loadById.get(loadId);
      const routeName = load?.route?.name || [load?.route?.origin, load?.route?.destination].filter(Boolean).join(' -> ');
      const label = [load?.load_number || `Load #${loadId}`, routeName].filter(Boolean).join(' | ');
      map.set(String(loadId), label);
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [invoices, loadById]);

  const salesRefOptions = useMemo(() => {
    const map = new Map<number, string>();

    loads.forEach((load) => {
      const salesRefId = Number(load.sales_ref_id || load.sales_ref?.id || 0);
      if (!salesRefId) return;

      const label = load.sales_ref
        ? [load.sales_ref.employee_code, load.sales_ref.first_name, load.sales_ref.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || load.sales_ref.name || `Sales Ref #${salesRefId}`
        : `Sales Ref #${salesRefId}`;

      if (!map.has(salesRefId)) {
        map.set(salesRefId, label);
      }
    });

    return Array.from(map.entries())
      .map(([id, label]) => ({ id: String(id), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [loads]);

  useEffect(() => {
    setRouteFilter('all');
  }, [loadFilter]);

  const salesRows = useMemo(() => {
    const rowKeyOccurrences = new Map<string, number>();

    return invoices
      .filter((invoice) => String(invoice.status || '').toLowerCase() !== 'cancelled')
      .map<SalesViewRow>((invoice) => {
        const loadId = Number(invoice.load_id || 0);
        const load = loadId ? loadById.get(loadId) : null;
        const loadRoutes = getLoadRouteEntries(load);
        const customerRouteId = Number(invoice.customer?.route_id || 0);
        const matchedRoute = customerRouteId > 0
          ? loadRoutes.find((entry) => entry.routeId === customerRouteId)
          : null;

        const routeName = matchedRoute
          ? matchedRoute.label
          : (loadRoutes.length === 1
            ? loadRoutes[0].label
            : (loadRoutes.length > 1 ? 'Unmapped in Delivery Routes' : getRouteLabel(load?.route || null)));

        const routeId = matchedRoute?.routeId || (loadRoutes.length === 1 ? loadRoutes[0].routeId : null);
        const routeKey = routeId ? `${loadId}-${routeId}` : `${loadId}-unmapped`;
        const baseRowKey = `${Number(invoice.id || 0)}-${loadId}-${routeKey}`;
        const seenCount = (rowKeyOccurrences.get(baseRowKey) || 0) + 1;
        rowKeyOccurrences.set(baseRowKey, seenCount);
        const rowKey = seenCount === 1 ? baseRowKey : `${baseRowKey}-${seenCount}`;

        const salesAmount = Number(invoice.total || 0);
        const rawCollectedAmount = paymentsByInvoice.get(Number(invoice.id)) ?? Number(invoice.paid_amount || 0);
        const collectedAmount = Math.min(salesAmount, Math.max(0, rawCollectedAmount));
        const outstandingAmount = Math.max(0, salesAmount - collectedAmount);

        return {
          id: invoice.id,
          rowKey,
          invoiceNumber: String(invoice.invoice_number || '-'),
          invoiceDate: String(invoice.invoice_date || ''),
          customerCode: String(invoice.customer?.customer_code || '-'),
          customerName: String(invoice.customer?.shop_name || '-'),
          loadId,
          loadNumber: String(load?.load_number || (loadId ? `Load #${loadId}` : '-')),
          routeId,
          routeKey,
          routeName: String(routeName || '-'),
          status: (invoice.status || 'pending') as InvoiceStatus,
          salesAmount,
          collectedAmount,
          outstandingAmount,
        };
      });
  }, [invoices, loadById, paymentsByInvoice]);

  const routeOptions = useMemo(() => {
    const routeMap = new Map<string, { key: string; label: string }>();

    const targetLoadId = loadFilter !== 'all' ? Number(loadFilter) : 0;
    salesRows.forEach((row) => {
      if (targetLoadId > 0 && row.loadId !== targetLoadId) return;
      routeMap.set(row.routeKey, { key: row.routeKey, label: row.routeName });
    });

    return Array.from(routeMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [salesRows, loadFilter]);

  useEffect(() => {
    if (routeFilter === 'all') return;
    if (!routeOptions.some((option) => option.key === routeFilter)) {
      setRouteFilter('all');
    }
  }, [routeFilter, routeOptions]);

  useEffect(() => {
    if (salesRefFilter === 'all') return;
    if (!salesRefOptions.some((option) => option.id === salesRefFilter)) {
      setSalesRefFilter('all');
    }
  }, [salesRefFilter, salesRefOptions]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return salesRows.filter((row) => {
      const linkedLoad = row.loadId ? loadById.get(row.loadId) : null;
      const salesRefId = Number(linkedLoad?.sales_ref_id || linkedLoad?.sales_ref?.id || 0);

      if (viewScope === 'my' && currentEmployeeId > 0 && salesRefId !== currentEmployeeId) return false;
      if (viewScope === 'team' && teamMemberIds.length > 0 && !teamMemberIds.includes(salesRefId)) return false;
      if (salesRefFilter !== 'all' && String(salesRefId) !== salesRefFilter) return false;

      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (customerFilter !== 'all' && row.customerName !== customerFilter) return false;

      if (loadFilter !== 'all') {
        const selected = loadById.get(Number(loadFilter));
        const expectedLabel = selected?.load_number || `Load #${loadFilter}`;
        if (row.loadNumber !== expectedLabel) return false;
      }

      if (routeFilter !== 'all' && row.routeKey !== routeFilter) return false;

      if (fromDate) {
        const d = row.invoiceDate ? new Date(row.invoiceDate) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = row.invoiceDate ? new Date(row.invoiceDate) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.invoiceNumber,
        row.customerCode,
        row.customerName,
        row.loadNumber,
        row.routeName,
        row.status,
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(term);
    });
  }, [salesRows, search, statusFilter, customerFilter, loadFilter, routeFilter, fromDate, toDate, loadById, viewScope, currentEmployeeId, teamMemberIds, salesRefFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / rowsPerPage)), [filteredRows.length, rowsPerPage]);

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, customerFilter, loadFilter, routeFilter, fromDate, toDate, viewScope, salesRefFilter, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const teamPerformanceRows = useMemo(() => {
    const map = new Map<number, { id: number; name: string; invoices: number; sales: number; collected: number; outstanding: number }>();

    filteredRows.forEach((row) => {
      const linkedLoad = row.loadId ? loadById.get(row.loadId) : null;
      const salesRefId = Number(linkedLoad?.sales_ref_id || linkedLoad?.sales_ref?.id || 0);
      if (!salesRefId) return;

      const salesRefName = linkedLoad?.sales_ref
        ? [linkedLoad.sales_ref.employee_code, linkedLoad.sales_ref.first_name, linkedLoad.sales_ref.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || linkedLoad.sales_ref.name || `Sales Ref #${salesRefId}`
        : `Sales Ref #${salesRefId}`;

      if (!map.has(salesRefId)) {
        map.set(salesRefId, {
          id: salesRefId,
          name: salesRefName,
          invoices: 0,
          sales: 0,
          collected: 0,
          outstanding: 0,
        });
      }

      const current = map.get(salesRefId)!;
      current.invoices += 1;
      current.sales += row.salesAmount;
      current.collected += row.collectedAmount;
      current.outstanding += row.outstandingAmount;
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredRows, loadById]);

  const summary = useMemo(() => {
    const totalInvoices = filteredRows.length;
    const grossSales = filteredRows.reduce((sum, row) => sum + row.salesAmount, 0);
    const totalCollected = filteredRows.reduce((sum, row) => sum + row.collectedAmount, 0);
    const totalOutstanding = filteredRows.reduce((sum, row) => sum + row.outstandingAmount, 0);

    return {
      totalInvoices,
      grossSales,
      totalCollected,
      totalOutstanding,
      averageInvoice: totalInvoices > 0 ? grossSales / totalInvoices : 0,
    };
  }, [filteredRows]);

  const formatMoney = (value?: number) => {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const toDateLabel = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const statusBadgeClass = (status?: InvoiceStatus) => {
    if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (status === 'partial') return 'bg-amber-100 text-amber-700';
    if (status === 'cancelled') return 'bg-gray-200 text-gray-700';
    return 'bg-red-100 text-red-700';
  };

  const rowToExport = (row: SalesViewRow) => {
    return [
      row.invoiceNumber,
      toDateLabel(row.invoiceDate),
      row.customerCode,
      row.customerName,
      row.loadNumber,
      row.routeName,
      row.status.toUpperCase(),
      formatMoney(row.salesAmount),
      formatMoney(row.collectedAmount),
      formatMoney(row.outstandingAmount),
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Customer Code',
      'Customer Name',
      'Delivery',
      'Route',
      'Status',
      'Sales Amount',
      'Collected Amount',
      'Outstanding Amount',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-sales-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Sales Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 72);
    doc.text(`Customer Filter: ${customerFilter === 'all' ? 'ALL' : customerFilter}`, 40, 86);
    doc.text(`Delivery Filter: ${loadFilter === 'all' ? 'ALL' : (loadById.get(Number(loadFilter))?.load_number || `Load #${loadFilter}`)}`, 40, 100);
    doc.text(`Route Filter: ${routeFilter === 'all' ? 'ALL' : (routeOptions.find((option) => option.key === routeFilter)?.label || routeFilter)}`, 40, 114);

    autoTable(doc, {
      startY: 128,
      head: [[
        'Invoice #',
        'Date',
        'Customer',
        'Delivery',
        'Route',
        'Status',
        'Sales',
        'Collected',
        'Outstanding',
      ]],
      body: filteredRows.map((row) => {
        const values = rowToExport(row);
        return [
          values[0],
          values[1],
          `${values[2]} - ${values[3]}`,
          values[4],
          values[5],
          values[6],
          values[7],
          values[8],
          values[9],
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [14, 116, 144] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Invoices: ${summary.totalInvoices} | Gross Sales: ${formatMoney(summary.grossSales)} | Collected: ${formatMoney(summary.totalCollected)} | Outstanding: ${formatMoney(summary.totalOutstanding)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    return doc;
  };

  const viewPdf = () => {
    const doc = buildPdf();
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  };

  const downloadPdf = () => {
    const doc = buildPdf();
    doc.save(`distribution-sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-sky-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-700"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-sky-50 to-teal-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-cyan-700 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-cyan-600 rounded-full animate-pulse"></div>
              <span>Sales Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Sales <span className="bg-gradient-to-r from-cyan-700 to-teal-700 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Delivery-tagged invoice sales, collections, and due balance tracking.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-10 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice, customer, delivery, route"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {customerOptions.map((customerName) => (
                  <option key={customerName} value={customerName}>{customerName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery</label>
              <select
                value={loadFilter}
                onChange={(e) => setLoadFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {loadOptions.map((loadOption) => (
                  <option key={loadOption.id} value={loadOption.id}>{loadOption.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Route (Delivery No)</label>
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {routeOptions.map((routeOption) => (
                  <option key={routeOption.key} value={routeOption.key}>{routeOption.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">View Scope</label>
              <select
                value={viewScope}
                onChange={(e) => setViewScope(e.target.value as 'all' | 'my' | 'team')}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                {isAdminUser && <option value="all">All Sales Refs</option>}
                {currentEmployeeId > 0 && <option value="my">My Sales</option>}
                {teamMemberIds.length > 0 && <option value="team">My Team Sales</option>}
                {!isAdminUser && currentEmployeeId <= 0 && <option value="all">All</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sales Ref</label>
              <select
                value={salesRefFilter}
                onChange={(e) => setSalesRefFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {salesRefOptions.map((salesRef) => (
                  <option key={salesRef.id} value={salesRef.id}>{salesRef.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="md:col-span-10 flex justify-end">
              <button
                type="button"
                onClick={() => fetchRows()}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-cyan-700 to-teal-700 border border-transparent rounded-md text-sm font-semibold text-white hover:from-cyan-800 hover:to-teal-800 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              View PDF
            </button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
              Download PDF
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              Download CSV (Excel)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Invoices: <strong>{summary.totalInvoices}</strong></span>
            <span>Gross Sales: <strong>{formatMoney(summary.grossSales)}</strong></span>
            <span>Collected: <strong>{formatMoney(summary.totalCollected)}</strong></span>
            <span>Outstanding: <strong>{formatMoney(summary.totalOutstanding)}</strong></span>
            <span>Avg Invoice: <strong>{formatMoney(summary.averageInvoice)}</strong></span>
          </div>

          {teamPerformanceRows.length > 0 && (
            <div className="border-b border-gray-100 bg-white px-4 py-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-gray-600">Team Performance</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {teamPerformanceRows.map((member) => {
                  const progress = member.sales > 0 ? Math.min(100, (member.collected / member.sales) * 100) : 0;
                  return (
                    <div key={member.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-600">Invoices: {member.invoices}</p>
                      </div>
                      <p className="text-xs text-gray-700">Sales {formatMoney(member.sales)} | Collected {formatMoney(member.collected)} | Outstanding {formatMoney(member.outstanding)}</p>
                      <div className="mt-2 h-2 rounded-full bg-gray-200">
                        <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Delivery</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Outstanding</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">No sales records found.</td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const absoluteIndex = ((currentPage - 1) * rowsPerPage) + idx;
                    return (
                    <tr key={row.rowKey} className={absoluteIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.invoiceDate)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.customerCode} - {row.customerName}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.loadNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.routeName}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                          {row.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.salesAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.collectedAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.outstandingAmount)}</td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-gray-600">
                {(() => {
                  const startRow = (currentPage - 1) * rowsPerPage + 1;
                  const endRow = Math.min(filteredRows.length, currentPage * rowsPerPage);
                  return `Showing ${startRow}-${endRow} of ${filteredRows.length}`;
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-gray-600" htmlFor="sales-rows-per-page">Rows</label>
                <select
                  id="sales-rows-per-page"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
