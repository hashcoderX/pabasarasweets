'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';

type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
};

type InvoiceItem = {
  id: number;
};

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  customer_id?: number;
  customer?: CustomerInfo | null;
  invoice_date?: string;
  due_date?: string | null;
  subtotal?: number;
  discount?: number;
  total?: number;
  paid_amount?: number;
  status?: InvoiceStatus;
  items?: InvoiceItem[];
  items_count?: number;
  created_at?: string;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function DistributionInvoiceReportPage() {
  const REPORT_CACHE_KEY = 'distribution-invoice-report:rows:v1';
  const REPORT_CACHE_TTL_MS = 60 * 1000;

  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [loadedRowsCount, setLoadedRowsCount] = useState(0);
  const fetchRunRef = useRef(0);

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

  useEffect(() => {
    if (!token) return;

    const verifyAccess = async () => {
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
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) => String(permission?.name || '').trim().toLowerCase())
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
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

        if (!isAdminUser && !hasReportPermission && !isSalesRef) {
          router.push('/dashboard');
          return;
        }

        const hadWarmCache = readRowsCache();
        await fetchRows(token, { skipLoading: hadWarmCache });
      } catch (error) {
        console.error('Error checking invoice report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const readRowsCache = () => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem(REPORT_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { cachedAt?: number; rows?: InvoiceRow[] };
      if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.cachedAt !== 'number') return false;
      if ((Date.now() - parsed.cachedAt) > REPORT_CACHE_TTL_MS) return false;

      setRows(parsed.rows);
      setLoadedRowsCount(parsed.rows.length);
      return true;
    } catch (error) {
      console.error('Error reading invoice report cache:', error);
      return false;
    }
  };

  const writeRowsCache = (invoiceRows: InvoiceRow[]) => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        cachedAt: Date.now(),
        rows: invoiceRows,
      });
      if (payload.length > 1_500_000) {
        sessionStorage.removeItem(REPORT_CACHE_KEY);
        return;
      }
      sessionStorage.setItem(REPORT_CACHE_KEY, payload);
    } catch (error) {
      console.error('Error writing invoice report cache:', error);
    }
  };

  const fetchRows = async (authToken?: string, options?: { skipLoading?: boolean }) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    const runId = ++fetchRunRef.current;

    try {
      if (!options?.skipLoading) setLoading(true);
      setBackgroundLoading(false);
      setErrorMessage('');
      setLoadedRowsCount(0);

      const firstUrl = `${API_URL}/api/distribution/invoices?per_page=20&exclude_cancelled=1&report_mode=1`;
      const firstResponse: { data: { data?: PaginatedResponse<InvoiceRow> } } = await axios.get(firstUrl, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      if (runId !== fetchRunRef.current) return;

      const firstPayload = firstResponse.data?.data;
      const firstRows = Array.isArray(firstPayload?.data) ? firstPayload.data : [];
      let nextUrl: string | null = firstPayload?.next_page_url || null;

      setRows(firstRows);
      setLoadedRowsCount(firstRows.length);
      writeRowsCache(firstRows);
      if (!options?.skipLoading) setLoading(false);

      if (!nextUrl) {
        setBackgroundLoading(false);
        return;
      }

      setBackgroundLoading(true);
      void (async () => {
        const allRows: InvoiceRow[] = [...firstRows];
        let pageCount = 0;

        try {
          while (nextUrl && pageCount < 200) {
            const response: { data: { data?: PaginatedResponse<InvoiceRow> } } = await axios.get(nextUrl, {
              headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
            });

            if (runId !== fetchRunRef.current) return;

            const payload = response.data?.data;
            const pageRows = Array.isArray(payload?.data) ? payload.data : [];
            allRows.push(...pageRows);

            nextUrl = payload?.next_page_url || null;
            pageCount += 1;

            setRows([...allRows]);
            setLoadedRowsCount(allRows.length);
            if (pageCount % 2 === 0 || !nextUrl) {
              writeRowsCache(allRows);
            }
          }
        } catch (error) {
          if (runId !== fetchRunRef.current) return;
          console.error('Error fetching remaining invoice report rows:', error);
          setErrorMessage((prev) => prev || 'Initial records loaded. Failed to sync all remaining records.');
        } finally {
          if (runId !== fetchRunRef.current) return;
          setBackgroundLoading(false);
        }
      })();
    } catch (error) {
      if (runId !== fetchRunRef.current) return;
      console.error('Error fetching invoice report rows:', error);
      setRows([]);
      setLoadedRowsCount(0);
      setBackgroundLoading(false);
      setErrorMessage('Failed to load invoice report data.');
    } finally {
      if (runId === fetchRunRef.current && !options?.skipLoading) setLoading(false);
    }
  };

  const customerOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.customer?.shop_name)
          .filter((name): name is string => Boolean(name && name.trim()))
      )
    ).sort();
  }, [rows]);

  const parseAmount = (value?: number) => Number(value || 0);

  const getOutstanding = (row: InvoiceRow) => {
    const outstanding = parseAmount(row.total) - parseAmount(row.paid_amount);
    return outstanding > 0 ? outstanding : 0;
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (String(row.status || '').toLowerCase() === 'cancelled') return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (customerFilter !== 'all' && String(row.customer?.shop_name || '') !== customerFilter) return false;

      if (fromDate) {
        const d = row.invoice_date ? new Date(row.invoice_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = row.invoice_date ? new Date(row.invoice_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.invoice_number,
        row.customer?.shop_name,
        row.customer?.customer_code,
        row.status,
        row.invoice_date,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, statusFilter, customerFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalInvoices = filteredRows.length;
    const invoiceTotal = filteredRows.reduce((sum, row) => sum + parseAmount(row.total), 0);
    const paidTotal = filteredRows.reduce((sum, row) => sum + parseAmount(row.paid_amount), 0);
    const outstandingTotal = filteredRows.reduce((sum, row) => sum + getOutstanding(row), 0);

    const statusCounts = {
      pending: filteredRows.filter((row) => row.status === 'pending').length,
      partial: filteredRows.filter((row) => row.status === 'partial').length,
      paid: filteredRows.filter((row) => row.status === 'paid').length,
      cancelled: filteredRows.filter((row) => row.status === 'cancelled').length,
    };

    return {
      totalInvoices,
      invoiceTotal,
      paidTotal,
      outstandingTotal,
      statusCounts,
    };
  }, [filteredRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, customerFilter, fromDate, toDate, rowsPerPage, rows.length]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  }, [filteredRows.length, rowsPerPage]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredRows.slice(start, end);
  }, [filteredRows, safeCurrentPage, rowsPerPage]);

  const pageStart = filteredRows.length === 0 ? 0 : (safeCurrentPage - 1) * rowsPerPage + 1;
  const pageEnd = filteredRows.length === 0 ? 0 : Math.min(pageStart + paginatedRows.length - 1, filteredRows.length);

  const toDateLabel = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const formatMoney = (value?: number) => {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const statusBadgeClass = (status?: InvoiceStatus) => {
    if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (status === 'partial') return 'bg-amber-100 text-amber-700';
    if (status === 'cancelled') return 'bg-gray-200 text-gray-700';
    return 'bg-red-100 text-red-700';
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Invoice Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Invoice <span className="bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Invoice totals, paid value and customer-wise invoice trend overview.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice no, customer code, customer name"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
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
            <div className="md:col-span-6 flex justify-end">
              <button
                type="button"
                onClick={() => fetchRows()}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-green-700 hover:to-teal-700 disabled:opacity-60"
              >
                {loading ? 'Loading...' : backgroundLoading ? 'Syncing...' : 'Refresh Data'}
              </button>
            </div>
            <div className="md:col-span-6 flex justify-end items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Rows per page</label>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                {[10, 20, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total Invoices: <strong>{summary.totalInvoices}</strong></span>
            <span>Invoice Total: <strong>{formatMoney(summary.invoiceTotal)}</strong></span>
            <span>Paid: <strong>{formatMoney(summary.paidTotal)}</strong></span>
            <span>Outstanding: <strong>{formatMoney(summary.outstandingTotal)}</strong></span>
            <span>Pending: <strong>{summary.statusCounts.pending}</strong></span>
            <span>Partial: <strong>{summary.statusCounts.partial}</strong></span>
            <span>Paid: <strong>{summary.statusCounts.paid}</strong></span>
            {backgroundLoading && (
              <span className="text-teal-700 font-medium">
                Loading remaining records... <strong>{loadedRowsCount}</strong> loaded
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Sub Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Discount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Outstanding</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No invoice records found.</td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => (
                    <tr key={row.id} className={((pageStart - 1 + idx) % 2) === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.invoice_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {(row.customer?.customer_code || '-') + ' - ' + (row.customer?.shop_name || '-')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.invoice_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.due_date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                          {row.status ? row.status.toUpperCase() : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(row.items_count ?? (row.items || []).length)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.subtotal)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.discount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.total)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.paid_amount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(getOutstanding(row))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-gray-600">
              Showing <strong>{pageStart}</strong> to <strong>{pageEnd}</strong> of <strong>{filteredRows.length}</strong> invoices
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
