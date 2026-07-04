'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceRow = {
  id: number;
  load_id?: number | null;
  invoice_number?: string;
  invoice_date?: string;
  total?: number;
  status?: string;
};

type PaymentRow = {
  id: number;
  load_id?: number | null;
  amount?: number;
  status?: string;
  payment_date?: string;
};

type ReturnRow = {
  id: number;
  load_id?: number | null;
  settlement_amount?: number;
  total_amount?: number;
  status?: string;
  return_date?: string;
};

type LoadRow = {
  id: number;
  load_number?: string;
  load_date?: string;
  delivery_date?: string | null;
  status?: string;
  route?: {
    name?: string;
    origin?: string;
    destination?: string;
  } | null;
  vehicle?: {
    registration_number?: string;
  } | null;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type DeliveryBalanceRow = {
  loadId: number;
  loadNumber: string;
  loadDate: string;
  deliveryDate: string;
  routeName: string;
  vehicleNumber: string;
  invoiceCount: number;
  salesAmount: number;
  returnAmount: number;
  netSalesAmount: number;
  collectionAmount: number;
  outstandingAmount: number;
};

export default function DistributionDeliveryBalanceReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_transit' | 'delivered' | 'cancelled'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';

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

        await fetchRows(token);
      } catch (error) {
        console.error('Error checking delivery balance report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchPaginated = async <T,>(endpoint: string, authToken: string) => {
    const rows: T[] = [];
    let nextUrl: string | null = `${API_URL}/api/${endpoint}?per_page=200`;
    let pageCount = 0;

    while (nextUrl && pageCount < 50) {
      const response: { data: { data?: PaginatedResponse<T> } } = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });

      const payload = response.data?.data;
      rows.push(...(Array.isArray(payload?.data) ? payload.data : []));
      nextUrl = payload?.next_page_url || null;
      pageCount += 1;
    }

    return rows;
  };

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const [invoiceRows, paymentRows, returnRows, loadRows] = await Promise.all([
        fetchPaginated<InvoiceRow>('distribution/invoices', tokenToUse),
        fetchPaginated<PaymentRow>('distribution/payments', tokenToUse),
        fetchPaginated<ReturnRow>('distribution/returns', tokenToUse),
        axios
          .get(`${API_URL}/api/vehicle-loading/loads`, {
            headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          })
          .then((res) => (Array.isArray(res.data) ? (res.data as LoadRow[]) : [])),
      ]);

      setInvoices(invoiceRows);
      setPayments(paymentRows);
      setReturns(returnRows);
      setLoads(loadRows);
    } catch (error) {
      console.error('Error fetching delivery balance report rows:', error);
      setInvoices([]);
      setPayments([]);
      setReturns([]);
      setLoads([]);
      setErrorMessage('Failed to load delivery balance report data.');
    } finally {
      setLoading(false);
    }
  };

  const parseAmount = (value?: number) => Number(value || 0);

  const groupedRows = useMemo(() => {
    const loadMap = new Map<number, DeliveryBalanceRow>();

    loads.forEach((load) => {
      const routeName = load.route?.name || [load.route?.origin, load.route?.destination].filter(Boolean).join(' -> ');
      loadMap.set(Number(load.id), {
        loadId: Number(load.id),
        loadNumber: String(load.load_number || `Load #${load.id}`),
        loadDate: String(load.load_date || ''),
        deliveryDate: String(load.delivery_date || ''),
        routeName: String(routeName || '-'),
        vehicleNumber: String(load.vehicle?.registration_number || '-'),
        invoiceCount: 0,
        salesAmount: 0,
        returnAmount: 0,
        netSalesAmount: 0,
        collectionAmount: 0,
        outstandingAmount: 0,
      });
    });

    invoices.forEach((invoice) => {
      if (String(invoice.status || '').toLowerCase() === 'cancelled') return;
      const loadId = Number(invoice.load_id || 0);
      if (!loadId) return;

      const row = loadMap.get(loadId) || {
        loadId,
        loadNumber: `Load #${loadId}`,
        loadDate: '',
        deliveryDate: '',
        routeName: '-',
        vehicleNumber: '-',
        invoiceCount: 0,
        salesAmount: 0,
        returnAmount: 0,
        netSalesAmount: 0,
        collectionAmount: 0,
        outstandingAmount: 0,
      };

      row.invoiceCount += 1;
      row.salesAmount += parseAmount(invoice.total);

      loadMap.set(loadId, row);
    });

    payments.forEach((payment) => {
      if (String(payment.status || '').toLowerCase() === 'bounced') return;
      const loadId = Number(payment.load_id || 0);
      if (!loadId) return;

      const row = loadMap.get(loadId) || {
        loadId,
        loadNumber: `Load #${loadId}`,
        loadDate: '',
        deliveryDate: '',
        routeName: '-',
        vehicleNumber: '-',
        invoiceCount: 0,
        salesAmount: 0,
        returnAmount: 0,
        netSalesAmount: 0,
        collectionAmount: 0,
        outstandingAmount: 0,
      };

      row.collectionAmount += parseAmount(payment.amount);
      loadMap.set(loadId, row);
    });

    returns.forEach((returnRow) => {
      if (String(returnRow.status || '').toLowerCase() === 'rejected') return;
      const loadId = Number(returnRow.load_id || 0);
      if (!loadId) return;

      const row = loadMap.get(loadId) || {
        loadId,
        loadNumber: `Load #${loadId}`,
        loadDate: '',
        deliveryDate: '',
        routeName: '-',
        vehicleNumber: '-',
        invoiceCount: 0,
        salesAmount: 0,
        returnAmount: 0,
        netSalesAmount: 0,
        collectionAmount: 0,
        outstandingAmount: 0,
      };

      row.returnAmount += parseAmount(returnRow.settlement_amount || returnRow.total_amount);
      loadMap.set(loadId, row);
    });

    const list = Array.from(loadMap.values()).map((row) => {
      const netSalesAmount = Math.max(0, row.salesAmount - row.returnAmount);
      const outstandingAmount = Math.max(0, netSalesAmount - row.collectionAmount);

      return {
        ...row,
        netSalesAmount,
        outstandingAmount,
      };
    });

    return list.sort((a, b) => (b.deliveryDate || b.loadDate || '').localeCompare(a.deliveryDate || a.loadDate || ''));
  }, [loads, invoices, payments, returns]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return groupedRows.filter((row) => {
      const loadState = (loads.find((item) => Number(item.id) === Number(row.loadId))?.status || '').toLowerCase();
      if (statusFilter !== 'all' && loadState !== statusFilter) return false;

      const reportDate = row.deliveryDate || row.loadDate;
      if (fromDate && reportDate) {
        const d = new Date(reportDate);
        if (Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate && reportDate) {
        const d = new Date(reportDate);
        if (Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.loadNumber,
        row.routeName,
        row.vehicleNumber,
        loads.find((item) => Number(item.id) === Number(row.loadId))?.status || '',
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(term);
    });
  }, [groupedRows, search, statusFilter, fromDate, toDate, loads]);

  const summary = useMemo(() => {
    const deliveryCount = filteredRows.length;
    const invoiceCount = filteredRows.reduce((sum, row) => sum + row.invoiceCount, 0);
    const salesAmount = filteredRows.reduce((sum, row) => sum + row.salesAmount, 0);
    const returnAmount = filteredRows.reduce((sum, row) => sum + row.returnAmount, 0);
    const netSalesAmount = filteredRows.reduce((sum, row) => sum + row.netSalesAmount, 0);
    const collectionAmount = filteredRows.reduce((sum, row) => sum + row.collectionAmount, 0);
    const outstandingAmount = filteredRows.reduce((sum, row) => sum + row.outstandingAmount, 0);

    return {
      deliveryCount,
      invoiceCount,
      salesAmount,
      returnAmount,
      netSalesAmount,
      collectionAmount,
      outstandingAmount,
      collectionRatio: netSalesAmount > 0 ? (collectionAmount / netSalesAmount) * 100 : 0,
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

  const rowToExport = (row: DeliveryBalanceRow) => {
    const loadStatus = String(loads.find((load) => Number(load.id) === Number(row.loadId))?.status || '-').toUpperCase();

    return [
      row.loadNumber,
      toDateLabel(row.loadDate),
      toDateLabel(row.deliveryDate),
      row.vehicleNumber,
      row.routeName,
      loadStatus,
      String(row.invoiceCount),
      formatMoney(row.salesAmount),
      formatMoney(row.returnAmount),
      formatMoney(row.netSalesAmount),
      formatMoney(row.collectionAmount),
      formatMoney(row.outstandingAmount),
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Delivery',
      'Load Date',
      'Delivery Date',
      'Vehicle',
      'Route',
      'Status',
      'Invoices',
      'Sales',
      'Returns',
      'Net Sales',
      'Collections',
      'Outstanding',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-delivery-balance-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Delivery Balance Sheet Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Delivery Status: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 72);

    autoTable(doc, {
      startY: 90,
      head: [[
        'Delivery',
        'Load Date',
        'Route',
        'Status',
        'Invoices',
        'Sales',
        'Returns',
        'Net Sales',
        'Collections',
        'Outstanding',
      ]],
      body: filteredRows.map((row) => {
        const values = rowToExport(row);
        return [
          values[0],
          values[1],
          values[4],
          values[5],
          values[6],
          values[7],
          values[8],
          values[9],
          values[10],
          values[11],
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 101, 52] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Deliveries: ${summary.deliveryCount} | Net Sales: ${formatMoney(summary.netSalesAmount)} | Collections: ${formatMoney(summary.collectionAmount)} | Outstanding: ${formatMoney(summary.outstandingAmount)} | Collection Ratio: ${summary.collectionRatio.toFixed(2)}%`,
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
    doc.save(`distribution-delivery-balance-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-lime-50 via-emerald-50 to-green-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lime-50 via-emerald-50 to-green-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-16 left-16 w-72 h-72 bg-lime-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-16 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-48 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-green-700 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              <span>Delivery Balance Sheet Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Delivery <span className="bg-gradient-to-r from-green-700 to-lime-700 bg-clip-text text-transparent">Balance Sheet</span>
          </h1>
          <p className="text-gray-600">Delivery-wise sales, returns, collections, and outstanding balance position.</p>
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
                placeholder="Delivery number, route, vehicle"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'in_transit' | 'delivered' | 'cancelled')}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
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
                className="px-4 py-2 bg-gradient-to-r from-green-700 to-lime-700 border border-transparent rounded-md text-sm font-semibold text-white hover:from-green-800 hover:to-lime-800 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              View PDF
            </button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
              Download PDF
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              Download CSV (Excel)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-lime-50 to-green-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Deliveries: <strong>{summary.deliveryCount}</strong></span>
            <span>Invoices: <strong>{summary.invoiceCount}</strong></span>
            <span>Sales: <strong>{formatMoney(summary.salesAmount)}</strong></span>
            <span>Returns: <strong>{formatMoney(summary.returnAmount)}</strong></span>
            <span>Net Sales: <strong>{formatMoney(summary.netSalesAmount)}</strong></span>
            <span>Collections: <strong>{formatMoney(summary.collectionAmount)}</strong></span>
            <span>Outstanding: <strong>{formatMoney(summary.outstandingAmount)}</strong></span>
            <span>Collection Ratio: <strong>{summary.collectionRatio.toFixed(2)}%</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Delivery</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Delivery Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Route</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Invoices</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Returns</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Net Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Collections</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Outstanding</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No delivery balances found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.loadId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.loadNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.loadDate)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.deliveryDate)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.vehicleNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.routeName}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{row.invoiceCount}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.salesAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.returnAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.netSalesAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.collectionAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.outstandingAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
