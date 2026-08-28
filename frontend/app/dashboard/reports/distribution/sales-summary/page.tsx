'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createApiClient } from '@/lib/apiClient';

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

type LoadRow = {
  id: number;
  load_number?: string;
  load_date?: string;
  delivery_date?: string | null;
  route?: {
    id?: number;
    name?: string;
    origin?: string;
    destination?: string;
  } | null;
};

type PaginatedPayload<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type PermissionLike = {
  name?: string;
};

type RoleLike = {
  name?: string;
  permissions?: PermissionLike[];
};

type UserProfile = {
  employee_id?: number | null;
  employee?: { id?: number | null } | null;
  role?: string | null;
  roles?: Array<string | RoleLike>;
};

type SummaryRow = {
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

const today = new Date().toISOString().split('T')[0];
const monthStart = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-01`;
};

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

export default function DistributionSalesSummaryReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);

  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today);
  const [loadFilter, setLoadFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;
  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const fetchPaginated = useCallback(async <T,>(endpoint: string): Promise<T[]> => {
    const rows: T[] = [];
    let nextUrl: string | null = `${endpoint}?per_page=500`;
    let pages = 0;

    while (nextUrl && pages < 100) {
      const response = await api.get(nextUrl);
      const payload: PaginatedPayload<T> | T[] = response.data?.data || response.data;

      if (Array.isArray(payload)) {
        rows.push(...payload);
        break;
      }

      rows.push(...(Array.isArray(payload?.data) ? payload.data : []));
      nextUrl = payload?.next_page_url || null;
      pages += 1;
    }

    return rows;
  }, [api]);

  const loadReportData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [invoiceRows, paymentRows, loadRes] = await Promise.all([
        fetchPaginated<InvoiceRow>('/distribution/invoices'),
        fetchPaginated<PaymentRow>('/distribution/payments'),
        api.get('/vehicle-loading/loads'),
      ]);

      const loadPayload = loadRes.data?.data || loadRes.data;
      const loadRows = (Array.isArray(loadPayload) ? loadPayload : []) as LoadRow[];

      setInvoices(invoiceRows);
      setPayments(paymentRows);
      setLoads(loadRows);
    } catch (error) {
      console.error('Error loading distribution sales summary report:', error);
      setInvoices([]);
      setPayments([]);
      setLoads([]);
      setErrorMessage('Failed to load sales summary report data.');
    } finally {
      setLoading(false);
    }
  }, [api, fetchPaginated]);

  useEffect(() => {
    if (!token) return;

    const verifyAndLoad = async () => {
      try {
        const userRes = await api.get('/user');
        const userData = (userRes.data || {}) as UserProfile;

        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);

        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role) =>
                typeof role === 'string' ? role : String(role?.name || '')
              )
            : []),
        ]
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role) => {
              if (typeof role === 'string') return [] as string[];
              return Array.isArray(role?.permissions)
                ? role.permissions
                    .map((permission) => String(permission?.name || '').trim().toLowerCase())
                    .filter(Boolean)
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
        const isSalesRef =
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref');

        if (!isAdminUser && !hasReportPermission && !isSalesRef) {
          router.push('/dashboard');
          return;
        }

        await loadReportData();
      } catch (error) {
        console.error('Error checking sales summary report access:', error);
        setErrorMessage('Failed to validate report access.');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAndLoad();
  }, [token, api, router, loadReportData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, loadFilter, searchTerm]);

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
      const routeName = load.route?.name || [load.route?.origin, load.route?.destination].filter(Boolean).join(' -> ');
      const label = [load.load_number || `Load #${load.id}`, routeName].filter(Boolean).join(' | ');
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

  const summaryRows = useMemo(() => {
    const grouped = new Map<string, {
      loadId: number | null;
      loadLabel: string;
      routeName: string;
      invoiceIds: Set<number>;
      customerIds: Set<number>;
      grossSales: number;
      collected: number;
      outstanding: number;
    }>();

    invoices.forEach((invoice) => {
      const status = String(invoice.status || '').toLowerCase();
      if (status === 'cancelled') return;

      const invoiceDate = String(invoice.invoice_date || '').slice(0, 10);
      if (fromDate && invoiceDate < fromDate) return;
      if (toDate && invoiceDate > toDate) return;

      const loadId = Number(invoice.load_id || 0) || null;
      if (loadFilter !== 'all' && Number(loadFilter) !== Number(loadId || 0)) return;

      const load = loadId ? loadById.get(loadId) : null;
      const routeName = String(
        load?.route?.name || [load?.route?.origin, load?.route?.destination].filter(Boolean).join(' -> ') || '-'
      );
      const loadLabel = load?.load_number || (loadId ? `Load #${loadId}` : 'Unassigned Load');
      const key = loadId ? `load-${loadId}` : 'load-unassigned';

      const salesAmount = Number(invoice.total || 0);
      const collected = paymentsByInvoice.get(Number(invoice.id)) ?? Number(invoice.paid_amount || 0);
      const outstanding = Math.max(0, salesAmount - collected);

      if (!grouped.has(key)) {
        grouped.set(key, {
          loadId,
          loadLabel,
          routeName,
          invoiceIds: new Set<number>(),
          customerIds: new Set<number>(),
          grossSales: 0,
          collected: 0,
          outstanding: 0,
        });
      }

      const target = grouped.get(key);
      if (!target) return;

      target.invoiceIds.add(Number(invoice.id));
      if (Number(invoice.customer_id || 0) > 0) target.customerIds.add(Number(invoice.customer_id));
      target.grossSales += salesAmount;
      target.collected += collected;
      target.outstanding += outstanding;
    });

    const term = searchTerm.trim().toLowerCase();

    const rows = Array.from(grouped.entries()).map(([key, group]): SummaryRow => {
      const collectionRate = group.grossSales > 0 ? (group.collected / group.grossSales) * 100 : 0;
      return {
        key,
        loadId: group.loadId,
        loadLabel: group.loadLabel,
        routeName: group.routeName,
        invoiceCount: group.invoiceIds.size,
        customerCount: group.customerIds.size,
        grossSales: group.grossSales,
        collected: group.collected,
        outstanding: group.outstanding,
        collectionRate,
      };
    });

    return rows
      .filter((row) => {
        if (!term) return true;
        const text = [row.loadLabel, row.routeName, String(row.loadId || ''), row.key].join(' ').toLowerCase();
        return text.includes(term);
      })
      .sort((a, b) => {
        if (a.loadLabel === b.loadLabel) return b.grossSales - a.grossSales;
        return a.loadLabel.localeCompare(b.loadLabel);
      });
  }, [invoices, paymentsByInvoice, loadById, fromDate, toDate, loadFilter, searchTerm]);

  const totals = useMemo(() => {
    const loadCount = summaryRows.length;
    const invoiceCount = summaryRows.reduce((sum, row) => sum + row.invoiceCount, 0);
    const grossSales = summaryRows.reduce((sum, row) => sum + row.grossSales, 0);
    const collected = summaryRows.reduce((sum, row) => sum + row.collected, 0);
    const outstanding = summaryRows.reduce((sum, row) => sum + row.outstanding, 0);
    const collectionRate = grossSales > 0 ? (collected / grossSales) * 100 : 0;

    return {
      loadCount,
      invoiceCount,
      grossSales,
      collected,
      outstanding,
      collectionRate,
    };
  }, [summaryRows]);

  const totalPages = Math.max(1, Math.ceil(summaryRows.length / pageSize));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return summaryRows.slice(start, start + pageSize);
  }, [summaryRows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const rowToExport = (row: SummaryRow) => [
    row.loadLabel,
    row.routeName,
    String(row.invoiceCount),
    String(row.customerCount),
    Number(row.grossSales).toFixed(2),
    Number(row.collected).toFixed(2),
    Number(row.outstanding).toFixed(2),
    `${row.collectionRate.toFixed(2)}%`,
  ];

  const exportCsv = () => {
    const headers = ['Load', 'Route', 'Invoice Count', 'Customer Count', 'Gross Sales', 'Collected', 'Outstanding', 'Collection Rate'];
    const csvContent = [headers, ...summaryRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-sales-summary-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Sales Summary Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${fromDate || '-'} to ${toDate || '-'}`, 40, 72);
    doc.text(`Load Filter: ${loadFilter === 'all' ? 'ALL' : (loadOptions.find((option) => option.id === loadFilter)?.label || `Load #${loadFilter}`)}`, 40, 86);
    doc.text(`Search: ${searchTerm.trim() || 'N/A'}`, 40, 100);

    autoTable(doc, {
      startY: 114,
      head: [['Load', 'Route', 'Invoices', 'Customers', 'Gross Sales', 'Collected', 'Outstanding', 'Collection Rate']],
      body: summaryRows.map((row) => rowToExport(row)),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [6, 95, 70] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Loads: ${totals.loadCount} | Invoices: ${totals.invoiceCount} | Gross: ${money(totals.grossSales)} | Collected: ${money(totals.collected)} | Outstanding: ${money(totals.outstanding)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    doc.save(`distribution-sales-summary-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-16 left-16 w-72 h-72 bg-emerald-200 rounded-full blur-3xl"></div>
        <div className="absolute top-32 right-20 w-72 h-72 bg-cyan-200 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-8 left-1/3 w-72 h-72 bg-teal-200 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/reports" className="text-sm font-semibold text-slate-700 hover:text-emerald-700 transition-colors">← Back to Reports</Link>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide uppercase text-emerald-700">Distribution</span>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-3xl border border-white/70 bg-white/80 backdrop-blur-lg p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">Sales Summary</p>
              <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Distribution Sales Summary by Load</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-2xl">
                Analyze load-wise sales, collections, and outstanding balances with delivery-level filtering.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 px-4 py-3 min-w-[250px]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Selected Range</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{dateLabel(fromDate)} to {dateLabel(toDate)}</p>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <label className="text-sm font-semibold text-slate-700">
              From date
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Load</label>
              <select
                value={loadFilter}
                onChange={(event) => setLoadFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">All Loads</option>
                {loadOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Search
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Load number or route"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100">Download CSV</button>
            <button type="button" onClick={downloadPdf} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Download PDF</button>
            <button
              type="button"
              onClick={() => {
                setFromDate(monthStart());
                setToDate(today);
                setLoadFilter('all');
                setSearchTerm('');
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={loadReportData}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Loads</p>
            <p className="mt-2 text-2xl font-black text-emerald-900">{totals.loadCount}</p>
          </article>
          <article className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Invoices</p>
            <p className="mt-2 text-2xl font-black text-blue-900">{totals.invoiceCount}</p>
          </article>
          <article className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Gross Sales</p>
            <p className="mt-2 text-2xl font-black text-cyan-900">{money(totals.grossSales)}</p>
          </article>
          <article className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Collected</p>
            <p className="mt-2 text-2xl font-black text-teal-900">{money(totals.collected)}</p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</p>
            <p className="mt-2 text-2xl font-black text-amber-900">{money(totals.outstanding)}</p>
            <p className="mt-1 text-xs text-amber-700">Collection Rate: {totals.collectionRate.toFixed(2)}%</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-emerald-50">
            <h2 className="font-semibold text-slate-900">Load-wise Sales Summary</h2>
            <p className="text-xs text-slate-600 mt-0.5">Grouped summary with load filter support.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Load</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Route</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Invoices</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Customers</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Gross Sales</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Collected</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Outstanding</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                      No sales summary rows for current filters.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, index) => (
                    <tr key={row.key} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-5 py-3 text-slate-800 font-medium">{row.loadLabel}</td>
                      <td className="px-5 py-3 text-slate-700">{row.routeName}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{row.invoiceCount}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{row.customerCount}</td>
                      <td className="px-5 py-3 text-right font-bold text-cyan-700">{money(row.grossSales)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-teal-700">{money(row.collected)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-700">{money(row.outstanding)}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{row.collectionRate.toFixed(2)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {summaryRows.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-white/85 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div>
                {(() => {
                  const start = (currentPage - 1) * pageSize + 1;
                  const end = Math.min(summaryRows.length, currentPage * pageSize);
                  return `Showing ${start}-${end} of ${summaryRows.length} rows`;
                })()}
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
