'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type SalesViewRow = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerCode: string;
  customerName: string;
  loadNumber: string;
  routeName: string;
  status: InvoiceStatus;
  salesAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
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
        console.error('Error checking sales report access:', error);
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
    } catch (error) {
      console.error('Error fetching sales report rows:', error);
      setInvoices([]);
      setPayments([]);
      setLoads([]);
      setErrorMessage('Failed to load sales report data.');
    } finally {
      setLoading(false);
    }
  };

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

  const salesRows = useMemo(() => {
    return invoices
      .filter((invoice) => String(invoice.status || '').toLowerCase() !== 'cancelled')
      .map<SalesViewRow>((invoice) => {
        const loadId = Number(invoice.load_id || 0);
        const load = loadId ? loadById.get(loadId) : null;
        const routeName = load?.route?.name || [load?.route?.origin, load?.route?.destination].filter(Boolean).join(' -> ');

        const salesAmount = Number(invoice.total || 0);
        const collectedAmount = paymentsByInvoice.get(Number(invoice.id)) ?? Number(invoice.paid_amount || 0);
        const outstandingAmount = Math.max(0, salesAmount - collectedAmount);

        return {
          id: invoice.id,
          invoiceNumber: String(invoice.invoice_number || '-'),
          invoiceDate: String(invoice.invoice_date || ''),
          customerCode: String(invoice.customer?.customer_code || '-'),
          customerName: String(invoice.customer?.shop_name || '-'),
          loadNumber: String(load?.load_number || (loadId ? `Load #${loadId}` : '-')),
          routeName: String(routeName || '-'),
          status: (invoice.status || 'pending') as InvoiceStatus,
          salesAmount,
          collectedAmount,
          outstandingAmount,
        };
      });
  }, [invoices, loadById, paymentsByInvoice]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return salesRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (customerFilter !== 'all' && row.customerName !== customerFilter) return false;

      if (loadFilter !== 'all') {
        const selected = loadById.get(Number(loadFilter));
        const expectedLabel = selected?.load_number || `Load #${loadFilter}`;
        if (row.loadNumber !== expectedLabel) return false;
      }

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
  }, [salesRows, search, statusFilter, customerFilter, loadFilter, fromDate, toDate, loadById]);

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

    autoTable(doc, {
      startY: 100,
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
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
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
            <div className="md:col-span-7 flex justify-end">
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
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
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
