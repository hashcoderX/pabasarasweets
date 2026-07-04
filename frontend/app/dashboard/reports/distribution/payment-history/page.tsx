'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type PaymentMethod = 'cash' | 'check' | 'bank_transfer';
type PaymentStatus = 'received' | 'cleared' | 'bounced' | 'pending';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
};

type InvoiceInfo = {
  id: number;
  invoice_number?: string;
};

type PaymentRow = {
  id: number;
  payment_number?: string;
  customer?: CustomerInfo | null;
  invoice?: InvoiceInfo | null;
  payment_date?: string;
  amount?: number;
  payment_method?: PaymentMethod;
  status?: PaymentStatus;
  reference_no?: string;
  bank_name?: string;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function DistributionPaymentHistoryReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
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
        console.error('Error checking payment history access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const allRows: PaymentRow[] = [];
      let nextUrl: string | null = `${API_URL}/api/distribution/payments?per_page=200`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: { data?: PaginatedResponse<PaymentRow> } } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const payload = response.data?.data;
        const pageRows = Array.isArray(payload?.data) ? payload.data : [];
        allRows.push(...pageRows);

        nextUrl = payload?.next_page_url || null;
        pageCount += 1;
      }

      setRows(allRows);
    } catch (error) {
      console.error('Error fetching payment history rows:', error);
      setRows([]);
      setErrorMessage('Failed to load payment history data.');
    } finally {
      setLoading(false);
    }
  };

  const parseAmount = (value?: number) => Number(value || 0);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (methodFilter !== 'all' && row.payment_method !== methodFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (fromDate) {
        const d = row.payment_date ? new Date(row.payment_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = row.payment_date ? new Date(row.payment_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.payment_number,
        row.customer?.shop_name,
        row.customer?.customer_code,
        row.invoice?.invoice_number,
        row.payment_method,
        row.status,
        row.reference_no,
        row.bank_name,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, methodFilter, statusFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalPayments = filteredRows.length;
    const totalAmount = filteredRows.reduce((sum, row) => sum + parseAmount(row.amount), 0);

    const methodTotals = {
      cash: filteredRows.filter((row) => row.payment_method === 'cash').reduce((sum, row) => sum + parseAmount(row.amount), 0),
      check: filteredRows.filter((row) => row.payment_method === 'check').reduce((sum, row) => sum + parseAmount(row.amount), 0),
      bank_transfer: filteredRows.filter((row) => row.payment_method === 'bank_transfer').reduce((sum, row) => sum + parseAmount(row.amount), 0),
    };

    return { totalPayments, totalAmount, methodTotals };
  }, [filteredRows]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();

    filteredRows.forEach((row) => {
      if (!row.payment_date) return;
      const date = new Date(row.payment_date);
      if (Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const prev = map.get(key) || { count: 0, amount: 0 };
      prev.count += 1;
      prev.amount += parseAmount(row.amount);
      map.set(key, prev);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, ...value }));
  }, [filteredRows]);

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

  const methodLabel = (value?: PaymentMethod) => {
    if (value === 'bank_transfer') return 'Bank Transfer';
    if (value === 'check') return 'Check';
    return 'Cash';
  };

  const methodBadgeClass = (method?: PaymentMethod) => {
    if (method === 'bank_transfer') return 'bg-blue-100 text-blue-700';
    if (method === 'check') return 'bg-purple-100 text-purple-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const rowToExport = (row: PaymentRow) => {
    return [
      row.payment_number || '-',
      row.invoice?.invoice_number || '-',
      row.customer?.customer_code || '-',
      row.customer?.shop_name || '-',
      toDateLabel(row.payment_date),
      methodLabel(row.payment_method),
      row.status ? row.status.toUpperCase() : '-',
      formatMoney(row.amount),
      row.reference_no || '-',
      row.bank_name || '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Payment Number',
      'Invoice Number',
      'Customer Code',
      'Customer Name',
      'Payment Date',
      'Method',
      'Status',
      'Amount',
      'Reference',
      'Bank',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-payment-history-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Payment History Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Method Filter: ${methodFilter === 'all' ? 'ALL' : methodLabel(methodFilter)}`, 40, 72);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Payment #',
        'Invoice #',
        'Customer',
        'Date',
        'Method',
        'Status',
        'Amount',
        'Reference',
        'Bank',
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
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Payments: ${summary.totalPayments} | Total: ${formatMoney(summary.totalAmount)} | Cash: ${formatMoney(summary.methodTotals.cash)} | Check: ${formatMoney(summary.methodTotals.check)} | Bank Transfer: ${formatMoney(summary.methodTotals.bank_transfer)}`,
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
    doc.save(`distribution-payment-history-report-${new Date().toISOString().split('T')[0]}.pdf`);
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
              <span>Payment History Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Payment History <span className="bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Payment timeline and method analytics for distribution collections.</p>
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
                placeholder="Payment no, invoice no, customer, reference"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PaymentStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="received">Received</option>
                <option value="cleared">Cleared</option>
                <option value="pending">Pending</option>
                <option value="bounced">Bounced</option>
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
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              View PDF
            </button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              Download PDF
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
              Download CSV (Excel)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total Payments: <strong>{summary.totalPayments}</strong></span>
            <span>Total Amount: <strong>{formatMoney(summary.totalAmount)}</strong></span>
            <span>Cash: <strong>{formatMoney(summary.methodTotals.cash)}</strong></span>
            <span>Check: <strong>{formatMoney(summary.methodTotals.check)}</strong></span>
            <span>Bank Transfer: <strong>{formatMoney(summary.methodTotals.bank_transfer)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Payment #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">No payment history records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.payment_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.invoice?.invoice_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {(row.customer?.customer_code || '-') + ' - ' + (row.customer?.shop_name || '-')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.payment_date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${methodBadgeClass(row.payment_method)}`}>
                          {methodLabel(row.payment_method)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.status ? row.status.toUpperCase() : '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.reference_no || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50 text-sm font-semibold text-black">
            Monthly Payment Trend
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Payment Count</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {monthlyTrend.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">No monthly trend data available.</td>
                  </tr>
                ) : (
                  monthlyTrend.map((row, idx) => (
                    <tr key={row.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.month}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{row.count}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.amount)}</td>
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
